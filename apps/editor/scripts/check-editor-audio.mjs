import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  createEditorState,
  editorReducer,
} from "../src/studio/editor/editorReducer.ts";
import {
  canSplitItemAtFrame,
  createSplitItemId,
} from "../src/studio/editor/audio/audioEditUtils.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const read = (path) => readFile(resolve(ROOT, path), "utf8");

const project = {
  schemaVersion: 1,
  project: {
    id: "tts-e5-test",
    name: "TTS E5 Test",
    fps: 30,
    width: 1080,
    height: 1920,
    durationInFrames: 600,
  },
  tracks: [
    {
      id: "A1",
      type: "AUDIO",
      name: "TTS",
      enabled: true,
      locked: false,
      order: 0,
    },
  ],
  items: [
    {
      id: "tts-main",
      type: "TTS",
      trackId: "A1",
      timelineStartFrame: 30,
      durationInFrames: 180,
      enabled: true,
      locked: false,
      src: "audio/tts.mp3",
      sourceStartFrame: 60,
      sourceDurationInFrames: 180,
      sourceAssetDurationInFrames: 360,
      volume: 0.8,
      muted: false,
      fadeInFrames: 12,
      fadeOutFrames: 18,
    },
  ],
  settings: {
    snapEnabled: true,
    snapToleranceFrames: 4,
    timelineZoom: 1,
    masterVolume: 1,
  },
};

let state = createEditorState(project);
const item = (id) => {
  const value = state.project.items.find((candidate) => candidate.id === id);
  assert.ok(value, `missing item: ${id}`);
  return value;
};

assert.equal(
  canSplitItemAtFrame(state, "tts-main", 90),
  true,
  "split inside TTS",
);
assert.equal(
  canSplitItemAtFrame(state, "tts-main", 30),
  false,
  "no split at TTS start",
);

const splitId = createSplitItemId(state, "tts-main", 90);
assert.equal(splitId, "tts-main-split-90", "deterministic split id");

state = editorReducer(state, {
  type: "SPLIT_AUDIO_ITEM",
  itemId: "tts-main",
  splitFrame: 90,
  newItemId: splitId,
});

const left = item("tts-main");
const right = item(splitId);
assert.equal(left.durationInFrames, 60, "left timeline duration");
assert.equal(right.timelineStartFrame, 90, "right timeline start");
assert.equal(right.durationInFrames, 120, "right timeline duration");
assert.equal(left.sourceStartFrame, 60, "left source start");
assert.equal(left.sourceDurationInFrames, 60, "left source span");
assert.equal(right.sourceStartFrame, 120, "right source start");
assert.equal(right.sourceDurationInFrames, 120, "right source span");
assert.equal(
  left.sourceDurationInFrames + right.sourceDurationInFrames,
  180,
  "split preserves source span",
);
assert.equal(right.volume, 0.8, "split preserves volume");
assert.ok(
  left.fadeOutFrames <= left.durationInFrames,
  "split clamps left fade",
);
assert.ok(
  right.fadeInFrames <= right.durationInFrames,
  "split clamps right fade",
);

state = editorReducer(state, {
  type: "MOVE_ITEM",
  itemId: splitId,
  timelineStartFrame: 108,
});
assert.equal(item(splitId).timelineStartFrame, 108, "TTS segment move");

state = editorReducer(state, {
  type: "TRIM_ITEM_START",
  itemId: splitId,
  deltaFrames: 8,
});
assert.equal(item(splitId).timelineStartFrame, 116, "TTS left trim start");
assert.equal(item(splitId).sourceStartFrame, 128, "TTS source in follows trim");
assert.equal(item(splitId).durationInFrames, 112, "TTS left trim duration");

state = editorReducer(state, {
  type: "TRIM_ITEM_END",
  itemId: splitId,
  deltaFrames: 12,
});
assert.equal(item(splitId).durationInFrames, 100, "TTS right trim duration");
assert.equal(item(splitId).sourceDurationInFrames, 100, "TTS source out follows trim");

state = editorReducer(state, {
  type: "CHANGE_VOLUME",
  itemId: splitId,
  volume: 0.42,
});
assert.equal(item(splitId).volume, 0.42, "TTS segment volume");

state = editorReducer(state, {
  type: "CHANGE_AUDIO_MUTED",
  itemId: splitId,
  muted: true,
});
assert.equal(item(splitId).muted, true, "TTS mute");

state = editorReducer(state, {
  type: "CHANGE_AUDIO_FADES",
  itemId: splitId,
  fadeInFrames: 999,
  fadeOutFrames: 25,
});
assert.equal(
  item(splitId).fadeInFrames,
  item(splitId).durationInFrames,
  "fade in clamped to segment",
);
assert.equal(item(splitId).fadeOutFrames, 25, "fade out update");

const secondId = createSplitItemId(state, "tts-main", 90);
assert.equal(
  secondId,
  "tts-main-split-90-2",
  "split id collision suffix",
);

const waveform = await read("src/studio/editor/audio/Waveform.tsx");
const audioInspector = await read(
  "src/studio/editor/inspector/AudioInspector.tsx",
);
const inspector = await read("src/studio/editor/inspector/Inspector.tsx");
const timeline = await read("src/studio/editor/timeline/Timeline.tsx");
const timelineItem = await read(
  "src/studio/editor/timeline/TimelineItem.tsx",
);
const studioEditor = await read("src/studio/editor/StudioEditor.tsx");

assert.match(waveform, /waveformCache/, "waveform source cache");
assert.match(waveform, /decodeAudioData/, "Web Audio decode");
assert.match(waveform, /sourceStartFrame/, "waveform source-in slicing");
assert.match(waveform, /sourceDurationInFrames/, "waveform source span slicing");
assert.match(waveform, /data-editor-waveform/, "waveform timeline state");

assert.match(audioInspector, /Split at Playhead/, "TTS split button");
assert.match(audioInspector, /label="Volume"/, "TTS volume inspector");
assert.match(audioInspector, /label="Fade In"/, "TTS fade-in inspector");
assert.match(audioInspector, /label="Fade Out"/, "TTS fade-out inspector");
assert.match(audioInspector, /changeAudioMuted/, "TTS mute inspector");
assert.match(inspector, /selected\[0\]\.type === "TTS"/, "TTS inspector route");

assert.ok(
  timeline.includes('candidate.type === "TTS"'),
  "timeline interactions include TTS",
);
assert.ok(
  timelineItem.includes('item.type === "TTS"'),
  "TTS drag and trim handles enabled",
);
assert.match(timelineItem, /<Waveform item=\{item\}/, "TTS waveform mounted");
assert.match(studioEditor, /splitSelectedTts/, "TTS split keyboard handler");
assert.match(
  studioEditor,
  /event\.key\.toLowerCase\(\) === "s"/,
  "S split shortcut",
);

console.log(
  "[editor-audio] PASS: TTS split, drag, trim, volume, fade, mute, waveform, and split shortcut",
);
