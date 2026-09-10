import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import test from "node:test";
import {
  PROJECT_STYLE_UNMATERIALIZED_VERSION,
  ProjectBootstrapError,
  ProjectBootstrapService,
  STANDARD_PROJECT_DIRECTORIES
} from "../src/index.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const resourcesDir = path.join(repositoryRoot, "resources");
const migrationsDir = path.join(repositoryRoot, "migrations");
const clock = { nowIso: () => "2026-09-10T05:00:00.000Z" };

async function makeService() {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-mig04-"));
  const workspaceRoot = path.join(root, "workspace");
  return {
    root,
    workspaceRoot,
    service: new ProjectBootstrapService({
      repositoryRoot,
      resourcesDir,
      migrationsDir,
      workspaceRoot,
      clock
    })
  };
}

test("creates a SHORTFORM unified project with one migrated project.db and pinned resources", async () => {
  const { service } = await makeService();
  const created = await service.createProject({
    projectId: "short_fixture",
    title: "Short Fixture",
    format: "shortform"
  });

  assert.equal(created.record.project.format, "SHORTFORM");
  assert.equal(created.record.pipeline, "VPF_UNIFIED_V1");
  assert.equal(created.record.legacyAllowed, false);
  assert.equal(created.migrations.current, true);
  assert.equal(created.migrations.latestMigrationId, "0014");
  assert.equal(created.record.project.versions.dataModelVersion, "0014");
  assert.equal(
    created.record.project.versions.projectStyleVersion,
    PROJECT_STYLE_UNMATERIALIZED_VERSION
  );
  assert.ok(created.record.project.versions.resourceHashes?.formatProfile?.startsWith("sha256:"));
  assert.ok(created.record.resourcePins.length >= 8);

  const db = new Database(created.projectDbPath, { readonly: true });
  try {
    const projectCount = db.prepare("SELECT COUNT(*) AS count FROM projects").get() as {count: number};
    const styleCount = db.prepare("SELECT COUNT(*) AS count FROM project_styles").get() as {count: number};
    const migrationCount = db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as {count: number};
    assert.equal(projectCount.count, 1);
    assert.equal(styleCount.count, 0);
    assert.equal(migrationCount.count, 14);
  } finally {
    db.close();
  }

  for (const directory of STANDARD_PROJECT_DIRECTORIES) {
    const info = await stat(path.join(created.projectRoot, directory));
    assert.equal(info.isDirectory(), true);
  }
});

test("creates a LONGFORM project using the same Visual Bible but the LONGFORM format profile", async () => {
  const { service } = await makeService();
  const created = await service.createProject({
    projectId: "long_fixture",
    title: "Long Fixture",
    format: "longform"
  });

  assert.equal(created.record.project.format, "LONGFORM");
  const visualBible = created.record.resourcePins.find(
    (pin) => pin.resourceType === "CHANNEL_VISUAL_BIBLE"
  );
  const format = created.record.resourcePins.find(
    (pin) => pin.resourceType === "FORMAT_PROFILE"
  );
  assert.equal(visualBible?.resourceId, "HISTORY_MYSTERY_VISUAL_BIBLE");
  assert.equal(format?.resourceId, "LONGFORM_16X9_V1");
  assert.ok(format?.contentHash.startsWith("sha256:"));
});

test("project.json is an exchange snapshot that matches authoritative DB identity and pins", async () => {
  const { service } = await makeService();
  const created = await service.createProject({
    projectId: "snapshot_fixture",
    title: "Snapshot Fixture",
    format: "shortform"
  });
  const snapshot = JSON.parse(await readFile(created.projectJsonPath, "utf8")) as any;
  const status = await service.getStatus("snapshot_fixture");

  assert.equal(snapshot.projectId, status.project.projectId);
  assert.equal(snapshot.title, status.project.title);
  assert.equal(snapshot.format, status.project.format);
  assert.deepEqual(snapshot.versions, status.project.versions);
  assert.deepEqual(snapshot.resourcePins, status.resourcePins);
  assert.equal(snapshot.pipeline, "VPF_UNIFIED_V1");
  assert.equal(snapshot.legacyAllowed, false);
});

test("duplicate project ids are rejected without replacing the first project", async () => {
  const { service } = await makeService();
  await service.createProject({
    projectId: "duplicate_fixture",
    title: "First",
    format: "shortform"
  });

  await assert.rejects(
    () => service.createProject({
      projectId: "duplicate_fixture",
      title: "Second",
      format: "longform"
    }),
    (error: unknown) =>
      error instanceof ProjectBootstrapError &&
      error.code === "DUPLICATE_PROJECT"
  );

  const status = await service.getStatus("duplicate_fixture");
  assert.equal(status.project.title, "First");
  assert.equal(status.project.format, "SHORTFORM");
});

test("traversal ids and invalid formats are rejected", async () => {
  const { service } = await makeService();
  await assert.rejects(
    () => service.createProject({
      projectId: "../outside",
      title: "Bad",
      format: "shortform"
    })
  );
  await assert.rejects(
    () => service.createProject({
      projectId: "bad_format",
      title: "Bad",
      format: "vertical"
    }),
    (error: unknown) =>
      error instanceof ProjectBootstrapError &&
      error.code === "INVALID_FORMAT"
  );
});

test("doctor verifies DB, migrations, exact resource hashes, directories, snapshot and legacy isolation", async () => {
  const { service } = await makeService();
  await service.createProject({
    projectId: "doctor_fixture",
    title: "Doctor Fixture",
    format: "longform"
  });
  const doctor = await service.doctor("doctor_fixture");

  assert.equal(doctor.healthy, true);
  assert.equal(doctor.diagnostics.every((item) => item.status === "PASS"), true);
  assert.ok(doctor.diagnostics.some((item) => item.code === "RESOURCE_PINS"));
  assert.ok(doctor.diagnostics.some((item) => item.code === "OLD_REPOSITORY_DEPENDENCY"));
});

test("absolute external workspace roots create projects outside the repository default workspace", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-external-workspace-"));
  const externalWorkspace = path.join(root, "large-media-disk");
  const service = new ProjectBootstrapService({
    repositoryRoot,
    resourcesDir,
    migrationsDir,
    workspaceRoot: externalWorkspace,
    clock
  });
  const created = await service.createProject({
    projectId: "external_fixture",
    title: "External Fixture",
    format: "shortform"
  });

  assert.equal(
    created.projectRoot,
    path.join(externalWorkspace, "projects", "external_fixture")
  );
});
