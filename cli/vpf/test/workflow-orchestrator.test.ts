import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
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
      format: "shortform",
      targetDurationSec: 60
    });

    const workflow = new Agent1WorkflowOrchestratorService(bootstrap);
    const initial = await workflow.status("workflow_sample");
    assert.equal(initial.workflow_id, "VPF_PRODUCTION_V1");
    assert.equal(initial.workflow_version, "1.2");
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
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
