import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RuntimeContractError, type RuntimeJob } from "@vpf/runtime-contracts";
import type { ImageRuntimeInput } from "@vpf/runtime-contracts/image";
import {
  ImageRuntimeExecutor,
  assertImageProviderRequestMatchesApprovedInput,
  buildManualImageRuntimeResult,
  type ImageProviderRequest
} from "../src/image-runtime.js";

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

function runtimeJob(input: ImageRuntimeInput): RuntimeJob<ImageRuntimeInput> {
  return {
    schemaVersion: 1,
    jobId: "job-image",
    jobRevision: 2,
    projectId: "project-image",
    jobType: "IMAGE_GENERATION",
    target: { type: "ASSET", id: "asset-image", revision: 2 },
    provider: "MOCK_IMAGE",
    providerProfileVersion: "mock-v1",
    executionMode: "AUTOMATED",
    attempt: 1,
    inputHash: "a".repeat(64),
    input,
    expectedOutputs: [
      {
        role: "primary",
        mediaType: "IMAGE",
        required: true,
        acceptedMimeTypes: ["image/png"]
      }
    ],
    secretRequirements: []
  };
}

async function fixture() {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vpf-mig06-image-"));
  const projectRoot = join(workspaceRoot, "projects", "project-image");
  await mkdir(join(projectRoot, "04_visual_identity"), { recursive: true });
  const referenceBytes = png(64, 64);
  await writeFile(join(projectRoot, "04_visual_identity", "reference.png"), referenceBytes);
  const input: ImageRuntimeInput = {
    prompt: "Exact approved prompt — preserve punctuation, 한국어, spacing.",
    negativePrompt: "Exact negative prompt; do not mutate.",
    width: 1536,
    height: 864,
    aspectRatio: "16:9",
    references: [
      {
        mediaId: "reference-media",
        role: "IDENTITY_ANCHOR:anchor-1",
        relativePath: "04_visual_identity/reference.png",
        sha256: sha(referenceBytes)
      }
    ],
    outputRelativePath: "05_images/generated/asset-image/attempt-1.png"
  };
  return { workspaceRoot, projectRoot, input };
}

test("image runtime sends exact semantic prompt/reference payload and writes hash-verified output", async () => {
  const { workspaceRoot, projectRoot, input } = await fixture();
  let captured: ImageProviderRequest | undefined;
  const executor = new ImageRuntimeExecutor(
    {
      async generate(request) {
        captured = request;
        assert.equal(request.prompt, input.prompt);
        assert.equal(request.negativePrompt, input.negativePrompt);
        assert.equal(request.references.length, 1);
        return {
          bytes: png(input.width, input.height),
          mimeType: "image/png",
          providerRequestIds: ["req-image-1"]
        };
      }
    },
    {
      workspace: { workspaceRoot },
      clock: { nowIso: () => "2026-09-10T12:00:00.000Z" }
    }
  );

  const result = await executor.execute(runtimeJob(input));
  assert.equal(result.status, "COMPLETE");
  assert.deepEqual(result.providerRequestIds, ["req-image-1"]);
  assert.equal(result.outputs[0]?.width, 1536);
  assert.equal(result.outputs[0]?.height, 864);
  assert.equal(result.outputs[0]?.mimeType, "image/png");
  assert.equal(result.outputs[0]?.relativePath, input.outputRelativePath);
  const actual = await readFile(join(projectRoot, input.outputRelativePath));
  assert.equal(result.outputs[0]?.sha256, sha(actual));
  assert.ok(captured);
  assertImageProviderRequestMatchesApprovedInput(captured!, input);
});

test("reference hash mismatch blocks before the provider adapter is called", async () => {
  const { workspaceRoot, input } = await fixture();
  input.references[0] = { ...input.references[0]!, sha256: "0".repeat(64) };
  let called = false;
  const executor = new ImageRuntimeExecutor(
    {
      async generate() {
        called = true;
        return { bytes: png(1536, 864), mimeType: "image/png" };
      }
    },
    { workspace: { workspaceRoot } }
  );
  await assert.rejects(
    () => executor.execute(runtimeJob(input)),
    (error: unknown) =>
      error instanceof RuntimeContractError && error.code === "ARTIFACT_HASH_MISMATCH"
  );
  assert.equal(called, false);
});

test("provider result with wrong dimensions is rejected rather than silently resized", async () => {
  const { workspaceRoot, input } = await fixture();
  const executor = new ImageRuntimeExecutor(
    {
      async generate() {
        return { bytes: png(1024, 1024), mimeType: "image/png" };
      }
    },
    { workspace: { workspaceRoot } }
  );
  await assert.rejects(
    () => executor.execute(runtimeJob(input)),
    (error: unknown) =>
      error instanceof RuntimeContractError && error.code === "PROVIDER_RESULT_INVALID"
  );
});

test("manual fallback imports only the exact approved output path and dimensions", async () => {
  const { workspaceRoot, projectRoot, input } = await fixture();
  const path = join(projectRoot, input.outputRelativePath);
  await mkdir(join(projectRoot, "05_images", "generated", "asset-image"), { recursive: true });
  await writeFile(path, png(input.width, input.height));
  const result = await buildManualImageRuntimeResult({
    runtimeJob: runtimeJob(input),
    workspace: { workspaceRoot },
    providerRequestIds: ["manual-ticket-1"],
    startedAt: "2026-09-10T12:00:00.000Z",
    completedAt: "2026-09-10T12:00:01.000Z"
  });
  assert.equal(result.status, "COMPLETE");
  assert.deepEqual(result.providerRequestIds, ["manual-ticket-1"]);
  assert.equal(result.outputs[0]?.sha256, sha(await readFile(path)));
});
