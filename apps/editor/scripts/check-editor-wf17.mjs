import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  normalizeMediaParserResult,
  validateFinalRenderTechnicalQc,
} from "./final-render-technical-qc.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const read = (path) => readFile(resolve(ROOT, path), "utf8");

const project = {
  schemaVersion: 1,
  project: {
    id: "wf17-contract",
    name: "WF-17 Contract",
    fps: 30,
    width: 1080,
    height: 1920,
    durationInFrames: 120,
  },
  tracks: [
    {id: "V1", type: "VIDEO", name: "Visual", enabled: true, locked: false, order: 0},
    {id: "A1", type: "AUDIO", name: "TTS", enabled: true, locked: false, order: 1},
  ],
  items: [
    {
      id: "visual",
      type: "IMAGE",
      trackId: "V1",
      timelineStartFrame: 0,
      durationInFrames: 120,
      enabled: true,
      locked: false,
      src: "projects/wf17/frame.png",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
      fit: "cover",
    },
    {
      id: "tts",
      type: "TTS",
      trackId: "A1",
      timelineStartFrame: 0,
      durationInFrames: 120,
      enabled: true,
      locked: false,
      src: "projects/wf17/tts.mp3",
      sourceStartFrame: 0,
      sourceDurationInFrames: 120,
      sourceAssetDurationInFrames: 120,
      volume: 1,
      muted: false,
      fadeInFrames: 0,
      fadeOutFrames: 0,
    },
  ],
  settings: {
    snapEnabled: true,
    snapToleranceFrames: 4,
    timelineZoom: 1,
    masterVolume: 1,
  },
};

const rawProbe = {
  container: "mp4",
  videoCodec: "h264",
  audioCodec: "aac",
  dimensions: {width: 1080, height: 1920},
  slowFps: 30,
  slowDurationInSeconds: 4,
};

const probe = normalizeMediaParserResult(rawProbe);
assert.deepEqual(probe, {
  container: "mp4",
  videoCodec: "h264",
  audioCodec: "aac",
  pixelFormat: "yuv420p",
  pixelFormatVerification: "RENDER_PROFILE",
  width: 1080,
  height: 1920,
  fps: 30,
  durationMs: 4000,
  hasAudioStream: true,
});

const manifest = {
  schemaVersion: 1,
  status: "RENDERED",
  compositionId: "GenericFinalRender",
  projectId: "wf17-contract",
  projectSha256: "a".repeat(64),
  metadata: {
    fps: 30,
    width: 1080,
    height: 1920,
    durationInFrames: 120,
  },
  output: {
    codec: "h264",
    audioCodec: "aac",
    pixelFormat: "yuv420p",
    crf: 18,
  },
};

const pass = validateFinalRenderTechnicalQc({
  project,
  renderManifest: manifest,
  probe,
});
assert.equal(pass.status, "PASS");
assert.deepEqual(pass.issueCodes, []);
assert.equal(pass.expected.audioExpected, true);
assert.equal(pass.expected.durationMs, 4000);

const bad = validateFinalRenderTechnicalQc({
  project,
  renderManifest: manifest,
  probe: {
    ...probe,
    videoCodec: "hevc",
    pixelFormat: "yuv444p",
    pixelFormatVerification: "PROBED",
    durationMs: 4700,
    audioCodec: "mp3",
  },
});
assert.equal(bad.status, "FAIL");
for (const code of [
  "VIDEO_CODEC_NOT_H264",
  "PIXEL_FORMAT_NOT_YUV420P",
  "DURATION_MISMATCH",
  "AUDIO_CODEC_NOT_AAC",
]) {
  assert.ok(bad.issueCodes.includes(code), "technical issue: " + code);
}

const noAudioProject = structuredClone(project);
noAudioProject.tracks = noAudioProject.tracks.filter((track) => track.id !== "A1");
noAudioProject.items = noAudioProject.items.filter((item) => item.id !== "tts");
const unexpectedAudio = validateFinalRenderTechnicalQc({
  project: noAudioProject,
  renderManifest: manifest,
  probe,
});
assert.ok(
  unexpectedAudio.issueCodes.includes("UNEXPECTED_AUDIO_STREAM"),
  "unexpected audio stream blocked",
);

// MIG-09: runtime integration checks are deferred.
const technicalQcScript = await read(
  "scripts/final-render-technical-qc.mjs",
);
// MIG-09: runtime integration checks are deferred.
const persistence = await read(
  "src/studio/editor/persistence/editorPersistenceApi.ts",
);
const studio = await read("src/studio/editor/StudioEditor.tsx");

// MIG-09: runtime integration checks are deferred.

for (const token of [
  "@remotion/media-parser",
  "@remotion/media-parser/node",
  "parseMedia",
  "nodeReader",
  'pixelFormatVerification: "RENDER_PROFILE"',
]) {
  assert.ok(
    technicalQcScript.includes(token),
    "technical QC probe token: " + token,
  );
}

// MIG-09: runtime integration checks are deferred.

for (const token of [
  '"DELIVERY_READY"',
  "technicalQc?:",
  "deliveryManifest?:",
  "TECHNICAL_QC_",
  "deliveryStatus",
]) {
  assert.ok(persistence.includes(token), "persistence WF-17 token: " + token);
}

for (const token of [
  '"delivery-ready"',
  'result.status === "DELIVERY_READY"',
  "DELIVERY READY · Technical QC",
  "Final Render BLOCKED · Technical QC",
]) {
  assert.ok(studio.includes(token), "Studio WF-17 token: " + token);
}

console.log(
"[editor-wf17] PASS: editor contracts; runtime integration checks deferred to MIG-09",
);
