import {resolveEditorMediaSrc} from "../../../editor/mediaSource";

const waitForAudioMetadata = (
  src: string,
): Promise<number> =>
  new Promise((resolve, reject) => {
    const audio = new window.Audio();
    audio.preload = "metadata";

    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", loaded);
      audio.removeEventListener("error", failed);
      audio.src = "";
    };
    const loaded = () => {
      const duration = Number(audio.duration);
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("오디오 길이를 확인할 수 없습니다."));
        return;
      }
      resolve(duration);
    };
    const failed = () => {
      cleanup();
      reject(new Error("오디오 메타데이터를 읽지 못했습니다."));
    };

    audio.addEventListener("loadedmetadata", loaded, {once: true});
    audio.addEventListener("error", failed, {once: true});
    audio.src = src;
  });

export const probeAudioDurationSeconds = async (
  src: string,
): Promise<number> =>
  waitForAudioMetadata(
    /^https?:|^blob:|^data:/i.test(src)
      ? src
      : resolveEditorMediaSrc(src),
  );

export const probeAudioDurationFrames = async (
  src: string,
  fps: number,
): Promise<number> =>
  Math.max(
    1,
    Math.round((await probeAudioDurationSeconds(src)) * Math.max(1, fps)),
  );

export const probeAudioFileDurationFrames = async (
  file: File,
  fps: number,
): Promise<number> => {
  const url = URL.createObjectURL(file);
  try {
    return Math.max(
      1,
      Math.round((await waitForAudioMetadata(url)) * Math.max(1, fps)),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const auditionAudioItem = async ({
  src,
  sourceStartFrame,
  sourceDurationInFrames,
  fps,
  volume,
  loop = false,
}: {
  src: string;
  sourceStartFrame: number;
  sourceDurationInFrames: number;
  fps: number;
  volume: number;
  loop?: boolean;
}): Promise<() => void> => {
  const audio = new window.Audio();
  audio.preload = "auto";
  audio.volume = Math.min(1, Math.max(0, volume));
  audio.loop = loop;

  const startSeconds = sourceStartFrame / Math.max(1, fps);
  const durationMs =
    (sourceDurationInFrames / Math.max(1, fps)) * 1000;

  const ready = new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", loaded);
      audio.removeEventListener("error", failed);
    };
    const loaded = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error("오디오 미리듣기에 실패했습니다."));
    };
    audio.addEventListener("loadedmetadata", loaded, {once: true});
    audio.addEventListener("error", failed, {once: true});
  });

  audio.src = resolveEditorMediaSrc(src);
  await ready;
  audio.currentTime = Math.max(0, startSeconds);
  await audio.play();

  const timer = window.setTimeout(() => {
    if (!loop) {
      audio.pause();
    }
  }, Math.max(100, durationMs));

  return () => {
    window.clearTimeout(timer);
    audio.pause();
    audio.src = "";
  };
};
