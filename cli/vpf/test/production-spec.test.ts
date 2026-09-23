import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { Agent1ProductionManagerService } from "../src/production-spec-service.js";
import { Wf09bCliService } from "../src/wf09b.js";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

test("direct Production Spec injection cannot bypass Agent2 story/audio gates", async () => {
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

    const storyGate = await manager.validateStory("spec_gate_sample");
    assert.equal(storyGate.status, "FAIL");
    assert.ok(storyGate.errors.some(issue =>
      issue.code === "SCRIPT_GATE_REQUIRED" ||
      issue.code === "TTS_MANIFEST_MISSING" ||
      issue.code === "SUBTITLE_TIMING_MISSING"
    ));

    const ready = await manager.generationReady("spec_gate_sample");
    assert.equal(ready.status, "FAIL");
    assert.equal(ready.ready_for_generation, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
