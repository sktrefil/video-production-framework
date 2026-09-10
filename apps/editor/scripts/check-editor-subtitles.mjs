import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  createEditorState,
  editorReducer,
} from "../src/studio/editor/editorReducer.ts";
import {
  findSubtitleTrackId,
  generateSubtitlesFromScript,
  generateSubtitlesFromScriptAndTranscription,
  generateSubtitlesFromTranscription,
  SHORTS_LOWER_SUBTITLE_STYLE,
  wrapSubtitleText,
} from "../src/studio/editor/subtitles/subtitleGeneration.ts";
import {
  runSubtitleTimingQc,
} from "../src/studio/editor/subtitles/subtitleTimingQc.ts";
import {
  resolveSubtitleQcNavigationTarget,
} from "../src/studio/editor/subtitles/subtitleQcNavigator.ts";
import {
  applyAllSubtitleTimingSafeFixes,
  applySubtitleTimingSafeFix,
  canSafeFixSubtitleTimingIssue,
} from "../src/studio/editor/subtitles/subtitleTimingSafeFix.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const read = (path) => readFile(resolve(ROOT, path), "utf8");

const baseProject = {
  schemaVersion: 1,
  project: {
    id: "subtitle-e6-test",
    name: "Subtitle E6 Test",
    fps: 30,
    width: 1080,
    height: 1920,
    durationInFrames: 600,
  },
  tracks: [
    {id: "T1", type: "TEXT", name: "Subtitles", enabled: true, locked: false, order: 0},
    {id: "A1", type: "AUDIO", name: "TTS", enabled: true, locked: false, order: 1},
  ],
  items: [
    {
      id: "tts-a",
      type: "TTS",
      trackId: "A1",
      timelineStartFrame: 30,
      durationInFrames: 120,
      enabled: true,
      locked: false,
      src: "projects/test/tts.mp3",
      sourceStartFrame: 60,
      sourceDurationInFrames: 120,
      sourceAssetDurationInFrames: 300,
      volume: 1,
      muted: false,
      fadeInFrames: 0,
      fadeOutFrames: 0,
    },
    {
      id: "tts-b",
      type: "TTS",
      trackId: "A1",
      timelineStartFrame: 180,
      durationInFrames: 90,
      enabled: true,
      locked: false,
      src: "projects/test/tts.mp3",
      sourceStartFrame: 180,
      sourceDurationInFrames: 90,
      sourceAssetDurationInFrames: 300,
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

assert.equal(findSubtitleTrackId(baseProject), "T1", "subtitle track discovery");
assert.equal(
  wrapSubtitleText("하나 둘 셋 넷 다섯 여섯", 7, 2).split("\n").length,
  2,
  "two-line wrapping",
);

const options = {
  trackId: "T1",
  fps: 30,
  compositionWidth: 1080,
  compositionHeight: 1920,
  existingIds: [],
  maxCharsPerLine: 12,
  maxLines: 2,
  maxCueDurationFrames: 84,
};

const ttsItems = baseProject.items.filter((item) => item.type === "TTS");

const transcription = generateSubtitlesFromTranscription({
  ttsItems,
  wordsBySource: {
    "projects/test/tts.mp3": [
      {text: "첫", startMs: 2100, endMs: 2300},
      {text: "번째", startMs: 2350, endMs: 2700},
      {text: "문장입니다.", startMs: 2750, endMs: 3400},
      {text: "두", startMs: 6200, endMs: 6400},
      {text: "번째", startMs: 6450, endMs: 6750},
      {text: "문장입니다.", startMs: 6800, endMs: 7600},
    ],
  },
  options,
});

assert.ok(transcription.length >= 2, "transcription creates subtitle items");
assert.equal(
  transcription[0].generationSource,
  "TTS_TRANSCRIBE",
  "transcription generation metadata",
);
assert.ok(
  transcription.some((item) => item.generatedFromTtsIds.includes("tts-a")),
  "first TTS mapping",
);
assert.ok(
  transcription.some((item) => item.generatedFromTtsIds.includes("tts-b")),
  "second TTS mapping",
);
assert.ok(
  transcription.every(
    (item) =>
      item.timelineStartFrame >= 30 &&
      item.timelineStartFrame + item.durationInFrames <= 270,
  ),
  "transcription maps into edited TTS timeline windows",
);

const alignedItems = generateSubtitlesFromScriptAndTranscription({
  script: "첫 번째 문장입니다. 두 번째 문장입니다.",
  ttsItems,
  wordsBySource: {
    "projects/test/tts.mp3": [
      {text: "첫", startMs: 2100, endMs: 2300},
      {text: "번째", startMs: 2350, endMs: 2700},
      {text: "문장입니다.", startMs: 2750, endMs: 3400},
      {text: "두", startMs: 6200, endMs: 6400},
      {text: "번째", startMs: 6450, endMs: 6750},
      {text: "문장입니다.", startMs: 6800, endMs: 7600},
    ],
  },
  options,
});
assert.ok(alignedItems.length >= 2, "script + TTS alignment creates captions");
assert.ok(
  alignedItems.every((item) => item.generationSource === "SCRIPT_TTS_ALIGN"),
  "aligned generation metadata",
);
assert.ok(
  alignedItems.map((item) => item.text.replace(/\n/g, " ")).join(" ").includes(
    "첫 번째 문장입니다.",
  ),
  "approved script wording retained",
);
assert.equal(
  alignedItems[0].fontFamily,
  SHORTS_LOWER_SUBTITLE_STYLE.fontFamily,
  "shorts subtitle font",
);
assert.equal(alignedItems[0].fontSize, 104, "shorts subtitle 104px at 1080");
assert.equal(alignedItems[0].y, 1790, "shorts subtitle baseline at 1920");
assert.equal(alignedItems[0].strokeWidth, 4, "shorts subtitle outline");
assert.equal(alignedItems[0].lineHeight, 1.24, "shorts subtitle line height");

const qcStyle = {
  x: 540,
  y: 1790,
  width: 964,
  fontFamily: "VITRO",
  fontSize: 104,
  fontWeight: 700,
  color: "#FFFDF7",
  strokeColor: "#17130F",
  strokeWidth: 4,
  textAlign: "center",
  lineHeight: 1.24,
  maxLines: 2,
  backgroundEnabled: false,
  backgroundColor: "#000000",
  backgroundOpacity: 0.42,
};

const cleanQc = runSubtitleTimingQc({
  subtitles: [
    {
      id: "qc-a",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 30,
      durationInFrames: 60,
      enabled: true,
      locked: false,
      text: "정상 자막",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-a"],
      ...qcStyle,
    },
    {
      id: "qc-b",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 90,
      durationInFrames: 60,
      enabled: true,
      locked: false,
      text: "첫 구간",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-a"],
      ...qcStyle,
    },
    {
      id: "qc-c",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 180,
      durationInFrames: 45,
      enabled: true,
      locked: false,
      text: "둘째 구간",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-b"],
      ...qcStyle,
    },
    {
      id: "qc-d",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 225,
      durationInFrames: 45,
      enabled: true,
      locked: false,
      text: "마지막 자막",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-b"],
      ...qcStyle,
    },
  ],
  ttsItems,
  options: {
    fps: 30,
    maxCharsPerLine: 12,
    maxLines: 2,
  },
});
assert.equal(cleanQc.status, "PASS", "clean subtitle timing QC passes");
assert.equal(cleanQc.errorCount, 0, "clean QC has no errors");
assert.equal(cleanQc.warningCount, 0, "clean QC has no warnings");

const badQc = runSubtitleTimingQc({
  subtitles: [
    {
      id: "qc-overlap-a",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 30,
      durationInFrames: 60,
      enabled: true,
      locked: false,
      text: "정상",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-a"],
      ...qcStyle,
    },
    {
      id: "qc-overlap-b",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 80,
      durationInFrames: 5,
      enabled: true,
      locked: false,
      text: "한 줄 글자가 지나치게 긴 자막입니다",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-a"],
      ...qcStyle,
    },
    {
      id: "qc-outside",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 265,
      durationInFrames: 20,
      enabled: true,
      locked: false,
      text: "범위 밖",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-b"],
      ...qcStyle,
    },
  ],
  ttsItems,
  options: {
    fps: 30,
    maxCharsPerLine: 12,
    maxLines: 2,
  },
});
assert.equal(badQc.status, "FAIL", "invalid timing QC fails");
assert.ok(
  badQc.issues.some((entry) => entry.code === "OVERLAP"),
  "QC detects subtitle overlap",
);
assert.ok(
  badQc.issues.some((entry) => entry.code === "OUTSIDE_TTS_RANGE"),
  "QC detects subtitle outside referenced TTS range",
);
assert.ok(
  badQc.issues.some((entry) => entry.code === "TOO_SHORT"),
  "QC detects too-short subtitle",
);
assert.ok(
  badQc.issues.some((entry) => entry.code === "LINE_TOO_LONG"),
  "QC detects overlong subtitle line",
);

const overlapIssue = badQc.issues.find(
  (entry) => entry.code === "OVERLAP",
);
assert.ok(overlapIssue, "overlap QC issue exists for navigation");
const overlapTarget = resolveSubtitleQcNavigationTarget({
  issue: overlapIssue,
  subtitles: [
    {
      id: "qc-overlap-a",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 30,
      durationInFrames: 60,
      enabled: true,
      locked: false,
      text: "정상",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-a"],
      ...qcStyle,
    },
    {
      id: "qc-overlap-b",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 80,
      durationInFrames: 5,
      enabled: true,
      locked: false,
      text: "겹침",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-a"],
      ...qcStyle,
    },
  ],
  durationInFrames: 600,
});
assert.equal(
  overlapTarget.subtitleId,
  "qc-overlap-b",
  "QC navigator selects the cue nearest the issue frame",
);
assert.equal(
  overlapTarget.frame,
  overlapIssue.frame,
  "QC navigator seeks to the issue frame",
);

const overlapFix = applySubtitleTimingSafeFix({
  issue: overlapIssue,
  subtitles: [
    {
      id: "qc-overlap-a",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 30,
      durationInFrames: 60,
      enabled: true,
      locked: false,
      text: "정상",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-a"],
      ...qcStyle,
    },
    {
      id: "qc-overlap-b",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 80,
      durationInFrames: 20,
      enabled: true,
      locked: false,
      text: "겹침",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-a"],
      ...qcStyle,
    },
  ],
  ttsItems,
  fps: 30,
  projectDurationInFrames: 600,
});
assert.equal(overlapFix.applied, true, "Safe Fix removes subtitle overlap");
assert.equal(
  overlapFix.subtitles.find((item) => item.id === "qc-overlap-a")
    ?.durationInFrames,
  50,
  "overlap Safe Fix trims only the earlier cue to the next start",
);

const shortIssue = {
  code: "TOO_SHORT",
  severity: "WARN",
  message: "too short",
  subtitleIds: ["qc-short"],
  frame: 90,
  frames: 5,
};
assert.equal(
  canSafeFixSubtitleTimingIssue(shortIssue),
  true,
  "too-short QC issue is Safe Fix eligible",
);
const shortFix = applySubtitleTimingSafeFix({
  issue: shortIssue,
  subtitles: [
    {
      id: "qc-before",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 30,
      durationInFrames: 60,
      enabled: true,
      locked: false,
      text: "앞",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-a"],
      ...qcStyle,
    },
    {
      id: "qc-short",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 90,
      durationInFrames: 5,
      enabled: true,
      locked: false,
      text: "짧음",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-a"],
      ...qcStyle,
    },
    {
      id: "qc-after",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 120,
      durationInFrames: 30,
      enabled: true,
      locked: false,
      text: "뒤",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-a"],
      ...qcStyle,
    },
  ],
  ttsItems,
  fps: 30,
  projectDurationInFrames: 600,
});
assert.equal(shortFix.applied, true, "Safe Fix expands too-short cue");
assert.equal(
  shortFix.subtitles.find((item) => item.id === "qc-short")
    ?.durationInFrames,
  9,
  "too-short Safe Fix reaches 0.30 second minimum at 30fps",
);

const outsideIssue = {
  code: "OUTSIDE_TTS_RANGE",
  severity: "ERROR",
  message: "outside",
  subtitleIds: ["qc-edge"],
  frame: 145,
};
const outsideFix = applySubtitleTimingSafeFix({
  issue: outsideIssue,
  subtitles: [
    {
      id: "qc-edge",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 145,
      durationInFrames: 10,
      enabled: true,
      locked: false,
      text: "경계",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-a"],
      ...qcStyle,
    },
  ],
  ttsItems,
  fps: 30,
  projectDurationInFrames: 600,
});
assert.equal(outsideFix.applied, true, "Safe Fix clamps partial TTS overflow");
assert.equal(
  outsideFix.subtitles[0].durationInFrames,
  5,
  "TTS range Safe Fix clips cue to referenced TTS end",
);

const lockedFix = applySubtitleTimingSafeFix({
  issue: shortIssue,
  subtitles: [
    {
      id: "qc-short",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 90,
      durationInFrames: 5,
      enabled: true,
      locked: true,
      text: "잠김",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-a"],
      ...qcStyle,
    },
  ],
  ttsItems,
  fps: 30,
  projectDurationInFrames: 600,
});
assert.equal(lockedFix.applied, false, "Safe Fix never edits locked subtitle");

const allFixes = applyAllSubtitleTimingSafeFixes({
  issues: [overlapIssue],
  subtitles: [
    {
      id: "qc-overlap-a",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 30,
      durationInFrames: 60,
      enabled: true,
      locked: false,
      text: "앞",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-a"],
      ...qcStyle,
    },
    {
      id: "qc-overlap-b",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 80,
      durationInFrames: 20,
      enabled: true,
      locked: false,
      text: "뒤",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-a"],
      ...qcStyle,
    },
  ],
  ttsItems,
  fps: 30,
  projectDurationInFrames: 600,
});
assert.equal(allFixes.appliedCount, 1, "Safe Fix all applies eligible QC fix");

const silentQc = runSubtitleTimingQc({
  subtitles: [
    {
      id: "qc-silent",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 30,
      durationInFrames: 20,
      enabled: true,
      locked: false,
      text: "무음 구간",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromTtsIds: ["tts-a"],
      ...qcStyle,
    },
  ],
  ttsItems,
  wordsBySource: {
    "projects/test/tts.mp3": [
      {text: "실제발화", startMs: 5000, endMs: 5200},
    ],
  },
  options: {
    fps: 30,
    maxCharsPerLine: 12,
    maxLines: 2,
  },
});
assert.ok(
  silentQc.issues.some((entry) => entry.code === "NO_SPEECH_OVERLAP"),
  "QC detects subtitle in actual Whisper silence window",
);

const scriptItems = generateSubtitlesFromScript({
  script:
    "사도세자는 정말 뒤주 속에서 죽은 걸까요? 첫 번째 문장입니다. 두 번째 문장도 이어집니다.",
  ttsItems,
  options,
});
assert.ok(scriptItems.length >= 2, "script fallback creates subtitles");
assert.ok(
  scriptItems.every((item) => item.generationSource === "SCRIPT_TIMING"),
  "script fallback metadata",
);
assert.ok(
  scriptItems.every((item) => item.generatedFromTtsIds.length === 1),
  "script captions retain TTS provenance",
);

let state = createEditorState({
  ...baseProject,
  items: [
    ...baseProject.items,
    transcription[0],
    {
      id: "top-title-test",
      type: "TEXT",
      trackId: "T1",
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
      color: "#fff",
      strokeColor: "#000",
      strokeWidth: 3,
      textAlign: "center",
      lineHeight: 1.1,
      maxLines: 2,
      backgroundEnabled: false,
      backgroundColor: "#000",
      backgroundOpacity: 0,
    },
  ],
});
state = editorReducer(state, {
  type: "REPLACE_SUBTITLE_ITEMS",
  items: alignedItems,
});
assert.equal(
  state.project.items.filter((item) => item.type === "SUBTITLE").length,
  alignedItems.length,
  "subtitle replacement removes old captions",
);
assert.ok(
  state.project.items.some((item) => item.id === "top-title-test"),
  "subtitle replacement preserves TOP_TITLE text",
);

const subtitleId = alignedItems[0].id;
const subtitle = () => {
  const value = state.project.items.find((item) => item.id === subtitleId);
  assert.ok(value && value.type === "SUBTITLE", "subtitle item exists");
  return value;
};

state = editorReducer(state, {
  type: "UPDATE_TEXT",
  itemId: subtitleId,
  text: "직접 수정\n줄바꿈",
});
assert.equal(subtitle().text, "직접 수정\n줄바꿈", "free subtitle text editing");

state = editorReducer(state, {
  type: "UPDATE_SUBTITLE_STYLE",
  itemId: subtitleId,
  patch: {
    x: 420,
    y: 1460,
    width: 760,
    fontSize: 88,
    fontFamily: "Arial",
    color: "#abcdef",
    strokeColor: "#123456",
    strokeWidth: 7,
    textAlign: "left",
    lineHeight: 1.25,
    maxLines: 3,
    backgroundEnabled: true,
    backgroundColor: "#112233",
    backgroundOpacity: 0.6,
  },
});
assert.equal(subtitle().x, 420, "subtitle X");
assert.equal(subtitle().y, 1460, "subtitle Y");
assert.equal(subtitle().fontSize, 88, "subtitle font size");
assert.equal(subtitle().color, "#abcdef", "subtitle color");
assert.equal(subtitle().strokeWidth, 7, "subtitle stroke");
assert.equal(subtitle().maxLines, 3, "subtitle max lines");
assert.equal(subtitle().backgroundOpacity, 0.6, "subtitle background opacity");

const startBeforeMove = subtitle().timelineStartFrame;
state = editorReducer(state, {
  type: "MOVE_ITEM",
  itemId: subtitleId,
  timelineStartFrame: startBeforeMove + 10,
});
assert.equal(
  subtitle().timelineStartFrame,
  startBeforeMove + 10,
  "subtitle timeline move",
);

const durationBeforeTrim = subtitle().durationInFrames;
state = editorReducer(state, {
  type: "TRIM_ITEM_END",
  itemId: subtitleId,
  deltaFrames: 3,
});
assert.equal(
  subtitle().durationInFrames,
  Math.max(1, durationBeforeTrim - 3),
  "subtitle timeline trim",
);

const generationSource = await read(
  "src/studio/editor/subtitles/subtitleGeneration.ts",
);
const qcNavigator = await read(
  "src/studio/editor/subtitles/subtitleQcNavigator.ts",
);
const qcSafeFix = await read(
  "src/studio/editor/subtitles/subtitleTimingSafeFix.ts",
);
const generator = await read(
  "src/studio/editor/subtitles/SubtitleGeneratorPanel.tsx",
);
const api = await read("src/studio/editor/subtitles/subtitleApi.ts");
const textInspector = await read(
  "src/studio/editor/inspector/TextInspector.tsx",
);
const inspector = await read("src/studio/editor/inspector/Inspector.tsx");
const timeline = await read("src/studio/editor/timeline/Timeline.tsx");
const timelineItem = await read(
  "src/studio/editor/timeline/TimelineItem.tsx",
);
const canvas = await read(
  "src/studio/editor/canvas/StudioSubtitleCanvasOverlay.tsx",
);
const generic = await read("src/editor/GenericEditorComposition.tsx");
const textRenderer = await read("src/editor/TextItemRenderer.tsx");
const studioEditor = await read("src/studio/editor/StudioEditor.tsx");
// MIG-09: runtime integration checks are deferred.

assert.ok(
  generationSource.includes("...(last.generatedFromTtsIds ?? [])"),
  "alignment safely handles optional generatedFromTtsIds provenance",
);
assert.ok(
  qcNavigator.includes("resolveSubtitleQcNavigationTarget"),
  "QC navigator resolves target subtitle and frame",
);
assert.ok(
  qcNavigator.includes("scrollTimelineSubtitleIntoView"),
  "QC navigator scroll helper exists",
);
assert.ok(
  qcNavigator.includes("scrollIntoView"),
  "QC navigator centers the timeline cue",
);
assert.ok(
  qcNavigator.includes("candidate.dataset.editorTimelineItem === subtitleId"),
  "QC navigator resolves timeline item by stable data attribute",
);
assert.ok(
  qcSafeFix.includes('"OVERLAP"'),
  "Safe Fix supports overlap repair",
);
assert.ok(
  qcSafeFix.includes('"TOO_SHORT"'),
  "Safe Fix supports minimum cue duration repair",
);
assert.ok(
  qcSafeFix.includes('"OUTSIDE_TTS_RANGE"'),
  "Safe Fix supports TTS boundary clamp",
);
assert.ok(
  qcSafeFix.includes("target.locked"),
  "Safe Fix refuses locked subtitles",
);
assert.ok(
  qcSafeFix.includes('item.generationSource !== "MANUAL"'),
  "Safe Fix refuses manual subtitles",
);
assert.ok(
  generator.includes("기존 자막 삭제 + 실제 발화 타이밍으로 재생성"),
  "primary aligned subtitle regeneration button",
);
assert.ok(
  generator.includes("replaceSubtitleItems"),
  "generator atomically replaces old subtitles",
);
assert.ok(
  generator.includes("loadProjectSubtitleScript"),
  "generator auto-loads approved project script",
);
assert.ok(
  generator.includes("104px@1080"),
  "generator advertises restored shorts style",
);
assert.ok(
  generator.includes('data-editor-local-whisper-status="true"'),
  "generator shows Local Whisper runtime status card",
);
assert.ok(
  generator.includes('data-editor-force-local-whisper="true"'),
  "generator exposes forced Local Whisper reanalysis",
);
assert.ok(
  generator.includes("캐시 확인 / 필요 시 Local Whisper 분석 중"),
  "generator shows cache/analysis progress state",
);
assert.ok(
  generator.includes("최근 결과: 캐시"),
  "generator shows cache hit summary",
);
assert.ok(
  generator.includes("Local Whisper 강제 재분석 + 자막 재생성"),
  "generator shows forced reanalysis action",
);
assert.ok(
  generator.includes('data-editor-subtitle-timing-qc="true"'),
  "generator shows subtitle Timing QC panel",
);
assert.ok(
  generator.includes('data-editor-run-current-subtitle-qc="true"'),
  "generator exposes current subtitle Timing QC action",
);
assert.ok(
  generator.includes('data-editor-subtitle-qc-issue={entry.code}'),
  "Timing QC issues are clickable navigator controls",
);
assert.ok(
  generator.includes("navigateToTimingQcIssue"),
  "generator routes QC issues through navigator",
);
assert.ok(
  generator.includes("editorActions.selectItem([target.subtitleId])"),
  "QC navigator selects the target subtitle",
);
assert.ok(
  generator.includes("editorActions.setPlayhead(target.frame)"),
  "QC navigator updates editor playhead",
);
assert.ok(
  generator.includes("seek(target.frame)"),
  "QC navigator seeks the Remotion preview",
);
assert.ok(
  generator.includes("scrollTimelineSubtitleIntoView(target.subtitleId)"),
  "QC navigator scrolls the timeline cue into view",
);
assert.ok(
  generator.includes('data-editor-subtitle-qc-safe-fix={entry.code}'),
  "QC issue rows expose per-issue Safe Fix",
);
assert.ok(
  generator.includes('data-editor-apply-all-subtitle-safe-fixes="true"'),
  "Timing QC exposes Safe Fix all action",
);
assert.ok(
  generator.includes("applySubtitleTimingSafeFix"),
  "generator applies one Safe Fix through pure planner",
);
assert.ok(
  generator.includes("applyAllSubtitleTimingSafeFixes"),
  "generator applies all eligible Safe Fixes",
);
assert.ok(
  generator.includes("editorActions.replaceSubtitleItems(result.subtitles)"),
  "Safe Fix replacement is atomic at subtitle collection level",
);
assert.ok(
  generator.includes("잠금/수동 자막, 문구 변경, 무음"),
  "Safe Fix UI explains conservative non-fixable categories",
);
assert.ok(
  generator.includes("runSubtitleTimingQc"),
  "generator automatically runs Timing QC after generation",
);
assert.ok(
  generator.includes("wordsBySource,"),
  "generated subtitle QC receives actual Whisper word timing",
);
assert.ok(
  generator.includes("Timing QC ${report.status}"),
  "generator reports Timing QC status after replacement",
);
assert.ok(
  api.includes("/api/editor/subtitles/transcribe"),
  "subtitle transcribe API client",
);
assert.ok(
  api.includes("transcribeTtsSourceDetailed"),
  "subtitle API exposes detailed Local Whisper transcription result",
);
assert.ok(
  api.includes("LocalWhisperTranscriptionMeta"),
  "subtitle API exposes Local Whisper cache/runtime metadata",
);
assert.ok(
  api.includes("loadLocalWhisperCapabilities"),
  "subtitle API reads Local Whisper Sidecar capabilities",
);
assert.ok(
  api.includes("/api/editor/capabilities"),
  "subtitle API capability endpoint",
);
assert.ok(
  api.includes("force = false"),
  "subtitle client supports optional forced cache refresh",
);
assert.ok(
  api.includes("JSON.stringify({src, language, force})"),
  "subtitle client sends cache refresh flag",
);
assert.ok(
  api.includes('import {staticFile} from "remotion"'),
  "public project script uses Remotion staticFile URLs",
);
// MIG-09: runtime integration checks are deferred.
assert.ok(
  api.includes("looksLikeHtml"),
  "HTML fallback pages are rejected as subtitle text",
);
assert.ok(
  api.includes("public/projects/${projectId}/script/script.txt"),
  "missing-script error shows the authoritative public path",
);

for (const label of [
  "Text / 줄바꿈",
  "Start",
  "Duration",
  "X",
  "Y",
  "Width",
  "Font Size",
  "Font Weight",
  "Line Height",
  "Max Lines",
  "Stroke",
  "Text Color",
  "Stroke Color",
]) {
  assert.ok(textInspector.includes(label), "text inspector: " + label);
}
assert.ok(
  textInspector.includes("updateSubtitleStyle"),
  "subtitle style reducer route",
);
assert.ok(textInspector.includes("updateText"), "subtitle text reducer route");
assert.ok(
  inspector.includes('selected[0].type === "SUBTITLE"'),
  "subtitle inspector route",
);

assert.ok(
  timeline.includes('candidate.type === "SUBTITLE"'),
  "subtitle timeline interaction",
);
assert.ok(
  timelineItem.includes('item.type === "SUBTITLE"'),
  "subtitle drag and trim handles",
);
assert.ok(
  canvas.includes("data-editor-subtitle-canvas"),
  "preview canvas subtitle overlay",
);
assert.ok(
  canvas.includes("updateSubtitleStyle"),
  "preview drag updates subtitle XY",
);
assert.ok(
  canvas.includes("top: item.y - estimatedHeight"),
  "subtitle canvas uses bottom baseline anchor",
);
assert.ok(
  textRenderer.includes('shared/fonts/VITRO-CORE-TTF.ttf'),
  "generic renderer loads authoritative VITRO font",
);
assert.ok(
  textRenderer.includes('"translate(-50%, -100%)"'),
  "generic subtitle renderer uses bottom baseline anchor",
);
assert.ok(
  generic.includes("StudioSubtitleCanvasOverlay"),
  "preview overlay mounted",
);
assert.ok(studioEditor.includes("Auto 자막"), "auto subtitle toolbar");
assert.ok(
  studioEditor.includes("SubtitleGeneratorPanel"),
  "generator panel mounted",
);

// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.
// MIG-09: runtime integration checks are deferred.

console.log(
"[editor-subtitles] PASS: editor contracts; runtime integration checks deferred to MIG-09",
);
