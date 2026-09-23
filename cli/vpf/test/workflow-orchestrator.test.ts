import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import {
  Agent1WorkflowOrchestratorService,
  WorkflowOrchestratorError
} from "../src/workflow-orchestrator-service.js";
import { Agent1ProductionManagerService } from "../src/production-spec-service.js";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

test("Agent1 workflow instantiates T010-T100 and unlocks tasks only after gate PASS", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-workflow-orchestrator-"));
  try {
    const bootstrap = new ProjectBootstrapService({ repositoryRoot, workspaceRoot: root });
    await bootstrap.createProject({
      projectId: "workflow_sample",
      title: "Workflow Sample",
      format: "shortform",
      targetDurationSec: 60
    });

    const workflow = new Agent1WorkflowOrchestratorService(bootstrap);
    const initial = await workflow.status("workflow_sample");
    assert.equal(initial.workflow_id, "VPF_PRODUCTION_V1");
    assert.equal(initial.workflow_version, "1.0");
    assert.equal(initial.tasks.length, 10);
    assert.deepEqual(initial.ready_tasks, ["T010"]);
    assert.equal(initial.next_task?.assigned_agent, "AGENT2_STORY_AUDIO");

    await assert.rejects(
      workflow.dispatch("workflow_sample", "T010", "AGENT3_VISUAL_PRODUCTION"),
      (error: unknown) => error instanceof WorkflowOrchestratorError && error.code === "TASK_AGENT_MISMATCH"
    );

    const dispatch = await workflow.dispatch("workflow_sample", "T010", "AGENT2_STORY_AUDIO");
    assert.equal(dispatch.task_id, "T010");
    assert.equal(dispatch.attempt, 1);
    assert.equal((await workflow.status("workflow_sample")).tasks.find(task => task.task_id === "T010")?.status, "RUNNING");

    const gate = await workflow.recordGate("workflow_sample", "T010", true);
    assert.equal(gate.gate, "RESEARCH_GATE");
    assert.equal(gate.status, "PASS");

    const completed = await workflow.complete("workflow_sample", "T010");
    assert.equal(completed.status, "COMPLETE");

    const after = await workflow.status("workflow_sample");
    assert.equal(after.next_task?.task_id, "T020");
    assert.equal(after.next_task?.status, "READY");

    await workflow.dispatch("workflow_sample", "T020");
    const failed = await workflow.recordGate("workflow_sample", "T020", false, [
      { code: "SCRIPT_REVIEW", message: "Script requires revision." }
    ]);
    assert.equal(failed.status, "FAIL");

    const revision = await workflow.status("workflow_sample");
    assert.equal(revision.tasks.find(task => task.task_id === "T020")?.status, "REVISION_REQUIRED");
    assert.equal(revision.tasks.find(task => task.task_id === "T030")?.status, "BLOCKED");

    const retry = await workflow.dispatch("workflow_sample", "T020");
    assert.equal(retry.attempt, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("Agent1 marks a running downstream task stale when its Scene Timing input revision changes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-workflow-stale-"));
  try {
    const bootstrap = new ProjectBootstrapService({ repositoryRoot, workspaceRoot: root });
    await bootstrap.createProject({
      projectId: "workflow_stale",
      title: "Workflow Stale",
      format: "shortform",
      targetDurationSec: 5
    });
    const workflow = new Agent1WorkflowOrchestratorService(bootstrap);
    const production = new Agent1ProductionManagerService(bootstrap);

    await workflow.status("workflow_stale");
    for (const taskId of ["T010", "T020"]) {
      await workflow.dispatch("workflow_stale", taskId);
      await workflow.recordGate("workflow_stale", taskId, true);
      await workflow.complete("workflow_stale", taskId);
    }

    await workflow.dispatch("workflow_stale", "T030");
    const sceneFile = path.join(root, "scene-v1.json");
    const makeScene = (purpose: string) => ({
      schema_version: "1.0",
      project_id: "workflow_stale",
      scenes: [{
        scene_id: "SCENE_01",
        script_ko: "테스트 내레이션입니다.",
        script_en: "",
        story_role: "HOOK",
        narrative_purpose_ko: purpose,
        narrative_purpose_en: "",
        estimated_duration_sec: 5,
        tts: { start_sec: 0, end_sec: 5, duration_sec: 5 },
        beats: [{ beat_id: "BEAT_01", purpose_ko: purpose, purpose_en: "", start_sec: 0, end_sec: 5 }]
      }]
    });
    await writeFile(sceneFile, JSON.stringify(makeScene("첫 장면")), "utf8");
    assert.equal((await production.applyStory("workflow_stale", sceneFile)).stored, true);
    assert.equal((await workflow.complete("workflow_stale", "T030")).status, "COMPLETE");

    assert.equal((await workflow.next("workflow_stale"))?.task_id, "T040");
    await workflow.dispatch("workflow_stale", "T040");

    const revisedFile = path.join(root, "scene-v2.json");
    await writeFile(revisedFile, JSON.stringify(makeScene("수정된 첫 장면")), "utf8");
    assert.equal((await production.applyStory("workflow_stale", revisedFile)).stored, true);

    const refreshed = await workflow.status("workflow_stale");
    assert.equal(refreshed.tasks.find(task => task.task_id === "T040")?.status, "REVISION_REQUIRED");
    assert.equal(refreshed.tasks.find(task => task.task_id === "T050")?.status, "BLOCKED");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
