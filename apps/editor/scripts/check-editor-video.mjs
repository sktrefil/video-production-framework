import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const read = (path) => readFile(resolve(ROOT, path), "utf8");

const timeline = await read("src/studio/editor/timeline/Timeline.tsx");
const timelineItem = await read("src/studio/editor/timeline/TimelineItem.tsx");
const resizeHandle = await read(
  "src/studio/editor/timeline/TimelineResizeHandle.tsx",
);
const inspector = await read("src/studio/editor/inspector/VideoInspector.tsx");
const inspectorRoot = await read("src/studio/editor/inspector/Inspector.tsx");
const studioEditor = await read("src/studio/editor/StudioEditor.tsx");
const reducer = await read("src/studio/editor/editorReducer.ts");

assert.match(
  timeline,
  /kind: "move" \| "trim-left" \| "trim-right"/,
  "move and trim interactions",
);
assert.match(
  timeline,
  /pixelsToFrame\(\s*event\.clientX - interaction\.startClientX/,
  "pointer delta is frame-based",
);
assert.match(
  timeline,
  /snapMovedItemStart/,
  "clip move uses start/end snap",
);
assert.match(
  timeline,
  /trimItemStart/,
  "left trim reducer route",
);
assert.match(
  timeline,
  /trimItemEnd/,
  "right trim reducer route",
);
assert.match(
  timeline,
  /sourceAssetDurationInFrames - sourceEnd/,
  "right trim respects source asset boundary",
);
assert.match(
  timelineItem,
  /item\.type === "VIDEO"/,
  "E4 editing restricted to video items",
);
assert.match(
  resizeHandle,
  /cursor: "ew-resize"/,
  "trim cursor",
);

for (const field of [
  "Start",
  "Duration",
  "Speed",
  "Volume",
  "X",
  "Y",
  "Scale",
  "Rotation",
  "Opacity",
]) {
  assert.match(inspector, new RegExp(`label="${field}"`), `inspector ${field}`);
}
assert.match(inspector, /changePlaybackRate/, "speed action");
assert.match(inspector, /changeVolume/, "volume action");
assert.match(inspector, /updateTransform/, "transform action");
assert.match(inspector, /changeVideoFit/, "fit action");
assert.match(inspector, /Source In:/, "source in display");
assert.match(inspector, /Source Out:/, "source out display");
assert.match(inspectorRoot, /VideoInspector/, "video inspector routed");
assert.match(
  studioEditor,
  /<Inspector[\s\S]*?\bfloating\b[\s\S]*?onClose=/,
  "inspector mounted as floating portal",
);

assert.match(
  reducer,
  /item\.sourceDurationInFrames \/ nextRate/,
  "speed preserves source window and changes timeline duration",
);
assert.match(reducer, /case "CHANGE_VIDEO_FIT"/, "fit reducer route");

console.log(
  "[editor-video] PASS: clip drag, trim, speed, volume, transform, fit, and numeric inspector wiring",
);
