import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import type { RuntimeJob } from "@vpf/runtime-contracts";
import type { ImageRuntimeInput } from "@vpf/runtime-contracts/image";

function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function sha(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function makeRuntimeJob(input: ImageRuntimeInput, projectId = "process-image"): RuntimeJob<ImageRuntimeInput> {
  return {
    schemaVersion: 1,
    jobId: "job-process",
    jobRevision: 2,
    projectId,
    jobType: "IMAGE_GENERATION",
    target: { type: "ASSET", id: "asset-process", revision: 2 },
    provider: "TEST_ADAPTER",
    providerProfileVersion: "test-v1",
    executionMode: "AUTOMATED",
    attempt: 1,
    inputHash: "a".repeat(64),
    input,
    expectedOutputs: [{
      role: "primary",
      mediaType: "IMAGE",
      required: true,
      acceptedMimeTypes: ["image/png"]
    }],
    secretRequirements: []
  };
}

test("runtimes/image process entrypoint executes a provider adapter without changing prompt", async () => {
  const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vpf-mig06-process-"));
  const projectId = "process-image";
  const projectRoot = join(workspaceRoot, "projects", projectId);
  const reference = png(32, 32);
  const referencePath = join(projectRoot, "04_visual_identity", "reference.png");
  await mkdir(dirname(referencePath), { recursive: true });
  await writeFile(referencePath, reference);

  const exactPrompt = "EXACT::prompt::한국어::  two-spaces";
  const input: ImageRuntimeInput = {
    prompt: exactPrompt,
    width: 320,
    height: 180,
    aspectRatio: "16:9",
    references: [{
      mediaId: "ref-process",
      role: "IDENTITY_ANCHOR:anchor-process",
      relativePath: "04_visual_identity/reference.png",
      sha256: sha(reference)
    }],
    outputRelativePath: "05_images/generated/process/attempt-1.png"
  };
  const runtimeJob = makeRuntimeJob(input, projectId);

  const adapterPath = join(workspaceRoot, "adapter.mjs");
  await writeFile(adapterPath, `
export default {
  async generate(request) {
    if (request.prompt !== ${JSON.stringify(exactPrompt)}) throw new Error("PROMPT_MUTATED");
    const bytes = Buffer.alloc(24);
    Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(bytes, 0);
    bytes.writeUInt32BE(13, 8);
    bytes.write("IHDR", 12, "ascii");
    bytes.writeUInt32BE(request.width, 16);
    bytes.writeUInt32BE(request.height, 20);
    return {bytes, mimeType: "image/png", providerRequestIds: ["process-request"]};
  }
};
`);

  const processResult = spawnSync(
    process.execPath,
    [join(repositoryRoot, "runtimes", "image", "runtime.mjs")],
    {
      cwd: repositoryRoot,
      input: JSON.stringify(runtimeJob),
      encoding: "utf8",
      env: {
        ...process.env,
        VPF_WORKSPACE_ROOT: workspaceRoot,
        VPF_IMAGE_ADAPTER_MODULE: adapterPath
      }
    }
  );

  assert.equal(processResult.status, 0, processResult.stderr);
  const result = JSON.parse(processResult.stdout) as {status: string; providerRequestIds: string[]};
  assert.equal(result.status, "COMPLETE");
  assert.deepEqual(result.providerRequestIds, ["process-request"]);
});

test("runtimes/image blocks a legacy repository adapter path before importing it", async () => {
  const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const root = await mkdtemp(join(tmpdir(), "vpf-mig11-image-adapter-"));
  const legacyDir = join(root, "video-production", "adapter");
  const marker = join(root, "adapter-loaded.txt");
  const adapterPath = join(legacyDir, "provider.mjs");
  await mkdir(legacyDir, { recursive: true });
  await writeFile(adapterPath, `
import {writeFileSync} from "node:fs";
writeFileSync(${JSON.stringify(marker)}, "loaded");
export default {async generate(){throw new Error("SHOULD_NOT_RUN");}};
`);

  const input: ImageRuntimeInput = {
    prompt: "semantic prompt may mention nothing operational",
    width: 320,
    height: 180,
    aspectRatio: "16:9",
    references: [],
    outputRelativePath: "05_images/generated/process/attempt-1.png"
  };
  const processResult = spawnSync(
    process.execPath,
    [join(repositoryRoot, "runtimes", "image", "runtime.mjs")],
    {
      cwd: repositoryRoot,
      input: JSON.stringify(makeRuntimeJob(input)),
      encoding: "utf8",
      env: {
        ...process.env,
        VPF_WORKSPACE_ROOT: root,
        VPF_IMAGE_ADAPTER_MODULE: adapterPath
      }
    }
  );

  assert.equal(processResult.status, 1);
  assert.match(processResult.stderr, /Legacy operational reference is forbidden/);
  assert.equal(existsSync(marker), false, "legacy adapter must be rejected before module import side effects");
});
