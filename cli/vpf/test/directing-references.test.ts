import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveDirectingReferences } from "../src/directing-references.js";
import { videoGenerationCapabilitiesForT060 } from "@vpf/production-spec";

test("LONGFORM T060 exposes mixed Gemini and Google Flow duration capabilities", () => {
  const capabilities = videoGenerationCapabilitiesForT060();
  const gemini = capabilities.find(item =>
    item.provider === "GEMINI" && item.model === "GEMINI_I2V_10S"
  );
  const flowFast = capabilities.find(item =>
    item.provider === "GOOGLE_FLOW" && item.model === "VEO_3_1_FAST"
  );
  const flowOmni = capabilities.find(item =>
    item.provider === "GOOGLE_FLOW" && item.model === "GEMINI_OMNI_FLASH"
  );
  assert.deepEqual(gemini?.supported_durations_sec, [10]);
  assert.deepEqual(flowFast?.supported_durations_sec, [4, 6, 8]);
  assert.deepEqual(flowOmni?.supported_durations_sec, [4, 6, 8, 10]);
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


test("only new LONGFORM schemas require an explicit incoming state transition", async () => {
  const { clipCameraSchema } = await import("../src/agent3-runtime-schemas.js");
  const longform = clipCameraSchema("LONGFORM") as any;
  const card = longform.properties.clip_production_spec.properties.clips.items.properties.directing;
  assert.ok(card.required.includes("transition_in"));
  assert.deepEqual(card.properties.transition_in.enum, ["CONTINUATION", "STORY_CUT", "ANGLE_CHANGE", "FRESH_START"]);
  const shorts = clipCameraSchema("SHORTS") as any;
  assert.equal(shorts.properties.clip_production_spec.properties.clips.items.required.includes("directing"), false);
});
