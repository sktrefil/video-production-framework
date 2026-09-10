import assert from "node:assert/strict";
import {
  createEditorState,
  editorReducer,
} from "../src/studio/editor/editorReducer.ts";

const project = {
  schemaVersion: 1,
  project: {
    id: "editor-state-test",
    name: "Editor State Test",
    fps: 30,
    width: 1080,
    height: 1920,
    durationInFrames: 600,
  },
  tracks: [
    {
      id: "V1",
      type: "VIDEO",
      name: "Video 1",
      enabled: true,
      locked: false,
      order: 0,
    },
    {
      id: "A1",
      type: "AUDIO",
      name: "TTS",
      enabled: true,
      locked: false,
      order: 1,
    },
    {
      id: "T1",
      type: "TEXT",
      name: "Subtitle",
      enabled: true,
      locked: false,
      order: 2,
    },
  ],
  items: [
    {
      id: "video-1",
      type: "VIDEO",
      trackId: "V1",
      timelineStartFrame: 20,
      durationInFrames: 100,
      enabled: true,
      locked: false,
      src: "clips/clip-1.mp4",
      sourceStartFrame: 10,
      sourceDurationInFrames: 100,
      sourceAssetDurationInFrames: 160,
      playbackRate: 1,
      volume: 1,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
      fit: "cover",
    },
    {
      id: "image-motion",
      type: "IMAGE",
      trackId: "V1",
      timelineStartFrame: 180,
      durationInFrames: 90,
      enabled: true,
      locked: false,
      src: "images/motion.png",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
      fit: "cover",
      motion: {
        kind: "TRANSFORM",
        from: {
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          opacity: 2,
        },
        to: {
          x: -54,
          y: 0,
          scale: 0,
          rotation: 0,
          opacity: 1,
        },
        easing: "UNKNOWN",
      },
    },
    {
      id: "tts-1",
      type: "TTS",
      trackId: "A1",
      timelineStartFrame: 0,
      durationInFrames: 100,
      enabled: true,
      locked: false,
      src: "audio/tts.mp3",
      sourceStartFrame: 0,
      sourceDurationInFrames: 100,
      sourceAssetDurationInFrames: 100,
      volume: 1,
      muted: false,
      fadeInFrames: 0,
      fadeOutFrames: 0,
    },
    {
      id: "subtitle-1",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 0,
      durationInFrames: 60,
      enabled: true,
      locked: false,
      text: "original",
      x: 540,
      y: 1500,
      width: 900,
      fontFamily: "VITRO",
      fontSize: 90,
      fontWeight: 700,
      color: "#fff",
      strokeColor: "#000",
      strokeWidth: 4,
      textAlign: "center",
      lineHeight: 1.1,
      maxLines: 2,
      backgroundEnabled: false,
      backgroundColor: "#000",
      backgroundOpacity: 0,
    },
  ],
  settings: {
    snapEnabled: true,
    snapToleranceFrames: 4,
    timelineZoom: 1,
    masterVolume: 1,
  },
};

const snapshot = JSON.stringify(project);
let state = createEditorState(project);

const item = (id) => {
  const value = state.project.items.find((candidate) => candidate.id === id);
  assert.ok(value, `missing item: ${id}`);
  return value;
};

assert.deepEqual(
  item("image-motion").motion,
  {
    kind: "TRANSFORM",
    from: {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
    },
    to: {
      x: -54,
      y: 0,
      scale: 0.001,
      rotation: 0,
      opacity: 1,
    },
    easing: "EASE_IN_OUT",
  },
  "image motion normalization",
);

state = editorReducer(state, {
  type: "MOVE_ITEM",
  itemId: "video-1",
  timelineStartFrame: 45,
});
assert.equal(item("video-1").timelineStartFrame, 45, "video move");

state = editorReducer(state, {
  type: "TRIM_ITEM_START",
  itemId: "video-1",
  deltaFrames: 10,
});
assert.equal(item("video-1").timelineStartFrame, 55, "left trim timeline start");
assert.equal(item("video-1").durationInFrames, 90, "left trim duration");
assert.equal(item("video-1").sourceStartFrame, 20, "left trim source start");
assert.equal(item("video-1").sourceDurationInFrames, 90, "left trim source duration");

state = editorReducer(state, {
  type: "TRIM_ITEM_END",
  itemId: "video-1",
  deltaFrames: 15,
});
assert.equal(item("video-1").durationInFrames, 75, "right trim duration");
assert.equal(item("video-1").sourceDurationInFrames, 75, "right trim source duration");

state = editorReducer(state, {
  type: "CHANGE_PLAYBACK_RATE",
  itemId: "video-1",
  playbackRate: 0,
});
assert.equal(item("video-1").playbackRate, 0.0625, "playback-rate floor");
assert.equal(
  item("video-1").durationInFrames,
  1200,
  "slower playback expands timeline duration",
);

state = editorReducer(state, {
  type: "CHANGE_PLAYBACK_RATE",
  itemId: "video-1",
  playbackRate: 99,
});
assert.equal(item("video-1").playbackRate, 16, "playback-rate ceiling");
assert.equal(
  item("video-1").durationInFrames,
  5,
  "faster playback contracts timeline duration",
);

state = editorReducer(state, {
  type: "CHANGE_VIDEO_FIT",
  itemId: "video-1",
  fit: "contain",
});
assert.equal(item("video-1").fit, "contain", "video fit update");

state = editorReducer(state, {
  type: "CHANGE_VOLUME",
  itemId: "video-1",
  volume: -3,
});
assert.equal(item("video-1").volume, 0, "volume floor");

state = editorReducer(state, {
  type: "UPDATE_TEXT",
  itemId: "subtitle-1",
  text: "edited\nsubtitle",
});
assert.equal(item("subtitle-1").text, "edited\nsubtitle", "subtitle text update");

state = editorReducer(state, {
  type: "SPLIT_AUDIO_ITEM",
  itemId: "tts-1",
  splitFrame: 60,
  newItemId: "tts-2",
});
assert.equal(item("tts-1").durationInFrames, 60, "tts left duration");
assert.equal(item("tts-2").timelineStartFrame, 60, "tts right timeline start");
assert.equal(item("tts-2").durationInFrames, 40, "tts right duration");
assert.equal(item("tts-2").sourceStartFrame, 60, "tts right source start");

state = editorReducer(state, {
  type: "MOVE_ITEM",
  itemId: "tts-2",
  timelineStartFrame: 72,
});
assert.equal(item("tts-2").timelineStartFrame, 72, "tts segment move");

const beforeBadTrackMove = item("video-1");
state = editorReducer(state, {
  type: "MOVE_ITEM",
  itemId: "video-1",
  timelineStartFrame: 99,
  trackId: "A1",
});
assert.equal(item("video-1"), beforeBadTrackMove, "reject incompatible track");

state = editorReducer(state, {
  type: "TRIM_ITEM_END",
  itemId: "video-1",
  deltaFrames: 9999,
});
assert.equal(item("video-1").durationInFrames, 1, "minimum duration invariant");

assert.equal(JSON.stringify(project), snapshot, "input project must remain immutable");

console.log("[editor-state] PASS: 16 reducer scenarios including image motion normalization");
