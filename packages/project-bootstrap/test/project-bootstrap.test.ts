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

test("MIG-11 doctor rejects disabled or missing project flags without upgrading the DB",async()=>{
  const {service}=await makeService();
  const created=await service.createProject({projectId:"legacy_policy",title:"policy",format:"longform"});
  const db=new Database(created.projectDbPath);
  try {
    // Simulate an imported older schema; the canonical table itself has CHECK constraints.
    db.exec("ALTER TABLE projects RENAME TO canonical_projects; CREATE TABLE projects AS SELECT * FROM canonical_projects");
    db.prepare("UPDATE projects SET legacy_allowed=1").run();
    await assert.rejects(service.getStatus("legacy_policy"),{code:"LEGACY_RUNTIME_FORBIDDEN"});
    const doctor=await service.doctor("legacy_policy");
    assert.equal(doctor.healthy,false);
    assert.ok(doctor.diagnostics.some(d=>d.code==="LEGACY_DISABLED" && d.status==="FAIL"));
    assert.equal((db.prepare("SELECT legacy_allowed FROM projects").get() as {legacy_allowed:number}).legacy_allowed,1);
    db.prepare("UPDATE projects SET legacy_allowed=0,pipeline='UNKNOWN'").run();
    await assert.rejects(service.getStatus("legacy_policy"),{code:"LEGACY_RUNTIME_FORBIDDEN"});
    db.exec("ALTER TABLE projects DROP COLUMN pipeline");
    await assert.rejects(service.getStatus("legacy_policy"),{code:"LEGACY_RUNTIME_FORBIDDEN"});
  } finally {db.close();}
});

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
  assert.equal(created.migrations.latestMigrationId, "0023");
  assert.equal(created.record.project.versions.dataModelVersion, "0023");
  assert.equal(
    created.record.project.versions.projectStyleVersion,
    PROJECT_STYLE_UNMATERIALIZED_VERSION
  );
  assert.ok(created.record.project.versions.resourceHashes?.formatProfile?.startsWith("sha256:"));
  assert.ok(created.record.resourcePins.length >= 12);
  assert.ok(created.record.resourcePins.some(pin =>
    pin.resourceType === "PROVIDER_PROFILE" &&
    pin.resourceId === "OPENAI_AGENT2_STORY_V1" &&
    pin.version === "1.0.0"
  ));
  assert.ok(created.record.resourcePins.some(pin =>
    pin.resourceType === "PROVIDER_PROFILE" &&
    pin.resourceId === "OPENAI_AGENT3_VISUAL_V1" &&
    pin.version === "1.0.0"
  ));
  assert.ok(created.record.resourcePins.some(pin =>
    pin.resourceType === "PROVIDER_PROFILE" &&
    pin.resourceId === "CODEX_MANAGER_V1" &&
    pin.version === "1.0.0"
  ));
  assert.ok(created.record.resourcePins.some(pin =>
    pin.resourceType === "PROVIDER_PROFILE" &&
    pin.resourceId === "CODEX_STORY_AUDIO_V1" &&
    pin.version === "1.0.0"
  ));
  assert.ok(created.record.resourcePins.some(pin =>
    pin.resourceType === "PROVIDER_PROFILE" &&
    pin.resourceId === "CODEX_VISUAL_PRODUCTION_V1" &&
    pin.version === "1.0.0"
  ));

  const db = new Database(created.projectDbPath, { readonly: true });
  try {
    const projectCount = db.prepare("SELECT COUNT(*) AS count FROM projects").get() as {count: number};
    const styleCount = db.prepare("SELECT COUNT(*) AS count FROM project_styles").get() as {count: number};
    const migrationCount = db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as {count: number};
    assert.equal(projectCount.count, 1);
    assert.equal(styleCount.count, 0);
    const productionSpecCount = db.prepare("SELECT COUNT(*) AS count FROM production_project_specs").get() as {count: number};
    assert.equal(migrationCount.count, 23);
    assert.equal(productionSpecCount.count, 1);
    const workflowCount = db.prepare("SELECT COUNT(*) AS count FROM production_workflow_instances").get() as {count: number};
    const taskCount = db.prepare("SELECT COUNT(*) AS count FROM production_task_instances").get() as {count: number};
    const readyTask = db.prepare("SELECT task_id, status FROM production_task_instances WHERE project_id = ? AND status = 'READY' ORDER BY task_order").get("short_fixture") as {task_id: string; status: string};
    assert.equal(workflowCount.count, 1);
    assert.equal(taskCount.count, 10);
    assert.deepEqual(readyTask, { task_id: "T010", status: "READY" });
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


test("upgrade-runtime preserves workflow state while applying migrations and Codex resource pins", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-runtime-upgrade-"));
  const workspaceRoot = path.join(root, "workspace");
  const oldService = new ProjectBootstrapService({
    repositoryRoot,
    resourcesDir,
    migrationsDir,
    workspaceRoot,
    clock,
    channelProfileVersion: "1.5.0"
  });
  const created = await oldService.createProject({
    projectId: "runtime_upgrade_fixture",
    title: "Runtime Upgrade Fixture",
    format: "longform"
  });

  const db = new Database(created.projectDbPath);
  try {
    db.prepare(
      "DELETE FROM schema_migrations WHERE migration_id IN ('0019','0020','0021','0022','0023')"
    ).run();
    db.prepare(
      "DELETE FROM production_task_instances WHERE project_id=?"
    ).run("runtime_upgrade_fixture");
    db.prepare(
      "DELETE FROM production_workflow_instances WHERE project_id=?"
    ).run("runtime_upgrade_fixture");
    db.prepare(
      "DELETE FROM production_project_specs WHERE project_id=?"
    ).run("runtime_upgrade_fixture");
  } finally {
    db.close();
  }

  const service = new ProjectBootstrapService({
    repositoryRoot,
    resourcesDir,
    migrationsDir,
    workspaceRoot,
    clock
  });
  const before = await service.getStatus("runtime_upgrade_fixture");
  assert.equal(before.migrations.current, false);
  assert.equal(
    before.resourcePins.find(pin => pin.resourceType === "CHANNEL_PROFILE")?.version,
    "1.5.0"
  );

  const upgraded = await service.upgradeRuntime("runtime_upgrade_fixture");
  assert.equal(upgraded.migrationBefore.current, false);
  assert.equal(upgraded.migrationAfter.current, true);
  assert.equal(upgraded.migrationAfter.latestMigrationId, "0023");
  assert.equal(upgraded.previousChannelProfileVersion, "1.5.0");
  assert.equal(upgraded.currentChannelProfileVersion, "1.8.0");
  assert.equal(upgraded.preservedProjectRevision, 1);
  assert.equal(upgraded.preservedWorkflowState, true);
  assert.equal(upgraded.projectSpecBackfilled, true);
  assert.equal(upgraded.workflowBackfilled, true);
  assert.ok(upgraded.addedProviderProfiles.includes("CODEX_MANAGER_V1"));
  assert.ok(upgraded.addedProviderProfiles.includes("CODEX_STORY_AUDIO_V1"));
  assert.ok(upgraded.addedProviderProfiles.includes("CODEX_VISUAL_PRODUCTION_V1"));

  const after = await service.getStatus("runtime_upgrade_fixture");
  assert.equal(after.migrations.current, true);
  assert.equal(after.project.revision, 1);
  assert.equal(after.project.versions.dataModelVersion, "0023");
  assert.equal(
    after.resourcePins.find(pin => pin.resourceType === "CHANNEL_PROFILE")?.version,
    "1.8.0"
  );
  assert.ok(after.resourcePins.some(pin =>
    pin.resourceType === "PROVIDER_PROFILE" &&
    pin.resourceId === "CODEX_MANAGER_V1"
  ));
  assert.ok(after.resourcePins.some(pin =>
    pin.resourceType === "PROVIDER_PROFILE" &&
    pin.resourceId === "CODEX_STORY_AUDIO_V1"
  ));
  assert.ok(after.resourcePins.some(pin =>
    pin.resourceType === "PROVIDER_PROFILE" &&
    pin.resourceId === "CODEX_VISUAL_PRODUCTION_V1"
  ));

  const verifyDb = new Database(created.projectDbPath, { readonly: true });
  try {
    const workflowCount = verifyDb.prepare(
      "SELECT COUNT(*) AS count FROM production_workflow_instances WHERE project_id=?"
    ).get("runtime_upgrade_fixture") as { count: number };
    const taskCount = verifyDb.prepare(
      "SELECT COUNT(*) AS count FROM production_task_instances WHERE project_id=?"
    ).get("runtime_upgrade_fixture") as { count: number };
    const ready = verifyDb.prepare(
      "SELECT task_id, status, attempt FROM production_task_instances WHERE project_id=? AND status='READY'"
    ).get("runtime_upgrade_fixture") as { task_id: string; status: string; attempt: number };
    assert.equal(workflowCount.count, 1);
    assert.equal(taskCount.count, 10);
    assert.deepEqual(ready, { task_id: "T010", status: "READY", attempt: 0 });
  } finally {
    verifyDb.close();
  }

  const snapshot = JSON.parse(
    await readFile(created.projectJsonPath, "utf8")
  ) as { revision: number; resourcePins: Array<{resourceId: string; version: string}> };
  assert.equal(snapshot.revision, 1);
  assert.ok(snapshot.resourcePins.some(pin =>
    pin.resourceId === "HISTORY_MYSTERY_V1" &&
    pin.version === "1.8.0"
  ));

  const doctor = await service.doctor("runtime_upgrade_fixture");
  assert.equal(doctor.healthy, true);
});


test("setProjectTopic stores an explicit research topic as a new active Project Spec revision", async () => {
  const { service } = await makeService();
  const created = await service.createProject({
    projectId: "topic_fixture",
    title: "Pilot Display Name",
    format: "longform"
  });

  const updated = await service.setProjectTopic(
    "topic_fixture",
    "로마 제9군단의 마지막 기록과 이후 행방"
  );
  assert.equal(updated.projectSpecRevision, 2);
  assert.equal(updated.topic, "로마 제9군단의 마지막 기록과 이후 행방");

  const db = new Database(created.projectDbPath, { readonly: true });
  try {
    const rows = db.prepare(
      "SELECT revision, lifecycle_status, spec_json FROM production_project_specs WHERE project_id=? ORDER BY revision"
    ).all("topic_fixture") as Array<{
      revision: number;
      lifecycle_status: string;
      spec_json: string;
    }>;
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.lifecycle_status, "SUPERSEDED");
    assert.equal(rows[1]?.lifecycle_status, "ACTIVE");
    const active = JSON.parse(rows[1]!.spec_json) as { topic?: string };
    assert.equal(active.topic, "로마 제9군단의 마지막 기록과 이후 행방");
  } finally {
    db.close();
  }
});
