import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  createEditorState,
  editorReducer,
} from "../src/studio/editor/editorReducer.ts";
import {
  createOverlayPreset,
  planOverlayTracks,
} from "../src/studio/editor/overlays/overlayPresets.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const read = (path) => readFile(resolve(ROOT, path), "utf8");

const emptyProject = {
  schemaVersion: 1,
  project: {
    id: "overlay-e7-test",
    name: "Overlay E7 Test",
    fps: 30,
    width: 1080,
    height: 1920,
    durationInFrames: 600,
  },
  tracks: [
    {
      id: "V1",
      type: "VIDEO",
      name: "Video",
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

const plan = planOverlayTracks(emptyProject);
assert.equal(plan.tracksToAdd.length, 2, "auto creates text + graphic tracks");
const graphicTrack = plan.tracksToAdd.find((track) => track.type === "GRAPHIC");
const textTrack = plan.tracksToAdd.find((track) => track.type === "TEXT");
assert.ok(graphicTrack, "graphic track planned");
assert.ok(textTrack, "text track planned");
assert.ok(
  graphicTrack.order < textTrack.order,
  "graphic track renders below text track",
);

const presets = [
  "TOP_TITLE",
  "LOWER_INFO",
  "TOP_BLUR",
  "BOTTOM_BLUR",
  "GRADIENT",
  "PANEL",
  "DIM_LAYER",
];
const created = presets.map((preset) =>
  createOverlayPreset({
    project: emptyProject,
    preset,
    startFrame: 90,
    textTrackId: plan.textTrackId,
    graphicTrackId: plan.graphicTrackId,
  }),
);
assert.equal(created.length, 7, "seven studio overlay presets");
assert.equal(created[0].type, "TEXT", "top title is text");
assert.equal(created[0].textRole, "TOP_TITLE", "top title role");
assert.equal(created[1].type, "TEXT", "lower info is text");
assert.equal(created[1].textRole, "LOWER_THIRD", "lower info role");
assert.equal(created[2].graphicType, "BLUR_PANEL", "top blur preset");
assert.equal(created[3].graphicType, "BLUR_PANEL", "bottom blur preset");
assert.equal(created[4].graphicType, "GRADIENT", "gradient preset");
assert.equal(created[5].graphicType, "SOLID_PANEL", "panel preset");
assert.equal(created[6].graphicType, "DIM_LAYER", "dim preset");
assert.equal(created[2].timelineStartFrame, 90, "preset starts at playhead");
assert.equal(
  created[2].durationInFrames,
  510,
  "graphic defaults through composition end",
);

let state = createEditorState(emptyProject);
for (const track of plan.tracksToAdd) {
  state = editorReducer(state, {type: "ADD_TRACK", track});
}
assert.ok(
  state.project.tracks.some((track) => track.id === plan.textTrackId),
  "text track reducer add",
);
assert.ok(
  state.project.tracks.some((track) => track.id === plan.graphicTrackId),
  "graphic track reducer add",
);

const topTitle = created[0];
const bottomBlur = created[3];
state = editorReducer(state, {type: "ADD_ITEM", item: topTitle});
state = editorReducer(state, {type: "ADD_ITEM", item: bottomBlur});
const item = (id) => {
  const value = state.project.items.find((entry) => entry.id === id);
  assert.ok(value, "missing item: " + id);
  return value;
};

state = editorReducer(state, {
  type: "UPDATE_TEXT",
  itemId: topTitle.id,
  text: "새 상단 제목",
});
state = editorReducer(state, {
  type: "UPDATE_TEXT_STYLE",
  itemId: topTitle.id,
  patch: {
    x: 480,
    y: 180,
    width: 820,
    fontSize: 72,
    color: "#e5b84f",
    strokeWidth: 5,
    backgroundEnabled: true,
    backgroundOpacity: 0.4,
    textRole: "LABEL",
  },
});
assert.equal(item(topTitle.id).text, "새 상단 제목", "text content update");
assert.equal(item(topTitle.id).x, 480, "text X");
assert.equal(item(topTitle.id).fontSize, 72, "text size");
assert.equal(item(topTitle.id).textRole, "LABEL", "text role update");
assert.equal(
  item(topTitle.id).backgroundOpacity,
  0.4,
  "text background opacity",
);

state = editorReducer(state, {
  type: "UPDATE_GRAPHIC_STYLE",
  itemId: bottomBlur.id,
  patch: {
    x: 30,
    y: 1400,
    width: 1020,
    height: 460,
    opacity: 0.62,
    blurPx: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
});
assert.equal(item(bottomBlur.id).x, 30, "graphic X");
assert.equal(item(bottomBlur.id).height, 460, "graphic height");
assert.equal(item(bottomBlur.id).opacity, 0.62, "graphic opacity");
assert.equal(item(bottomBlur.id).blurPx, 36, "graphic blur");
assert.equal(item(bottomBlur.id).borderRadius, 18, "graphic radius");

const gradient = created[4];
state = editorReducer(state, {type: "ADD_ITEM", item: gradient});
state = editorReducer(state, {
  type: "UPDATE_GRAPHIC_STYLE",
  itemId: gradient.id,
  patch: {
    gradientStartColor: "rgba(1,2,3,0)",
    gradientEndColor: "rgba(4,5,6,0.9)",
    gradientAngleDeg: 90,
  },
});
assert.equal(
  item(gradient.id).gradientAngleDeg,
  90,
  "gradient angle reducer",
);

const titleStart = item(topTitle.id).timelineStartFrame;
state = editorReducer(state, {
  type: "MOVE_ITEM",
  itemId: topTitle.id,
  timelineStartFrame: titleStart + 12,
});
assert.equal(
  item(topTitle.id).timelineStartFrame,
  titleStart + 12,
  "text timeline move",
);
const blurDuration = item(bottomBlur.id).durationInFrames;
state = editorReducer(state, {
  type: "TRIM_ITEM_END",
  itemId: bottomBlur.id,
  deltaFrames: 15,
});
assert.equal(
  item(bottomBlur.id).durationInFrames,
  blurDuration - 15,
  "graphic timeline trim",
);

const generator = await read(
  "src/studio/editor/overlays/OverlayGeneratorPanel.tsx",
);
const textInspector = await read(
  "src/studio/editor/inspector/TextInspector.tsx",
);
const graphicInspector = await read(
  "src/studio/editor/inspector/GraphicInspector.tsx",
);
const inspector = await read("src/studio/editor/inspector/Inspector.tsx");
const timeline = await read("src/studio/editor/timeline/Timeline.tsx");
const timelineItem = await read(
  "src/studio/editor/timeline/TimelineItem.tsx",
);
const canvas = await read(
  "src/studio/editor/canvas/StudioGraphicsCanvasOverlay.tsx",
);
const generic = await read("src/editor/GenericEditorComposition.tsx");
const studioEditor = await read("src/studio/editor/StudioEditor.tsx");
const renderer = await read("src/editor/GraphicItemRenderer.tsx");

for (const label of [
  "상단 제목",
  "하단 정보",
  "상단 Blur",
  "하단 Blur",
  "Gradient",
  "Panel",
  "Dim Layer",
]) {
  assert.ok(generator.includes(label), "overlay generator: " + label);
}
assert.ok(generator.includes("addTrack"), "track auto creation dispatch");
assert.ok(generator.includes("addItem"), "overlay item creation dispatch");

assert.ok(textInspector.includes("Text Role"), "text role inspector");
assert.ok(textInspector.includes("Font Size"), "text font size inspector");
assert.ok(textInspector.includes("Text Color"), "text color inspector");
assert.ok(textInspector.includes("updateTextStyle"), "text style action");

for (const label of [
  "Graphic Type",
  "Width",
  "Height",
  "Opacity",
  "Blur",
  "Radius",
  "Gradient Angle",
]) {
  assert.ok(graphicInspector.includes(label), "graphic inspector: " + label);
}
assert.ok(
  graphicInspector.includes("updateGraphicStyle"),
  "graphic style action",
);
assert.ok(
  inspector.includes('selected[0].type === "GRAPHIC"'),
  "graphic inspector routing",
);
assert.ok(
  inspector.includes('selected[0].type === "TEXT"'),
  "text inspector routing",
);

assert.ok(timeline.includes('candidate.type === "TEXT"'), "text timeline edit");
assert.ok(
  timeline.includes('candidate.type === "GRAPHIC"'),
  "graphic timeline edit",
);
assert.ok(timelineItem.includes('item.type === "TEXT"'), "text handles");
assert.ok(timelineItem.includes('item.type === "GRAPHIC"'), "graphic handles");

assert.ok(
  canvas.includes("data-editor-graphics-canvas"),
  "graphics preview canvas",
);
assert.ok(canvas.includes('"resize"'), "preview resize interaction");
assert.ok(canvas.includes("updateTextStyle"), "preview text drag/resize");
assert.ok(
  canvas.includes("updateGraphicStyle"),
  "preview graphic drag/resize",
);
assert.ok(
  generic.includes("StudioGraphicsCanvasOverlay"),
  "graphics canvas mounted",
);
assert.ok(studioEditor.includes("Text/Graphics"), "overlay toolbar button");
assert.ok(
  studioEditor.includes("OverlayGeneratorPanel"),
  "overlay generator mounted",
);

assert.ok(
  renderer.includes("gradientStartColor"),
  "renderer gradient start color",
);
assert.ok(
  renderer.includes("gradientEndColor"),
  "renderer gradient end color",
);
assert.ok(
  renderer.includes("backdropFilter"),
  "renderer backdrop blur",
);

console.log(
  "[editor-overlays] PASS: auto tracks, text/blur/gradient/panel presets, timeline edit, inspector edit, preview drag/resize, and rendering",
);
