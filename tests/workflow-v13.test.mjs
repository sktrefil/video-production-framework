import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { STANDARD_PRODUCTION_WORKFLOW, VIDEO_GENERATION_CAPABILITIES } from "@vpf/production-spec";
import { Agent3VisualProductionRepository } from "@vpf/storage/agent3-visual-production";
import { Agent3RuntimeRepository } from "@vpf/storage/agent3-runtime";
import { Agent2StoryAudioRepository } from "@vpf/storage/agent2-story-audio";
import { WorkflowOrchestratorRepository } from "@vpf/storage/workflow-orchestrator";
import { Agent1WorkflowOrchestratorService } from "../cli/vpf/dist/workflow-orchestrator-service.js";
import { Agent3VisualProductionWorkerService } from "../cli/vpf/dist/agent3-visual-production-service.js";
import { Agent3RuntimeAdapterService } from "../cli/vpf/dist/agent3-runtime-adapter-service.js";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

test("Workflow v1.3 boots eleven tasks and gates T030 behind T025", async () => {
  const workflow = STANDARD_PRODUCTION_WORKFLOW;
  assert.equal(workflow.version, "1.3");
  assert.equal(workflow.tasks.length, 11);
  const t025 = workflow.tasks.find(task => task.task_id === "T025");
  const t030 = workflow.tasks.find(task => task.task_id === "T030");
  const t060 = workflow.tasks.find(task => task.task_id === "T060");
  const t080 = workflow.tasks.find(task => task.task_id === "T080");
  assert.equal(t025.assigned_agent, "AGENT3_VISUAL_PRODUCTION");
  assert.deepEqual(t025.depends_on, ["T020"]);
  assert.equal(t025.completion_gate, "PRE_TTS_VISUAL_GATE");
  assert.deepEqual(t030.depends_on, ["T025"]);
  assert.ok(t060.production_policies.includes("VIDEO_GENERATION_CAPABILITY_POLICY_V1"));
  assert.ok(t080.production_policies.includes("VIDEO_GENERATION_CAPABILITY_POLICY_V1"));

  const gemini = VIDEO_GENERATION_CAPABILITIES.find(item => item.provider === "GEMINI" && item.model === "GEMINI_I2V_10S");
  const flowFast = VIDEO_GENERATION_CAPABILITIES.find(item => item.provider === "GOOGLE_FLOW" && item.model === "VEO_3_1_FAST");
  const flowOmni = VIDEO_GENERATION_CAPABILITIES.find(item => item.provider === "GOOGLE_FLOW" && item.model === "GEMINI_OMNI_FLASH");
  assert.deepEqual(gemini?.supported_durations_sec, [10]);
  assert.deepEqual(flowFast?.supported_durations_sec, [4, 6, 8]);
  assert.deepEqual(flowOmni?.supported_durations_sec, [4, 6, 8, 10]);

  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "vpf-v13-"));
  try {
    const bootstrap = new ProjectBootstrapService({ repositoryRoot, workspaceRoot });
    const projectId = "v13_gate_fixture";
    const created = await bootstrap.createProject({ projectId, title: "Gate Fixture", topic: "History", format: "shortform", targetDurationSec: 60 });
    const doctor = await bootstrap.doctor(projectId);
    assert.equal(doctor.healthy, true);
    const manager = new Agent1WorkflowOrchestratorService(bootstrap);
    const initial = await manager.status(projectId);
    assert.equal(initial.tasks.length, 11);
    assert.deepEqual(initial.ready_tasks, ["T010"]);
    for (const [current, next] of [["T010", "T020"], ["T020", "T025"]]) {
      const repo = new WorkflowOrchestratorRepository(created.projectDbPath);
      try { repo.updateTask({ projectId, taskId: current, status: "COMPLETE", lastGateStatus: "PASS", updatedAt: new Date().toISOString() }); }
      finally { repo.close(); }
      assert.equal((await manager.status(projectId)).tasks.find(task => task.task_id === next).status, "READY");
    }
    const storyRepo = new Agent2StoryAudioRepository(created.projectDbPath);
    try {
      const at = new Date().toISOString();
      storyRepo.save(projectId, "story_spec", { schema_version: "1.0", project_id: projectId,
        scenes: [{ scene_id: "S1", beats: [{ beat_id: "B1" }] }] }, "T020", at);
      storyRepo.save(projectId, "script", { schema_version: "1.0", project_id: projectId, body_ko: "Test" }, "T020", at);
    } finally { storyRepo.close(); }
    await manager.dispatch(projectId, "T025", "AGENT3_VISUAL_PRODUCTION");
    await manager.recordGate(projectId, "T025", false, [{ code: "REVISE", message: "Revise visual direction" }]);
    const failed = await manager.status(projectId);
    assert.equal(failed.tasks.find(task => task.task_id === "T025").status, "REVISION_REQUIRED");
    assert.equal(failed.tasks.find(task => task.task_id === "T030").status, "BLOCKED");
    await manager.dispatch(projectId, "T025", "AGENT3_VISUAL_PRODUCTION");
    const worker = new Agent3VisualProductionWorkerService(bootstrap);
    const commonVisual = {
      schema_version: "1.0", project_id: projectId,
      pre_tts_visual_plan: { schema_version: "1.0", project_id: projectId,
        scenes: [{ scene_id: "S1", visual_intent: "Graphic reveal", uncertainty_handling: "Silhouette" }] },
      pre_tts_visual_beat_spec: { schema_version: "1.0", project_id: projectId,
        beats: [{ scene_id: "S1", beat_id: "B1", visual_action: "Parallax traversal" }] }
    };
    await assert.rejects(
      worker.executePayload(projectId, "T025", {
        ...commonVisual,
        pre_tts_visual_direction_spec: { schema_version: "1.0", project_id: projectId,
          style_direction: "cinematic stylized historical reconstruction", camera_direction: "Orbit and scale change", continuity_direction: "Motif carries forward" }
      }),
      /NON_REALISTIC_STYLIZED/
    );
    const workerResult = await worker.executePayload(projectId, "T025", {
      ...commonVisual,
      pre_tts_visual_direction_spec: { schema_version: "1.0", project_id: projectId,
        style_direction: "NON_REALISTIC_STYLIZED — cinematic stylized historical reconstruction", camera_direction: "Orbit and scale change", continuity_direction: "Motif carries forward" }
    });
    assert.equal(workerResult.stored_artifacts.length, 3);
    const repo = new Agent3VisualProductionRepository(created.projectDbPath, { readonly: true });
    try { for (const type of t025.required_outputs) assert.equal(repo.getActive(projectId, type).revision, 1); }
    finally { repo.close(); }
    assert.equal((await manager.evaluateCompletionGate(projectId, "T025")).status, "PASS");
    await manager.complete(projectId, "T025");
    assert.equal((await manager.status(projectId)).tasks.find(task => task.task_id === "T030").status, "READY");
    const t030Dispatch = await manager.dispatch(projectId, "T030", "AGENT2_STORY_AUDIO");
    assert.deepEqual(t030Dispatch.input_revision_refs.filter(ref => ref.artifact_type.startsWith("pre_tts_"))
      .map(ref => ref.artifact_type).sort(), [...t025.required_outputs].sort());
  } finally { await rm(workspaceRoot, { recursive: true, force: true }); }
});

test("Agent3 OpenAI runtime dispatches T025 before measured scene timing exists", async () => {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "vpf-v13-runtime-"));
  const projectId = "v13_runtime_fixture";
  let requests = 0;
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* consume request body */ }
    requests += 1;
    const visual = {
      schema_version: "1.0", project_id: projectId,
      pre_tts_visual_plan: { schema_version: "1.0", project_id: projectId,
        scenes: [{ scene_id: "S1", visual_intent: "Graphic reveal", uncertainty_handling: "Silhouette" }] },
      pre_tts_visual_beat_spec: { schema_version: "1.0", project_id: projectId,
        beats: [{ scene_id: "S1", beat_id: "B1", visual_action: "Parallax reveal" }] },
      pre_tts_visual_direction_spec: { schema_version: "1.0", project_id: projectId,
        style_direction: "NON_REALISTIC_STYLIZED", camera_direction: "Orbit", continuity_direction: "Preserve motif" }
    };
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ id: "response_t025", status: "completed", output: [{ type: "message", role: "assistant",
      content: [{ type: "output_text", text: JSON.stringify(visual), annotations: [] }] }] }));
  });
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const bootstrap = new ProjectBootstrapService({ repositoryRoot, workspaceRoot });
    const created = await bootstrap.createProject({ projectId, title: "Runtime", topic: "History", format: "shortform", targetDurationSec: 60 });
    const workflow = new WorkflowOrchestratorRepository(created.projectDbPath);
    const story = new Agent2StoryAudioRepository(created.projectDbPath);
    try {
      const at = new Date().toISOString();
      workflow.updateTask({ projectId, taskId: "T010", status: "COMPLETE", lastGateStatus: "PASS", updatedAt: at });
      workflow.updateTask({ projectId, taskId: "T020", status: "COMPLETE", lastGateStatus: "PASS", updatedAt: at });
      story.save(projectId, "story_spec", { schema_version: "1.0", project_id: projectId,
        scenes: [{ scene_id: "S1", beats: [{ beat_id: "B1" }] }] }, "T020", at);
      story.save(projectId, "script", { schema_version: "1.0", project_id: projectId, body_ko: "Test" }, "T020", at);
    } finally { story.close(); workflow.close(); }
    const runtime = new Agent3RuntimeAdapterService(bootstrap, { ...process.env,
      VPF_AI_RUNTIME_MODE: "OPENAI_API", OPENAI_API_KEY: "fixture-key", VPF_AGENT3_OPENAI_MODEL: "gpt-5.6",
      OPENAI_API_BASE_URL: `http://127.0.0.1:${address.port}/v1`, VPF_AGENT3_OPENAI_RETRIES: "0" });
    const result = await runtime.runNext(projectId);
    assert.equal(result.task_id, "T025");
    assert.equal(result.gate_status, "PASS");
    assert.equal(result.worker.stored_artifacts.length, 3);
    assert.equal(requests, 1);
    assert.equal((await new Agent1WorkflowOrchestratorService(bootstrap).status(projectId)).next_task?.task_id, "T030");
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});


test("Workflow v1.3 explicitly resumes exhausted T025 without consuming a new attempt and preserves runtime history", async () => {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "vpf-v13-resume-"));
  const projectId = "v13_resume_fixture";
  let requests = 0;
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* consume request body */ }
    requests += 1;
    const visual = {
      schema_version: "1.0", project_id: projectId,
      pre_tts_visual_plan: { schema_version: "1.0", project_id: projectId,
        scenes: [{ scene_id: "S1", visual_intent: "Graphic reveal", uncertainty_handling: "Silhouette" }] },
      pre_tts_visual_beat_spec: { schema_version: "1.0", project_id: projectId,
        beats: [{ scene_id: "S1", beat_id: "B1", visual_action: "Parallax reveal" }] },
      pre_tts_visual_direction_spec: { schema_version: "1.0", project_id: projectId,
        style_direction: "NON_REALISTIC_STYLIZED — cinematic stylized historical reconstruction",
        camera_direction: "Orbit", continuity_direction: "Preserve motif" }
    };
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ id: "response_t025_resume", status: "completed", output: [{ type: "message", role: "assistant",
      content: [{ type: "output_text", text: JSON.stringify(visual), annotations: [] }] }] }));
  });

  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const bootstrap = new ProjectBootstrapService({ repositoryRoot, workspaceRoot });
    const created = await bootstrap.createProject({ projectId, title: "Resume Fixture", topic: "History", format: "shortform", targetDurationSec: 60 });
    const workflow = new WorkflowOrchestratorRepository(created.projectDbPath);
    const story = new Agent2StoryAudioRepository(created.projectDbPath);
    try {
      const at = new Date().toISOString();
      workflow.updateTask({ projectId, taskId: "T010", status: "COMPLETE", attempt: 1, lastGateStatus: "PASS", updatedAt: at });
      workflow.updateTask({ projectId, taskId: "T020", status: "COMPLETE", attempt: 1, lastGateStatus: "PASS", updatedAt: at });
      workflow.updateTask({ projectId, taskId: "T025", status: "REVISION_REQUIRED", attempt: 3, outputRefs: [], updatedAt: at });
      story.save(projectId, "story_spec", { schema_version: "1.0", project_id: projectId,
        scenes: [{ scene_id: "S1", beats: [{ beat_id: "B1" }] }] }, "T020", at);
      story.save(projectId, "script", { schema_version: "1.0", project_id: projectId, body_ko: "Test" }, "T020", at);
    } finally { story.close(); workflow.close(); }

    const history = new Agent3RuntimeRepository(created.projectDbPath);
    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const runId = `${projectId}:T025:A${attempt}:CODEX:fixture-${attempt}`;
        history.start({
          run_id: runId, project_id: projectId, task_id: "T025",
          provider: "CODEX_SESSION", model_id: "codex-default", provider_response_id: null,
          input_sha256: "fixture-input", started_at: `2026-10-04T00:00:0${attempt}.000Z`
        });
        history.fail({
          runId, errorCode: attempt < 3 ? "CODEX_EXEC_FAILED" : "AGENT3_INPUT_INVALID",
          errorDetail: attempt < 3 ? "usage limit" : "missing NON_REALISTIC_STYLIZED",
          completedAt: `2026-10-04T00:00:1${attempt}.000Z`
        });
      }
    } finally { history.close(); }

    const manager = new Agent1WorkflowOrchestratorService(bootstrap);
    await assert.rejects(
      manager.dispatch(projectId, "T025", "AGENT3_VISUAL_PRODUCTION"),
      error => error?.code === "TASK_RETRY_EXHAUSTED"
    );
    await manager.requestRevision(projectId, "T025");

    const before = new Agent3RuntimeRepository(created.projectDbPath, { readonly: true });
    let beforeRows;
    try { beforeRows = before.list(projectId); }
    finally { before.close(); }
    assert.equal(beforeRows.length, 3);

    const runtime = new Agent3RuntimeAdapterService(bootstrap, { ...process.env,
      VPF_AI_RUNTIME_MODE: "OPENAI_API", OPENAI_API_KEY: "fixture-key", VPF_AGENT3_OPENAI_MODEL: "gpt-5.6",
      OPENAI_API_BASE_URL: `http://127.0.0.1:${address.port}/v1`, VPF_AGENT3_OPENAI_RETRIES: "0" });
    const result = await runtime.runNext(projectId, { resumeCurrentAttempt: true });
    assert.equal(result.task_id, "T025");
    assert.equal(result.gate_status, "PASS");
    assert.equal(result.worker.stored_artifacts.length, 3);
    assert.equal(requests, 1);

    const state = await manager.status(projectId);
    const t025 = state.tasks.find(task => task.task_id === "T025");
    assert.equal(t025.status, "COMPLETE");
    assert.equal(t025.attempt, 3);
    assert.equal(t025.last_gate_id, "PRE_TTS_VISUAL_GATE");
    assert.equal(t025.last_gate_status, "PASS");
    assert.equal(state.tasks.find(task => task.task_id === "T030").status, "READY");

    const artifacts = new Agent3VisualProductionRepository(created.projectDbPath, { readonly: true });
    try {
      for (const type of ["pre_tts_visual_plan", "pre_tts_visual_beat_spec", "pre_tts_visual_direction_spec"]) {
        assert.equal(artifacts.getActive(projectId, type).revision, 1);
      }
    } finally { artifacts.close(); }

    const after = new Agent3RuntimeRepository(created.projectDbPath, { readonly: true });
    let afterRows;
    try { afterRows = after.list(projectId); }
    finally { after.close(); }
    assert.equal(afterRows.length, 4);
    assert.deepEqual(afterRows.slice(0, 3).map(row => row.run_id), beforeRows.map(row => row.run_id));
    assert.ok(afterRows.slice(0, 3).every(row => row.status === "FAILED"));
    assert.equal(afterRows.at(-1).status, "COMPLETE");
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
