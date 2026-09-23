import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { ProductionSpecRepository } from "@vpf/storage/production-spec";
import { Agent1ProductionManagerService } from "../src/production-spec-service.js";
import { Wf09bCliService } from "../src/wf09b.js";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

test("Agent1 gates a new project from specs to computed generation readiness", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-production-spec-"));
  try {
    const bootstrap = new ProjectBootstrapService({ repositoryRoot, workspaceRoot: root });
    const created = await bootstrap.createProject({
      projectId: "spec_gate_sample",
      title: "Production Spec Gate Sample",
      format: "shortform",
      targetDurationSec: 5
    });
    assert.equal(created.projectSpec.format, "SHORTS");
    assert.deepEqual(created.projectSpec.resolution, { width: 1080, height: 1920 });

    await assert.rejects(
      new Wf09bCliService(bootstrap).preflight("spec_gate_sample"),
      { code: "WF09B_GENERATION_GATE" },
      "new projects cannot enter image runtime before Agent1 generation readiness"
    );

    const manager = new Agent1ProductionManagerService(bootstrap);
    assert.equal((await manager.validateProject("spec_gate_sample")).status, "PASS");

    const sceneFile = path.join(root, "scene.json");
    await writeFile(sceneFile, JSON.stringify({
      schema_version: "1.0",
      project_id: "spec_gate_sample",
      scenes: [{
        scene_id: "SCENE_01",
        script_ko: "테스트 내레이션입니다.",
        script_en: "",
        story_role: "HOOK",
        narrative_purpose_ko: "핵심 질문을 제기한다.",
        narrative_purpose_en: "",
        estimated_duration_sec: 5,
        tts: { start_sec: 0, end_sec: 5, duration_sec: 5 },
        beats: [{ beat_id: "BEAT_01", purpose_ko: "질문 제기", purpose_en: "", start_sec: 0, end_sec: 5 }]
      }]
    }), "utf8");
    assert.equal((await manager.applyStory("spec_gate_sample", sceneFile)).stored, true);
    assert.equal((await manager.validateStory("spec_gate_sample")).status, "PASS");

    const clipFile = path.join(root, "clips.json");
    await writeFile(clipFile, JSON.stringify({
      schema_version: "1.0",
      project_id: "spec_gate_sample",
      clips: [{
        scene_id: "SCENE_01",
        clip_id: "CLIP_01A",
        editorial_duration_sec: 5,
        generation_duration_sec: 10,
        mandatory_core_points: [
          { id: "CP01", description_ko: "대상을 보여준다.", description_en: "", window_start_sec: 0.4, window_end_sec: 1.8 },
          { id: "CP02", description_ko: "행동을 보여준다.", description_en: "", window_start_sec: 1.8, window_end_sec: 3.6 }
        ],
        narrative_deadline_sec: 4,
        target_state_deadline_sec: 4.3,
        start_handle_sec: 0.4,
        end_hold_sec: 0.7,
        safe_trim_start_sec: 5,
        camera: {
          purpose: "DISCOVER",
          movement: "LATERAL_TRACK_WITH_SUBTLE_PUSH",
          shot_size_start: "WIDE",
          shot_size_end: "MEDIUM_WIDE",
          movement_curve: "HOLD_MOVE_SETTLE"
        },
        state_images: { entry: "IMG_01_01", mid: null, target: "IMG_01_02" },
        transition_in: "HARD_CUT",
        transition_out: "MATCH_CUT",
        ready_for_generation: true
      }]
    }), "utf8");
    const applied = await manager.applyClips("spec_gate_sample", clipFile);
    assert.equal(applied.stored, true);
    assert.equal(applied.validation.ready_for_generation, false, "Agent3 input cannot grant readiness");
    assert.equal((await manager.validateClips("spec_gate_sample")).status, "PASS");
    const ready = await manager.generationReady("spec_gate_sample");
    assert.equal(ready.status, "PASS");
    assert.equal(ready.ready_for_generation, true);

    const repo = new ProductionSpecRepository(created.projectDbPath, { readonly: true });
    try {
      assert.equal(repo.getLatestGate("spec_gate_sample", "GENERATION_READY_GATE")?.evaluated_by, "AGENT1_MANAGER");
      assert.equal(repo.getClipProduction("spec_gate_sample")?.clips[0]?.ready_for_generation, true, "author input is retained but never trusted");
    } finally { repo.close(); }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
