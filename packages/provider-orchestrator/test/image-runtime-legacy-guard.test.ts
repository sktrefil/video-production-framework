import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { RuntimeJob } from "@vpf/runtime-contracts";
import type { ImageRuntimeInput } from "@vpf/runtime-contracts/image";
import { LegacyGuardError } from "@vpf/legacy-guard";
import { ImageRuntimeExecutor } from "../src/image-runtime.js";

function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function job(input: ImageRuntimeInput, provider = "SAFE_IMAGE_ADAPTER"): RuntimeJob<ImageRuntimeInput> {
  return {
    schemaVersion: 1,
    jobId: "job-legacy-guard-image",
    jobRevision: 1,
    projectId: "image-legacy-guard",
    jobType: "IMAGE_GENERATION",
    target: { type: "ASSET", id: "asset-1", revision: 1 },
    provider,
    providerProfileVersion: "safe-v1",
    executionMode: "AUTOMATED",
    attempt: 1,
    inputHash: "b".repeat(64),
    input,
    expectedOutputs: [{role:"primary", mediaType:"IMAGE", required:true, acceptedMimeTypes:["image/png"]}],
    secretRequirements: []
  };
}

test("image runtime rejects a symlinked reference before the provider adapter is called", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vpf-mig11-image-symlink-"));
  const projectRoot = join(workspaceRoot, "projects", "image-legacy-guard");
  const outside = join(workspaceRoot, "outside");
  await mkdir(join(projectRoot, "04_visual_identity"), {recursive:true});
  await mkdir(outside, {recursive:true});
  const bytes = png(32, 32);
  await writeFile(join(outside, "reference.png"), bytes);
  await symlink(outside, join(projectRoot, "04_visual_identity", "linked"));

  let called = false;
  const executor = new ImageRuntimeExecutor({
    async generate() {
      called = true;
      return {bytes: png(320,180), mimeType:"image/png"};
    }
  }, {workspace:{workspaceRoot}});

  const input: ImageRuntimeInput = {
    prompt: "approved prompt",
    width: 320,
    height: 180,
    aspectRatio: "16:9",
    references: [{
      mediaId:"ref-1",
      role:"IDENTITY_ANCHOR:1",
      relativePath:"04_visual_identity/linked/reference.png",
      sha256:hash(bytes)
    }],
    outputRelativePath:"05_images/generated/asset-1/attempt-1.png"
  };

  await assert.rejects(() => executor.execute(job(input)), (error: unknown) =>
    error instanceof LegacyGuardError && error.code === "LEGACY_RUNTIME_FORBIDDEN");
  assert.equal(called, false);
});

test("image runtime rejects a legacy provider execution identifier while leaving prompt prose untouched", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "vpf-mig11-image-provider-"));
  let called = false;
  const executor = new ImageRuntimeExecutor({
    async generate() {
      called = true;
      return {bytes: png(320,180), mimeType:"image/png"};
    }
  }, {workspace:{workspaceRoot}});
  const input: ImageRuntimeInput = {
    prompt: "A documentary note can literally mention HISTORY_MYSTERY_STYLIZED_V1 without becoming execution metadata.",
    width:320,
    height:180,
    aspectRatio:"16:9",
    references:[],
    outputRelativePath:"05_images/generated/asset-1/attempt-1.png"
  };
  await assert.rejects(() => executor.execute(job(input, "video-production/legacy-image-runtime")), LegacyGuardError);
  assert.equal(called, false);
});
