import {uploadBgm} from "../../audio/audio-api";
import {probeAudioFileDurationFrames} from "./audioAssetUtils";

export const EXTERNAL_BGM_ACCEPT = ".mp3,.wav,.m4a";

const SUPPORTED_EXTENSIONS = new Set(["mp3", "wav", "m4a"]);

export const isSupportedExternalBgmFile = (file: File): boolean => {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (SUPPORTED_EXTENSIONS.has(extension)) {
    return true;
  }

  return (
    file.type === "audio/mpeg" ||
    file.type === "audio/wav" ||
    file.type === "audio/x-wav" ||
    file.type === "audio/mp4" ||
    file.type === "audio/x-m4a"
  );
};

export const uploadExternalBgmFile = async ({
  file,
  fps,
  startFrame,
  volume = 0.1,
}: {
  file: File;
  fps: number;
  startFrame: number;
  volume?: number;
}): Promise<{
  src: string;
  volume: number;
  startFrame: number;
  assetFrames: number;
}> => {
  if (!isSupportedExternalBgmFile(file)) {
    throw new Error("BGM은 MP3, WAV, M4A 파일만 추가할 수 있습니다.");
  }

  const assetFrames = await probeAudioFileDurationFrames(file, fps);
  const uploaded = await uploadBgm(file, volume, startFrame);
  if (!uploaded.bgm.path) {
    throw new Error("BGM upload returned no path");
  }

  return {
    src: uploaded.bgm.path,
    volume: uploaded.bgm.volume,
    startFrame,
    assetFrames,
  };
};
