import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {editorActions} from "../src/studio/editor/editorActions.ts";
import {
  createEditorState,
} from "../src/studio/editor/editorReducer.ts";
import {
  editorHistoryReducer,
} from "../src/studio/editor/editorHistoryReducer.ts";
import {
  assertCompatibleEditorProject,
} from "../src/studio/editor/persistence/editorPersistenceApi.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const read = (path) => readFile(resolve(ROOT, path), "utf8");

const baseProject = {
  schemaVersion: 1,
  project: {
    id: "persistence-e9-test",
    name: "Persistence E9 Test",
    fps: 30,
    width: 1080,
    height: 1920,
    durationInFrames: 600,
  },
  tracks: [
    {id: "V1", type: "VIDEO", name: "Video", enabled: true, locked: false, order: 0},
    {id: "A1", type: "AUDIO", name: "TTS", enabled: true, locked: false, order: 1},
    {id: "A3", type: "AUDIO", name: "BGM", enabled: true, locked: false, order: 2},
    {id: "A4", type: "AUDIO", name: "SFX", enabled: true, locked: false, order: 3},
    {id: "T1", type: "TEXT", name: "Subtitles", enabled: true, locked: false, order: 4},
    {id: "T2", type: "TEXT", name: "Titles", enabled: true, locked: false, order: 5},
    {id: "G1", type: "GRAPHIC", name: "Graphics", enabled: true, locked: false, order: 6},
  ],
  items: [
    {
      id: "video-01",
      type: "VIDEO",
      trackId: "V1",
      timelineStartFrame: 0,
      durationInFrames: 120,
      enabled: true,
      locked: false,
      src: "projects/persistence-e9-test/video.mp4",
      sourceStartFrame: 0,
      sourceDurationInFrames: 120,
      sourceAssetDurationInFrames: 300,
      playbackRate: 1,
      volume: 0.1,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
      fit: "cover",
    },
    {
      id: "tts-01",
      type: "TTS",
      trackId: "A1",
      timelineStartFrame: 0,
      durationInFrames: 180,
      enabled: true,
      locked: false,
      src: "projects/persistence-e9-test/tts.mp3",
      sourceStartFrame: 0,
      sourceDurationInFrames: 180,
      sourceAssetDurationInFrames: 360,
      volume: 0.9,
      muted: false,
      fadeInFrames: 3,
      fadeOutFrames: 6,
    },
    {
      id: "bgm-01",
      type: "BGM",
      trackId: "A3",
      timelineStartFrame: 0,
      durationInFrames: 600,
      enabled: true,
      locked: false,
      src: "projects/persistence-e9-test/bgm.mp3",
      sourceStartFrame: 0,
      sourceDurationInFrames: 150,
      sourceAssetDurationInFrames: 150,
      volume: 0.12,
      muted: false,
      fadeInFrames: 15,
      fadeOutFrames: 30,
      loop: true,
    },
    {
      id: "sfx-01",
      type: "SFX",
      trackId: "A4",
      timelineStartFrame: 90,
      durationInFrames: 24,
      enabled: true,
      locked: false,
      src: "projects/persistence-e9-test/sfx.wav",
      sourceStartFrame: 0,
      sourceDurationInFrames: 24,
      sourceAssetDurationInFrames: 24,
      volume: 0.35,
      muted: false,
      fadeInFrames: 0,
      fadeOutFrames: 2,
      loop: false,
    },
    {
      id: "subtitle-01",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 0,
      durationInFrames: 60,
      enabled: true,
      locked: false,
      text: "저장\n복원",
      x: 540,
      y: 1540,
      width: 900,
      fontFamily: "VITRO",
      fontSize: 76,
      fontWeight: 700,
      color: "#ffffff",
      strokeColor: "#000000",
      strokeWidth: 4,
      textAlign: "center",
      lineHeight: 1.15,
      maxLines: 2,
      backgroundEnabled: false,
      backgroundColor: "#000000",
      backgroundOpacity: 0.4,
      generationSource: "MANUAL",
      generatedFromTtsIds: ["tts-01"],
    },
    {
      id: "title-01",
      type: "TEXT",
      trackId: "T2",
      timelineStartFrame: 0,
      durationInFrames: 120,
      enabled: true,
      locked: false,
      text: "상단 제목",
      textRole: "TOP_TITLE",
      x: 540,
      y: 180,
      width: 900,
      fontFamily: "VITRO",
      fontSize: 64,
      fontWeight: 800,
      color: "#ffffff",
      strokeColor: "#000000",
      strokeWidth: 3,
      textAlign: "center",
      lineHeight: 1.1,
      maxLines: 2,
      backgroundEnabled: false,
      backgroundColor: "#000000",
      backgroundOpacity: 0.3,
    },
    {
      id: "blur-01",
      type: "GRAPHIC",
      trackId: "G1",
      timelineStartFrame: 0,
      durationInFrames: 600,
      enabled: true,
      locked: false,
      graphicType: "BLUR_PANEL",
      x: 0,
      y: 1440,
      width: 1080,
      height: 480,
      opacity: 0.5,
      blurPx: 28,
      backgroundColor: "rgba(0,0,0,0.3)",
      borderRadius: 0,
    },
  ],
  settings: {
    snapEnabled: true,
    snapToleranceFrames: 4,
    timelineZoom: 1,
    masterVolume: 1,
  },
};

const roundTrip = JSON.parse(JSON.stringify(baseProject));
assert.deepEqual(roundTrip, baseProject, "canonical project is fully JSON serializable");

assert.doesNotThrow(
  () => assertCompatibleEditorProject(baseProject, roundTrip),
  "compatible persisted metadata",
);
assert.throws(
  () =>
    assertCompatibleEditorProject(baseProject, {
      ...roundTrip,
      project: {...roundTrip.project, width: 720},
    }),
  /width/,
  "composition metadata mismatch is rejected",
);

let state = createEditorState(baseProject);
assert.equal(state.dirty, false, "initial state is clean");
assert.equal(state.history.past.length, 0, "initial undo history empty");

state = editorHistoryReducer(
  state,
  editorActions.moveItem("video-01", 12),
);
assert.equal(state.project.items[0].timelineStartFrame, 12, "edit applied");
assert.equal(state.dirty, true, "edit marks dirty");
assert.equal(state.history.past.length, 1, "single edit creates undo snapshot");

state = editorHistoryReducer(state, editorActions.undo());
assert.equal(state.project.items[0].timelineStartFrame, 0, "undo restores project");
assert.equal(state.dirty, false, "undo to saved state clears dirty");
assert.equal(state.history.future.length, 1, "undo creates redo state");

state = editorHistoryReducer(state, editorActions.redo());
assert.equal(state.project.items[0].timelineStartFrame, 12, "redo reapplies edit");
assert.equal(state.dirty, true, "redo away from saved state is dirty");

state = editorHistoryReducer(state, editorActions.markSaved());
assert.equal(state.dirty, false, "mark saved clears dirty");

const historyBeforeTransaction = state.history.past.length;
state = editorHistoryReducer(state, editorActions.beginEditTransaction());
state = editorHistoryReducer(
  state,
  editorActions.moveItem("video-01", 20),
);
state = editorHistoryReducer(
  state,
  editorActions.moveItem("video-01", 30),
);
state = editorHistoryReducer(
  state,
  editorActions.moveItem("video-01", 45),
);
assert.equal(
  state.history.past.length,
  historyBeforeTransaction,
  "drag updates do not spam history before pointer-up",
);
state = editorHistoryReducer(state, editorActions.endEditTransaction());
assert.equal(
  state.history.past.length,
  historyBeforeTransaction + 1,
  "one drag transaction creates one undo snapshot",
);
assert.equal(state.project.items[0].timelineStartFrame, 45, "drag final position");
assert.equal(state.dirty, true, "transaction marks dirty");

state = editorHistoryReducer(state, editorActions.undo());
assert.equal(
  state.project.items[0].timelineStartFrame,
  12,
  "transaction undo returns to drag start",
);
assert.equal(state.dirty, false, "undo transaction returns to saved project");
state = editorHistoryReducer(state, editorActions.redo());
assert.equal(
  state.project.items[0].timelineStartFrame,
  45,
  "transaction redo restores final drag state",
);

const reloadedProject = {
  ...baseProject,
  project: {...baseProject.project, name: "Reloaded"},
};
state = editorHistoryReducer(
  state,
  editorActions.loadProject(reloadedProject),
);
assert.equal(state.project.project.name, "Reloaded", "load project replaces state");
assert.equal(state.dirty, false, "load resets dirty");
assert.equal(state.history.past.length, 0, "load clears undo history");
assert.equal(state.history.future.length, 0, "load clears redo history");

const context = await read("src/studio/editor/StudioEditorContext.tsx");
const studioEditor = await read("src/studio/editor/StudioEditor.tsx");
const persistenceApi = await read(
  "src/studio/editor/persistence/editorPersistenceApi.ts",
);
const timeline = await read("src/studio/editor/timeline/Timeline.tsx");
const subtitleCanvas = await read(
  "src/studio/editor/canvas/StudioSubtitleCanvasOverlay.tsx",
);
const graphicsCanvas = await read(
  "src/studio/editor/canvas/StudioGraphicsCanvasOverlay.tsx",
);
// MIG-09: runtime integration checks are deferred.

for (const token of [
  "loadPersistedEditorProject",
  "savePersistedEditorProject",
  "beforeunload",
  "markSaved",
  "canUndo",
  "canRedo",
]) {
  assert.ok(context.includes(token), "context persistence: " + token);
}
assert.ok(
  context.includes("useRemotionEnvironment"),
  "persistence hydration is Studio-only",
);

for (const token of [
  "data-editor-save-button",
  "data-editor-load-button",
  "data-editor-undo-button",
  "data-editor-redo-button",
  "data-editor-dirty-state",
  "Ctrl+Z",
  "Ctrl+S",
  "window.confirm",
]) {
  assert.ok(studioEditor.includes(token), "persistence UI: " + token);
}

assert.ok(
  persistenceApi.includes("/api/editor/project/"),
  "client canonical project API",
);
assert.ok(
  persistenceApi.includes('method: "PUT"'),
  "client atomic save request uses PUT",
);
assert.ok(
  persistenceApi.includes("assertCompatibleEditorProject"),
  "client composition compatibility gate",
);

for (const source of [timeline, subtitleCanvas, graphicsCanvas]) {
  assert.ok(
    source.includes("beginEditTransaction"),
    "pointer interaction begins undo transaction",
  );
  assert.ok(
    source.includes("endEditTransaction"),
    "pointer interaction ends undo transaction",
  );
}

assert.ok(
  timeline.includes('candidate.type === "BGM"') &&
    timeline.includes('candidate.type === "SFX"') &&
    timeline.includes('candidate.type === "TEXT"') &&
    timeline.includes('candidate.type === "GRAPHIC"'),
  "timeline pointer move supports all E4-E8 editable types",
);

// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.

console.log(
"[editor-persistence] PASS: editor contracts; runtime integration checks deferred to MIG-09",
);
