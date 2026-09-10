import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { FileSystemResourceRegistry } from "@vpf/resource-registry";
import {
  DEFAULT_CHANNEL_PROFILE_VERSION,
  ProjectBootstrapService
} from "../src/index.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const resourcesDir = path.join(repositoryRoot, "resources");
const migrationsDir = path.join(repositoryRoot, "migrations");

function sha256(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

test("MIG-04 preserves accepted HISTORY_MYSTERY_V1@1.0.0 bytes and upgrades selection explicitly", async () => {
  const v100Path = path.join(
    resourcesDir,
    "channel-profiles",
    "HISTORY_MYSTERY_V1",
    "1.0.0.json"
  );
  const raw = await readFile(v100Path, "utf8");
  assert.equal(
    sha256(raw),
    "3bc8ac5ccba7fbe75e391125b3778aa67e52e03af1f12558bf20d9e519e235da"
  );

  const registry = new FileSystemResourceRegistry(resourcesDir);
  const oldProfile = await registry.resolve({
    resourceType: "CHANNEL_PROFILE",
    resourceId: "HISTORY_MYSTERY_V1",
    version: "1.0.0"
  });
  const newProfile = await registry.resolve({
    resourceType: "CHANNEL_PROFILE",
    resourceId: "HISTORY_MYSTERY_V1",
    version: "1.1.0"
  });

  assert.ok(oldProfile);
  assert.ok(newProfile);
  assert.equal(
    "ruleRegistry" in (oldProfile.payload as Record<string, unknown>),
    false
  );
  assert.equal(
    "ruleRegistry" in (newProfile.payload as Record<string, unknown>),
    true
  );
  assert.equal(DEFAULT_CHANNEL_PROFILE_VERSION, "1.1.0");
});

test("new projects pin the new channel profile version instead of mutating v1.0.0", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-mig04-versioning-"));
  const service = new ProjectBootstrapService({
    repositoryRoot,
    resourcesDir,
    migrationsDir,
    workspaceRoot: path.join(root, "workspace"),
    clock: { nowIso: () => "2026-09-10T06:00:00.000Z" }
  });

  const created = await service.createProject({
    projectId: "resource_version_fixture",
    title: "Resource Version Fixture",
    format: "longform"
  });
  const channelPin = created.record.resourcePins.find(
    (pin) => pin.resourceType === "CHANNEL_PROFILE"
  );

  assert.equal(channelPin?.resourceId, "HISTORY_MYSTERY_V1");
  assert.equal(channelPin?.version, "1.1.0");
  assert.ok(channelPin?.contentHash.startsWith("sha256:"));
});
