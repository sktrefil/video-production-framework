import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
  FileSystemResourceRegistry,
  ResourceRegistryError,
  type ResourceDocument
} from "../src/index.js";

async function fixtureRoot() {
  return mkdtemp(path.join(tmpdir(), "vpf-resource-registry-"));
}

async function writeResource(
  root: string,
  directory: string,
  document: ResourceDocument
) {
  const target = path.join(root, directory, document.resourceId);
  await mkdir(target, { recursive: true });
  await writeFile(
    path.join(target, `${document.version}.json`),
    `${JSON.stringify(document, null, 2)}\n`,
    "utf8"
  );
}

const formatPayload = {
  format: "LONGFORM",
  width: 1920,
  height: 1080,
  aspectRatio: "16:9",
  fpsPreference: 30,
  safeAreas: { top: 54, right: 96, bottom: 108, left: 96 },
  imageGeneration: { width: 1536, height: 864 },
  editorDefaults: { fit: "cover" },
  subtitleLayoutEnvelope: { maxLines: 2 },
  delivery: { container: "mp4" }
};

test("resolves exact version and rejects a mismatched pinned hash", async () => {
  const root = await fixtureRoot();
  await writeResource(root, "format-profiles", {
    schemaVersion: 1,
    resourceType: "FORMAT_PROFILE",
    resourceId: "LONGFORM_16X9_V1",
    version: "1.0.0",
    payload: formatPayload
  });
  const registry = new FileSystemResourceRegistry(root);
  const snapshot = await registry.resolve({
    resourceType: "FORMAT_PROFILE",
    resourceId: "LONGFORM_16X9_V1",
    version: "1.0.0"
  });
  assert.ok(snapshot);
  assert.match(snapshot.contentHash, /^sha256:[a-f0-9]{64}$/);

  await assert.rejects(
    () => registry.resolve({
      resourceType: "FORMAT_PROFILE",
      resourceId: "LONGFORM_16X9_V1",
      version: "1.0.0",
      expectedHash: "sha256:deadbeef"
    }),
    (error: unknown) =>
      error instanceof ResourceRegistryError &&
      error.code === "RESOURCE_HASH_MISMATCH"
  );
});

test("missing versions return null and pinned projects do not auto-upgrade", async () => {
  const root = await fixtureRoot();
  for (const version of ["1.0.0", "2.0.0"]) {
    await writeResource(root, "format-profiles", {
      schemaVersion: 1,
      resourceType: "FORMAT_PROFILE",
      resourceId: "LONGFORM_16X9_V1",
      version,
      payload: { ...formatPayload, width: version === "1.0.0" ? 1920 : 3840 }
    });
  }
  const registry = new FileSystemResourceRegistry(root);
  const first = await registry.resolve({
    resourceType: "FORMAT_PROFILE",
    resourceId: "LONGFORM_16X9_V1",
    version: "1.0.0"
  });
  assert.ok(first);

  const pinned = await registry.resolvePinned({
    resourceType: "FORMAT_PROFILE",
    resourceId: "LONGFORM_16X9_V1",
    version: "1.0.0",
    contentHash: first.contentHash
  });
  assert.equal(pinned.version, "1.0.0");
  assert.equal((pinned.payload as { width: number }).width, 1920);

  const missing = await registry.resolve({
    resourceType: "FORMAT_PROFILE",
    resourceId: "LONGFORM_16X9_V1",
    version: "3.0.0"
  });
  assert.equal(missing, null);

  const plan = await registry.planUpgrade({
    resourceType: "FORMAT_PROFILE",
    resourceId: "LONGFORM_16X9_V1",
    version: "1.0.0",
    contentHash: first.contentHash
  }, "2.0.0");
  assert.equal(plan.changed, true);
  assert.equal(plan.to.version, "2.0.0");
  assert.ok(plan.staleImpact.includes("SCENE_ASSET"));
});

test("legacy visual/master resources are explicit non-candidates", async () => {
  const registry = new FileSystemResourceRegistry(await fixtureRoot());
  for (const resourceId of [
    "history_mystery_shorts_style",
    "HISTORY_MYSTERY_STYLIZED_V1",
    "old_scene_prompt_style_v2",
    "master_candidate_style"
  ]) {
    await assert.rejects(
      () => registry.resolve({
        resourceType: "CHANNEL_VISUAL_BIBLE",
        resourceId,
        version: "1.0.0"
      }),
      (error: unknown) =>
        error instanceof ResourceRegistryError &&
        error.code === "LEGACY_RESOURCE_FORBIDDEN"
    );
  }
});

test("provider profiles reject channel creative/style fields", async () => {
  const root = await fixtureRoot();
  await writeResource(root, "provider-profiles", {
    schemaVersion: 1,
    resourceType: "PROVIDER_PROFILE",
    resourceId: "BAD_PROVIDER",
    version: "1.0.0",
    payload: {
      provider: "TEST",
      executionMode: "AUTOMATED",
      jobTypes: ["IMAGE_GENERATION"],
      capabilities: { palette: "legacy blue" },
      retryPolicy: { maxAttempts: 2 },
      result: { mediaType: "IMAGE" },
      runtimeSecretNames: ["TEST_API_KEY"]
    }
  });
  const registry = new FileSystemResourceRegistry(root);
  await assert.rejects(
    () => registry.resolve({
      resourceType: "PROVIDER_PROFILE",
      resourceId: "BAD_PROVIDER",
      version: "1.0.0"
    }),
    (error: unknown) =>
      error instanceof ResourceRegistryError &&
      error.code === "RESOURCE_SCHEMA_INVALID"
  );
});
