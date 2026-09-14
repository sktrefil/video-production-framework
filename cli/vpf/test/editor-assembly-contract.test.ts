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
  assert.match(service,/result\.assembly\.editProject/);
  assert.match(service,/"edit_project\.json"/);
  assert.doesNotMatch(service,/totalFrames\s*=\s*1500/);
  assert.doesNotMatch(service,/clipFrames\s*=\s*150/);
  assert.doesNotMatch(service,/width\s*:\s*1080/);
  assert.doesNotMatch(service,/height\s*:\s*1920/);
});

test("shortform editor content plan includes top 18 percent and bottom 28 percent blur panels",()=>{
  const service=read("cli/vpf/src/editor-assembly-service.ts");

  assert.match(service,/id: "top-safe-blur"/);
  assert.match(service,/id: "bottom-safe-blur"/);
  assert.match(service,/graphicType: "BLUR_PANEL"/);
  assert.match(service,/height: Math\.round\(input\.profile\.height \* 0\.18\)/);
  assert.match(service,/bottomBlurY = Math\.round\(input\.profile\.height \* 0\.72\)/);
  assert.match(service,/height: input\.profile\.height - bottomBlurY/);
});

test("canonical render wrapper rejects assembly lineage drift",()=>{
  const wrapper=read("apps/editor/scripts/render-editor-project-canonical.mjs");
  const editorPkg=JSON.parse(read("apps/editor/package.json")) as {scripts:{render:string}};

  assert.equal(editorPkg.scripts.render,"node scripts/render-editor-project-canonical.mjs");
  assert.match(wrapper,/ASSEMBLY_LINEAGE_MISMATCH/);
  assert.match(wrapper,/materializedRevision !== renderRevision/);
  assert.match(wrapper,/materializedId !== renderId/);
});
