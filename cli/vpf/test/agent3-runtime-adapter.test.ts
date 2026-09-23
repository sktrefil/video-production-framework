import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { Agent3RuntimeRepository } from "@vpf/storage/agent3-runtime";
import { Agent3VisualProductionRepository } from "@vpf/storage/agent3-visual-production";
import { ProductionSpecRepository } from "@vpf/storage/production-spec";
import { Agent2StoryAudioWorkerService } from "../src/agent2-story-audio-service.js";
import {
  Agent3RuntimeAdapterError,
  Agent3RuntimeAdapterService
} from "../src/agent3-runtime-adapter-service.js";
import { Agent1WorkflowOrchestratorService } from "../src/workflow-orchestrator-service.js";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk.toString("utf8");
  return body;
}

async function listen(
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
) {
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Test server address missing.");
  }
  return {
    baseUrl: "http://127.0.0.1:" + address.port,
    close: async () =>
      await new Promise<void>((resolve, reject) =>
        server.close(error => error ? reject(error) : resolve())
      )
  };
}

async function prepareAgent2(
  bootstrap: ProjectBootstrapService,
  projectId: string
): Promise<{ duration: number }> {
  const manager = new Agent1WorkflowOrchestratorService(bootstrap);
  const worker = new Agent2StoryAudioWorkerService(bootstrap);

  await manager.dispatch(projectId, "T010");
  await worker.executePayload(projectId, "T010", {
    research_spec: {
      schema_version: "1.0",
      project_id: projectId,
      topic: "로마 제9군단",
      central_question: "제9군단의 마지막 운명은 무엇이었는가?",
      sources: [{
        source_id: "SRC_001",
        title: "Reference",
        source_type: "BOOK",
        citation: "Reference p.1"
      }],
      research_notes: ["검증된 기록과 가설을 구분한다."]
    },
    fact_check_spec: {
      schema_version: "1.0",
      project_id: projectId,
      facts: [{
        fact_id: "FACT_001",
        statement_ko: "제9군단에 대한 마지막 기록이 존재한다.",
        statement_en: "A last traceable record of the Ninth Legion exists.",
        classification: "VERIFIED_FACT",
        confidence: "HIGH",
        source_refs: ["SRC_001"],
        visualisation_note: "마지막 기록 이후의 불확실성을 시각화한다.",
        uncertainty_note: ""
      }]
    }
  });
  await manager.complete(projectId, "T010");

  const scriptText = "제9군단의마지막기록뒤운명은확실하지않습니다.";
  await manager.dispatch(projectId, "T020");
  await worker.executePayload(projectId, "T020", {
    story_spec: {
      schema_version: "1.0",
      project_id: projectId,
      central_question: "제9군단의 마지막 운명은 무엇이었는가?",
      sections: [{
        section_id: "SEC_01",
        role: "HOOK",
        purpose_ko: "기록 단절 미스터리 제기",
        purpose_en: "",
        fact_refs: ["FACT_001"]
      }],
      scenes: [{
        scene_id: "SCENE_01",
        story_role: "HOOK",
        narrative_purpose_ko: "마지막 기록 이후의 불확실성을 제기한다.",
        narrative_purpose_en: "",
        script_ko: scriptText,
        script_en: "",
        fact_refs: ["FACT_001"],
        beats: [{
          beat_id: "BEAT_01",
          purpose_ko: "마지막 기록과 불확실성 제시",
          purpose_en: "",
          script_ko: scriptText
        }]
      }]
    },
    script: {
      schema_version: "1.0",
      project_id: projectId,
      language: "ko",
      body_ko: scriptText,
      body_en: "",
      estimated_duration_sec: 5,
      source_fact_refs: ["FACT_001"]
    }
  });
  await manager.complete(projectId, "T020");

  const characters = Array.from(scriptText);
  const step = 0.2;
  const starts = characters.map((_, index) => Number((index * step).toFixed(3)));
  const ends = characters.map((_, index) => Number(((index + 1) * step).toFixed(3)));
  const duration = ends.at(-1)!;

  await manager.dispatch(projectId, "T030");
  await worker.executePayload(projectId, "T030", {
    schema_version: "1.0",
    project_id: projectId,
    provider: "ELEVENLABS",
    voice_id: "TEST",
    model_id: "eleven_v3",
    sections: [{
      section_id: "TTS_001",
      timeline_start_sec: 0,
      text: scriptText,
      audio_relative_path: "03_tts/narration.mp3",
      audio_sha256: "a".repeat(64),
      audio_duration_sec: duration,
      alignment: {
        characters,
        character_start_times_seconds: starts,
        character_end_times_seconds: ends
      }
    }]
  });
  await manager.complete(projectId, "T030");
  return { duration };
}

function visualResponse(projectId: string, bible: {
  resourceId: string;
  version: string;
  contentHash: string;
}) {
  return {
    schema_version: "1.0",
    project_id: projectId,
    visual_bible: {
      resource_id: bible.resourceId,
      version: bible.version,
      content_hash: bible.contentHash
    },
    scenes: [{
      scene_id: "SCENE_01",
      story_role: "HOOK",
      factuality_mode: "HISTORICAL_RECONSTRUCTION",
      fact_refs: ["FACT_001"],
      narrative_purpose_ko: "마지막 기록 이후의 불확실성을 제기한다.",
      narrative_purpose_en: "Raise uncertainty after the last record.",
      visual_intent_ko: "실종 사건 자체가 아니라 마지막으로 추적 가능한 흔적이 멀어지는 모습을 보여준다.",
      visual_intent_en: "Show the last traceable presence receding rather than a literal disappearance.",
      environment_ko: "비안개가 낀 고대 도로와 석조 구조물",
      environment_en: "Ancient road and stone structures in rain mist",
      subject_ko: "멀리 전진하는 로마 군단 행렬",
      subject_en: "A distant Roman marching column",
      action_ko: "행렬이 같은 방향으로 전진하며 날씨에 점차 가려진다.",
      action_en: "The column advances in one direction and is gradually obscured by weather.",
      evidence_constraints: [],
      uncertainty_handling_ko: "기록 단절을 마법적 소멸로 묘사하지 않는다.",
      uncertainty_handling_en: "Do not turn a break in records into magical disappearance.",
      forbidden_visual_claims: ["magical disappearance", "fabricated inscription"],
      continuity: {
        character_identity: [],
        environment_identity: ["ancient road", "stone structures"],
        lighting_direction: "soft side light",
        color_language: "muted cool storm tones with restrained earth colors",
        weather: "rain mist",
        movement_direction: "forward into depth",
        screen_direction: "LEFT_TO_RIGHT",
        camera_energy: "RESTRAINED",
        visual_motif: ["mist", "stone"]
      },
      handoff: {
        entry_anchor: "marching line",
        exit_anchor: "dense mist",
        preserve_elements: ["road axis", "screen direction", "mist"],
        next_cut_intent: "carry the road and fog axis into the next visual state"
      }
    }]
  };
}

function stateResponse(projectId: string) {
  return {
    schema_version: "1.0",
    project_id: projectId,
    state_images: [
      {
        state_image_id: "SCENE_01_STATE_01_ENTRY",
        scene_id: "SCENE_01",
        beat_id: "BEAT_01",
        role: "ENTRY",
        sequence_order: 1,
        visual_goal_ko: "행렬이 아직 분명히 보인다.",
        visual_goal_en: "The column remains clearly readable.",
        composition_ko: "전경 암석, 중경 행렬, 원경 비안개",
        composition_en: "Foreground rock, midground column, distant rain mist",
        subject_state_ko: "규율 있게 이동하는 행렬",
        subject_state_en: "A disciplined moving column",
        environment_state_ko: "비에 젖은 고대 도로",
        environment_state_en: "Rain-soaked ancient road",
        motion_vector_ko: "왼쪽에서 오른쪽으로 깊이 방향 이동",
        motion_vector_en: "Left to right into depth",
        handoff_anchor: "marching line",
        continuity_refs: ["road axis", "screen direction", "mist"],
        factual_constraints: [],
        avoidances: ["readable generated text", "magic effect"]
      },
      {
        state_image_id: "SCENE_01_STATE_02_TARGET",
        scene_id: "SCENE_01",
        beat_id: "BEAT_01",
        role: "TARGET",
        sequence_order: 2,
        visual_goal_ko: "행렬이 짙어진 날씨 뒤로 가려지지만 소멸하지 않는다.",
        visual_goal_en: "The column becomes obscured by weather without disappearing.",
        composition_ko: "동일한 도로 축에서 안개가 짙어진 상태",
        composition_en: "Same road axis with denser mist",
        subject_state_ko: "희미하게 남은 행렬 실루엣",
        subject_state_en: "Faint remaining column silhouettes",
        environment_state_ko: "짙어진 비안개",
        environment_state_en: "Dense rain mist",
        motion_vector_ko: "동일 진행 방향을 유지한다.",
        motion_vector_en: "Preserve the same travel direction",
        handoff_anchor: "dense mist",
        continuity_refs: ["road axis", "screen direction", "mist"],
        factual_constraints: [],
        avoidances: ["teleportation", "magic effect"]
      }
    ]
  };
}

function clipResponse(projectId: string, duration: number) {
  const startHandle = Number(Math.min(0.2, duration * 0.05).toFixed(3));
  const coreStart = Number((startHandle + 0.05).toFixed(3));
  const coreEnd = Number((duration * 0.5).toFixed(3));
  const narrative = Number((duration * 0.65).toFixed(3));
  const target = Number((duration * 0.8).toFixed(3));
  const endHold = Number((duration - target).toFixed(3));
  return {
    schema_version: "1.0",
    project_id: projectId,
    clip_production_spec: {
      schema_version: "1.0",
      project_id: projectId,
      clips: [{
        scene_id: "SCENE_01",
        clip_id: "SCENE_01_CLIP_01",
        editorial_duration_sec: duration,
        generation_duration_sec: null,
        mandatory_core_points: [{
          id: "CP_01",
          description_ko: "행렬이 비안개에 점차 가려진다.",
          description_en: "The column becomes gradually obscured by rain mist.",
          window_start_sec: coreStart,
          window_end_sec: coreEnd
        }],
        narrative_deadline_sec: narrative,
        target_state_deadline_sec: target,
        start_handle_sec: startHandle,
        end_hold_sec: endHold,
        safe_trim_start_sec: duration,
        camera: {
          purpose: "LOSE_SIGHT",
          movement: "LATERAL_TRACK",
          shot_size_start: "WIDE",
          shot_size_end: "WIDE",
          movement_curve: "HOLD_MOVE_SETTLE"
        },
        state_images: {
          entry: "SCENE_01_STATE_01_ENTRY",
          mid: null,
          target: "SCENE_01_STATE_02_TARGET"
        },
        transition_in: "HARD_CUT",
        transition_out: "ENVIRONMENT_OCCLUSION"
      }]
    }
  };
}

test("Agent3 runtime automatically runs T040-T060 and hands off T070", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-agent3-runtime-"));
  let calls = 0;
  const requestBodies: any[] = [];
  let bible: { resourceId: string; version: string; contentHash: string } | null = null;
  let duration = 0;

  const server = await listen(async (req, res) => {
    if (req.url === "/v1/responses" && req.method === "POST") {
      calls += 1;
      const body = JSON.parse(await readBody(req));
      requestBodies.push(body);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      const value = calls === 1
        ? visualResponse("agent3_runtime", bible!)
        : calls === 2
          ? stateResponse("agent3_runtime")
          : clipResponse("agent3_runtime", duration);
      res.end(JSON.stringify({
        id: "resp_agent3_" + calls,
        status: "completed",
        output: [{
          type: "message",
          role: "assistant",
          content: [{
            type: "output_text",
            text: JSON.stringify(value),
            annotations: []
          }]
        }]
      }));
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });

  try {
    const bootstrap = new ProjectBootstrapService({
      repositoryRoot,
      workspaceRoot: path.join(root, "workspace")
    });
    const created = await bootstrap.createProject({
      projectId: "agent3_runtime",
      title: "로마 제9군단",
      format: "shortform",
      targetDurationSec: 5,
      language: "ko"
    });
    const prepared = await prepareAgent2(bootstrap, "agent3_runtime");
    duration = prepared.duration;

    const status = await bootstrap.getStatus("agent3_runtime");
    const pin = status.resourcePins.find(item =>
      item.resourceType === "CHANNEL_VISUAL_BIBLE"
    );
    assert.ok(pin);
    bible = {
      resourceId: pin!.resourceId,
      version: pin!.version,
      contentHash: pin!.contentHash
    };

    const runtime = new Agent3RuntimeAdapterService(bootstrap, {
      ...process.env,
      OPENAI_API_KEY: "test-agent3-key",
      VPF_AGENT3_OPENAI_MODEL: "gpt-5.6",
      OPENAI_API_BASE_URL: server.baseUrl + "/v1",
      VPF_AGENT3_OPENAI_RETRIES: "0"
    });

    const result = await runtime.runAll("agent3_runtime");
    assert.deepEqual(
      result.steps.map(step => step.task_id),
      ["T040", "T050", "T060"]
    );
    assert.equal(result.handoff_task, "T070");
    assert.equal(result.handoff_agent, "AGENT3_VISUAL_PRODUCTION");
    assert.equal(calls, 3);
    assert.deepEqual(
      requestBodies.map(body => body.text.format.name),
      [
        "agent3_scene_visual_spec",
        "agent3_state_image_spec",
        "agent3_clip_camera_spec"
      ]
    );
    assert.ok(requestBodies.every(body => body.reasoning.effort === "high"));

    const workflow = new Agent1WorkflowOrchestratorService(bootstrap);
    const workflowState = await workflow.status("agent3_runtime");
    assert.equal(workflowState.tasks.find(task => task.task_id === "T040")?.status, "COMPLETE");
    assert.equal(workflowState.tasks.find(task => task.task_id === "T050")?.status, "COMPLETE");
    assert.equal(workflowState.tasks.find(task => task.task_id === "T060")?.status, "COMPLETE");
    assert.equal(workflowState.tasks.find(task => task.task_id === "T070")?.status, "READY");

    const production = new ProductionSpecRepository(created.projectDbPath, { readonly: true });
    const visualRepo = new Agent3VisualProductionRepository(created.projectDbPath, { readonly: true });
    const runs = new Agent3RuntimeRepository(created.projectDbPath, { readonly: true });
    try {
      assert.equal(production.getLatestGate("agent3_runtime", "VISUAL_PLAN_GATE")?.status, "PASS");
      assert.equal(production.getLatestGate("agent3_runtime", "STATE_IMAGE_GATE")?.status, "PASS");
      assert.equal(production.getLatestGate("agent3_runtime", "CLIP_PLAN_GATE")?.status, "PASS");
      assert.equal(production.getLatestGate("agent3_runtime", "GENERATION_READY_GATE")?.status, "PASS");
      const prompts = visualRepo.getActive<any>("agent3_runtime", "prompt_bundle_spec")?.value;
      assert.equal(prompts?.video_prompts?.[0]?.clip_id, "SCENE_01_CLIP_01");
      assert.equal(prompts?.video_prompts?.[0]?.safe_trim_start_sec, duration);
      const rows = runs.list("agent3_runtime");
      assert.equal(rows.length, 3);
      assert.ok(rows.every(row => row.status === "COMPLETE"));
      assert.ok(rows.every(row => row.provider === "OPENAI"));
      assert.equal(rows.some(row => JSON.stringify(row).includes("test-agent3-key")), false);
    } finally {
      runs.close();
      visualRepo.close();
      production.close();
    }
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Agent3 run-all retries Core rejection with revision feedback", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-agent3-runtime-retry-"));
  let calls = 0;
  let bible: { resourceId: string; version: string; contentHash: string } | null = null;
  let duration = 0;
  const feedbackInputs: Array<string | null> = [];

  const server = await listen(async (req, res) => {
    if (req.url === "/v1/responses" && req.method === "POST") {
      calls += 1;
      const body = JSON.parse(await readBody(req));
      const userText = body.input[1].content[0].text;
      feedbackInputs.push(JSON.parse(userText).revision_feedback ?? null);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");

      let value;
      if (calls === 1) {
        value = visualResponse("agent3_retry", bible!);
        value.scenes[0].factuality_mode = "HYPOTHESIS_RECONSTRUCTION";
      } else if (calls === 2) {
        value = visualResponse("agent3_retry", bible!);
      } else if (calls === 3) {
        value = stateResponse("agent3_retry");
      } else {
        value = clipResponse("agent3_retry", duration);
      }

      res.end(JSON.stringify({
        id: "resp_retry_" + calls,
        status: "completed",
        output: [{
          type: "message",
          role: "assistant",
          content: [{
            type: "output_text",
            text: JSON.stringify(value),
            annotations: []
          }]
        }]
      }));
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });

  try {
    const bootstrap = new ProjectBootstrapService({
      repositoryRoot,
      workspaceRoot: path.join(root, "workspace")
    });
    const created = await bootstrap.createProject({
      projectId: "agent3_retry",
      title: "로마 제9군단 재시도",
      format: "shortform",
      targetDurationSec: 5,
      language: "ko"
    });
    duration = (await prepareAgent2(bootstrap, "agent3_retry")).duration;
    const status = await bootstrap.getStatus("agent3_retry");
    const pin = status.resourcePins.find(item =>
      item.resourceType === "CHANNEL_VISUAL_BIBLE"
    )!;
    bible = {
      resourceId: pin.resourceId,
      version: pin.version,
      contentHash: pin.contentHash
    };

    const runtime = new Agent3RuntimeAdapterService(bootstrap, {
      ...process.env,
      OPENAI_API_KEY: "test-agent3-key",
      VPF_AGENT3_OPENAI_MODEL: "gpt-5.6",
      OPENAI_API_BASE_URL: server.baseUrl + "/v1",
      VPF_AGENT3_OPENAI_RETRIES: "0"
    });

    const result = await runtime.runAll("agent3_retry");
    assert.deepEqual(result.steps.map(step => step.task_id), ["T040", "T050", "T060"]);
    assert.equal(calls, 4);
    assert.equal(feedbackInputs[0], null);
    assert.match(feedbackInputs[1] ?? "", /VISUAL_FACTUALITY_CLASSIFICATION_MISMATCH/);

    const runs = new Agent3RuntimeRepository(created.projectDbPath, { readonly: true });
    try {
      const rows = runs.list("agent3_retry");
      assert.equal(rows.length, 4);
      assert.equal(rows[0]?.status, "FAILED");
      assert.equal(rows[1]?.status, "COMPLETE");
      assert.equal(rows[0]?.task_id, "T040");
      assert.equal(rows[1]?.task_id, "T040");
    } finally {
      runs.close();
    }
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Agent3 automatic runtime fails closed when OPENAI_API_KEY is missing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-agent3-runtime-secret-"));
  try {
    const bootstrap = new ProjectBootstrapService({
      repositoryRoot,
      workspaceRoot: path.join(root, "workspace")
    });
    await bootstrap.createProject({
      projectId: "agent3_no_key",
      title: "Agent3 no key",
      format: "shortform",
      targetDurationSec: 5,
      language: "ko"
    });
    await prepareAgent2(bootstrap, "agent3_no_key");

    const runtime = new Agent3RuntimeAdapterService(bootstrap, {
      ...process.env,
      OPENAI_API_KEY: ""
    });
    await assert.rejects(
      runtime.runNext("agent3_no_key"),
      (error: unknown) =>
        error instanceof Agent3RuntimeAdapterError &&
        error.code === "AGENT3_RUNTIME_SECRET_MISSING"
    );
    const workflow = new Agent1WorkflowOrchestratorService(bootstrap);
    assert.equal(
      (await workflow.status("agent3_no_key")).tasks.find(
        task => task.task_id === "T040"
      )?.status,
      "REVISION_REQUIRED"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
