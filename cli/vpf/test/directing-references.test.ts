import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveDirectingReferences } from "../src/directing-references.js";
import { selectedVideoGenerationDuration } from "../src/agent3-runtime-adapter-service.js";

test("new LONGFORM requires an explicit tool duration while SHORTS remains compatible", () => {
  assert.equal(selectedVideoGenerationDuration("SHORTS", {}), null);
  assert.equal(selectedVideoGenerationDuration("LONGFORM", {VPF_VIDEO_GENERATION_DURATION_SEC:"10"}), 10);
  assert.throws(() => selectedVideoGenerationDuration("LONGFORM", {}), /actual selected video tool duration/);
  assert.throws(() => selectedVideoGenerationDuration("LONGFORM", {VPF_VIDEO_GENERATION_DURATION_SEC:"NaN"}));
});

test("directing references require canonical approval, pin revision/hash and reject changed bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "vpf-directing-reference-"));
  const dbPath = join(root, "project.db");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`CREATE TABLE media_artifacts (id TEXT,project_id TEXT,revision INTEGER,relative_path TEXT,checksum TEXT,mime_type TEXT,lifecycle_status TEXT,media_status TEXT);
      CREATE TABLE production_assets (project_id TEXT,approved_media_id TEXT,lifecycle_status TEXT,asset_class TEXT,asset_status TEXT,stale INTEGER);`);
    const bytes = Buffer.from("reference-fixture");
    await writeFile(join(root, "reference.png"), bytes);
    const hash = createHash("sha256").update(bytes).digest("hex");
    db.prepare("INSERT INTO media_artifacts VALUES ('REF','p',3,'reference.png',?,'image/png','ACTIVE','AVAILABLE')").run(hash);
    db.exec("INSERT INTO production_assets VALUES ('p','REF','ACTIVE','REFERENCE','DRAFT',0)");
    const input = { dbPath, projectRoot: root, projectId: "p", ids: ["REF"] };
    await assert.rejects(resolveDirectingReferences(input), /approved canonical/);
    db.exec("UPDATE production_assets SET asset_status='APPROVED'");
    const pinned = await resolveDirectingReferences(input);
    assert.equal(pinned[0]!.revision, 3);
    assert.equal(pinned[0]!.sha256, hash);
    await writeFile(join(root, "reference.png"), "changed");
    await assert.rejects(resolveDirectingReferences(input), /bytes changed/);
    db.exec("UPDATE production_assets SET stale=1");
    await assert.rejects(resolveDirectingReferences(input), /approved canonical/);
  } finally {
    db.close();
    await rm(root, {recursive:true,force:true});
  }
});
