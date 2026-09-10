import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp, mkdir, symlink, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {assertUnifiedProject, assertNoLegacyReference, assertNoLegacyExecutionInput} from "../src/index.js";
import {assertIsolatedPath} from "../src/filesystem.js";

test("project identity fails closed, including missing flags and truthy coercions",()=>{
  for(const policy of [null,{}, {pipeline:"VPF_UNIFIED_V1"}, {pipeline:"VPF_UNIFIED_V1",legacyAllowed:"false"}, {pipeline:"LEGACY",legacyAllowed:false}, {pipeline:"VPF_UNIFIED_V1",legacyAllowed:true}])
    assert.throws(()=>assertUnifiedProject(policy),{code:"LEGACY_RUNTIME_FORBIDDEN"});
  assert.doesNotThrow(()=>assertUnifiedProject({pipeline:"VPF_UNIFIED_V1",legacyAllowed:false}));
});

test("all seven legacy categories reject case, separator and encoded variants",()=>{
  const examples=[
    ["HISTORY_MYSTERY_STYLIZED_V1", "LEGACY_VISUAL_STYLE"],
    ["config/history_mystery_shorts_style.json", "LEGACY_VISUAL_STYLE"],
    ["master_library/character.png", "LEGACY_MASTER_LIBRARY"],
    ["src/lived_sentences/image_prompt_planner.py", "LEGACY_IMAGE_PROMPT_PLANNER"],
    ["src.lived_sentences.scenes", "LEGACY_SCENE_INTERPRETER"],
    ["src\\SADO_PRINCE\\index.ts", "LEGACY_PROJECT_RENDER_PATH"],
    ["src%2Fsado_prince%2Findex.ts", "LEGACY_PROJECT_RENDER_PATH"],
    ["src/lived_sentences/cli.py", "LEGACY_CONTROL_PLANE"],
    ["D:\\git\\video-production\\main.py", "LEGACY_RUNTIME_FORBIDDEN"],
    ["/tmp/video-production-admin-manager-v2/runtime.py", "LEGACY_RUNTIME_FORBIDDEN"]
  ];
  for(const [value,code] of examples) assert.throws(()=>assertNoLegacyReference(value!),{code});
});

test("execution metadata is guarded while semantic prompt bytes remain untouched",()=>{
  const input={prompt:" Do not use HISTORY_MYSTERY_STYLIZED_V1\r\n",negativePrompt:"master_library",references:[{relativePath:"05_images/anchor.png"}]};
  const before=JSON.stringify(input); assert.doesNotThrow(()=>assertNoLegacyExecutionInput(input)); assert.equal(JSON.stringify(input),before);
  assert.throws(()=>assertNoLegacyExecutionInput({...input,references:[{relativePath:"master_library/anchor.png"}]}),{code:"LEGACY_MASTER_LIBRARY"});
  assert.throws(()=>assertNoLegacyExecutionInput({runtime:{args:["src/lived_sentences/cli.py"]}}),{code:"LEGACY_CONTROL_PLANE"});
  for(const valid of ["/repo/video-production-framework/runtimes/elevenlabs/runtime.py","projects/project_one/media/image.png","HISTORY_MYSTERY_VISUAL_BIBLE"])
    assert.doesNotThrow(()=>assertNoLegacyReference(valid));
});

test("resource/media symlinks and sibling-prefix escapes fail before access",async()=>{
  const root=await mkdtemp(join(tmpdir(),"vpf-isolation-"));
  await mkdir(join(root,"canonical")); await mkdir(join(root,"external"));
  await writeFile(join(root,"external","file.json"),"{}");
  await symlink(join(root,"external"),join(root,"canonical","link"));
  assert.throws(()=>assertIsolatedPath(join(root,"canonical"),join(root,"canonical","link","file.json")),{code:"LEGACY_RUNTIME_FORBIDDEN"});
  assert.throws(()=>assertIsolatedPath(join(root,"canonical"),join(root,"canonical-other","file.json")),{code:"LEGACY_RUNTIME_FORBIDDEN"});
  assert.doesNotThrow(()=>assertIsolatedPath(join(root,"canonical"),join(root,"canonical","new.json")));
});
