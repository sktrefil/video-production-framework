import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
  mkdir,
  rm,
  writeFile,
  readFile,
} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  validateEditorProductionProject,
  projectSha256,
} from "./editor-production-gate.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const read = (path) => readFile(resolve(ROOT, path), "utf8");

const projectId = "e10-production-gate-test";
const publicProjectDir = resolve(ROOT, "public", "projects", projectId);
const framePath = resolve(publicProjectDir, "frame.png");
const ttsPath = resolve(publicProjectDir, "tts.mp3");
const localSubtitleCacheDir = resolve(
  ROOT,
  ".local",
  "subtitles",
  projectId,
);

await mkdir(publicProjectDir, {recursive: true});
await writeFile(framePath, Buffer.from([1, 2, 3, 4]));
await writeFile(ttsPath, Buffer.from([9, 8, 7, 6, 5, 4]));

const baseProject = {
  schemaVersion: 1,
  project: {
    id: projectId,
    name: "E10 Gate Test",
    fps: 30,
    width: 1080,
    height: 1920,
    durationInFrames: 90,
  },
  tracks: [
    {
      id: "V1",
      type: "VIDEO",
      name: "Main Visual",
      enabled: true,
      locked: false,
      order: 0,
    },
    {
      id: "T1",
      type: "TEXT",
      name: "Subtitle",
      enabled: true,
      locked: false,
      order: 1,
    },
  ],
  items: [
    {
      id: "image-01",
      type: "IMAGE",
      trackId: "V1",
      timelineStartFrame: 0,
      durationInFrames: 90,
      enabled: true,
      locked: false,
      src: `projects/${projectId}/frame.png`,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
      fit: "cover",
    },
    {
      id: "subtitle-01",
      type: "SUBTITLE",
      trackId: "T1",
      timelineStartFrame: 0,
      durationInFrames: 45,
      enabled: true,
      locked: false,
      text: "Production Gate",
      x: 540,
      y: 1540,
      width: 900,
      fontFamily: "sans-serif",
      fontSize: 72,
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
    },
  ],
  settings: {
    snapEnabled: true,
    snapToleranceFrames: 4,
    timelineZoom: 1,
    masterVolume: 1,
  },
};

try {
  const approved = await validateEditorProductionProject(baseProject);
  assert.equal(approved.ok, true, "valid local full-coverage project approved");
  assert.equal(approved.errors.length, 0, "approved project has no errors");
  assert.equal(approved.verifiedMedia.length, 1, "local media verified");
  assert.equal(approved.visualGaps.length, 0, "no visual gaps");
  assert.equal(
    approved.subtitleQc?.status,
    "PASS",
    "valid subtitle timing QC passes production gate",
  );

  const motionProject = structuredClone(baseProject);
  motionProject.items[0].motion = {
    kind: "TRANSFORM",
    from: {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
    },
    to: {
      x: 0,
      y: 0,
      scale: 1.05,
      rotation: 0,
      opacity: 1,
    },
    easing: "EASE_IN_OUT",
  };
  const motionApproved =
    await validateEditorProductionProject(motionProject);
  assert.equal(
    motionApproved.ok,
    true,
    "valid executable image motion passes production gate",
  );

  const badMotionProject = structuredClone(motionProject);
  badMotionProject.items[0].motion.to.scale = 0;
  const badMotionBlocked =
    await validateEditorProductionProject(badMotionProject);
  assert.equal(
    badMotionBlocked.ok,
    false,
    "invalid image motion blocks production gate",
  );
  assert.ok(
    badMotionBlocked.errors.some(
      (issue) => issue.code === "IMAGE_MOTION_INVALID",
    ),
    "invalid image motion has deterministic gate code",
  );

  const overlapProject = structuredClone(baseProject);
  overlapProject.items.push({
    ...structuredClone(baseProject.items[1]),
    id: "subtitle-02",
    timelineStartFrame: 40,
    durationInFrames: 20,
    text: "Overlap",
  });
  const overlapBlocked =
    await validateEditorProductionProject(overlapProject);
  assert.equal(
    overlapBlocked.ok,
    false,
    "subtitle overlap blocks production gate",
  );
  assert.ok(
    overlapBlocked.errors.some(
      (issue) => issue.code === "SUBTITLE_QC_OVERLAP",
    ),
    "subtitle overlap production error code",
  );
  const overlapGateIssue = overlapBlocked.errors.find(
    (issue) => issue.code === "SUBTITLE_QC_OVERLAP",
  );
  assert.deepEqual(
    overlapGateIssue?.data?.subtitleIds,
    ["subtitle-01", "subtitle-02"],
    "production subtitle QC error preserves target subtitle ids",
  );
  assert.equal(
    overlapGateIssue?.data?.frame,
    40,
    "production subtitle QC error preserves problem frame",
  );
  assert.equal(
    overlapBlocked.subtitleQc?.status,
    "FAIL",
    "subtitle QC report fails on overlap",
  );

  const outsideProject = structuredClone(baseProject);
  outsideProject.tracks.push({
    id: "A1",
    type: "AUDIO",
    name: "TTS",
    enabled: true,
    locked: false,
    order: 2,
  });
  outsideProject.items.push({
    id: "tts-gate",
    type: "TTS",
    trackId: "A1",
    timelineStartFrame: 0,
    durationInFrames: 30,
    enabled: true,
    locked: false,
    src: `projects/${projectId}/tts.mp3`,
    sourceStartFrame: 0,
    sourceDurationInFrames: 30,
    sourceAssetDurationInFrames: 90,
    volume: 1,
    muted: false,
    fadeInFrames: 0,
    fadeOutFrames: 0,
  });
  outsideProject.items[1].timelineStartFrame = 25;
  outsideProject.items[1].durationInFrames = 15;
  outsideProject.items[1].generationSource = "SCRIPT_TTS_ALIGN";
  outsideProject.items[1].generatedFromTtsIds = ["tts-gate"];
  const outsideBlocked =
    await validateEditorProductionProject(outsideProject);
  assert.equal(
    outsideBlocked.ok,
    false,
    "subtitle outside referenced TTS blocks production gate",
  );
  assert.ok(
    outsideBlocked.errors.some(
      (issue) => issue.code === "SUBTITLE_QC_OUTSIDE_TTS_RANGE",
    ),
    "subtitle TTS boundary production error code",
  );

  const cacheDirectory = resolve(localSubtitleCacheDir, "tts-gate-cache");
  await mkdir(cacheDirectory, {recursive: true});
  const ttsHash = createHash("sha256")
    .update(await readFile(ttsPath))
    .digest("hex");
  await writeFile(
    resolve(cacheDirectory, "transcription_meta.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        engine: "faster-whisper",
        source: `projects/${projectId}/tts.mp3`,
        audioHash: ttsHash,
        model: "small",
        language: "ko",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    resolve(cacheDirectory, "word_timestamps.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        engine: "faster-whisper",
        words: [
          {word: "실제발화", start: 2.0, end: 2.2},
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const silenceProject = structuredClone(baseProject);
  silenceProject.tracks.push({
    id: "A1",
    type: "AUDIO",
    name: "TTS",
    enabled: true,
    locked: false,
    order: 2,
  });
  silenceProject.items.push({
    id: "tts-gate",
    type: "TTS",
    trackId: "A1",
    timelineStartFrame: 0,
    durationInFrames: 90,
    enabled: true,
    locked: false,
    src: `projects/${projectId}/tts.mp3`,
    sourceStartFrame: 0,
    sourceDurationInFrames: 90,
    sourceAssetDurationInFrames: 90,
    volume: 1,
    muted: false,
    fadeInFrames: 0,
    fadeOutFrames: 0,
  });
  silenceProject.items[1].timelineStartFrame = 0;
  silenceProject.items[1].durationInFrames = 20;
  silenceProject.items[1].generationSource = "SCRIPT_TTS_ALIGN";
  silenceProject.items[1].generatedFromTtsIds = ["tts-gate"];
  const silenceBlocked =
    await validateEditorProductionProject(silenceProject);
  assert.equal(
    silenceBlocked.ok,
    false,
    "subtitle in Local Whisper silence blocks production gate",
  );
  assert.ok(
    silenceBlocked.errors.some(
      (issue) => issue.code === "SUBTITLE_QC_NO_SPEECH_OVERLAP",
    ),
    "Local Whisper silence production error code",
  );
  assert.ok(
    silenceBlocked.subtitleQc?.cacheSources.some(
      (entry) => entry.src === `projects/${projectId}/tts.mp3`,
    ),
    "production gate records Local Whisper cache source",
  );

  const visualGapProject = structuredClone(baseProject);
  visualGapProject.items[0].durationInFrames = 60;
  const gapBlocked = await validateEditorProductionProject(visualGapProject);
  assert.equal(gapBlocked.ok, false, "visual gap blocks production");
  assert.ok(
    gapBlocked.errors.some((issue) => issue.code === "VISUAL_GAP"),
    "visual gap error code",
  );

  const gapAllowed = await validateEditorProductionProject(
    visualGapProject,
    {allowVisualGaps: true},
  );
  assert.equal(gapAllowed.ok, true, "explicit visual gap override");
  assert.ok(
    gapAllowed.warnings.some((issue) => issue.code === "VISUAL_GAP"),
    "visual gap becomes warning",
  );

  const missingMedia = structuredClone(baseProject);
  missingMedia.items[0].src = `projects/${projectId}/missing.png`;
  const missingBlocked = await validateEditorProductionProject(missingMedia);
  assert.equal(missingBlocked.ok, false, "missing media blocks production");
  assert.ok(
    missingBlocked.errors.some(
      (issue) => issue.code === "MEDIA_FILE_MISSING",
    ),
    "missing media error code",
  );

  const remoteMedia = structuredClone(baseProject);
  remoteMedia.items[0].src = "https://example.com/frame.png";
  const remoteBlocked = await validateEditorProductionProject(remoteMedia);
  assert.equal(remoteBlocked.ok, false, "remote media blocked by default");
  assert.ok(
    remoteBlocked.errors.some(
      (issue) => issue.code === "REMOTE_MEDIA_BLOCKED",
    ),
    "remote deterministic block",
  );
  const remoteAllowed = await validateEditorProductionProject(remoteMedia, {
    allowRemote: true,
  });
  assert.equal(remoteAllowed.ok, true, "remote can be explicitly allowed");
  assert.ok(
    remoteAllowed.warnings.some(
      (issue) => issue.code === "REMOTE_MEDIA_ALLOWED",
    ),
    "remote override warning",
  );

  const ephemeral = structuredClone(baseProject);
  ephemeral.items[0].src = "blob:http://localhost/temp";
  const ephemeralBlocked = await validateEditorProductionProject(ephemeral);
  assert.equal(ephemeralBlocked.ok, false, "blob media blocked");
  assert.ok(
    ephemeralBlocked.errors.some(
      (issue) => issue.code === "EPHEMERAL_MEDIA_SOURCE",
    ),
    "ephemeral source error",
  );

  const timelineOverflow = structuredClone(baseProject);
  timelineOverflow.items[1].timelineStartFrame = 80;
  timelineOverflow.items[1].durationInFrames = 20;
  const overflowBlocked =
    await validateEditorProductionProject(timelineOverflow);
  assert.ok(
    overflowBlocked.errors.some(
      (issue) => issue.code === "ITEM_EXCEEDS_COMPOSITION",
    ),
    "timeline overflow blocked",
  );

  const videoMismatch = structuredClone(baseProject);
  videoMismatch.items[0] = {
    id: "video-01",
    type: "VIDEO",
    trackId: "V1",
    timelineStartFrame: 0,
    durationInFrames: 90,
    enabled: true,
    locked: false,
    src: `projects/${projectId}/frame.png`,
    sourceStartFrame: 0,
    sourceDurationInFrames: 60,
    sourceAssetDurationInFrames: 60,
    playbackRate: 2,
    volume: 0,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    fit: "cover",
  };
  const mismatchBlocked =
    await validateEditorProductionProject(videoMismatch);
  assert.ok(
    mismatchBlocked.errors.some(
      (issue) => issue.code === "VIDEO_DURATION_RATE_MISMATCH",
    ),
    "video duration/rate mismatch blocked",
  );

  const hashA = projectSha256(baseProject);
  const hashB = projectSha256(JSON.parse(JSON.stringify(baseProject)));
  assert.equal(hashA, hashB, "project hash stable across JSON roundtrip");

  const finalRender = await read("src/editor/GenericFinalRender.tsx");
  const projectRenderer = await read("src/editor/ProjectRenderer.tsx");
  const root = await read("src/Root.tsx");
// MIG-09: runtime integration checks are deferred.
  const productionGate = await read("scripts/editor-production-gate.mjs");
  const subtitleProductionQc = await read(
    "scripts/subtitle-production-qc.mjs",
  );
// MIG-09: runtime integration checks are deferred.
  const persistenceApi = await read(
    "src/studio/editor/persistence/editorPersistenceApi.ts",
  );
  const studioEditor = await read("src/studio/editor/StudioEditor.tsx");
  const subtitleGenerator = await read(
    "src/studio/editor/subtitles/SubtitleGeneratorPanel.tsx",
  );

  assert.ok(
    finalRender.includes("<ProjectRenderer project={project} />"),
    "final render uses exact same ProjectRenderer as preview",
  );
  for (const token of [
    "durationInFrames: metadata.durationInFrames",
    "fps: metadata.fps",
    "width: metadata.width",
    "height: metadata.height",
    'defaultCodec: "h264"',
    'defaultPixelFormat: "yuv420p"',
  ]) {
    assert.ok(finalRender.includes(token), "dynamic metadata: " + token);
  }

  assert.ok(
    projectRenderer.includes("export const ProjectRenderer"),
    "shared renderer exported",
  );
  assert.ok(root.includes('id="GenericVideoEditor"'), "preview composition");
  assert.ok(root.includes('id="GenericFinalRender"'), "final composition");
  assert.ok(
    root.includes("calculateGenericFinalRenderMetadata"),
    "final composition calculateMetadata",
  );
  assert.ok(
    root.includes(
      "defaultProps={{ project: EDITOR_PROJECT }}",
    ),
    "final composition default props fixture",
  );

  assert.ok(
    productionGate.includes("validateSubtitleProductionQc"),
    "production gate runs subtitle QC",
  );

  assert.ok(
    productionGate.includes('"IMAGE_MOTION_INVALID"'),
    "production gate validates executable image motion",
  );
  assert.ok(
    productionGate.includes("SUBTITLE_QC_${entry.code}"),
    "production gate promotes subtitle QC errors to blocking gate errors",
  );
  assert.ok(
    subtitleProductionQc.includes('"NO_SPEECH_OVERLAP"'),
    "production subtitle QC checks Local Whisper silence windows",
  );
  assert.ok(
    subtitleProductionQc.includes("meta?.audioHash !== expectedAudioHash"),
    "production subtitle QC rejects stale Whisper cache",
  );

// MIG-09: runtime integration checks are deferred.

// MIG-09: runtime integration checks are deferred.

  assert.ok(
    persistenceApi.includes("runEditorProductionGate"),
    "Studio gate API",
  );
  assert.ok(
    persistenceApi.includes("runEditorFinalRender"),
    "Studio render API",
  );
  assert.ok(
    persistenceApi.includes("subtitleQc: gate?.subtitleQc"),
    "Studio production API exposes subtitle QC summary",
  );
  assert.ok(
    persistenceApi.includes("export type EditorProductionIssue"),
    "Studio production API defines navigable production issue type",
  );
  assert.ok(
    persistenceApi.includes("subtitleIds?: string[]"),
    "Studio production API preserves subtitle ids for gate navigation",
  );
  assert.ok(
    persistenceApi.includes("frame?: number"),
    "Studio production API preserves QC problem frame",
  );

  for (const token of [
    "data-editor-production-gate-button",
    "data-editor-final-render-button",
    "data-editor-production-status",
    "runProductionGate",
    "runFinalRender",
    "Save required for Gate/Render",
  ]) {
    assert.ok(studioEditor.includes(token), "Studio production UI: " + token);
  }

  assert.ok(
    studioEditor.includes('entry.code.startsWith("SUBTITLE_QC_")'),
    "Studio surfaces subtitle QC blocking errors",
  );
  assert.ok(
    studioEditor.includes("Subtitle QC BLOCKED"),
    "Studio labels production gate subtitle QC block",
  );
  assert.ok(
    studioEditor.includes("Final Render BLOCKED · Subtitle QC"),
    "Studio labels final render subtitle QC block",
  );
  assert.ok(
    studioEditor.includes("Subtitle QC ERROR blocks Final Render"),
    "Final Render tooltip documents subtitle QC gate",
  );
  assert.ok(
    studioEditor.includes('data-editor-production-subtitle-qc-error={entry.code}'),
    "Studio renders clickable production subtitle QC errors",
  );
  assert.ok(
    studioEditor.includes("openSubtitleQcFromProductionError"),
    "Studio routes production QC errors into Auto subtitle QC",
  );
  assert.ok(
    studioEditor.includes("setSubtitleGeneratorOpen(true)"),
    "Gate QC navigation opens Auto subtitle panel",
  );
  assert.ok(
    studioEditor.includes("resolveSubtitleQcNavigationTarget"),
    "Gate QC navigation resolves target subtitle and frame",
  );
  assert.ok(
    studioEditor.includes("dispatch(editorActions.selectItem([target.subtitleId]))"),
    "Gate QC navigation selects target subtitle",
  );
  assert.ok(
    studioEditor.includes("seekExact(target.frame)"),
    "Gate QC navigation seeks the preview to problem frame",
  );
  assert.ok(
    studioEditor.includes("scrollTimelineSubtitleIntoView(target.subtitleId)"),
    "Gate QC navigation scrolls target cue into view",
  );
  assert.ok(
    studioEditor.includes("gateFocus={subtitleGateQcFocus}"),
    "Studio passes production gate focus into Auto subtitle panel",
  );
  assert.ok(
    subtitleGenerator.includes('data-editor-production-gate-qc-focus="true"'),
    "Auto subtitle QC panel shows production gate focus banner",
  );
  assert.ok(
    subtitleGenerator.includes("timingQcRef.current?.scrollIntoView"),
    "Auto subtitle panel scrolls to Timing QC after gate navigation",
  );

  assert.ok(
    studioEditor.includes("if (state.dirty)"),
    "dirty project cannot render",
  );

  console.log(
"[editor-production] PASS: editor contracts; runtime integration checks deferred to MIG-09",
  );
} finally {
  await rm(publicProjectDir, {recursive: true, force: true});
  await rm(localSubtitleCacheDir, {recursive: true, force: true});
}
