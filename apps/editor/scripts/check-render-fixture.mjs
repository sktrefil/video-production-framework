import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir, mkdtemp, readFile, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {SqliteEditorMaterializationRepository} from "@vpf/storage/editor-materialization";
import {SqliteFinalOutputRepository} from "@vpf/storage/final-output";
import {renderEditorProject} from "./render-editor-project.mjs";
import {recordFinalOutputQcCommand} from "./final-output-qc.mjs";
import {packagePublishHandoffCommand} from "./package-publish-handoff.mjs";

const APP_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const projectId = `mig09-fixture-${process.pid}`;
const root = await mkdtemp(join(tmpdir(), "vpf-mig09-render-"));
const projectRoot = join(root, projectId);
const editorMirror = join(APP_ROOT, "public", "projects", projectId);
const now = new Date().toISOString();
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#111"/><circle cx="32" cy="32" r="18" fill="#ddd"/></svg>';
const mediaPath = join(projectRoot, "05_images", "frame.svg");
const mediaSha = createHash("sha256").update(svg).digest("hex");

try {
  await mkdir(join(projectRoot, "05_images"), {recursive: true});
  await mkdir(join(projectRoot, "08_editor"), {recursive: true});
  await mkdir(join(projectRoot, "09_render"), {recursive: true});
  await mkdir(join(projectRoot, "10_publish"), {recursive: true});
  await writeFile(mediaPath, svg, "utf8");

  const editProject = {
    schemaVersion: 1,
    project: {id: projectId, name: "MIG-09 actual render fixture", fps: 30, width: 64, height: 64, durationInFrames: 12},
    tracks: [{id: "V1", type: "VIDEO", name: "Main Visual", enabled: true, locked: false, order: 0}],
    items: [{
      id: "img1", type: "IMAGE", trackId: "V1", timelineStartFrame: 0, durationInFrames: 12,
      enabled: true, locked: false, src: "05_images/frame.svg", x: 0, y: 0, scale: 1,
      rotation: 0, opacity: 1, fit: "cover"
    }],
    settings: {snapEnabled: true, snapToleranceFrames: 4, timelineZoom: 1, masterVolume: 1}
  };

  const dbPath = join(projectRoot, "project.db");
  const setup = new SqliteEditorMaterializationRepository(dbPath);
  try {
    setup.db.prepare(`INSERT INTO media_artifacts
      (id, project_id, revision, lifecycle_status, media_type, relative_path, mime_type,
       width, height, duration_ms, checksum, source_job_id, media_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run("media1", projectId, 1, "ACTIVE", "IMAGE", "05_images/frame.svg", "image/svg+xml",
        64, 64, null, mediaSha, null, "AVAILABLE", now, now);
    setup.db.prepare(`INSERT INTO editor_timeline_assemblies
      (id, project_id, revision, lifecycle_status, source_binding_refs_json, fps, width, height,
       assembly_status, stale, stale_reason, edit_project_json, cut_boundaries_json,
       motion_directives_json, blockers_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run("assembly1", projectId, 1, "ACTIVE", "[]", 30, 64, 64, "READY", 0, null,
        JSON.stringify(editProject), "[]", "[]", "[]", now, now);
  } finally {
    setup.close();
  }

  const render = await renderEditorProject({projectId, projectRoot});
  if (render.status !== "DELIVERY_READY") {
    console.error(`[editor-render] QC DEBUG: ${JSON.stringify(render.technicalQc ?? null)}`);
  }
  assert.equal(render.status, "DELIVERY_READY");
  assert.equal(render.technicalQc?.status, "PASS");
  assert.equal(render.delivery?.status, "READY");
  assert.equal(render.physicalOutputPath, "09_render/final.mp4");
  const videoInfo = await stat(join(projectRoot, "09_render", "final.mp4"));
  assert.ok(videoInfo.size > 0);
  const gate = JSON.parse(await readFile(join(projectRoot, "09_render", "production_gate.json"), "utf8"));
  assert.equal(gate.status, "PASS");

  const verifyRepo = new SqliteFinalOutputRepository(dbPath);
  try {
    const delivery = await verifyRepo.getLatestDeliveryManifest(projectId);
    assert.equal(delivery?.status, "READY");
    assert.equal(delivery?.outputPath, `out/${projectId}/final.mp4`);
  } finally {
    verifyRepo.close();
  }

  const finalQc = await recordFinalOutputQcCommand({
    projectId,
    projectRoot,
    status: "PASS",
    confidence: 1,
    notes: ["MIG-09 deterministic fixture QC"]
  });
  assert.equal(finalQc.record.status, "PASS");
  assert.equal(finalQc.projectRelativePath, "10_publish/final_output_qc.json");

  const metadataPath = join(projectRoot, "10_publish", "publish_metadata.json");
  await writeFile(metadataPath, JSON.stringify({
    platform: "YOUTUBE",
    title: "MIG-09 fixture",
    description: "runtime smoke",
    tags: ["fixture"],
    visibility: "PRIVATE",
    madeForKids: false
  }, null, 2) + "\n", "utf8");

  const packaged = await packagePublishHandoffCommand({projectId, projectRoot, metadataPath});
  assert.equal(packaged.outcome.manifest.packageStatus, "READY");
  assert.equal(packaged.materialized.status, "READY");
  assert.equal(packaged.materialized.packageDirectory, "10_publish/package");
  assert.equal(
    JSON.parse(await readFile(join(projectRoot, "10_publish", "package", "publish_handoff.json"), "utf8")).status,
    "READY"
  );

  console.log(`[editor-render] PASS: actual GenericFinalRender MP4 + Technical QC + WF-18 package · project=${projectId} · bytes=${videoInfo.size}`);
} catch (error) {
  console.error(`[editor-render] FAIL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await rm(editorMirror, {recursive: true, force: true}).catch(() => undefined);
  await rm(root, {recursive: true, force: true}).catch(() => undefined);
}
