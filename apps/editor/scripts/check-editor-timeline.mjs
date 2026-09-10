import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  clampTimelineFrame,
  formatFrameTimecode,
  frameToPixels,
  getRulerStepFrames,
  getSnapCandidates,
  pixelsToFrame,
  snapFrameToCandidates,
  snapMovedItemStart,
  timelinePixelsPerFrame,
} from "../src/studio/editor/timeline/timelineMath.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const read = (path) => readFile(resolve(ROOT, path), "utf8");

assert.equal(frameToPixels(10, 2), 20, "frame -> pixels");
assert.equal(pixelsToFrame(21, 2), 11, "pixels -> frame");
assert.equal(clampTimelineFrame(-10, 100), 0, "frame floor");
assert.equal(clampTimelineFrame(150, 100), 99, "frame ceiling");
assert.equal(
  formatFrameTimecode(31, 30),
  "00:00:01:01",
  "frame timecode",
);
assert.equal(timelinePixelsPerFrame(1), 2, "base zoom");
assert.ok(
  getRulerStepFrames(2, 30) * 2 >= 84,
  "ruler maintains readable spacing",
);

assert.equal(
  snapFrameToCandidates(117, [0, 120, 240], 4),
  120,
  "snap within tolerance",
);
assert.equal(
  snapFrameToCandidates(110, [120], 4),
  110,
  "no snap outside tolerance",
);
assert.equal(
  snapFrameToCandidates(10, [8, 12], 2),
  8,
  "deterministic snap tie",
);
assert.equal(
  snapMovedItemStart(117, 30, [120, 150], 4),
  120,
  "moving item start snaps",
);
assert.equal(
  snapMovedItemStart(91, 30, [120], 2),
  90,
  "moving item end snaps",
);

const sample = JSON.parse(
  await read("src/generated/edit_project.sample.json"),
);
const candidates = getSnapCandidates(sample);
for (const expected of [0, 90, 120, 210, 240, 330]) {
  assert.ok(candidates.includes(expected), `snap candidate F${expected}`);
}

const studioEditor = await read("src/studio/editor/StudioEditor.tsx");
const timeline = await read("src/studio/editor/timeline/Timeline.tsx");
const ruler = await read("src/studio/editor/timeline/TimelineRuler.tsx");
const playhead = await read("src/studio/editor/timeline/TimelinePlayhead.tsx");
const item = await read("src/studio/editor/timeline/TimelineItem.tsx");
const inspector = await read("src/studio/editor/inspector/Inspector.tsx");
const root = await read("src/Root.tsx");
const generic = await read("src/editor/GenericEditorComposition.tsx");

assert.match(
  studioEditor,
  /pause, play, seek, toggle/,
  "uses Remotion Studio playback controls",
);
assert.match(
  studioEditor,
  /useCurrentFrame/,
  "reads actual Studio frame",
);
assert.match(
  studioEditor,
  /ArrowLeft/,
  "frame keyboard stepping",
);
assert.match(
  studioEditor,
  /event\.shiftKey \? 5 : 1/,
  "shift frame stepping",
);
assert.match(
  studioEditor,
  /Timeline zoom/,
  "zoom control",
);
assert.match(
  studioEditor,
  /setSnap/,
  "snap toggle",
);

assert.match(timeline, /overflow: "auto"/, "timeline scroll");
assert.match(timeline, /onZoomByFactor/, "ctrl-wheel zoom route");
assert.match(timeline, /snapFrameToCandidates/, "timeline pointer snap");
assert.match(ruler, /formatFrameTimecode/, "time ruler");
assert.match(
  timeline,
  /playheadDraggingRef/,
  "playhead keeps an explicit drag state",
);
assert.match(
  timeline,
  /seekPlayheadFromClientX/,
  "playhead follows pointer position continuously",
);
assert.match(
  timeline,
  /beginPlayheadScrub/,
  "timeline surface supports click-drag scrubbing",
);
assert.match(
  timeline,
  /onBeginDrag=\{beginPlayheadScrub\}/,
  "playhead drag handle is wired to scrub",
);
assert.match(
  playhead,
  /data-editor-playhead-handle="true"/,
  "playhead exposes a wide mouse hit target",
);
assert.match(
  playhead,
  /PLAYHEAD_HIT_WIDTH = 17/,
  "playhead hit target is wider than the visible line",
);
assert.match(
  playhead,
  /cursor: "ew-resize"/,
  "playhead advertises horizontal dragging",
);
assert.match(
  playhead,
  /pointerEvents: "auto"/,
  "playhead can receive pointer input",
);
assert.match(item, /data-editor-timeline-item/, "item selection surface");
assert.match(item, /TimelineResizeHandle/, "E4 trim handle reservation");
assert.match(
  studioEditor,
  /data-editor-inspector-toggle="true"/,
  "inspector popup toggle",
);
assert.match(
  studioEditor,
  /<Inspector[\s\S]*?\bfloating\b[\s\S]*?onClose=/,
  "inspector mounted as floating portal",
);
assert.doesNotMatch(
  studioEditor,
  /<Timeline[\s\S]*?\/?>\s*<Inspector\s*\/>/,
  "inspector no longer consumes inline timeline width",
);
assert.match(
  inspector,
  /data-editor-inspector-mode=\{floating \? "floating" : "inline"\}/,
  "inspector supports floating mode",
);
assert.match(
  inspector,
  /bottom: 396/,
  "floating inspector sits above editor timeline",
);

assert.match(
  generic,
  /StudioEditorProvider/,
  "generic editor owns editor state",
);
assert.match(
  generic,
  /ProjectRenderer project=\{state\.project\}/,
  "preview renderer follows editor project state",
);
assert.match(
  root,
  /StudioToolbarProvider compositionId="GenericVideoEditor"/,
  "generic editor studio toolbar",
);
assert.match(
  root,
  /component=\{StudioWrappedGenericEditor\}/,
  "GenericVideoEditor uses studio wrapper",
);

console.log(
  "[editor-timeline] PASS: ruler, free playhead scrub/drag, snap for edits, zoom, keyboard stepping, selection, preview state binding, and floating inspector layout",
);
