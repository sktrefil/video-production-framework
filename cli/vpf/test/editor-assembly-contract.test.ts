import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../../..");
const read=(relative:string)=>readFileSync(resolve(root,relative),"utf8");

test("vpf production entry routes editor assemble through canonical orchestration",()=>{
  const pkg=JSON.parse(read("package.json")) as {scripts:{vpf:string}};
  const entry=read("cli/vpf/src/entry.ts");
  const service=read("cli/vpf/src/editor-assembly-service.ts");

  assert.equal(pkg.scripts.vpf,"node cli/vpf/dist/entry.js");
  assert.match(entry,/args\[0\] === "editor" && args\[1\] === "assemble"/);
  assert.match(entry,/new EditorAssemblyCliService\(\)\.assemble/);
  assert.match(service,/new MediaBindingPipeline/);
  assert.match(service,/binding\.bindProject/);
  assert.match(service,/binding\.buildEditorHandoff/);
  assert.match(service,/new EditorContentPlanService/);
  assert.match(service,/new EditorTimelineAssemblyPipeline/);
  assert.match(service,/pipeline\.assembleProject/);
});

test("editor assembly resolves pinned format profile and emits DB-derived canonical json",()=>{
  const service=read("cli/vpf/src/editor-assembly-service.ts");

  assert.match(service,/resourceType === "FORMAT_PROFILE"/);
  assert.match(service,/resolvePinned<FormatProfilePayload>/);
  assert.match(service,/resource\.payload\.format === "SHORTFORM" \? 3 : 1/);
  assert.match(service,/REPOSITORY_RESOURCES_ROOT/);
  assert.match(service,/fileURLToPath\(import\.meta\.url\)/);
  assert.doesNotMatch(service,/status\.projectRoot, "\.\.", "\.\.", "\.\.", "resources"/);
  assert.match(service,/result\.assembly\.editProject/);
  assert.match(service,/"edit_project\.json"/);
  assert.doesNotMatch(service,/totalFrames\s*=\s*1500/);
  assert.doesNotMatch(service,/clipFrames\s*=\s*150/);
  assert.doesNotMatch(service,/width\s*:\s*1080/);
  assert.doesNotMatch(service,/height\s*:\s*1920/);
});

test("shortform editor content plan includes top 18 percent and bottom 26 percent blur panels",()=>{
  const service=read("cli/vpf/src/editor-assembly-service.ts");

  assert.match(service,/id: "top-safe-blur"/);
  assert.match(service,/id: "bottom-safe-blur"/);
  assert.match(service,/graphicType: "BLUR_PANEL"/);
  assert.match(service,/isShortform \? 0\.18 : 0\.12/);
  assert.match(service,/isShortform \? 0\.74 : 0\.82/);
  assert.match(service,/height: input\.profile\.height - bottomBlurY/);
  assert.match(service,/backgroundColor: "rgba\(8,12,18,0\.30\)"/);
});

test("editor content plan pins the approved Korean title and subtitle layout",()=>{
  const service=read("cli/vpf/src/editor-assembly-service.ts");
  const visuals=read("packages/domain/src/subtitle-visual-presets.ts");

  assert.match(visuals,/cinematicShortsHeaderVisuals/);
  assert.match(visuals,/cinematicShortsSubtitleFontSize/);
  assert.match(visuals,/fontFamily:"VPF Noto Sans KR"/);
  assert.match(service,/cinematicSubtitleStyleForFormat/);
  assert.match(service,/cinematicHeaderVisualsForFormat/);
  assert.match(service,/\.\.\.headerVisuals\.title/);
  assert.match(service,/\.\.\.headerVisuals\.info/);
  assert.match(service,/\.\.\.headerVisuals\.panel/);
  assert.match(service,/\.\.\.headerVisuals\.goldRule/);
});

test("editor assembly accepts project-owned, non-overlapping top information labels",()=>{
  const service=read("cli/vpf/src/editor-assembly-service.ts");

  assert.match(service,/top_annotations\.json/);
  assert.match(service,/readTopAnnotations/);
  assert.match(service,/annotation\.startMs < previousEnd/);
  assert.match(service,/textRole: "LABEL" as const/);
  assert.match(service,/id: `top-info-\$\{annotation\.id\}`/);
});

test("video-only narration timing replaces image holds and loops only when the source is shorter",()=>{
  const timing=read("cli/vpf/src/editor-narration-timing.ts");

  assert.match(timing,/const videoFrames = segment\.durationInFrames/);
  assert.match(timing,/\{loop: true\}/);
  assert.match(timing,/const holdFrames = source\.bindingKind === "VIDEO" \? 0/);
  assert.match(timing,/allNarrationSegmentsUseVideo && containsLegacyImageHold/);
});

test("narration-timed video scenes restore source sound on A2",()=>{
  const timing=read("cli/vpf/src/editor-narration-timing.ts");
  const service=read("cli/vpf/src/editor-assembly-service.ts");

  assert.match(timing,/type: "CLIP_AUDIO"/);
  assert.match(timing,/trackId: "A2"/);
  assert.match(timing,/id: `audio-\$\{placeholder\.id\}`/);
  assert.match(timing,/volume: this\.profile\.clipAudioVolume \?\? 1/);
  assert.match(service,/clipAudioVolume: finiteNumber\(defaults\.clipAudioVolume, 1\)/);
});

test("canonical render wrapper rejects assembly lineage drift",()=>{
  const wrapper=read("apps/editor/scripts/render-editor-project-canonical.mjs");
  const editorPkg=JSON.parse(read("apps/editor/package.json")) as {scripts:{render:string}};

  assert.equal(editorPkg.scripts.render,"node scripts/render-editor-project-canonical.mjs");
  assert.match(wrapper,/ASSEMBLY_LINEAGE_MISMATCH/);
  assert.match(wrapper,/materializedRevision !== renderRevision/);
  assert.match(wrapper,/materializedId !== renderId/);
});


test("LONGFORM editor assembly materializes segmented TTS placements on A1 with generated subtitle provenance",()=>{
  const service=read("cli/vpf/src/editor-assembly-service.ts");
  assert.match(service,/buildSegmentedTtsTimelineFromArtifacts/);
  assert.match(service,/narrationMode \?\? "SINGLE"\) === "SEGMENTED"/);
  assert.match(service,/audioPlacementIds: timeline\.audio\.map/);
  assert.match(service,/totalNarrationDurationMs\(content\.plan\.audio\)/);
});
