import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { sha256CanonicalJson, type ImageRuntimeInput, type RuntimeJob } from "@vpf/runtime-contracts";
import { ImageRuntimeExecutor, MockImageProvider, probeImage } from "../src/image-runtime.js";
import { png } from "./image-fixture.js";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
async function fixture(width = 16, height = 9) {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vpf-image-"));
  const root = join(workspaceRoot, "projects", "p");
  await mkdir(root, {recursive:true});
  const bytes = png(width, height);
  await writeFile(join(root, "reference.png"), bytes);
  const input: ImageRuntimeInput = {
    prompt: '  승인된 문장\r\n"exact" \\ e\u0301  ', negativePrompt: "  NO text\n",
    width, height, aspectRatio: `${width}:${height}`,
    formatProfile: {resourceId: "FORMAT", version:"1.0.0", contentHash:"a".repeat(64)},
    references: [{mediaId:"reference", relativePath:"reference.png", sha256:hash(bytes), role:"IDENTITY_ANCHOR"}],
    outputRelativePath:"05_images/candidate.png"
  };
  const job: RuntimeJob<ImageRuntimeInput> = {
    schemaVersion:1, jobId:"job", jobRevision:2, projectId:"p", jobType:"IMAGE_GENERATION",
    target:{type:"ASSET", id:"asset", revision:2}, provider:"MOCK", providerProfileVersion:"1.0.0",
    executionMode:"AUTOMATED", attempt:1, inputHash:sha256CanonicalJson(input), input,
    expectedOutputs:[{role:"image",mediaType:"IMAGE",required:true}], secretRequirements:[]
  };
  const adapter = new MockImageProvider("MOCK", "1.0.0", bytes);
  const formats = {async resolve() {return {...input.formatProfile, payload:{aspectRatio:`${width}:${height}`,imageGeneration:{width,height}}};}};
  return {root, job, adapter, executor:new ImageRuntimeExecutor(adapter, formats, {workspaceRoot}), bytes, formats, workspaceRoot};
}
for (const [width,height] of [[16,9],[9,16]]) test(`exact image payload and dimensions ${width}:${height}`, async () => {
  const f = await fixture(width,height);
  const before = structuredClone(f.job);
  const result = await f.executor.execute(f.job);
  assert.deepEqual(f.job,before);
  assert.equal(f.adapter.requests[0]?.prompt, f.job.input.prompt);
  assert.equal(f.adapter.requests[0]?.negativePrompt, f.job.input.negativePrompt);
  assert.deepEqual(f.adapter.requests[0]?.references[0]?.bytes, new Uint8Array(f.bytes));
  assert.equal(result.outputs[0]?.sha256,hash(await readFile(join(f.root,f.job.input.outputRelativePath))));
  assert.equal(result.outputs[0]?.width,width);
  assert.deepEqual(result.providerRequestIds,["mock-image-1"]);
});
test("missing negative prompt is not synthesized",async()=>{
  const f=await fixture(); delete f.job.input.negativePrompt; f.job.inputHash=sha256CanonicalJson(f.job.input);
  await f.executor.execute(f.job); assert.equal(Object.hasOwn(f.adapter.requests[0]!,"negativePrompt"),false);
});
test("reference hash mismatch blocks provider submission",async()=>{
  const f=await fixture(); await writeFile(join(f.root,"reference.png"),"changed");
  await assert.rejects(f.executor.execute(f.job),{code:"RUNTIME_INPUT_HASH_MISMATCH"});
  assert.equal(f.adapter.requests.length,0);
});
test("mutated input hash and wrong profile dimensions block submission",async()=>{
  const f=await fixture(); f.job.input.width=32;
  await assert.rejects(f.executor.execute(f.job),{code:"RUNTIME_INPUT_HASH_MISMATCH"});
  f.job.inputHash=sha256CanonicalJson(f.job.input);
  await assert.rejects(f.executor.execute(f.job),{code:"RUNTIME_CONFIG_INVALID"});
  assert.equal(f.adapter.requests.length,0);
});
test("output traversal and symlink escape blocked",async()=>{
  const f=await fixture(); f.job.input.outputRelativePath="../escape.png"; f.job.inputHash=sha256CanonicalJson(f.job.input);
  await assert.rejects(f.executor.execute(f.job),{code:"ARTIFACT_PATH_INVALID"});
  await symlink(tmpdir(),join(f.root,"escape"));
  f.job.input.outputRelativePath="escape/image.png"; f.job.inputHash=sha256CanonicalJson(f.job.input);
  await assert.rejects(f.executor.execute(f.job),{code:"ARTIFACT_PATH_INVALID"});
});
test("manual package preserves job and imported checksum is mandatory",async()=>{
  const f=await fixture(); f.job.executionMode="MANUAL_EXTERNAL";
  assert.deepEqual(JSON.parse(await f.executor.prepareManual(f.job)),f.job);
  await assert.rejects(f.executor.importManual(f.job,"reference.png","0".repeat(64)),{code:"ARTIFACT_HASH_MISMATCH"});
  const result=await f.executor.importManual(f.job,"reference.png",hash(f.bytes),"external-id");
  assert.equal(result.status,"COMPLETE"); assert.deepEqual(result.providerRequestIds,["external-id"]);
  assert.equal(f.adapter.requests.length,0);
});
test("corrupt PNG and unexpected dimensions rejected; no output overwrite",async()=>{
  assert.throws(()=>probeImage(Buffer.from("fake PNG")),{code:"PROVIDER_RESULT_INVALID"});
  const corrupt=png(); corrupt[40]^=1; assert.throws(()=>probeImage(corrupt));
  const f=await fixture(); const bad=new ImageRuntimeExecutor(new MockImageProvider("MOCK","1.0.0",png(9,16)),f.formats,{workspaceRoot:f.workspaceRoot});
  await assert.rejects(bad.execute(f.job),{code:"PROVIDER_RESULT_INVALID"});
  await f.executor.execute(f.job);
  await assert.rejects(f.executor.execute(f.job));
  assert.deepEqual(await readFile(join(f.root,f.job.input.outputRelativePath)),f.bytes);
});
test("provider exceptions do not leak transport secrets",async()=>{
  const f=await fixture(); const adapter={provider:"MOCK",providerProfileVersion:"1.0.0",async generate(){throw new Error("private transport secret");}};
  await assert.rejects(new ImageRuntimeExecutor(adapter,f.formats,{workspaceRoot:f.workspaceRoot}).execute(f.job),
    (error:Error)=>error.message==="Image provider request failed.");
});
