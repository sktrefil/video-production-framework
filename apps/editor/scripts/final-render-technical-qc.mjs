import {parseMedia} from "@remotion/media-parser";
import {nodeReader} from "@remotion/media-parser/node";

export const normalizeMediaParserResult = result => ({
  container: String(result?.container ?? ""),
  videoCodec: String(result?.videoCodec ?? ""),
  ...(result?.audioCodec ? {audioCodec: String(result.audioCodec)} : {}),
  pixelFormat: "yuv420p",
  pixelFormatVerification: "RENDER_PROFILE",
  width: Number(result?.dimensions?.width ?? 0),
  height: Number(result?.dimensions?.height ?? 0),
  fps: Number(result?.slowFps ?? result?.fps ?? 0),
  durationMs: Number(result?.slowDurationInSeconds ?? result?.durationInSeconds ?? 0) * 1000,
  hasAudioStream: Boolean(result?.audioCodec)
});

export async function probeFinalRender(outputPath) {
  const result = await parseMedia({
    src: outputPath,
    reader: nodeReader,
    fields: {
      container: true,
      videoCodec: true,
      audioCodec: true,
      dimensions: true,
      slowFps: true,
      slowDurationInSeconds: true
    },
    logLevel: "error",
    acknowledgeRemotionLicense: true
  });
  return normalizeMediaParserResult(result);
}
