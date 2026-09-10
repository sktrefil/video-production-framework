import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  createEditorState,
  editorReducer,
} from "../src/studio/editor/editorReducer.ts";
import {
  createBgmTimelineItem,
  createDuplicateAudioId,
  createSfxTimelineItem,
  planAudioTracks,
} from "../src/studio/editor/audio/audioTrackPresets.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const read = (path) => readFile(resolve(ROOT, path), "utf8");

const project = {
  schemaVersion: 1,
  project: {
    id: "audio-e8-test",
    name: "BGM SFX E8 Test",
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
  items: [],
  settings: {
    snapEnabled: true,
    snapToleranceFrames: 4,
    timelineZoom: 1,
    masterVolume: 1,
  },
};

const plan = planAudioTracks(project);
assert.equal(plan.tracksToAdd.length, 2, "BGM + SFX tracks auto planned");
assert.ok(plan.bgmTrackId.includes("BGM"), "BGM track id");
assert.ok(plan.sfxTrackId.includes("SFX"), "SFX track id");
assert.ok(
  plan.tracksToAdd.find((track) => track.id === plan.bgmTrackId)?.order <
    plan.tracksToAdd.find((track) => track.id === plan.sfxTrackId)?.order,
  "BGM track before SFX track",
);

const bgm = createBgmTimelineItem({
  project,
  trackId: plan.bgmTrackId,
  src: "projects/test/bgm.mp3",
  startFrame: 60,
  sourceAssetDurationInFrames: 90,
  volume: 0.1,
});
assert.equal(bgm.type, "BGM", "BGM item type");
assert.equal(bgm.loop, true, "BGM defaults to loop");
assert.equal(bgm.durationInFrames, 540, "BGM fills composition remainder");
assert.equal(bgm.sourceDurationInFrames, 90, "BGM retains one source cycle");

const sfx = createSfxTimelineItem({
  project,
  trackId: plan.sfxTrackId,
  src: "projects/test/sfx.wav",
  startFrame: 150,
  sourceAssetDurationInFrames: 60,
  volume: 0.18,
});
assert.equal(sfx.type, "SFX", "SFX item type");
assert.equal(sfx.loop, false, "SFX does not loop");
assert.equal(sfx.durationInFrames, 60, "SFX uses source duration");

let state = createEditorState(project);
for (const track of plan.tracksToAdd) {
  state = editorReducer(state, {type: "ADD_TRACK", track});
}
state = editorReducer(state, {type: "ADD_ITEM", item: bgm});
state = editorReducer(state, {type: "ADD_ITEM", item: sfx});

const item = (id) => {
  const value = state.project.items.find((entry) => entry.id === id);
  assert.ok(value, "missing item: " + id);
  return value;
};

state = editorReducer(state, {
  type: "CHANGE_ITEM_DURATION",
  itemId: bgm.id,
  durationInFrames: 220,
});
assert.equal(item(bgm.id).durationInFrames, 220, "loop BGM can shorten");
assert.equal(
  item(bgm.id).sourceDurationInFrames,
  90,
  "loop BGM shorten preserves source window",
);

state = editorReducer(state, {
  type: "CHANGE_ITEM_DURATION",
  itemId: bgm.id,
  durationInFrames: 500,
});
assert.equal(
  item(bgm.id).durationInFrames,
  500,
  "loop BGM expands beyond source duration",
);
assert.equal(
  item(bgm.id).sourceDurationInFrames,
  90,
  "loop BGM expansion preserves source cycle",
);

state = editorReducer(state, {
  type: "TRIM_ITEM_START",
  itemId: bgm.id,
  deltaFrames: -20,
});
assert.equal(item(bgm.id).timelineStartFrame, 40, "loop BGM left expansion");
assert.equal(
  item(bgm.id).sourceStartFrame,
  0,
  "loop BGM left expansion preserves source in",
);

state = editorReducer(state, {
  type: "CHANGE_AUDIO_LOOP",
  itemId: bgm.id,
  loop: false,
});
assert.equal(item(bgm.id).loop, false, "BGM loop toggle off");
state = editorReducer(state, {
  type: "CHANGE_AUDIO_LOOP",
  itemId: bgm.id,
  loop: true,
});
assert.equal(item(bgm.id).loop, true, "BGM loop toggle on");

state = editorReducer(state, {
  type: "CHANGE_AUDIO_LOOP",
  itemId: sfx.id,
  loop: true,
});
assert.equal(item(sfx.id).loop, false, "SFX loop toggle rejected");

state = editorReducer(state, {
  type: "TRIM_ITEM_START",
  itemId: sfx.id,
  deltaFrames: 5,
});
assert.equal(item(sfx.id).timelineStartFrame, 155, "SFX left trim timeline");
assert.equal(item(sfx.id).sourceStartFrame, 5, "SFX left trim source in");
assert.equal(item(sfx.id).sourceDurationInFrames, 55, "SFX trim source span");

state = editorReducer(state, {
  type: "TRIM_ITEM_END",
  itemId: sfx.id,
  deltaFrames: 7,
});
assert.equal(item(sfx.id).durationInFrames, 48, "SFX right trim");
assert.equal(item(sfx.id).sourceDurationInFrames, 48, "SFX source out trim");

state = editorReducer(state, {
  type: "CHANGE_VOLUME",
  itemId: sfx.id,
  volume: 0.37,
});
state = editorReducer(state, {
  type: "CHANGE_AUDIO_MUTED",
  itemId: sfx.id,
  muted: true,
});
state = editorReducer(state, {
  type: "CHANGE_AUDIO_FADES",
  itemId: sfx.id,
  fadeInFrames: 4,
  fadeOutFrames: 8,
});
assert.equal(item(sfx.id).volume, 0.37, "SFX volume");
assert.equal(item(sfx.id).muted, true, "SFX mute");
assert.equal(item(sfx.id).fadeInFrames, 4, "SFX fade in");
assert.equal(item(sfx.id).fadeOutFrames, 8, "SFX fade out");

const duplicateId = createDuplicateAudioId(state.project, item(sfx.id));
state = editorReducer(state, {
  type: "DUPLICATE_ITEM",
  itemId: sfx.id,
  newItemId: duplicateId,
  timelineStartFrame: 240,
  trackId: plan.sfxTrackId,
});
assert.ok(item(duplicateId), "SFX duplicate");
assert.equal(item(duplicateId).type, "SFX", "duplicate remains SFX");

const renderer = await read("src/editor/AudioItemRenderer.tsx");
const timeline = await read("src/studio/editor/timeline/Timeline.tsx");
const timelineItem = await read(
  "src/studio/editor/timeline/TimelineItem.tsx",
);
const timelineTrack = await read(
  "src/studio/editor/timeline/TimelineTrack.tsx",
);
const inspector = await read("src/studio/editor/inspector/Inspector.tsx");
const audioInspector = await read(
  "src/studio/editor/inspector/AudioInspector.tsx",
);
const assetPanel = await read(
  "src/studio/editor/audio/AudioAssetPanel.tsx",
);
const externalBgmImport = await read(
  "src/studio/editor/audio/externalBgmImport.ts",
);
const waveform = await read("src/studio/editor/audio/Waveform.tsx");
const studioEditor = await read("src/studio/editor/StudioEditor.tsx");
const root = await read("src/Root.tsx");
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.

assert.ok(renderer.includes("loop={item.loop === true}"), "renderer BGM loop");
assert.ok(
  renderer.includes('loopVolumeCurveBehavior="extend"'),
  "loop fade envelope uses composition frame",
);
assert.ok(renderer.includes("fadeInFrames"), "renderer fade in");
assert.ok(renderer.includes("fadeOutFrames"), "renderer fade out");

assert.ok(timeline.includes('candidate.type === "BGM"'), "BGM timeline editing");
assert.ok(timeline.includes('candidate.type === "SFX"'), "SFX timeline editing");
assert.ok(
  timeline.includes("isLoopingBgm"),
  "loop BGM timeline trim boundary handling",
);
assert.ok(timelineItem.includes('item.type === "BGM"'), "BGM drag handles");
assert.ok(timelineItem.includes('item.type === "SFX"'), "SFX drag handles");
assert.ok(
  timelineItem.includes("<Waveform item={item}"),
  "audio items render waveform",
);

assert.ok(
  inspector.includes('selected[0].type === "BGM"'),
  "BGM inspector routing",
);
assert.ok(
  inspector.includes('selected[0].type === "SFX"'),
  "SFX inspector routing",
);

for (const label of [
  "Volume",
  "Mute",
  "Fade In",
  "Fade Out",
  "Loop",
  "끝까지 채우기",
  "Audition",
  "SFX 복제",
]) {
  assert.ok(audioInspector.includes(label), "audio inspector: " + label);
}
assert.ok(
  audioInspector.includes("auditionAudioItem"),
  "audio audition helper used",
);
assert.ok(
  audioInspector.includes("createDuplicateAudioId"),
  "SFX duplicate helper used",
);
assert.ok(
  audioInspector.includes("deleteItem(item.id)"),
  "BGM/SFX delete route",
);
assert.ok(
  audioInspector.includes("{item.type} 삭제"),
  "audio delete label",
);

for (const token of [
  "getStudioAudioState",
  "getSfxState",
  "importInboxBgm",
  "importInboxSfx",
  "uploadExternalBgmFile",
  "uploadSfx",
  "기존 SFX Workbench 항목 가져오기",
  "현재 BGM을 Generic Timeline에 추가",
]) {
  assert.ok(assetPanel.includes(token), "asset panel integration: " + token);
}
assert.ok(
  assetPanel.includes("planAudioTracks"),
  "asset panel auto-creates A3/A4",
);
assert.ok(
  assetPanel.includes("probeAudioDurationFrames"),
  "asset duration probing",
);
assert.ok(
  assetPanel.includes('data-editor-bgm-drop-zone="true"'),
  "BGM panel external drag/drop zone",
);
assert.ok(
  assetPanel.includes("+ BGM 추가"),
  "BGM panel explicit add button",
);
assert.ok(
  externalBgmImport.includes("uploadExternalBgmFile"),
  "shared external BGM upload helper",
);
assert.ok(
  externalBgmImport.includes("isSupportedExternalBgmFile"),
  "external BGM file validation",
);
assert.ok(
  timelineTrack.includes('data-editor-bgm-drop-target'),
  "BGM timeline drop target",
);
assert.ok(
  timelineTrack.includes("onExternalBgmDrop"),
  "BGM drop callback wiring",
);
assert.ok(waveform.includes("decodeAudioData"), "waveform decode retained");

assert.ok(studioEditor.includes("BGM/SFX"), "BGM/SFX toolbar button");
assert.ok(
  studioEditor.includes('data-editor-add-bgm-button="true"'),
  "toolbar + BGM add button",
);
assert.ok(
  studioEditor.includes("onImportBgmFile"),
  "timeline external BGM import hook",
);
assert.ok(
  studioEditor.includes("AudioAssetPanel"),
  "BGM/SFX asset panel mounted",
);

// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.

console.log(
"[editor-bgm-sfx] PASS: editor contracts; runtime integration checks deferred to MIG-09",
);
