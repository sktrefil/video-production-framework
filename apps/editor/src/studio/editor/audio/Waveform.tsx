import {useEffect, useMemo, useState} from "react";
import type {FC} from "react";
import type {AudioTimelineItem} from "../editorTypes";
import {resolveEditorMediaSrc} from "../../../editor/mediaSource";

type WaveformState =
  | {status: "loading"; peaks: number[]}
  | {status: "ready"; peaks: number[]}
  | {status: "error"; peaks: number[]};

const waveformCache = new Map<string, Promise<number[]>>();
const PEAK_COUNT = 2048;

const decodeWaveform = async (src: string): Promise<number[]> => {
  const resolved = resolveEditorMediaSrc(src);
  const cached = waveformCache.get(resolved);
  if (cached) {
    return cached;
  }

  const task = (async () => {
    const response = await fetch(resolved);
    if (!response.ok) {
      throw new Error(`Waveform fetch failed: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const AudioContextCtor =
      window.AudioContext ??
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("Web Audio API is not available");
    }

    const context = new AudioContextCtor();
    try {
      const buffer = await context.decodeAudioData(arrayBuffer.slice(0));
      const channelCount = Math.max(1, buffer.numberOfChannels);
      const sampleCount = Math.max(1, buffer.length);
      const bucketSize = Math.max(1, Math.floor(sampleCount / PEAK_COUNT));
      const peaks: number[] = [];

      for (let bucket = 0; bucket < PEAK_COUNT; bucket += 1) {
        const start = bucket * bucketSize;
        if (start >= sampleCount) {
          break;
        }
        const end = Math.min(sampleCount, start + bucketSize);
        let peak = 0;

        for (let channel = 0; channel < channelCount; channel += 1) {
          const data = buffer.getChannelData(channel);
          for (let index = start; index < end; index += 1) {
            peak = Math.max(peak, Math.abs(data[index] ?? 0));
          }
        }

        peaks.push(Math.min(1, peak));
      }

      return peaks.length > 0 ? peaks : [0];
    } finally {
      void context.close();
    }
  })();

  waveformCache.set(resolved, task);
  return task;
};

const segmentPeaks = (
  peaks: number[],
  item: AudioTimelineItem,
  targetBars = 96,
): number[] => {
  const assetDuration = Math.max(1, item.sourceAssetDurationInFrames);
  const startRatio = item.sourceStartFrame / assetDuration;
  const endRatio =
    (item.sourceStartFrame + item.sourceDurationInFrames) / assetDuration;
  const startIndex = Math.max(
    0,
    Math.min(peaks.length - 1, Math.floor(startRatio * peaks.length)),
  );
  const endIndex = Math.max(
    startIndex + 1,
    Math.min(peaks.length, Math.ceil(endRatio * peaks.length)),
  );
  const slice = peaks.slice(startIndex, endIndex);
  const bars = Math.max(8, Math.min(targetBars, slice.length));
  const bucketSize = Math.max(1, Math.ceil(slice.length / bars));
  const reduced: number[] = [];

  for (let index = 0; index < slice.length; index += bucketSize) {
    reduced.push(
      slice
        .slice(index, index + bucketSize)
        .reduce((maximum, value) => Math.max(maximum, value), 0),
    );
  }

  return reduced.length > 0 ? reduced : [0];
};

export const Waveform: FC<{item: AudioTimelineItem}> = ({item}) => {
  const [state, setState] = useState<WaveformState>({
    status: "loading",
    peaks: [],
  });

  useEffect(() => {
    let active = true;
    setState({status: "loading", peaks: []});

    void decodeWaveform(item.src)
      .then((peaks) => {
        if (active) {
          setState({status: "ready", peaks});
        }
      })
      .catch(() => {
        if (active) {
          setState({status: "error", peaks: []});
        }
      });

    return () => {
      active = false;
    };
  }, [item.src]);

  const visible = useMemo(
    () =>
      state.status === "ready"
        ? segmentPeaks(state.peaks, item)
        : Array.from({length: 24}, (_, index) =>
            index % 3 === 0 ? 0.72 : index % 2 === 0 ? 0.45 : 0.3,
          ),
    [item, state],
  );

  return (
    <div
      data-editor-waveform={state.status}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: "4px 7px",
        display: "flex",
        alignItems: "center",
        gap: 1,
        opacity: state.status === "ready" ? 0.58 : 0.22,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {visible.map((peak, index) => (
        <span
          key={index}
          style={{
            flex: "1 1 0",
            minWidth: 1,
            maxWidth: 3,
            height: `${Math.max(8, Math.round(peak * 100))}%`,
            borderRadius: 1,
            background: "rgba(255,255,255,0.85)",
          }}
        />
      ))}
    </div>
  );
};
