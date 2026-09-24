import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { CodexRuntimeRepository } from "@vpf/storage/codex-runtime";
import { ProductionSpecRepository } from "@vpf/storage/production-spec";
import { Agent2StoryAudioWorkerService } from "../src/agent2-story-audio-service.js";
import { Agent2RuntimeAdapterService } from "../src/agent2-runtime-adapter-service.js";
import { Agent3RuntimeAdapterService } from "../src/agent3-runtime-adapter-service.js";
import { CodexManagerRuntimeService } from "../src/codex-manager-runtime-service.js";
import { CodexProcessRunner, CodexRuntimeError } from "../src/codex-process-runner.js";
import { Agent1WorkflowOrchestratorService } from "../src/workflow-orchestrator-service.js";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const fakeCodex = path.resolve(
  fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url))
);

function runtimeEnv(outputDir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    VPF_AI_RUNTIME_MODE: "CODEX_SESSION",
    VPF_CODEX_COMMAND: process.execPath,
    VPF_CODEX_COMMAND_ARGS_JSON: JSON.stringify([fakeCodex]),
    VPF_FAKE_CODEX_OUTPUT_DIR: outputDir,
    VPF_CODEX_TIMEOUT_MS: "30000",
    OPENAI_API_KEY: "must-not-reach-codex-child"
  };
}

async function writeJson(dir: string, name: string, value: unknown): Promise<void> {
  await writeFile(
    path.join(dir, name + ".json"),
    JSON.stringify(value, null, 2),
    "utf8"
  );
}

function researchBundle(projectId: string) {
  return {
    research_spec: {
      schema_version: "1.0",
      project_id: projectId,
      topic: "로마 제9군단",
      central_question: "제9군단의 마지막 운명은 무엇이었는가?",
      sources: [{
        source_id: "SRC_001",
        title: "Roman Ninth Legion reference",
        source_type: "WEB",
        url: "https://example.org/roman-ix",
        citation: "Roman Ninth Legion reference",
        publisher: "Example Institute",
        published_at: "2026-01-01",
        notes: "integration fixture"
      }],
      research_notes: ["검증된 기록과 이후의 불확실성을 구분한다."]
    },
    fact_check_spec: {
      schema_version: "1.0",
      project_id: projectId,
      facts: [{
        fact_id: "FACT_001",
        statement_ko: "제9군단에 대한 마지막 추적 가능한 기록이 존재한다.",
        statement_en: "A last traceable record of the Ninth Legion exists.",
        classification: "VERIFIED_FACT",
        confidence: "HIGH",
        source_refs: ["SRC_001"],
        visualisation_note: "마지막 기록 이후의 불확실성은 재구성으로만 표현한다.",
        uncertainty_note: ""
      }]
    }
  };
}

const scriptText = "제9군단의마지막기록뒤운명은확실하지않습니다.";

function storyBundle(projectId: string) {
  return {
    story_spec: {
      schema_version: "1.0",
      project_id: projectId,
      central_question: "제9군단의 마지막 운명은 무엇이었는가?",
      sections: [{
        section_id: "SEC_01",
        role: "HOOK",
        purpose_ko: "마지막 기록 이후의 불확실성을 제기한다.",
        purpose_en: "Raise uncertainty after the last record.",
        fact_refs: ["FACT_001"]
      }],
      scenes: [{
        scene_id: "SCENE_01",
        story_role: "HOOK",
        narrative_purpose_ko: "마지막 기록 이후의 불확실성을 제기한다.",
        narrative_purpose_en: "Raise uncertainty after the last record.",
        script_ko: scriptText,
        script_en: "",
        fact_refs: ["FACT_001"],
        beats: [{
          beat_id: "BEAT_01",
          purpose_ko: "마지막 기록과 불확실성을 제시한다.",
          purpose_en: "Present the final record and uncertainty.",
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
  };
}

function visualSpec(
  projectId: string,
  bible: { resourceId: string; version: string; contentHash: string }
) {
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
      visual_intent_ko: "군단의 소멸이 아니라 마지막으로 추적 가능한 흔적이 멀어지는 모습을 보여준다.",
      visual_intent_en: "Show the last traceable presence receding rather than a literal disappearance.",
      environment_ko: "비안개가 낀 고대 도로와 석조 구조물",
      environment_en: "Ancient road and stone structures in rain mist",
      subject_ko: "멀리 전진하는 로마 군단 행렬",
      subject_en: "A distant Roman marching column",
      action_ko: "행렬이 같은 방향으로 전진하며 날씨에 점차 가려진다.",
      action_en: "The column advances and is gradually obscured by weather.",
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
        next_cut_intent: "carry the road and fog axis into the next state"
      }
    }]
  };
}

function stateSpec(projectId: string) {
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

function clipSpec(projectId: string, duration: number) {
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

test("Codex 2 and Codex 3 execute through one stored-login runtime and reach T070", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-codex-multi-agent-"));
  const fixtures = path.join(root, "fixtures");
  const workspaceRoot = path.join(root, "workspace");
  await import("node:fs/promises").then(fs => fs.mkdir(fixtures, { recursive: true }));

  try {
    const bootstrap = new ProjectBootstrapService({
      repositoryRoot,
      workspaceRoot
    });
    const created = await bootstrap.createProject({
      projectId: "codex_multi",
      title: "로마 제9군단",
      topic: "로마 제9군단의 마지막 기록과 이후 행방",
      format: "shortform",
      targetDurationSec: 6,
      language: "ko"
    });
    const env = runtimeEnv(fixtures);

    const runner = new CodexProcessRunner(env);
    const preflight = await runner.preflight();
    assert.equal(preflight.ready, true);
    assert.ok(preflight.checks.every(check => check.status === "PASS"));

    await writeJson(fixtures, "T010", researchBundle("codex_multi"));
    await writeJson(fixtures, "T020", storyBundle("codex_multi"));

    const agent2 = new Agent2RuntimeAdapterService(bootstrap, env);
    const first = await agent2.runNext("codex_multi");
    assert.equal("task_id" in first ? first.task_id : null, "T010");
    assert.equal("runtime_provider" in first ? first.runtime_provider : null, "CODEX_SESSION");

    const second = await agent2.runNext("codex_multi");
    assert.equal("task_id" in second ? second.task_id : null, "T020");
    assert.equal("runtime_provider" in second ? second.runtime_provider : null, "CODEX_SESSION");

    const workflow = new Agent1WorkflowOrchestratorService(bootstrap);
    const worker = new Agent2StoryAudioWorkerService(bootstrap);
    const characters = Array.from(scriptText);
    const starts = characters.map((_, index) => Number((index * 0.2).toFixed(3)));
    const ends = characters.map((_, index) => Number(((index + 1) * 0.2).toFixed(3)));
    const duration = ends.at(-1)!;

    await workflow.dispatch("codex_multi", "T030");
    await worker.executePayload("codex_multi", "T030", {
      schema_version: "1.0",
      project_id: "codex_multi",
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
    await workflow.complete("codex_multi", "T030");

    const status = await bootstrap.getStatus("codex_multi");
    const biblePin = status.resourcePins.find(pin =>
      pin.resourceType === "CHANNEL_VISUAL_BIBLE"
    );
    assert.ok(biblePin);

    await writeJson(fixtures, "T040", visualSpec("codex_multi", {
      resourceId: biblePin!.resourceId,
      version: biblePin!.version,
      contentHash: biblePin!.contentHash
    }));
    await writeJson(fixtures, "T050", stateSpec("codex_multi"));
    await writeJson(fixtures, "T060", clipSpec("codex_multi", duration));

    const agent3 = new Agent3RuntimeAdapterService(bootstrap, env);
    const result = await agent3.runAll("codex_multi");
    assert.deepEqual(
      result.steps.map(step => step.task_id),
      ["T040", "T050", "T060"]
    );
    assert.ok(result.steps.every(step => step.runtime_provider === "CODEX_SESSION"));
    assert.equal(result.handoff_task, "T070");

    const finalState = await workflow.status("codex_multi");
    assert.equal(finalState.tasks.find(task => task.task_id === "T060")?.status, "COMPLETE");
    assert.equal(finalState.tasks.find(task => task.task_id === "T070")?.status, "READY");

    const production = new ProductionSpecRepository(
      created.projectDbPath,
      { readonly: true }
    );
    try {
      assert.equal(
        production.getLatestGate("codex_multi", "GENERATION_READY_GATE")?.status,
        "PASS"
      );
    } finally {
      production.close();
    }

    const codexRuns = new CodexRuntimeRepository(
      created.projectDbPath,
      { readonly: true }
    );
    try {
      const runs = codexRuns.list("codex_multi");
      assert.deepEqual(
        runs.map(run => run.role_id),
        [
          "CODEX_2_STORY_AUDIO",
          "CODEX_2_STORY_AUDIO",
          "CODEX_3_VISUAL_PRODUCTION",
          "CODEX_3_VISUAL_PRODUCTION",
          "CODEX_3_VISUAL_PRODUCTION"
        ]
      );
      assert.deepEqual(
        runs.map(run => run.task_id),
        ["T010", "T020", "T040", "T050", "T060"]
      );
      assert.ok(runs.every(run => run.status === "COMPLETE"));
      assert.ok(runs.every(run => run.auth_status === "STORED_LOGIN_OK"));
      assert.equal(JSON.stringify(runs).includes("must-not-reach-codex-child"), false);
    } finally {
      codexRuns.close();
    }

    const auditOutput = path.join(
      created.projectRoot,
      "logs",
      "codex",
      "codex2-story-audio",
      "T010",
      "attempt_01",
      "output.json"
    );
    assert.equal((await stat(auditOutput)).isFile(), true);
    assert.match(await readFile(auditOutput, "utf8"), /research_spec/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex 1 produces an advisory revision directive without changing workflow state", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-codex-manager-"));
  const fixtures = path.join(root, "fixtures");
  await import("node:fs/promises").then(fs => fs.mkdir(fixtures, { recursive: true }));

  try {
    const bootstrap = new ProjectBootstrapService({
      repositoryRoot,
      workspaceRoot: path.join(root, "workspace")
    });
    const created = await bootstrap.createProject({
      projectId: "codex_manager",
      title: "Codex Manager",
      topic: "Codex Manager integration fixture",
      format: "shortform",
      targetDurationSec: 5,
      language: "ko"
    });

    await writeJson(fixtures, "MANAGER_REVIEW_T040", {
      schema_version: "1.0",
      verdict: "RETRY",
      root_cause: "The visual mode promoted a hypothesis into evidence.",
      revision_instruction: "Keep the same scene and fact refs but change factuality mode to hypothesis reconstruction.",
      preserve: ["scene_id", "fact_refs", "Visual Bible"]
    });

    const manager = new CodexManagerRuntimeService(
      bootstrap,
      runtimeEnv(fixtures)
    );
    const before = await new Agent1WorkflowOrchestratorService(bootstrap)
      .status("codex_manager");

    const review = await manager.reviewFailure({
      projectId: "codex_manager",
      taskId: "T040",
      attempt: 1,
      workerRole: "CODEX_3_VISUAL_PRODUCTION",
      errorCode: "VISUAL_FACTUALITY_CLASSIFICATION_MISMATCH",
      errorDetail: "Hypothesis cannot be emitted as EVIDENCE."
    });
    assert.equal(review.verdict, "RETRY");

    const directive = await manager.latestDirective("codex_manager", "T040");
    assert.match(directive ?? "", /change factuality mode/u);

    const after = await new Agent1WorkflowOrchestratorService(bootstrap)
      .status("codex_manager");
    assert.deepEqual(
      after.tasks.map(task => [task.task_id, task.status]),
      before.tasks.map(task => [task.task_id, task.status])
    );

    const repo = new CodexRuntimeRepository(
      created.projectDbPath,
      { readonly: true }
    );
    try {
      const runs = repo.list("codex_manager");
      assert.equal(runs.length, 1);
      assert.equal(runs[0]?.role_id, "CODEX_1_MANAGER");
      assert.equal(runs[0]?.task_id, "MANAGER_REVIEW:T040");
    } finally {
      repo.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("Codex role contracts block cross-agent tasks and unauthorized web search", async () => {
  const runner = new CodexProcessRunner({
    ...process.env,
    VPF_CODEX_COMMAND: process.execPath,
    VPF_CODEX_COMMAND_ARGS_JSON: JSON.stringify([fakeCodex])
  });
  const base = {
    projectId: "role_guard",
    projectRoot: "/tmp/unused",
    dbPath: "/tmp/unused.db",
    attempt: 1,
    instructions: ["test"],
    input: {},
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {}
    }
  };

  await assert.rejects(
    runner.execute({
      ...base,
      roleId: "CODEX_2_STORY_AUDIO",
      taskId: "T040",
      webSearchMode: "disabled"
    }),
    (error: unknown) =>
      error instanceof CodexRuntimeError &&
      error.code === "CODEX_ROLE_TASK_FORBIDDEN"
  );

  await assert.rejects(
    runner.execute({
      ...base,
      roleId: "CODEX_3_VISUAL_PRODUCTION",
      taskId: "T040",
      webSearchMode: "live"
    }),
    (error: unknown) =>
      error instanceof CodexRuntimeError &&
      error.code === "CODEX_ROLE_TASK_FORBIDDEN"
  );
});
