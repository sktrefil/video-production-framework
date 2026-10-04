import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { Agent3VisualProductionRepository } from "@vpf/storage/agent3-visual-production";
import { WorkflowOrchestratorRepository } from "@vpf/storage/workflow-orchestrator";
import {
  Agent1WorkflowOrchestratorService,
  WorkflowOrchestratorError
} from "../src/workflow-orchestrator-service.js";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

test("Agent1 workflow instantiates T010-T100, enforces assignment and revision state", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-workflow-orchestrator-"));
  try {
    const bootstrap = new ProjectBootstrapService({ repositoryRoot, workspaceRoot: root });
    await bootstrap.createProject({
      projectId: "workflow_sample",
      title: "Workflow Sample",
      topic: "Workflow Sample Research Topic",
      format: "shortform",
      targetDurationSec: 60
    });

    const workflow = new Agent1WorkflowOrchestratorService(bootstrap);
    const initial = await workflow.status("workflow_sample");
    assert.equal(initial.workflow_id, "VPF_PRODUCTION_V1");
    assert.equal(initial.workflow_version, "1.3");
    assert.equal(initial.tasks.length, 11);
    assert.equal(initial.tasks.find(task => task.task_id === "T025")?.assigned_agent, "AGENT3_VISUAL_PRODUCTION");
    assert.deepEqual(initial.ready_tasks, ["T010"]);
    assert.equal(initial.next_task?.assigned_agent, "AGENT2_STORY_AUDIO");

    await assert.rejects(
      workflow.dispatch("workflow_sample", "T010", "AGENT3_VISUAL_PRODUCTION"),
      (error: unknown) => error instanceof WorkflowOrchestratorError && error.code === "TASK_AGENT_MISMATCH"
    );

    const dispatch = await workflow.dispatch("workflow_sample", "T010", "AGENT2_STORY_AUDIO");
    assert.equal(dispatch.task_id, "T010");
    assert.equal(dispatch.attempt, 1);
    assert.match(dispatch.dispatch_id, /^workflow_sample:T010:A1:RUN:[0-9a-f-]{36}$/);
    assert.deepEqual(
      dispatch.input_revision_refs.map(ref => ref.artifact_type).sort(),
      ["project_spec", "project_topic"]
    );
    assert.equal((await workflow.status("workflow_sample")).tasks.find(task => task.task_id === "T010")?.status, "RUNNING");

    const failed = await workflow.recordGate("workflow_sample", "T010", false, [
      { code: "RESEARCH_REVIEW", message: "Research requires revision." }
    ]);
    assert.equal(failed.gate, "RESEARCH_GATE");
    assert.equal(failed.status, "FAIL");

    const revision = await workflow.status("workflow_sample");
    assert.equal(revision.tasks.find(task => task.task_id === "T010")?.status, "REVISION_REQUIRED");
    assert.equal(revision.tasks.find(task => task.task_id === "T020")?.status, "BLOCKED");

    const retry = await workflow.dispatch("workflow_sample", "T010");
    assert.equal(retry.attempt, 2);
    assert.match(retry.dispatch_id, /^workflow_sample:T010:A2:RUN:[0-9a-f-]{36}$/);
    assert.notEqual(retry.dispatch_id, dispatch.dispatch_id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("T025 gate controls T030 unlock and keeps pre-TTS artifact revisions", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-workflow-v13-"));
  try {
    const bootstrap = new ProjectBootstrapService({ repositoryRoot, workspaceRoot: root });
    const projectId = "workflow_v13_gate";
    const created = await bootstrap.createProject({ projectId, title: "Gate", topic: "History", format: "shortform", targetDurationSec: 60 });
    const manager = new Agent1WorkflowOrchestratorService(bootstrap);
    for (const [current, next] of [
      ["T010", "T020"],
      ["T020", "T025"]
    ] as const) {
      const repo = new WorkflowOrchestratorRepository(created.projectDbPath);
      try { repo.updateTask({ projectId, taskId: current, status: "COMPLETE", lastGateStatus: "PASS", updatedAt: new Date().toISOString() }); }
      finally { repo.close(); }
      assert.equal((await manager.status(projectId)).tasks.find(task => task.task_id === next)?.status, "READY");
    }
    await manager.dispatch(projectId, "T025", "AGENT3_VISUAL_PRODUCTION");
    const failed = await manager.recordGate(projectId, "T025", false, [{ code: "VISUAL_REVIEW", message: "Revise direction." }]);
    assert.equal(failed.gate, "PRE_TTS_VISUAL_GATE");
    assert.equal((await manager.status(projectId)).tasks.find(task => task.task_id === "T030")?.status, "BLOCKED");
    await manager.dispatch(projectId, "T025", "AGENT3_VISUAL_PRODUCTION");
    const artifacts = new Agent3VisualProductionRepository(created.projectDbPath);
    try {
      for (const type of ["pre_tts_visual_plan", "pre_tts_visual_beat_spec", "pre_tts_visual_direction_spec"] as const) {
        artifacts.save(projectId, type, { schema_version: "1.0", project_id: projectId }, "T025", new Date().toISOString());
        assert.equal(artifacts.getActive(projectId, type)?.revision, 1);
      }
    } finally { artifacts.close(); }
    await manager.recordGate(projectId, "T025", true);
    await manager.complete(projectId, "T025");
    assert.equal((await manager.status(projectId)).tasks.find(task => task.task_id === "T030")?.status, "READY");
  } finally { await rm(root, { recursive: true, force: true }); }
});
