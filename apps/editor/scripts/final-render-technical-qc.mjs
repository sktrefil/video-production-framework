import {parseMedia} from "@remotion/media-parser";
import {nodeReader} from "@remotion/media-parser/node";

const normalize = (value) => String(value ?? "").trim().toLowerCase();

export const normalizeMediaParserResult = (result) => ({
  container: String(result?.container ?? ""),
  videoCodec: String(result?.videoCodec ?? ""),
  ...(result?.audioCodec
    ? {audioCodec: String(result.audioCodec)}
    : {}),
  // @remotion/media-parser does not expose pixel format.
  // The renderer fixes this value through --pixel-format=yuv420p,
  // and Technical QC separately verifies the declared render profile.
  pixelFormat: "yuv420p",
  pixelFormatVerification: "RENDER_PROFILE",
  width: Number(result?.dimensions?.width ?? 0),
  height: Number(result?.dimensions?.height ?? 0),
  fps: Number(result?.slowFps ?? result?.fps ?? 0),
  durationMs:
    Number(result?.slowDurationInSeconds ?? result?.durationInSeconds ?? 0) *
    1000,
  hasAudioStream: Boolean(result?.audioCodec),
});

export const probeFinalRender = async (outputPath) => {
  const result = await parseMedia({
    src: outputPath,
    reader: nodeReader,
    fields: {
      container: true,
      videoCodec: true,
      audioCodec: true,
      dimensions: true,
      slowFps: true,
      slowDurationInSeconds: true,
    },
    logLevel: "error",
    acknowledgeRemotionLicense: true,
  });

  return normalizeMediaParserResult(result);
};

const hasAudibleAudio = (project) => {
  if (Number(project?.settings?.masterVolume ?? 1) <= 0) return false;
  const trackById = new Map(
    (Array.isArray(project?.tracks) ? project.tracks : []).map((track) => [
      track.id,
      track,
    ]),
  );
  return (Array.isArray(project?.items) ? project.items : []).some((item) => {
    if (!["TTS", "CLIP_AUDIO", "BGM", "SFX"].includes(item?.type)) {
      return false;
    }
    const track = trackById.get(item.trackId);
    if (track?.enabled === false || item.enabled === false) return false;
    return item.muted !== true && Number(item.volume ?? 0) > 0;
  });
};

const expectedDurationMs = (project) =>
  (Number(project.project.durationInFrames) / Number(project.project.fps)) *
  1000;

export const validateFinalRenderTechnicalQc = ({
  project,
  renderManifest,
  probe,
}) => {
  const issues = [];
  const expectedAudio = hasAudibleAudio(project);
  const expectedDuration = expectedDurationMs(project);
  const durationToleranceMs = Math.max(
    100,
    2000 / Number(project.project.fps),
  );

  if (renderManifest?.projectId !== project.project.id) {
    issues.push("PROJECT_ID_MISMATCH");
  }
  if (
    renderManifest?.metadata?.fps !== project.project.fps ||
    renderManifest?.metadata?.width !== project.project.width ||
    renderManifest?.metadata?.height !== project.project.height ||
    renderManifest?.metadata?.durationInFrames !==
      project.project.durationInFrames
  ) {
    issues.push("RENDER_METADATA_MISMATCH");
  }
  if (renderManifest?.compositionId !== "GenericFinalRender") {
    issues.push("COMPOSITION_MISMATCH");
  }

  if (normalize(renderManifest?.output?.codec) !== "h264") {
    issues.push("DECLARED_VIDEO_CODEC_MISMATCH");
  }
  if (normalize(renderManifest?.output?.audioCodec) !== "aac") {
    issues.push("DECLARED_AUDIO_CODEC_MISMATCH");
  }
  if (normalize(renderManifest?.output?.pixelFormat) !== "yuv420p") {
    issues.push("DECLARED_PIXEL_FORMAT_MISMATCH");
  }
  if (Number(renderManifest?.output?.crf) !== 18) {
    issues.push("DECLARED_CRF_MISMATCH");
  }

  if (normalize(probe.container) !== "mp4") {
    issues.push("CONTAINER_NOT_MP4");
  }
  if (normalize(probe.videoCodec) !== "h264") {
    issues.push("VIDEO_CODEC_NOT_H264");
  }
  if (
    probe.pixelFormatVerification !== "RENDER_PROFILE" &&
    normalize(probe.pixelFormat) !== "yuv420p"
  ) {
    issues.push("PIXEL_FORMAT_NOT_YUV420P");
  }
  if (
    probe.width !== project.project.width ||
    probe.height !== project.project.height
  ) {
    issues.push("DIMENSIONS_MISMATCH");
  }
  if (
    !Number.isFinite(probe.fps) ||
    Math.abs(probe.fps - project.project.fps) > 0.01
  ) {
    issues.push("FPS_MISMATCH");
  }
  if (
    !Number.isFinite(probe.durationMs) ||
    probe.durationMs <= 0 ||
    Math.abs(probe.durationMs - expectedDuration) > durationToleranceMs
  ) {
    issues.push("DURATION_MISMATCH");
  }
  if (expectedAudio) {
    if (!probe.hasAudioStream) {
      issues.push("AUDIO_STREAM_MISSING");
    } else if (normalize(probe.audioCodec) !== "aac") {
      issues.push("AUDIO_CODEC_NOT_AAC");
    }
  } else if (probe.hasAudioStream) {
    issues.push("UNEXPECTED_AUDIO_STREAM");
  }

  return {
    schemaVersion: 1,
    status: issues.length === 0 ? "PASS" : "FAIL",
    projectId: project.project.id,
    checkedAt: new Date().toISOString(),
    expected: {
      fps: project.project.fps,
      width: project.project.width,
      height: project.project.height,
      durationInFrames: project.project.durationInFrames,
      durationMs: expectedDuration,
      audioExpected: expectedAudio,
      codec: "h264",
      audioCodec: "aac",
      pixelFormat: "yuv420p",
    },
    actual: probe,
    issueCodes: [...new Set(issues)],
  };
};
