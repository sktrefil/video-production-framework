import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertNoSecretValues } from "@vpf/runtime-contracts";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { CodexRuntimeRepository } from "@vpf/storage/codex-runtime";
import { Agent3RuntimeRepository } from "@vpf/storage/agent3-runtime";
import { ProductionSpecRepository } from "@vpf/storage/production-spec";
import { Agent2StoryAudioWorkerService } from "../src/agent2-story-audio-service.js";
import { Agent2RuntimeAdapterError, Agent2RuntimeAdapterService } from "../src/agent2-runtime-adapter-service.js";
import { buildT050CodexInput, Agent3RuntimeAdapterService } from "../src/agent3-runtime-adapter-service.js";
import { CodexManagerRuntimeService } from "../src/codex-manager-runtime-service.js";
import { CodexProcessRunner, CodexRuntimeError } from "../src/codex-process-runner.js";
import { Agent1WorkflowOrchestratorService } from "../src/workflow-orchestrator-service.js";
import {
  ProductionProgressReporter,
  type ProductionProgressEvent
} from "../src/production-progress.js";

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

function researchBundle(
  projectId: string,
  topic = "로마 제9군단의 마지막 기록과 이후 행방"
) {
  return {
    research_spec: {
      schema_version: "1.0",
      project_id: projectId,
      topic,
      central_question: "제9군단의 마지막 운명은 무엇이었는가?",
      sources: [{
        source_id: "SRC_001",
        title: "Roman Ninth Legion research reference",
        source_type: "RESEARCH_INSTITUTE",
        url: "https://example.org/roman-ix",
        citation: "Roman Ninth Legion research reference",
        publisher: "Example Institute",
        published_at: "2026-01-01",
        notes: "integration fixture"
      }, {
        source_id: "SRC_002",
        title: "Roman Ninth Legion university reference",
        source_type: "UNIVERSITY",
        url: "https://example.edu/roman-ix",
        citation: "Roman Ninth Legion university reference",
        publisher: "Example University",
        published_at: "2026-01-02",
        notes: "independent integration fixture"
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
        source_refs: ["SRC_001", "SRC_002"],
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
    const progressEvents: ProductionProgressEvent[] = [];
    const progress = new ProductionProgressReporter(event => {
      progressEvents.push(event);
    });

    const runner = new CodexProcessRunner(env);
    const preflight = await runner.preflight();
    assert.equal(preflight.ready, true);
    assert.ok(preflight.checks.every(check => check.status === "PASS"));

    await writeJson(fixtures, "T010", researchBundle("codex_multi"));
    await writeJson(fixtures, "T020", storyBundle("codex_multi"));
    for (const taskId of ["T010", "T020", "T040", "T050", "T060"]) {
      await writeJson(fixtures, "MANAGER_SUCCESS_" + taskId, {
        schema_version: "1.0",
        verdict: "APPROVE",
        root_cause: "Deterministic-pass output is semantically coherent.",
        revision_instruction: "",
        preserve: ["validated upstream constraints"]
      });
    }

    const agent2 = new Agent2RuntimeAdapterService(bootstrap, env, progress);
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

    const agent3 = new Agent3RuntimeAdapterService(bootstrap, env, progress);
    const result = await agent3.runAll("codex_multi");
    assert.deepEqual(
      result.steps.map(step => step.task_id),
      ["T040", "T050", "T060"]
    );
    assert.ok(result.steps.every(step => step.runtime_provider === "CODEX_SESSION"));
    assert.equal(result.handoff_task, "T070");

    const progressKeys = progressEvents.map(event =>
      `${event.event}:${event.task_id ?? event.next_task ?? ""}`
    );
    for (const expected of [
      "TASK_STARTED:T010",
      "QC_STARTED:T010",
      "QC_COMPLETED:T010",
      "TASK_COMPLETED:T010",
      "TASK_STARTED:T020",
      "QC_STARTED:T020",
      "QC_COMPLETED:T020",
      "TASK_COMPLETED:T020",
      "TASK_STARTED:T040",
      "QC_STARTED:T040",
      "QC_COMPLETED:T040",
      "TASK_COMPLETED:T040",
      "TASK_STARTED:T050",
      "QC_STARTED:T050",
      "QC_COMPLETED:T050",
      "TASK_COMPLETED:T050",
      "TASK_STARTED:T060",
      "QC_STARTED:T060",
      "QC_COMPLETED:T060",
      "TASK_COMPLETED:T060",
      "HANDOFF:T070"
    ]) {
      assert.ok(progressKeys.includes(expected), `missing progress event ${expected}`);
    }
    assert.deepEqual(
      progressEvents.map(event => event.sequence),
      progressEvents.map((_, index) => index + 1)
    );
    assert.ok(progressEvents.some(event =>
      event.event === "TASK_PROGRESS" &&
      event.task_id === "T010" &&
      event.phase === "RUNTIME_EXECUTION" &&
      event.percent === 5
    ));
    assert.ok(progressEvents.some(event =>
      event.event === "TASK_PROGRESS" &&
      event.task_id === "T060" &&
      event.phase === "MANAGER_QC_COMPLETE" &&
      event.percent === 95
    ));
    assert.ok(progressEvents.some(event =>
      event.event === "TASK_PROGRESS" &&
      event.task_id === "T060" &&
      event.phase === "COMPLETE" &&
      event.percent === 100
    ));

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
      assert.equal(runs.length, 10);
      const expectedRuns = new Map([
        ["T010", "CODEX_2_STORY_AUDIO"],
        ["MANAGER_SUCCESS:T010", "CODEX_1_MANAGER"],
        ["T020", "CODEX_2_STORY_AUDIO"],
        ["MANAGER_SUCCESS:T020", "CODEX_1_MANAGER"],
        ["T040", "CODEX_3_VISUAL_PRODUCTION"],
        ["MANAGER_SUCCESS:T040", "CODEX_1_MANAGER"],
        ["T050", "CODEX_3_VISUAL_PRODUCTION"],
        ["MANAGER_SUCCESS:T050", "CODEX_1_MANAGER"],
        ["T060", "CODEX_3_VISUAL_PRODUCTION"],
        ["MANAGER_SUCCESS:T060", "CODEX_1_MANAGER"]
      ]);
      for (const [taskId, roleId] of expectedRuns) {
        const matching = runs.filter(run =>
          run.task_id === taskId && run.role_id === roleId
        );
        assert.equal(matching.length, 1, taskId + " should execute exactly once.");
      }
      assert.ok(runs.every(run => run.status === "COMPLETE"));
      assert.ok(runs.every(run => run.auth_status === "STORED_LOGIN_OK"));
      assert.equal(JSON.stringify(runs).includes("must-not-reach-codex-child"), false);
      const reviews = codexRuns.listManagerReviews("codex_multi");
      assert.equal(reviews.length, 5);
      assert.ok(reviews.every(review => review.review_kind === "SUCCESS"));
      assert.ok(reviews.every(review => review.verdict === "APPROVE"));
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

    const t010Request = path.join(
      created.projectRoot,
      "logs",
      "codex",
      "codex2-story-audio",
      "T010",
      "attempt_01",
      "request.json"
    );
    const t010RequestBytes = await readFile(t010Request);
    assert.equal(
      t010RequestBytes.some(byte => byte > 0x7f),
      false,
      "Codex request.json must remain ASCII-safe across native Windows shell boundaries."
    );
    const t010RequestPayload = JSON.parse(t010RequestBytes.toString("ascii")) as {
      topic: string;
    };
    assert.equal(
      t010RequestPayload.topic,
      "로마 제9군단의 마지막 기록과 이후 행방"
    );

    const unicodeFixture = {
      topic: "네안데르탈인은 왜 사라졌나 — 멸종이었는가, 현생인류와 섞였는가",
      sentinel: "표본비율 2.4–3.8%"
    };
    const unicodeSerialized = JSON.stringify(unicodeFixture);
    assert.equal(
      JSON.stringify(JSON.parse(unicodeSerialized)),
      unicodeSerialized,
      "Unicode fixture must remain JSON-round-trippable."
    );

    const successQcRequest = path.join(
      created.projectRoot,
      "logs",
      "codex",
      "codex1-manager",
      "MANAGER_SUCCESS_T010",
      "attempt_01",
      "request.json"
    );
    assert.equal((await stat(successQcRequest)).isFile(), true);
    const successQcRequestBytes = await readFile(successQcRequest);
    assert.equal(
      successQcRequestBytes.some(byte => byte > 0x7f),
      false,
      "Codex1 QC request.json must also remain ASCII-safe when it embeds Korean upstream artifacts."
    );
    const successQcPayload = successQcRequestBytes.toString("ascii");
    const successQcParsed = JSON.parse(successQcPayload) as {
      output_artifacts: {
        research_spec?: {
          central_question?: string;
        };
      };
    };
    assert.match(successQcPayload, /output_artifacts/u);
    assert.match(successQcPayload, /fact_check_spec/u);
    assert.match(successQcPayload, /deterministic_gate/u);
    assert.equal(
      successQcParsed.output_artifacts.research_spec?.central_question,
      "제9군단의 마지막 운명은 무엇이었는가?"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex visual review attaches actual local images to the initial exec message", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-codex-visual-input-"));
  const fixtures = path.join(root, "fixtures");
  const workspaceRoot = path.join(root, "workspace");
  await import("node:fs/promises").then(fs => fs.mkdir(fixtures, { recursive: true }));

  try {
    const bootstrap = new ProjectBootstrapService({
      repositoryRoot,
      workspaceRoot
    });
    const created = await bootstrap.createProject({
      projectId: "codex_visual_input",
      title: "Codex Visual Input",
      topic: "Visual input fixture",
      format: "shortform",
      targetDurationSec: 5,
      language: "ko"
    });
    const firstImage = path.join(root, "seed-1.png");
    const secondImage = path.join(root, "seed-2.png");
    await writeFile(firstImage, Buffer.from("seed-one"));
    await writeFile(secondImage, Buffer.from("seed-two"));
    await writeJson(fixtures, "MANAGER_VISUAL_TEST", {
      schema_version: "1.0",
      verdict: "PASS"
    });

    const runner = new CodexProcessRunner(runtimeEnv(fixtures));
    const result = await runner.execute<{schema_version:"1.0";verdict:"PASS"}>({
      projectId: "codex_visual_input",
      projectRoot: created.projectRoot,
      dbPath: created.projectDbPath,
      roleId: "CODEX_1_MANAGER",
      taskId: "MANAGER_VISUAL:TEST",
      attempt: 1,
      instructions: ["Inspect both attached images."],
      input: { expected_image_count: 2 },
      imagePaths: [firstImage, secondImage],
      outputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["schema_version", "verdict"],
        properties: {
          schema_version: { type: "string", enum: ["1.0"] },
          verdict: { type: "string", enum: ["PASS"] }
        }
      },
      webSearchMode: "disabled"
    });

    assert.equal(result.output.verdict, "PASS");
    assert.equal(
      (await stat(path.join(result.auditDirectory, "visual-input-01.png"))).isFile(),
      true
    );
    assert.equal(
      (await stat(path.join(result.auditDirectory, "visual-input-02.png"))).isFile(),
      true
    );
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
    assert.match(
      await manager.latestDirective("codex_manager", "T040", 2) ?? "",
      /change factuality mode/u
    );
    assert.equal(
      await manager.latestDirective("codex_manager", "T040", 3),
      null
    );

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


test("Codex1 verdicts drive Agent2 workflow state", async () => {
  const cases = [
    { verdict: "RETRY" as const, expectedStatus: "REVISION_REQUIRED" as const, directive: true },
    { verdict: "BLOCK" as const, expectedStatus: "BLOCKED" as const, directive: false },
    { verdict: "ESCALATE" as const, expectedStatus: "BLOCKED" as const, directive: false }
  ];

  for (const item of cases) {
    const root = await mkdtemp(path.join(
      tmpdir(),
      "vpf-codex-manager-verdict-" + item.verdict.toLowerCase() + "-"
    ));
    const fixtures = path.join(root, "fixtures");
    await import("node:fs/promises").then(fs => fs.mkdir(fixtures, { recursive: true }));

    try {
      const projectId = "codex_verdict_" + item.verdict.toLowerCase();
      const topic = "로마 제9군단의 마지막 기록과 이후 행방";
      const bootstrap = new ProjectBootstrapService({
        repositoryRoot,
        workspaceRoot: path.join(root, "workspace")
      });
      await bootstrap.createProject({
        projectId,
        title: "Codex verdict " + item.verdict,
        topic,
        format: "shortform",
        targetDurationSec: 5,
        language: "ko"
      });

      await writeJson(fixtures, "T010", {
        research_spec: {
          schema_version: "1.0",
          project_id: projectId,
          topic,
          central_question: "제9군단의 마지막 운명은 무엇이었는가?",
          sources: [{
            source_id: "SRC_001",
            title: "Roman Ninth Legion source one",
            source_type: "RESEARCH_INSTITUTE",
            url: "https://example.org/roman-ix",
            citation: "Source one",
            publisher: "Same Institute",
            published_at: "2026-01-01",
            notes: ""
          }, {
            source_id: "SRC_002",
            title: "Roman Ninth Legion source two",
            source_type: "UNIVERSITY",
            url: "https://example.edu/roman-ix",
            citation: "Source two",
            publisher: "Same Institute",
            published_at: "2026-01-02",
            notes: ""
          }],
          research_notes: []
        },
        fact_check_spec: {
          schema_version: "1.0",
          project_id: projectId,
          facts: [{
            fact_id: "FACT_001",
            statement_ko: "제9군단에 대한 기록이 존재한다.",
            statement_en: "",
            classification: "VERIFIED_FACT",
            confidence: "HIGH",
            source_refs: ["SRC_001", "SRC_002"],
            visualisation_note: "",
            uncertainty_note: ""
          }]
        }
      });

      await writeJson(fixtures, "MANAGER_REVIEW_T010", {
        schema_version: "1.0",
        verdict: item.verdict,
        root_cause: "The failed T010 bundle does not satisfy the independent-source policy.",
        revision_instruction:
          item.verdict === "RETRY"
            ? "Replace one source with an independent publisher and preserve the topic."
            : item.verdict === "BLOCK"
              ? "Do not retry until independent upstream evidence is available."
              : "A human must decide whether the available evidence is sufficient to continue.",
        preserve: ["project topic", "fact IDs"]
      });

      const env = runtimeEnv(fixtures);
      const runtime = new Agent2RuntimeAdapterService(bootstrap, env);

      await assert.rejects(runtime.runNext(projectId));

      const workflow = new Agent1WorkflowOrchestratorService(bootstrap);
      const state = await workflow.status(projectId);
      const task = state.tasks.find(row => row.task_id === "T010");
      assert.equal(task?.status, item.expectedStatus);
      assert.equal(task?.attempt, 1);
      assert.equal(
        state.tasks.find(row => row.task_id === "T020")?.status,
        "BLOCKED"
      );

      const manager = new CodexManagerRuntimeService(bootstrap, env);
      const directive = await manager.latestDirective(projectId, "T010");
      if (item.directive) {
        assert.match(directive ?? "", /independent publisher/u);
      } else {
        assert.equal(directive, null);
      }

      if (item.verdict === "BLOCK") {
        const blockedResult = await runtime.runNext(projectId);
        assert.equal("status" in blockedResult ? blockedResult.status : null, "BLOCKED");
        if ("status" in blockedResult && blockedResult.status === "BLOCKED") {
          assert.deepEqual(blockedResult.blocked_tasks, ["T010"]);
          assert.equal(blockedResult.handoff_task, null);
        }
      }

      if (item.verdict === "ESCALATE") {
        const blockedResult = await runtime.runNext(projectId);
        assert.equal("status" in blockedResult ? blockedResult.status : null, "BLOCKED");
        await workflow.requestRevision(projectId, "T010");
        const resumed = await workflow.status(projectId);
        assert.equal(
          resumed.tasks.find(row => row.task_id === "T010")?.status,
          "REVISION_REQUIRED"
        );
      }

      const codex = new CodexRuntimeRepository(
        (await bootstrap.getStatus(projectId)).projectDbPath,
        { readonly: true }
      );
      try {
        const reviews = codex.list(projectId).filter(
          run => run.role_id === "CODEX_1_MANAGER"
        );
        assert.equal(reviews.length, 1);
        assert.equal(reviews[0]?.task_id, "MANAGER_REVIEW:T010");
      } finally {
        codex.close();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});


test("stale Codex1 verdict cannot overwrite a newer task attempt", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-codex-stale-verdict-"));
  try {
    const bootstrap = new ProjectBootstrapService({
      repositoryRoot,
      workspaceRoot: path.join(root, "workspace")
    });
    await bootstrap.createProject({
      projectId: "codex_stale_verdict",
      title: "Codex stale verdict",
      topic: "stale verdict fixture",
      format: "shortform",
      targetDurationSec: 5,
      language: "ko"
    });

    const workflow = new Agent1WorkflowOrchestratorService(bootstrap);
    await workflow.dispatch("codex_stale_verdict", "T010");
    await workflow.requestRevision("codex_stale_verdict", "T010");
    await workflow.dispatch("codex_stale_verdict", "T010");

    const before = await workflow.status("codex_stale_verdict");
    assert.equal(
      before.tasks.find(task => task.task_id === "T010")?.attempt,
      2
    );
    assert.equal(
      before.tasks.find(task => task.task_id === "T010")?.status,
      "RUNNING"
    );

    await workflow.applyManagerVerdict(
      "codex_stale_verdict",
      "T010",
      1,
      "BLOCK"
    );

    const after = await workflow.status("codex_stale_verdict");
    assert.equal(
      after.tasks.find(task => task.task_id === "T010")?.attempt,
      2
    );
    assert.equal(
      after.tasks.find(task => task.task_id === "T010")?.status,
      "RUNNING"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("Codex1 success QC verdicts control deterministic-pass T010 completion", async () => {
  const cases = [
    { verdict: "APPROVE" as const, expected: "COMPLETE" as const, rejects: false },
    { verdict: "RETRY" as const, expected: "REVISION_REQUIRED" as const, rejects: true },
    { verdict: "BLOCK" as const, expected: "BLOCKED" as const, rejects: true },
    { verdict: "ESCALATE" as const, expected: "BLOCKED" as const, rejects: true }
  ];

  for (const item of cases) {
    const root = await mkdtemp(path.join(
      tmpdir(),
      "vpf-codex-success-qc-" + item.verdict.toLowerCase() + "-"
    ));
    const fixtures = path.join(root, "fixtures");
    await import("node:fs/promises").then(fs => fs.mkdir(fixtures, { recursive: true }));

    try {
      const projectId = "codex_success_" + item.verdict.toLowerCase();
      const topic = "로마 제9군단의 마지막 기록과 이후 행방";
      const bootstrap = new ProjectBootstrapService({
        repositoryRoot,
        workspaceRoot: path.join(root, "workspace")
      });
      const created = await bootstrap.createProject({
        projectId,
        title: "Codex success QC " + item.verdict,
        topic,
        format: "shortform",
        targetDurationSec: 5,
        language: "ko"
      });

      await writeJson(fixtures, "T010", researchBundle(projectId, topic));
      await writeJson(fixtures, "MANAGER_SUCCESS_T010", {
        schema_version: "1.0",
        verdict: item.verdict,
        root_cause:
          item.verdict === "APPROVE"
            ? "The deterministic-pass research is semantically coherent."
            : "The deterministic-pass research still needs manager-level correction.",
        revision_instruction:
          item.verdict === "APPROVE"
            ? ""
            : item.verdict === "RETRY"
              ? "Tighten the research explanation while preserving all validated facts and sources."
              : item.verdict === "BLOCK"
                ? "Do not continue until the upstream evidence package changes."
                : "Require a human editorial decision before continuing.",
        preserve: ["project topic", "validated source refs", "fact IDs"]
      });

      const env = runtimeEnv(fixtures);
      const runtime = new Agent2RuntimeAdapterService(bootstrap, env);

      if (item.rejects) {
        await assert.rejects(
          runtime.runNext(projectId),
          (error: unknown) =>
            error instanceof Agent2RuntimeAdapterError &&
            error.code === "AGENT2_MANAGER_QC_REJECTED"
        );
      } else {
        const result = await runtime.runNext(projectId);
        assert.equal("task_id" in result ? result.task_id : null, "T010");
      }

      const workflow = new Agent1WorkflowOrchestratorService(bootstrap);
      const state = await workflow.status(projectId);
      assert.equal(
        state.tasks.find(task => task.task_id === "T010")?.status,
        item.expected
      );
      assert.equal(
        state.tasks.find(task => task.task_id === "T020")?.status,
        item.verdict === "APPROVE" ? "READY" : "BLOCKED"
      );

      const codex = new CodexRuntimeRepository(created.projectDbPath, { readonly: true });
      try {
        const reviews = codex.listManagerReviews(projectId);
        assert.equal(reviews.length, 1);
        assert.equal(reviews[0]?.review_kind, "SUCCESS");
        assert.equal(reviews[0]?.verdict, item.verdict);
      } finally {
        codex.close();
      }

      const manager = new CodexManagerRuntimeService(bootstrap, env);
      const directive = await manager.latestDirective(projectId, "T010", 2);
      if (item.verdict === "RETRY") {
        assert.match(directive ?? "", /Tighten the research explanation/u);
      } else {
        assert.equal(directive, null);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});


test("Codex timeout terminates a nested process tree and records FAILED", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-codex-timeout-"));
  const fixtures = path.join(root, "fixtures");
  await import("node:fs/promises").then(fs => fs.mkdir(fixtures, { recursive: true }));
  try {
    const bootstrap = new ProjectBootstrapService({
      repositoryRoot,
      workspaceRoot: path.join(root, "workspace")
    });
    const created = await bootstrap.createProject({
      projectId: "codex_timeout_fixture",
      title: "Codex timeout fixture",
      topic: "timeout fixture",
      format: "shortform",
      targetDurationSec: 5,
      language: "ko"
    });
    const activities: Array<{
      runtimePid: number | null;
      elapsedMs: number;
      lastActivityAgeMs: number;
      timedOut: boolean;
    }> = [];
    const runner = new CodexProcessRunner({
      ...runtimeEnv(fixtures),
      VPF_FAKE_CODEX_HANG_TASK: "T040",
      VPF_CODEX_TIMEOUT_MS: "250",
      VPF_CODEX_HEARTBEAT_MS: "50"
    });
    const started = Date.now();
    await assert.rejects(
      runner.execute({
        projectId: "codex_timeout_fixture",
        projectRoot: created.projectRoot,
        dbPath: created.projectDbPath,
        roleId: "CODEX_3_VISUAL_PRODUCTION",
        taskId: "T040",
        attempt: 1,
        instructions: ["timeout regression fixture"],
        input: { project_id: "codex_timeout_fixture" },
        outputSchema: {
          type: "object",
          additionalProperties: false,
          required: [],
          properties: {}
        },
        webSearchMode: "disabled",
        onActivity: activity => {
          activities.push({
            runtimePid: activity.runtimePid,
            elapsedMs: activity.elapsedMs,
            lastActivityAgeMs: activity.lastActivityAgeMs,
            timedOut: activity.timedOut
          });
        }
      }),
      (error: unknown) =>
        error instanceof CodexRuntimeError &&
        error.code === "CODEX_EXEC_TIMEOUT" &&
        /CODEX_TIMEOUT/u.test(error.message)
    );
    assert.ok(Date.now() - started < 6000, "timeout must settle instead of hanging");
    assert.ok(activities.some(item => item.runtimePid !== null));
    assert.ok(activities.some(item => item.elapsedMs > 0));
    assert.ok(activities.some(item => item.timedOut));

    const repo = new CodexRuntimeRepository(created.projectDbPath, { readonly: true });
    try {
      const run = repo.list("codex_timeout_fixture").find(item => item.task_id === "T040");
      assert.equal(run?.status, "FAILED");
      assert.ok(run?.completed_at);
      assert.match(run?.stderr_excerpt ?? "", /CODEX_TIMEOUT/u);
    } finally {
      repo.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("T050 Codex input excludes script bodies, provenance, and provider profile", () => {
  const projectSpec = {
    schema_version: "1.0",
    project_id: "compact_t050",
    topic: "compact context",
    format: "LONGFORM",
    target_duration_sec: 600,
    resolution: { width: 1920, height: 1080 },
    language: "ko",
    generation_policy: {
      image_engine: "chatgpt",
      video_engine: "FLOW",
      supported_video_engines: ["FLOW"]
    },
    workflow: {
      agent1_manager_required: true,
      story_gate_required: true,
      visual_gate_required: true,
      clip_gate_required: true,
      final_gate_required: true
    }
  } as const;
  const timing = {
    schema_version: "1.0",
    project_id: "compact_t050",
    scenes: [{
      scene_id: "SCENE_01",
      script_ko: "긴 대본".repeat(2000),
      script_en: "long script ".repeat(2000),
      story_role: "HOOK",
      narrative_purpose_ko: "핵심 장면",
      narrative_purpose_en: "Core scene",
      estimated_duration_sec: 20,
      tts: { start_sec: 0, end_sec: 20, duration_sec: 20 },
      beats: [{
        beat_id: "BEAT_01",
        purpose_ko: "핵심 전환",
        purpose_en: "Core transition",
        start_sec: 0,
        end_sec: 20
      }],
      provenance: {
        script_id: "SCRIPT",
        script_revision: 1,
        script_sha256: "a".repeat(64),
        scene_revision: 1
      }
    }]
  } as const;
  const visual = {
    ...visualSpec("compact_t050", {
      resourceId: "BIBLE",
      version: "1.0.0",
      contentHash: "b".repeat(64)
    }),
    scenes: visualSpec("compact_t050", {
      resourceId: "BIBLE",
      version: "1.0.0",
      contentHash: "b".repeat(64)
    }).scenes.map(scene => ({
      ...scene,
      narrative_purpose_en: "English duplicate ".repeat(200),
      visual_intent_en: "English duplicate ".repeat(200),
      environment_en: "English duplicate ".repeat(200),
      subject_en: "English duplicate ".repeat(200),
      action_en: "English duplicate ".repeat(200),
      uncertainty_handling_en: "English duplicate ".repeat(200)
    }))
  };

  const full = JSON.stringify({
    project_id: "compact_t050",
    project_spec: projectSpec,
    scene_timing_spec: timing,
    scene_visual_spec: visual,
    provider_profile: { oversized: "provider metadata".repeat(500) },
    manager_revision_instruction: null
  });
  const buildInput = (sceneVisual: typeof visual) => buildT050CodexInput({
    projectId: "compact_t050",
    projectSpec: projectSpec as any,
    sceneTiming: timing as any,
    sceneVisual: sceneVisual as any,
    managerDirective: null
  });
  const legacyInput = buildInput(visual);
  assert.doesNotThrow(() => assertNoSecretValues(legacyInput));
  assert.deepEqual(legacyInput, JSON.parse(JSON.stringify(legacyInput)));
  const compact = JSON.stringify(legacyInput);
  assert.doesNotMatch(compact, /fantasy_mode/u);

  for (const mode of ["OFF", "RESTRAINED", "EDITORIAL", "HEIGHTENED"] as const) {
    const explicitInput = buildInput({
      ...visual,
      scenes: visual.scenes.map(scene => ({ ...scene, fantasy_mode: mode }))
    });
    assert.doesNotThrow(() => assertNoSecretValues(explicitInput));
    const serialized = JSON.parse(JSON.stringify(explicitInput));
    assert.deepEqual(explicitInput, serialized);
    assert.equal(serialized.scene_visual_spec.scenes[0].fantasy_mode, mode);
  }

  assert.ok(compact.length < full.length / 2);
  assert.doesNotMatch(compact, /script_ko|script_en|provenance|provider_profile/u);
  assert.match(compact, /duration_sec/u);
  assert.match(compact, /BEAT_01/u);
  assert.match(compact, /handoff/u);
  assert.match(compact, /continuity/u);
});

test("Agent3 fatal Codex failure path restores task to revision-required", async () => {
  const source = await readFile(
    path.join(repositoryRoot, "cli", "vpf", "src", "agent3-runtime-adapter-service.ts"),
    "utf8"
  );
  assert.match(
    source,
    /if \(!managerVerdictApplied\) \{\s*await this\.manager\.requestRevision\(projectId, taskId\);\s*\}/u
  );
  assert.match(
    source,
    /!codexFatal\(error\)/u
  );
});


test("T050 timeout restores workflow to REVISION_REQUIRED for a later production retry", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-t050-timeout-retry-"));
  const fixtures = path.join(root, "fixtures");
  await import("node:fs/promises").then(fs => fs.mkdir(fixtures, { recursive: true }));
  const projectId = "t050_timeout_retry";
  try {
    const bootstrap = new ProjectBootstrapService({
      repositoryRoot,
      workspaceRoot: path.join(root, "workspace")
    });
    const created = await bootstrap.createProject({
      projectId,
      title: "T050 timeout retry",
      topic: "로마 제9군단의 마지막 기록과 이후 행방",
      format: "shortform",
      targetDurationSec: 6,
      language: "ko"
    });
    const baseEnv = runtimeEnv(fixtures);
    await writeJson(fixtures, "T010", researchBundle(projectId));
    await writeJson(fixtures, "T020", storyBundle(projectId));
    for (const taskId of ["T010", "T020", "T040"]) {
      await writeJson(fixtures, "MANAGER_SUCCESS_" + taskId, {
        schema_version: "1.0",
        verdict: "APPROVE",
        root_cause: "Fixture output is coherent.",
        revision_instruction: "",
        preserve: ["validated upstream constraints"]
      });
    }

    const agent2 = new Agent2RuntimeAdapterService(bootstrap, baseEnv);
    await agent2.runNext(projectId);
    await agent2.runNext(projectId);

    const workflow = new Agent1WorkflowOrchestratorService(bootstrap);
    const worker = new Agent2StoryAudioWorkerService(bootstrap);
    const characters = Array.from(scriptText);
    const starts = characters.map((_, index) => Number((index * 0.2).toFixed(3)));
    const ends = characters.map((_, index) => Number(((index + 1) * 0.2).toFixed(3)));
    const duration = ends.at(-1)!;
    await workflow.dispatch(projectId, "T030");
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
    await workflow.complete(projectId, "T030");

    const status = await bootstrap.getStatus(projectId);
    const biblePin = status.resourcePins.find(pin =>
      pin.resourceType === "CHANNEL_VISUAL_BIBLE"
    );
    assert.ok(biblePin);
    await writeJson(fixtures, "T040", visualSpec(projectId, {
      resourceId: biblePin!.resourceId,
      version: biblePin!.version,
      contentHash: biblePin!.contentHash
    }));

    const agent3Normal = new Agent3RuntimeAdapterService(bootstrap, baseEnv);
    const t040 = await agent3Normal.runNext(projectId);
    assert.equal("task_id" in t040 ? t040.task_id : null, "T040");

    const progressEvents: ProductionProgressEvent[] = [];
    const timeoutProgress = new ProductionProgressReporter(event => {
      progressEvents.push(event);
    });
    const timeoutEnv = {
      ...baseEnv,
      VPF_FAKE_CODEX_HANG_TASK: "T050",
      VPF_CODEX_TIMEOUT_MS: "250",
      VPF_CODEX_HEARTBEAT_MS: "50"
    };
    const agent3Timeout = new Agent3RuntimeAdapterService(
      bootstrap,
      timeoutEnv,
      timeoutProgress
    );

    await assert.rejects(
      agent3Timeout.runNext(projectId),
      (error: unknown) =>
        error instanceof CodexRuntimeError &&
        error.code === "CODEX_EXEC_TIMEOUT"
    );

    const after = await workflow.status(projectId);
    const t050 = after.tasks.find(task => task.task_id === "T050");
    assert.equal(t050?.status, "REVISION_REQUIRED");
    assert.equal(t050?.attempt, 1);
    assert.equal(
      after.tasks.find(task => task.task_id === "T060")?.status,
      "BLOCKED"
    );

    const agent3Runs = new Agent3RuntimeRepository(
      created.projectDbPath,
      { readonly: true }
    );
    try {
      const run = agent3Runs.list(projectId)
        .filter(item => item.task_id === "T050")
        .at(-1);
      assert.equal(run?.status, "FAILED");
      assert.equal(run?.error_code, "CODEX_EXEC_TIMEOUT");
      assert.match(run?.error_detail ?? "", /CODEX_TIMEOUT/u);
    } finally {
      agent3Runs.close();
    }

    assert.ok(progressEvents.some(event =>
      event.event === "TASK_PROGRESS" &&
      event.task_id === "T050" &&
      event.phase === "RUNTIME_EXECUTION" &&
      (event.elapsed_sec ?? 0) > 0 &&
      event.runtime_pid !== null &&
      event.runtime_pid !== undefined
    ));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
