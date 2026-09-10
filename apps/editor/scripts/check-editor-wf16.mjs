import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createEditorState} from "../src/studio/editor/editorReducer.ts";
import {validateEditorProductionProject} from "./editor-production-gate.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const read = (path) => readFile(resolve(ROOT, path), "utf8");

const project = {
  schemaVersion: 1,
  project: {
    id: "wf16-contract",
    name: "WF-16 Contract",
    fps: 30,
    width: 1080,
    height: 1920,
    durationInFrames: 120,
  },
  tracks: [
    {id: "V1", type: "VIDEO", name: "Main Visual", enabled: true, locked: false, order: 0},
    {id: "G1", type: "GRAPHIC", name: "Graphics", enabled: true, locked: false, order: 1},
    {id: "T1", type: "TEXT", name: "Subtitles", enabled: true, locked: false, order: 2},
    {id: "A1", type: "AUDIO", name: "TTS", enabled: true, locked: false, order: 3},
    {id: "T2", type: "TEXT", name: "Text", enabled: true, locked: false, order: 4},
    {id: "A2", type: "AUDIO", name: "Clip Audio", enabled: true, locked: false, order: 5},
    {id: "A3", type: "AUDIO", name: "BGM", enabled: true, locked: false, order: 6},
    {id: "A4", type: "AUDIO", name: "SFX", enabled: true, locked: false, order: 7},
  ],
  items: [
    {
      id: "visual-main",
      type: "IMAGE",
      trackId: "V1",
      timelineStartFrame: 0,
      durationInFrames: 120,
      enabled: true,
      locked: false,
      src: "projects/wf16/frame.png",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
      fit: "cover",
    },
    {
      id: "audio-narration",
      type: "TTS",
      trackId: "A1",
      timelineStartFrame: 0,
      durationInFrames: 120,
      enabled: true,
      locked: false,
      src: "projects/wf16/narration.mp3",
      sourceStartFrame: 0,
      sourceDurationInFrames: 120,
      sourceAssetDurationInFrames: 120,
      volume: 1,
      muted: false,
      fadeInFrames: 0,
      fadeOutFrames: 0,
    },
    {
      id: "audio-clip-audio",
      type: "CLIP_AUDIO",
      trackId: "A2",
      timelineStartFrame: 30,
      durationInFrames: 30,
      enabled: true,
      locked: false,
      src: "projects/wf16/clip-audio.mp3",
      sourceStartFrame: 0,
      sourceDurationInFrames: 30,
      sourceAssetDurationInFrames: 30,
      volume: 0.12,
      muted: false,
      fadeInFrames: 0,
      fadeOutFrames: 0,
    },
    {
      id: "audio-bgm",
      type: "BGM",
      trackId: "A3",
      timelineStartFrame: 0,
      durationInFrames: 120,
      enabled: true,
      locked: false,
      src: "projects/wf16/bgm.mp3",
      sourceStartFrame: 0,
      sourceDurationInFrames: 60,
      sourceAssetDurationInFrames: 60,
      volume: 0.1,
      muted: false,
      fadeInFrames: 15,
      fadeOutFrames: 36,
      loop: true,
    },
    {
      id: "audio-impact",
      type: "SFX",
      trackId: "A4",
      timelineStartFrame: 60,
      durationInFrames: 15,
      enabled: true,
      locked: false,
      src: "projects/wf16/impact.mp3",
      sourceStartFrame: 0,
      sourceDurationInFrames: 15,
      sourceAssetDurationInFrames: 15,
      volume: 0.35,
      muted: false,
      fadeInFrames: 0,
      fadeOutFrames: 2,
      loop: false,
    },
    {
      id: "subtitle-001",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 0,
      durationInFrames: 60,
      enabled: true,
      locked: false,
      text: "첫 번째 자막",
      x: 540,
      y: 1651.2,
      width: 936.036,
      fontFamily: "VITRO",
      fontSize: 91.8,
      fontWeight: 700,
      color: "#FFFDF7",
      strokeColor: "#17130F",
      strokeWidth: 4,
      textAlign: "center",
      lineHeight: 1.16,
      maxLines: 2,
      backgroundEnabled: false,
      backgroundColor: "#000000",
      backgroundOpacity: 0.4,
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["audio-narration"],
    },
    {
      id: "subtitle-002",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 60,
      durationInFrames: 60,
      enabled: true,
      locked: false,
      text: "두 번째 자막",
      x: 540,
      y: 1651.2,
      width: 936.036,
      fontFamily: "VITRO",
      fontSize: 91.8,
      fontWeight: 700,
      color: "#FFFDF7",
      strokeColor: "#17130F",
      strokeWidth: 4,
      textAlign: "center",
      lineHeight: 1.16,
      maxLines: 2,
      backgroundEnabled: false,
      backgroundColor: "#000000",
      backgroundOpacity: 0.4,
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["audio-narration"],
    },
    {
      id: "text-title",
      type: "TEXT",
      trackId: "T2",
      timelineStartFrame: 0,
      durationInFrames: 30,
      enabled: true,
      locked: false,
      text: "사건의 시작",
      textRole: "TOP_TITLE",
      x: 540,
      y: 190,
      width: 900,
      fontFamily: "VITRO",
      fontSize: 68,
      fontWeight: 800,
      color: "#FFFDF7",
      strokeColor: "#17130F",
      strokeWidth: 3,
      textAlign: "center",
      lineHeight: 1.12,
      maxLines: 2,
      backgroundEnabled: false,
      backgroundColor: "#000000",
      backgroundOpacity: 0.35,
    },
    {
      id: "graphic-bottom-blur",
      type: "GRAPHIC",
      trackId: "G1",
      timelineStartFrame: 0,
      durationInFrames: 120,
      enabled: true,
      locked: false,
      graphicType: "BLUR_PANEL",
      x: 0,
      y: 1420,
      width: 1080,
      height: 500,
      opacity: 0.38,
      blurPx: 24,
      backgroundColor: "rgba(0,0,0,0.35)",
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

const state = createEditorState(project);
assert.deepEqual(
  state.project.tracks.map((track) => track.id),
  ["V1", "G1", "T1", "A1", "T2", "A2", "A3", "A4"],
  "WF-16 track IDs survive editor normalization",
);
assert.equal(
  state.project.items.find((item) => item.id === "audio-bgm")?.type,
  "BGM",
  "BGM survives editor normalization",
);
assert.equal(
  state.project.items.find((item) => item.id === "audio-bgm")?.loop,
  true,
  "BGM loop survives editor normalization",
);
assert.deepEqual(
  state.project.items.find((item) => item.id === "subtitle-001")?.generatedFromTtsIds,
  ["audio-narration"],
  "subtitle keeps TTS provenance",
);

const gate = await validateEditorProductionProject(state.project, {
  verifyMedia: false,
});
assert.equal(gate.ok, true, "WF-16 assembled project passes production gate");
assert.equal(gate.errors.length, 0, "WF-16 contract has no production errors");
assert.equal(gate.visualGaps.length, 0, "WF-16 contract keeps full V1 coverage");
assert.notEqual(gate.subtitleQc?.status, "FAIL", "WF-16 subtitle QC is renderable");

const projectRenderer = await read("src/editor/ProjectRenderer.tsx");
const audioRenderer = await read("src/editor/AudioItemRenderer.tsx");
const textRenderer = await read("src/editor/TextItemRenderer.tsx");
const graphicRenderer = await read("src/editor/GraphicItemRenderer.tsx");

for (const token of [
  'item.type === "TTS"',
  'item.type === "CLIP_AUDIO"',
  'item.type === "BGM"',
  'item.type === "SFX"',
  "<AudioItemRenderer",
  "<TextItemRenderer",
  "<GraphicItemRenderer",
]) {
  assert.ok(projectRenderer.includes(token), "ProjectRenderer route: " + token);
}
assert.ok(audioRenderer.includes("trimBefore={item.sourceStartFrame}"), "audio source in");
assert.ok(audioRenderer.includes("loop={item.loop === true}"), "BGM looping");
assert.ok(audioRenderer.includes("fadeInFrames"), "audio fade in");
assert.ok(audioRenderer.includes("fadeOutFrames"), "audio fade out");
assert.ok(textRenderer.includes('item.type === "SUBTITLE"'), "subtitle renderer");
assert.ok(graphicRenderer.includes('item.graphicType === "GRADIENT"'), "graphic variants");

console.log(
  "[editor-wf16] PASS: A1/A2/A3/A4 + T1/T2 + G1 contract normalizes, gates, and routes to shared Remotion renderers",
);
