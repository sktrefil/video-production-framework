import {useEffect, useRef, useState} from "react";
import type {CSSProperties, FC} from "react";
import {useCurrentFrame} from "remotion";
import {editorActions} from "../editorActions";
import type {AudioTimelineItem} from "../editorTypes";
import {useStudioEditor} from "../StudioEditorContext";
import {
  canSplitItemAtFrame,
  createSplitItemId,
} from "../audio/audioEditUtils";
import {auditionAudioItem} from "../audio/audioAssetUtils";
import {createDuplicateAudioId} from "../audio/audioTrackPresets";

const sectionStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  color: "rgba(255,255,255,0.68)",
  fontSize: 10,
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 5,
  background: "rgba(0,0,0,0.28)",
  color: "white",
  padding: "5px 7px",
  fontSize: 11,
  outline: "none",
};

const buttonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 6,
  padding: "7px 9px",
  background: "rgba(255,255,255,0.07)",
  color: "white",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
};

const NumericField: FC<{
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
}> = ({label, value, step = 1, min, max, onCommit}) => {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const bounded = Math.min(
      max ?? Number.POSITIVE_INFINITY,
      Math.max(min ?? Number.NEGATIVE_INFINITY, parsed),
    );
    setDraft(String(bounded));
    onCommit(bounded);
  };

  return (
    <label style={labelStyle}>
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        step={step}
        min={min}
        max={max}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setDraft(String(value));
            event.currentTarget.blur();
          }
        }}
        style={inputStyle}
      />
    </label>
  );
};

export const AudioInspector: FC<{item: AudioTimelineItem}> = ({item}) => {
  const frame = useCurrentFrame();
  const {state, dispatch} = useStudioEditor();
  const [auditioning, setAuditioning] = useState(false);
  const stopAuditionRef = useRef<(() => void) | null>(null);
  const isTts = item.type === "TTS";
  const isBgm = item.type === "BGM";
  const isSfx = item.type === "SFX";
  const canSplit = isTts && canSplitItemAtFrame(state, item.id, frame);
  const fps = state.project.project.fps;

  useEffect(
    () => () => {
      stopAuditionRef.current?.();
      stopAuditionRef.current = null;
    },
    [],
  );

  const split = () => {
    if (!canSplit) {
      return;
    }
    dispatch(
      editorActions.splitAudioItem(
        item.id,
        frame,
        createSplitItemId(state, item.id, frame),
      ),
    );
  };

  const audition = async () => {
    stopAuditionRef.current?.();
    stopAuditionRef.current = null;
    setAuditioning(false);

    try {
      stopAuditionRef.current = await auditionAudioItem({
        src: item.src,
        sourceStartFrame: item.sourceStartFrame,
        sourceDurationInFrames: item.sourceDurationInFrames,
        fps,
        volume: item.volume,
        loop: false,
      });
      setAuditioning(true);
      window.setTimeout(() => setAuditioning(false), Math.max(
        100,
        (item.sourceDurationInFrames / Math.max(1, fps)) * 1000,
      ));
    } catch {
      setAuditioning(false);
    }
  };

  const stopAudition = () => {
    stopAuditionRef.current?.();
    stopAuditionRef.current = null;
    setAuditioning(false);
  };

  const duplicateSfx = () => {
    if (!isSfx) {
      return;
    }
    const projectDuration = state.project.project.durationInFrames;
    const latestStart = Math.max(0, projectDuration - item.durationInFrames);
    const preferred = item.timelineStartFrame + item.durationInFrames;
    dispatch(
      editorActions.duplicateItem(
        item.id,
        createDuplicateAudioId(state.project, item),
        Math.min(latestStart, preferred),
        item.trackId,
      ),
    );
  };

  const fitBgmToEnd = () => {
    if (!isBgm) {
      return;
    }
    dispatch(
      editorActions.changeItemDuration(
        item.id,
        Math.max(
          1,
          state.project.project.durationInFrames - item.timelineStartFrame,
        ),
      ),
    );
  };

  return (
    <div
      data-editor-audio-inspector={item.id}
      style={{display: "grid", gap: 10, padding: 10}}
    >
      <div>
        <div style={{fontSize: 12, fontWeight: 800}}>{item.type}</div>
        <div
          title={item.id}
          style={{
            marginTop: 3,
            fontSize: 10,
            opacity: 0.58,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.id}
        </div>
      </div>

      <div style={sectionStyle}>
        <NumericField
          label="Start"
          value={item.timelineStartFrame}
          min={0}
          max={Math.max(0, state.project.project.durationInFrames - 1)}
          onCommit={(value) =>
            dispatch(editorActions.moveItem(item.id, Math.round(value)))
          }
        />
        <NumericField
          label="Duration"
          value={item.durationInFrames}
          min={1}
          max={Math.max(
            1,
            state.project.project.durationInFrames - item.timelineStartFrame,
          )}
          onCommit={(value) =>
            dispatch(
              editorActions.changeItemDuration(item.id, Math.round(value)),
            )
          }
        />
      </div>

      <div
        style={{
          padding: "7px 8px",
          borderRadius: 5,
          background: "rgba(255,255,255,0.045)",
          fontSize: 10,
          lineHeight: 1.5,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <div>Source In: F{item.sourceStartFrame}</div>
        <div>
          Source Out: F
          {item.sourceStartFrame + item.sourceDurationInFrames}
        </div>
        <div>Source Span: {item.sourceDurationInFrames}f</div>
        {isBgm ? (
          <div>
            Loop: {item.loop ? "ON" : "OFF"} · Timeline{" "}
            {item.durationInFrames}f
          </div>
        ) : null}
      </div>

      <div style={sectionStyle}>
        <NumericField
          label="Volume"
          value={item.volume}
          min={0}
          max={1}
          step={0.01}
          onCommit={(value) =>
            dispatch(editorActions.changeVolume(item.id, value))
          }
        />
        <label style={labelStyle}>
          <span>Volume slider · {Math.round(item.volume * 100)}%</span>
          <input
            type="range"
            value={item.volume}
            min={0}
            max={1}
            step={0.01}
            onChange={(event) =>
              dispatch(
                editorActions.changeVolume(
                  item.id,
                  Number(event.target.value),
                ),
              )
            }
            style={{width: "100%"}}
          />
        </label>
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>
          <span>Mute</span>
          <input
            type="checkbox"
            checked={item.muted}
            onChange={(event) =>
              dispatch(
                editorActions.changeAudioMuted(item.id, event.target.checked),
              )
            }
          />
        </label>
        <NumericField
          label="Fade In"
          value={item.fadeInFrames}
          min={0}
          max={item.durationInFrames}
          onCommit={(value) =>
            dispatch(
              editorActions.changeAudioFades(item.id, {
                fadeInFrames: Math.round(value),
              }),
            )
          }
        />
        <NumericField
          label="Fade Out"
          value={item.fadeOutFrames}
          min={0}
          max={item.durationInFrames}
          onCommit={(value) =>
            dispatch(
              editorActions.changeAudioFades(item.id, {
                fadeOutFrames: Math.round(value),
              }),
            )
          }
        />
      </div>

      {isBgm ? (
        <div style={sectionStyle}>
          <label
            style={{
              ...labelStyle,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>Loop</span>
            <input
              type="checkbox"
              checked={item.loop === true}
              onChange={(event) =>
                dispatch(
                  editorActions.changeAudioLoop(
                    item.id,
                    event.target.checked,
                  ),
                )
              }
            />
          </label>
          <button type="button" onClick={fitBgmToEnd} style={buttonStyle}>
            끝까지 채우기
          </button>
        </div>
      ) : null}

      {isTts ? (
        <button
          type="button"
          onClick={split}
          disabled={!canSplit}
          style={{
            ...buttonStyle,
            background: canSplit
              ? "rgba(118,74,145,0.72)"
              : "rgba(255,255,255,0.06)",
            color: canSplit ? "white" : "rgba(255,255,255,0.35)",
            cursor: canSplit ? "pointer" : "not-allowed",
          }}
        >
          Split at Playhead · F{frame}
        </button>
      ) : null}

      {isBgm || isSfx ? (
        <div style={sectionStyle}>
          <button
            type="button"
            onClick={() => void audition()}
            style={buttonStyle}
          >
            {auditioning ? "▶ 재시작" : "▶ Audition"}
          </button>
          <button type="button" onClick={stopAudition} style={buttonStyle}>
            ■ Stop
          </button>
        </div>
      ) : null}

      {isSfx ? (
        <button type="button" onClick={duplicateSfx} style={buttonStyle}>
          SFX 복제
        </button>
      ) : null}

      {isBgm || isSfx ? (
        <button
          type="button"
          onClick={() => dispatch(editorActions.deleteItem(item.id))}
          style={{
            ...buttonStyle,
            border: "1px solid rgba(255,110,100,0.4)",
            background: "rgba(150,44,38,0.24)",
            color: "#ffc1ba",
          }}
        >
          {item.type} 삭제
        </button>
      ) : null}
    </div>
  );
};
