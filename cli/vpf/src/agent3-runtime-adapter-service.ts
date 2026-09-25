import { createHash } from "node:crypto";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectBootstrapService } from "@vpf/project-bootstrap";
import {
  FileSystemResourceRegistry,
  type ChannelVisualBiblePayload,
  type ProviderProfilePayload,
  type ResourcePin
} from "@vpf/resource-registry";
import {
  getAgent3TaskInstruction,
  type Agent2FactCheckSpec,
  type Agent2StorySpec,
  type Agent3T060Input,
  type Agent3TaskExecutionResult,
  type ClipProductionDocument,
  type ProjectSpec,
  type SceneTimingDocument,
  type SceneVisualDocument,
  type StateImageDocument
} from "@vpf/production-spec";
import { Agent2StoryAudioRepository } from "@vpf/storage/agent2-story-audio";
import { Agent3RuntimeRepository } from "@vpf/storage/agent3-runtime";
import { Agent3VisualProductionRepository } from "@vpf/storage/agent3-visual-production";
import { ProductionSpecRepository } from "@vpf/storage/production-spec";
import {
  Agent1WorkflowOrchestratorService
} from "./workflow-orchestrator-service.js";
import { CodexProcessRunner, CodexRuntimeError } from "./codex-process-runner.js";
import { CodexManagerRuntimeService } from "./codex-manager-runtime-service.js";
import {
  Agent3VisualProductionError,
  Agent3VisualProductionWorkerService
} from "./agent3-visual-production-service.js";
import { ProductionProgressReporter } from "./production-progress.js";
import {
  AGENT3_CLIP_CAMERA_SCHEMA,
  AGENT3_SCENE_VISUAL_SCHEMA,
  AGENT3_STATE_IMAGE_SCHEMA
} from "./agent3-runtime-schemas.js";

const DEFAULT_REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../..", import.meta.url))
);

type Agent3RuntimeTaskId = "T040" | "T050" | "T060";

interface OpenAiResponseEnvelope {
  id?: string;
  status?: string;
  output?: unknown[];
  error?: { message?: string };
}

interface RuntimeStepResult {
  task_id: Agent3RuntimeTaskId;
  runtime_provider: string;
  runtime_model: string;
  worker: Agent3TaskExecutionResult;
  gate_status: string;
}

export class Agent3RuntimeAdapterError extends Error {
  constructor(
    public readonly code:
      | "AGENT3_RUNTIME_SECRET_MISSING"
      | "AGENT3_RUNTIME_HTTP"
      | "AGENT3_RUNTIME_RESPONSE_INVALID"
      | "AGENT3_RUNTIME_TASK_UNAVAILABLE"
      | "AGENT3_RUNTIME_PREREQUISITE"
      | "AGENT3_RUNTIME_PROJECT_UPGRADE_REQUIRED"
      | "AGENT3_RUNTIME_RETRY_EXHAUSTED"
      | "AGENT3_RUNTIME_CORE_REJECTED"
      | "AGENT3_MANAGER_QC_REJECTED",
    message: string
  ) {
    super(message);
    this.name = "Agent3RuntimeAdapterError";
  }
}

const sha256Text = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

type Agent3AiRuntimeMode = "CODEX_SESSION" | "OPENAI_API";

function agent3AiRuntimeMode(environment: NodeJS.ProcessEnv): Agent3AiRuntimeMode {
  const value = (environment.VPF_AI_RUNTIME_MODE ?? "CODEX_SESSION").trim().toUpperCase();
  if (value === "CODEX_SESSION" || value === "OPENAI_API") return value;
  throw new Agent3RuntimeAdapterError(
    "AGENT3_RUNTIME_RESPONSE_INVALID",
    "VPF_AI_RUNTIME_MODE must be CODEX_SESSION or OPENAI_API."
  );
}

function codexFatal(error: unknown): boolean {
  return error instanceof CodexRuntimeError && [
    "CODEX_CLI_MISSING",
    "CODEX_LOGIN_REQUIRED",
    "CODEX_CAPABILITY_MISSING",
    "CODEX_EXEC_TIMEOUT",
    "CODEX_EXEC_FAILED",
    "CODEX_OUTPUT_MISSING"
  ].includes(error.code);
}


function extractOutputText(response: OpenAiResponseEnvelope): string {
  const texts: string[] = [];
  for (const item of response.output ?? []) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (record.type !== "message" || !Array.isArray(record.content)) continue;
    for (const part of record.content) {
      if (typeof part !== "object" || part === null) continue;
      const value = part as Record<string, unknown>;
      if (value.type === "output_text" && typeof value.text === "string") {
        texts.push(value.text);
      }
    }
  }
  return texts.join("").trim();
}

function parseStructuredJson<T>(response: OpenAiResponseEnvelope): T {
  const text = extractOutputText(response);
  if (!text) {
    throw new Agent3RuntimeAdapterError(
      "AGENT3_RUNTIME_RESPONSE_INVALID",
      "OpenAI response did not contain structured output text."
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Agent3RuntimeAdapterError(
      "AGENT3_RUNTIME_RESPONSE_INVALID",
      "OpenAI structured output was not valid JSON."
    );
  }
}

function errorCode(error: unknown): string {
  if (
    error instanceof Agent3RuntimeAdapterError ||
    error instanceof Agent3VisualProductionError
  ) {
    return error.code;
  }
  return "AGENT3_RUNTIME_UNEXPECTED";
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizedSceneVisual(
  value: SceneVisualDocument,
  projectId: string,
  visualBible: {
    resource_id: string;
    version: string;
    content_hash: string;
  }
): SceneVisualDocument {
  return {
    ...value,
    schema_version: "1.0",
    project_id: projectId,
    visual_bible: visualBible,
    scenes: value.scenes.map(scene => ({
      ...scene,
      fact_refs: [...scene.fact_refs]
    }))
  };
}

function normalizedStateImages(
  value: StateImageDocument,
  projectId: string
): StateImageDocument {
  return {
    ...value,
    schema_version: "1.0",
    project_id: projectId,
    state_images: value.state_images.map(item => ({ ...item }))
  };
}

function normalizedClipInput(
  value: Agent3T060Input,
  projectId: string
): Agent3T060Input {
  const clips: ClipProductionDocument = {
    ...value.clip_production_spec,
    schema_version: "1.0",
    project_id: projectId,
    clips: value.clip_production_spec.clips.map(clip => ({
      ...clip,
      generation_duration_sec: null,
      safe_trim_start_sec: clip.editorial_duration_sec
    }))
  };
  return {
    schema_version: "1.0",
    project_id: projectId,
    clip_production_spec: clips
  };
}

class OpenAiAgent3Runtime {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(
    profile: { model: string },
    private readonly environment: NodeJS.ProcessEnv = process.env
  ) {
    this.apiKey = (environment.OPENAI_API_KEY ?? "").trim();
    const override = (environment.VPF_AGENT3_OPENAI_MODEL ?? "").trim();
    if (override && override !== profile.model) {
      throw new Agent3RuntimeAdapterError(
        "AGENT3_RUNTIME_RESPONSE_INVALID",
        "VPF_AGENT3_OPENAI_MODEL=" + override +
          " does not match pinned provider model " + profile.model + "."
      );
    }
    this.model = profile.model.trim();
    this.baseUrl = (
      environment.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1"
    ).replace(/\/+$/u, "");
    this.timeoutMs = Number(
      environment.VPF_AGENT3_OPENAI_TIMEOUT_MS ?? 180000
    );
    this.retries = Number(
      environment.VPF_AGENT3_OPENAI_RETRIES ?? 2
    );

    if (!this.apiKey) {
      throw new Agent3RuntimeAdapterError(
        "AGENT3_RUNTIME_SECRET_MISSING",
        "OPENAI_API_KEY is required for Agent3 T040/T050/T060."
      );
    }
    if (!this.model) {
      throw new Agent3RuntimeAdapterError(
        "AGENT3_RUNTIME_RESPONSE_INVALID",
        "Pinned Agent3 OpenAI model must not be empty."
      );
    }
    if (
      !Number.isFinite(this.timeoutMs) ||
      this.timeoutMs <= 0 ||
      !Number.isInteger(this.retries) ||
      this.retries < 0 ||
      this.retries > 5
    ) {
      throw new Agent3RuntimeAdapterError(
        "AGENT3_RUNTIME_RESPONSE_INVALID",
        "Invalid Agent3 OpenAI timeout/retry configuration."
      );
    }
  }

  get modelId(): string {
    return this.model;
  }

  async sceneVisual(input: {
    projectId: string;
    projectSpec: ProjectSpec;
    sceneTiming: SceneTimingDocument;
    story: Agent2StorySpec;
    facts: Agent2FactCheckSpec;
    visualBiblePin: {
      resource_id: string;
      version: string;
      content_hash: string;
    };
    visualBible: ChannelVisualBiblePayload;
    revisionFeedback: string | null;
  }): Promise<{
    responseId: string | null;
    value: SceneVisualDocument;
  }> {
    const instruction = getAgent3TaskInstruction("T040");
    const response = await this.request({
      name: "agent3_scene_visual_spec",
      schema: AGENT3_SCENE_VISUAL_SCHEMA,
      developer: [
        "You are Agent 3 Visual Scene Planning Worker in a production pipeline.",
        ...instruction.rules,
        "Return one Scene Visual plan for every Scene Timing scene, in the same order.",
        "Copy each Story Scene fact_refs exactly. Never invent or remove a fact reference.",
        "Map factuality conservatively. For mixed fact_refs use the least-certain applicable class in this priority: any LEGEND => LEGEND_RECONSTRUCTION; else any HYPOTHESIS => HYPOTHESIS_RECONSTRUCTION; else any EDITORIAL_RECONSTRUCTION => EDITORIAL_FANTASY_RECONSTRUCTION; else any LIKELY_INTERPRETATION => HISTORICAL_RECONSTRUCTION or HYPOTHESIS_RECONSTRUCTION; otherwise VERIFIED_FACT may be EVIDENCE or HISTORICAL_RECONSTRUCTION.",
        "Visual Bible is the show-level authority. Do not replace it with a new style.",
        "Fantasy visual language may express atmosphere and reconstruction, but must not convert uncertainty into factual evidence.",
        "Handoff preserve_elements must contain two to four concrete continuity elements.",
        "English fields may be concise translations, but Korean fields must remain production-usable.",
        "If revision_feedback is present, correct those exact validation failures while preserving approved upstream meaning."
      ],
      user: {
        project_id: input.projectId,
        project_spec: input.projectSpec,
        scene_timing_spec: input.sceneTiming,
        story_spec: input.story,
        fact_check_spec: input.facts,
        visual_bible_pin: input.visualBiblePin,
        visual_bible_payload: input.visualBible,
        revision_feedback: input.revisionFeedback
      }
    });
    return {
      responseId: typeof response.id === "string" ? response.id : null,
      value: normalizedSceneVisual(
        parseStructuredJson<SceneVisualDocument>(response),
        input.projectId,
        input.visualBiblePin
      )
    };
  }

  async stateImages(input: {
    projectId: string;
    projectSpec: ProjectSpec;
    sceneTiming: SceneTimingDocument;
    sceneVisual: SceneVisualDocument;
    revisionFeedback: string | null;
  }): Promise<{
    responseId: string | null;
    value: StateImageDocument;
  }> {
    const instruction = getAgent3TaskInstruction("T050");
    const response = await this.request({
      name: "agent3_state_image_spec",
      schema: AGENT3_STATE_IMAGE_SCHEMA,
      developer: [
        "You are Agent 3 State Image Planning Worker in a production pipeline.",
        ...instruction.rules,
        "Create one ordered state ladder per Scene: exactly one ENTRY, zero or more MID, exactly one TARGET.",
        "Use IDs that are globally unique and stable, for example SCENE_01_STATE_01_ENTRY.",
        "ENTRY handoff_anchor must exactly equal the Scene Visual handoff.entry_anchor.",
        "TARGET handoff_anchor must exactly equal the Scene Visual handoff.exit_anchor.",
        "MID handoff anchors should be concrete visual states that can become the previous Clip target and next Clip entry.",
        "For SHORTS, design enough states to support roughly 4–5 second editorial Clips when useful.",
        "For LONGFORM, design enough states to support roughly 5–8 second editorial Clips when useful.",
        "Any Scene longer than 10 seconds must have enough sequential states to permit multiple Clips of at most 10 seconds.",
        "Prefer the minimum number of states that can carry the narrative clearly. Do not add novelty-only states.",
        "Every State Image must be video-ready: layered depth, complete physical relationships, and one continuable motion vector.",
        "Use only Beat IDs that exist in the Scene Timing input, or null when the state is scene-level.",
        "If revision_feedback is present, correct those exact validation failures without changing approved Scene Visual meaning."
      ],
      user: {
        project_id: input.projectId,
        project_spec: input.projectSpec,
        scene_timing_spec: input.sceneTiming,
        scene_visual_spec: input.sceneVisual,
        revision_feedback: input.revisionFeedback
      }
    });
    return {
      responseId: typeof response.id === "string" ? response.id : null,
      value: normalizedStateImages(
        parseStructuredJson<StateImageDocument>(response),
        input.projectId
      )
    };
  }

  async clipCamera(input: {
    projectId: string;
    projectSpec: ProjectSpec;
    sceneTiming: SceneTimingDocument;
    sceneVisual: SceneVisualDocument;
    states: StateImageDocument;
    revisionFeedback: string | null;
  }): Promise<{
    responseId: string | null;
    value: Agent3T060Input;
  }> {
    const instruction = getAgent3TaskInstruction("T060");
    const response = await this.request({
      name: "agent3_clip_camera_spec",
      schema: AGENT3_CLIP_CAMERA_SCHEMA,
      developer: [
        "You are Agent 3 Clip and Camera Planning Worker in a production pipeline.",
        ...instruction.rules,
        "Use actual measured scene_timing_spec.scenes[].tts.duration_sec. Never use estimated_duration_sec for clip duration allocation.",
        "For every Scene, the sum of editorial_duration_sec across its Clips must equal that Scene's measured TTS duration to within 0.01 sec.",
        "No Clip may exceed 10 seconds. Prefer about 4–5 seconds for SHORTS and 5–8 seconds for LONGFORM, but narrative beats and available state transitions have priority.",
        "Within a Scene, adjacent Clips must form a state chain: previous target state ID must exactly equal next entry state ID.",
        "Use only State Image IDs supplied in state_image_spec.",
        "A Clip entry state must precede its target state by sequence_order; MID, when used, must lie strictly between them.",
        "Use generation_duration_sec=null because the generation provider is not selected at this planning stage.",
        "Set safe_trim_start_sec equal to editorial_duration_sec.",
        "All mandatory core-point windows are clip-local seconds, non-overlapping, after start_handle_sec, and finish no later than narrative_deadline_sec.",
        "Core-point cap: duration <=3 sec: 1; >3 and <=5 sec: at most 2; >5 and <=10 sec: at most 3.",
        "narrative_deadline_sec must be before target_state_deadline_sec or equal to it, and target_state_deadline_sec must be before editorial end. Normally place narrative completion around 80–90 percent of editorial duration unless the beat requires an earlier completion.",
        "end_hold_sec must fit entirely after target_state_deadline_sec.",
        "Camera purpose must explain narrative intent. Avoid four adjacent Clips with the same movement, same shot-size pattern, or same transition.",
        "Use varied transitions such as HARD_CUT, MATCH_CUT, MOTION_MATCH, GRAPHIC_MATCH, FOREGROUND_WIPE, ENVIRONMENT_OCCLUSION, LIGHT_TRANSITION, STATIC_BREAK.",
        "Do not output prompts. The deterministic Prompt Compiler runs after this plan passes Core validation.",
        "If revision_feedback is present, correct those exact validation failures while preserving approved timing and visual meaning."
      ],
      user: {
        project_id: input.projectId,
        project_spec: input.projectSpec,
        scene_timing_spec: input.sceneTiming,
        scene_visual_spec: input.sceneVisual,
        state_image_spec: input.states,
        revision_feedback: input.revisionFeedback
      }
    });
    return {
      responseId: typeof response.id === "string" ? response.id : null,
      value: normalizedClipInput(
        parseStructuredJson<Agent3T060Input>(response),
        input.projectId
      )
    };
  }

  private async request(input: {
    name: string;
    schema: unknown;
    developer: string[];
    user: unknown;
  }): Promise<OpenAiResponseEnvelope> {
    const body = {
      model: this.model,
      store: false,
      reasoning: { effort: "high" },
      input: [
        {
          role: "developer",
          content: [{
            type: "input_text",
            text: input.developer.join("\n")
          }]
        },
        {
          role: "user",
          content: [{
            type: "input_text",
            text: JSON.stringify(input.user)
          }]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: input.name,
          strict: true,
          schema: input.schema
        }
      }
    };

    let lastError: unknown = null;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(this.baseUrl + "/responses", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + this.apiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        const raw = await response.text();
        let parsed: OpenAiResponseEnvelope;
        try {
          parsed = JSON.parse(raw) as OpenAiResponseEnvelope;
        } catch {
          throw new Agent3RuntimeAdapterError(
            "AGENT3_RUNTIME_RESPONSE_INVALID",
            "OpenAI returned non-JSON HTTP " + response.status + "."
          );
        }

        if (response.ok && parsed.status === "completed") {
          return parsed;
        }

        const detail = parsed.error?.message ??
          "OpenAI Responses API HTTP " + response.status +
          " status=" + String(parsed.status);
        if (
          (response.status === 429 || response.status >= 500) &&
          attempt < this.retries
        ) {
          lastError = new Agent3RuntimeAdapterError(
            "AGENT3_RUNTIME_HTTP",
            detail
          );
          await new Promise(resolve =>
            setTimeout(resolve, Math.min(1000 * 2 ** attempt, 4000))
          );
          continue;
        }
        throw new Agent3RuntimeAdapterError(
          "AGENT3_RUNTIME_HTTP",
          detail
        );
      } catch (error) {
        lastError = error;
        if (error instanceof Agent3RuntimeAdapterError) throw error;
        if (attempt >= this.retries) {
          throw new Agent3RuntimeAdapterError(
            "AGENT3_RUNTIME_HTTP",
            errorDetail(error)
          );
        }
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Agent3RuntimeAdapterError(
          "AGENT3_RUNTIME_HTTP",
          "OpenAI request failed."
        );
  }
}

async function resolvePinnedCodexVisualProfile(
  pins: ResourcePin[]
): Promise<ResourcePin> {
  const pin = pins.find(item =>
    item.resourceType === "PROVIDER_PROFILE" &&
    item.resourceId === "CODEX_VISUAL_PRODUCTION_V1"
  );
  if (!pin) {
    throw new Agent3RuntimeAdapterError(
      "AGENT3_RUNTIME_PREREQUISITE",
      "Pinned CODEX_VISUAL_PRODUCTION_V1 profile is missing."
    );
  }
  const registry = new FileSystemResourceRegistry(
    path.join(DEFAULT_REPOSITORY_ROOT, "resources")
  );
  const snapshot = await registry.resolvePinned<ProviderProfilePayload>(pin);
  if (
    snapshot.payload.provider !== "CODEX_SESSION" ||
    snapshot.payload.executionMode !== "AUTOMATED"
  ) {
    throw new Agent3RuntimeAdapterError(
      "AGENT3_RUNTIME_PREREQUISITE",
      "CODEX_VISUAL_PRODUCTION_V1 must be an AUTOMATED CODEX_SESSION profile."
    );
  }
  return pin;
}

async function resolvePinnedAgent3Profile(
  pins: ResourcePin[]
): Promise<{
  model: string;
  pin: ResourcePin;
}> {
  const pin = pins.find(item =>
    item.resourceType === "PROVIDER_PROFILE" &&
    item.resourceId === "OPENAI_AGENT3_VISUAL_V1"
  );
  if (!pin) {
    throw new Agent3RuntimeAdapterError(
      "AGENT3_RUNTIME_PREREQUISITE",
      "Pinned OpenAI Agent3 provider profile is missing. Agent3 automatic runtime requires HISTORY_MYSTERY_V1@1.7.0 or an explicit equivalent pin."
    );
  }

  const registry = new FileSystemResourceRegistry(
    path.join(DEFAULT_REPOSITORY_ROOT, "resources")
  );
  const snapshot = await registry.resolvePinned<ProviderProfilePayload>(pin);
  if (
    snapshot.payload.provider !== "OPENAI" ||
    snapshot.payload.executionMode !== "AUTOMATED" ||
    typeof snapshot.payload.model !== "string" ||
    !snapshot.payload.model.trim()
  ) {
    throw new Agent3RuntimeAdapterError(
      "AGENT3_RUNTIME_PREREQUISITE",
      "Pinned Agent3 provider profile is not an AUTOMATED OPENAI model profile."
    );
  }
  return {
    model: snapshot.payload.model.trim(),
    pin
  };
}

async function resolvePinnedVisualBible(
  pins: ResourcePin[]
): Promise<{
  pin: {
    resource_id: string;
    version: string;
    content_hash: string;
  };
  payload: ChannelVisualBiblePayload;
}> {
  const pin = pins.find(item =>
    item.resourceType === "CHANNEL_VISUAL_BIBLE"
  );
  if (!pin) {
    throw new Agent3RuntimeAdapterError(
      "AGENT3_RUNTIME_PREREQUISITE",
      "Pinned Channel Visual Bible is missing."
    );
  }
  const registry = new FileSystemResourceRegistry(
    path.join(DEFAULT_REPOSITORY_ROOT, "resources")
  );
  const snapshot = await registry.resolvePinned<ChannelVisualBiblePayload>(pin);
  return {
    pin: {
      resource_id: snapshot.resourceId,
      version: snapshot.version,
      content_hash: snapshot.contentHash
    },
    payload: snapshot.payload
  };
}

export class Agent3RuntimeAdapterService {
  private readonly manager: Agent1WorkflowOrchestratorService;
  private readonly worker: Agent3VisualProductionWorkerService;
  private readonly codexManager: CodexManagerRuntimeService;
  private readonly codexRunner: CodexProcessRunner;

  constructor(
    private readonly projects: ProjectBootstrapService,
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly progress: ProductionProgressReporter = new ProductionProgressReporter()
  ) {
    this.manager = new Agent1WorkflowOrchestratorService(projects);
    this.worker = new Agent3VisualProductionWorkerService(projects);
    this.codexManager = new CodexManagerRuntimeService(projects, environment);
    this.codexRunner = new CodexProcessRunner(environment);
  }

  async runNext(
    projectId: string
  ): Promise<
    RuntimeStepResult |
    {
      project_id: string;
      handoff_task: string | null;
      status: "HANDOFF";
    }
  > {
    await this.assertRuntimeProjectCurrent(projectId);
    const state = await this.manager.status(projectId);
    const next = state.tasks.find(task =>
      task.assigned_agent === "AGENT3_VISUAL_PRODUCTION" &&
      (task.status === "READY" || task.status === "REVISION_REQUIRED") &&
      ["T040", "T050", "T060"].includes(task.task_id)
    ) ?? null;

    if (next === null) {
      return {
        project_id: projectId,
        handoff_task: state.next_task?.task_id ?? null,
        status: "HANDOFF"
      };
    }

    const taskId = next.task_id as Agent3RuntimeTaskId;
    const dispatch = await this.manager.dispatch(
      projectId,
      taskId,
      "AGENT3_VISUAL_PRODUCTION"
    );
    await this.progress.emit({
      event: "TASK_STARTED",
      project_id: projectId,
      task_id: taskId,
      agent: "AGENT3_VISUAL_PRODUCTION",
      attempt: dispatch.attempt
    });
    try {
      const runtime = await this.executeDispatched(
        projectId,
        taskId,
        dispatch.attempt
      );

      if (agent3AiRuntimeMode(this.environment) === "CODEX_SESSION") {
        const gate = await this.manager.evaluateCompletionGate(projectId, taskId);
        if (gate.status !== "PASS") {
          throw new Agent3RuntimeAdapterError(
            "AGENT3_RUNTIME_CORE_REJECTED",
            `${gate.gate} rejected ${taskId} before Codex1 success QC.`
          );
        }
        await this.progress.emit({
          event: "QC_STARTED",
          project_id: projectId,
          task_id: taskId,
          agent: "CODEX_1_MANAGER",
          attempt: dispatch.attempt,
          qc_kind: "SUCCESS",
          phase: "CODEX1_SUCCESS_QC"
        });
        const review = await this.codexManager.reviewSuccess({
          projectId,
          taskId,
          attempt: dispatch.attempt,
          workerRole: "CODEX_3_VISUAL_PRODUCTION",
          gateStatus: "PASS",
          gateId: gate.gate,
          warnings: runtime.worker.warnings
        });
        await this.progress.emit({
          event: "QC_COMPLETED",
          project_id: projectId,
          task_id: taskId,
          agent: "CODEX_1_MANAGER",
          attempt: dispatch.attempt,
          qc_kind: "SUCCESS",
          verdict: review.verdict,
          phase: "CODEX1_SUCCESS_QC"
        });
        if (review.verdict !== "APPROVE") {
          await this.manager.applyManagerVerdict(
            projectId,
            taskId,
            dispatch.attempt,
            review.verdict
          );
          throw new Agent3RuntimeAdapterError(
            "AGENT3_MANAGER_QC_REJECTED",
            `Codex1 success QC returned ${review.verdict} for ${taskId}: ${review.root_cause}`
          );
        }
      }

      const completed = await this.manager.complete(projectId, taskId);
      await this.progress.emit({
        event: "TASK_COMPLETED",
        project_id: projectId,
        task_id: taskId,
        agent: "AGENT3_VISUAL_PRODUCTION",
        attempt: dispatch.attempt,
        message: `${taskId} completed with ${completed.last_gate_status ?? "PASS"}.`
      });
      return {
        task_id: taskId,
        runtime_provider: runtime.provider,
        runtime_model: runtime.model,
        worker: runtime.worker,
        gate_status: completed.last_gate_status ?? "PASS"
      };
    } catch (error) {
      if (
        error instanceof Agent3RuntimeAdapterError &&
        error.code === "AGENT3_MANAGER_QC_REJECTED"
      ) {
        throw error;
      }
      let managerVerdictApplied = false;
      if (
        agent3AiRuntimeMode(this.environment) === "CODEX_SESSION" &&
        !codexFatal(error)
      ) {
        try {
          await this.progress.emit({
            event: "QC_STARTED",
            project_id: projectId,
            task_id: taskId,
            agent: "CODEX_1_MANAGER",
            attempt: dispatch.attempt,
            qc_kind: "FAILURE",
            phase: "CODEX1_FAILURE_REVIEW"
          });
          const review = await this.codexManager.reviewFailure({
            projectId,
            taskId,
            attempt: dispatch.attempt,
            workerRole: "CODEX_3_VISUAL_PRODUCTION",
            errorCode:
              error instanceof Agent3RuntimeAdapterError
                ? error.code
                : error instanceof Agent3VisualProductionError
                  ? error.code
                  : error instanceof CodexRuntimeError
                    ? error.code
                    : "AGENT3_RUNTIME_FAILURE",
            errorDetail: errorDetail(error)
          });
          await this.progress.emit({
            event: "QC_COMPLETED",
            project_id: projectId,
            task_id: taskId,
            agent: "CODEX_1_MANAGER",
            attempt: dispatch.attempt,
            qc_kind: "FAILURE",
            verdict: review.verdict,
            phase: "CODEX1_FAILURE_REVIEW"
          });
          await this.manager.applyManagerVerdict(
            projectId,
            taskId,
            dispatch.attempt,
            review.verdict
          );
          managerVerdictApplied = true;
        } catch {
          // Fail closed to deterministic revision handling if Codex 1 review cannot be applied.
        }
      }
      if (!managerVerdictApplied) {
        await this.manager.requestRevision(projectId, taskId);
      }
      throw error;
    }
  }

  async runAll(projectId: string): Promise<{
    project_id: string;
    steps: RuntimeStepResult[];
    handoff_task: string | null;
    handoff_agent: string | null;
  }> {
    await this.assertRuntimeProjectCurrent(projectId);
    const steps: RuntimeStepResult[] = [];
    let guard = 0;

    while (guard < 12) {
      guard += 1;
      const state = await this.manager.status(projectId);
      const next = state.tasks.find(task =>
        task.assigned_agent === "AGENT3_VISUAL_PRODUCTION" &&
        (task.status === "READY" || task.status === "REVISION_REQUIRED") &&
        ["T040", "T050", "T060"].includes(task.task_id)
      ) ?? null;

      if (next === null) break;

      try {
        const result = await this.runNext(projectId);
        if ("status" in result) break;
        steps.push(result);
      } catch (error) {
        const after = await this.manager.status(projectId);
        const task = after.tasks.find(item => item.task_id === next.task_id);
        const retryable =
          task?.status === "REVISION_REQUIRED" &&
          (task.attempt ?? 0) < 3 &&
          errorCode(error) !== "AGENT3_RUNTIME_SECRET_MISSING" &&
          errorCode(error) !== "AGENT3_RUNTIME_PROJECT_UPGRADE_REQUIRED" &&
          errorCode(error) !== "AGENT3_RUNTIME_PREREQUISITE" &&
          !codexFatal(error);
        if (retryable) {
          await this.progress.emit({
            event: "TASK_RETRY",
            project_id: projectId,
            task_id: next.task_id,
            agent: "AGENT3_VISUAL_PRODUCTION",
            ...(task === undefined ? {} : { attempt: task.attempt }),
            message: errorDetail(error)
          });
          continue;
        }
        throw error;
      }
    }

    const handoff = await this.manager.next(projectId);
    if (handoff !== null) {
      await this.progress.emit({
        event: "HANDOFF",
        project_id: projectId,
        next_task: handoff.task_id,
        next_agent: handoff.assigned_agent,
        message: `Agent3 handed production to ${handoff.assigned_agent} at ${handoff.task_id}.`
      });
    }
    return {
      project_id: projectId,
      steps,
      handoff_task: handoff?.task_id ?? null,
      handoff_agent: handoff?.assigned_agent ?? null
    };
  }

  async runtimeStatus(projectId: string): Promise<{
    project_id: string;
    runs: ReturnType<Agent3RuntimeRepository["list"]>;
  }> {
    await this.assertRuntimeProjectCurrent(projectId);
    const status = await this.projects.getStatus(projectId);
    const repo = new Agent3RuntimeRepository(
      status.projectDbPath,
      { readonly: true }
    );
    try {
      return {
        project_id: projectId,
        runs: repo.list(projectId)
      };
    } finally {
      repo.close();
    }
  }

  private async assertRuntimeProjectCurrent(projectId: string): Promise<void> {
    const status = await this.projects.getStatus(projectId);
    const mode = agent3AiRuntimeMode(this.environment);
    if (mode === "CODEX_SESSION") {
      if (!status.migrations.appliedMigrationIds.includes("0023")) {
        throw new Agent3RuntimeAdapterError(
          "AGENT3_RUNTIME_PROJECT_UPGRADE_REQUIRED",
          "Codex Agent3 runtime requires migration 0023."
        );
      }
      if (!status.resourcePins.some(pin =>
        pin.resourceType === "PROVIDER_PROFILE" &&
        pin.resourceId === "CODEX_VISUAL_PRODUCTION_V1"
      )) {
        throw new Agent3RuntimeAdapterError(
          "AGENT3_RUNTIME_PROJECT_UPGRADE_REQUIRED",
          "Project does not pin CODEX_VISUAL_PRODUCTION_V1. Use HISTORY_MYSTERY_V1@1.8.0 or explicitly upgrade resources."
        );
      }
      return;
    }
    if (!status.migrations.appliedMigrationIds.includes("0021")) {
      throw new Agent3RuntimeAdapterError(
        "AGENT3_RUNTIME_PROJECT_UPGRADE_REQUIRED",
        "OpenAI API Agent3 runtime requires migration 0021."
      );
    }
    if (!status.resourcePins.some(pin =>
      pin.resourceType === "PROVIDER_PROFILE" &&
      pin.resourceId === "OPENAI_AGENT3_VISUAL_V1"
    )) {
      throw new Agent3RuntimeAdapterError(
        "AGENT3_RUNTIME_PROJECT_UPGRADE_REQUIRED",
        "OPENAI_API mode requires pinned OPENAI_AGENT3_VISUAL_V1."
      );
    }
  }

  private previousFeedback(
    dbPath: string,
    projectId: string,
    taskId: Agent3RuntimeTaskId
  ): string | null {
    const repo = new Agent3RuntimeRepository(
      dbPath,
      { readonly: true }
    );
    try {
      const failed = repo.list(projectId)
        .filter(run => run.task_id === taskId && run.status === "FAILED")
        .at(-1);
      return failed?.error_detail ?? null;
    } finally {
      repo.close();
    }
  }

  private async executeDispatched(
    projectId: string,
    taskId: Agent3RuntimeTaskId,
    attempt: number
  ): Promise<{
    provider: string;
    model: string;
    worker: Agent3TaskExecutionResult;
  }> {
    if (agent3AiRuntimeMode(this.environment) === "CODEX_SESSION") {
      return this.executeCodexDispatched(projectId, taskId, attempt);
    }
    const status = await this.projects.getStatus(projectId);
    const provider = await resolvePinnedAgent3Profile(status.resourcePins);
    const openai = new OpenAiAgent3Runtime(
      provider,
      this.environment
    );
    const production = new ProductionSpecRepository(
      status.projectDbPath,
      { readonly: true }
    );
    const agent2 = new Agent2StoryAudioRepository(
      status.projectDbPath,
      { readonly: true }
    );
    const agent3 = new Agent3VisualProductionRepository(
      status.projectDbPath,
      { readonly: true }
    );

    try {
      const projectSpec = production.getProjectSpec(projectId);
      const sceneTiming = production.getSceneTiming(projectId);
      if (projectSpec === null || sceneTiming === null) {
        throw new Agent3RuntimeAdapterError(
          "AGENT3_RUNTIME_PREREQUISITE",
          "Project Spec and measured Scene Timing are required."
        );
      }

      const feedback = this.previousFeedback(
        status.projectDbPath,
        projectId,
        taskId
      );

      if (taskId === "T040") {
        const story = agent2.getActive<Agent2StorySpec>(
          projectId,
          "story_spec"
        );
        const facts = agent2.getActive<Agent2FactCheckSpec>(
          projectId,
          "fact_check_spec"
        );
        if (story === null || facts === null) {
          throw new Agent3RuntimeAdapterError(
            "AGENT3_RUNTIME_PREREQUISITE",
            "T040 requires active story_spec and fact_check_spec."
          );
        }
        const bible = await resolvePinnedVisualBible(status.resourcePins);
        const input = {
          projectId,
          projectSpec,
          sceneTiming,
          story: story.value,
          facts: facts.value,
          visualBiblePin: bible.pin,
          visualBible: bible.payload,
          revisionFeedback: feedback
        };
        return this.executeOpenAiRun(
          status.projectDbPath,
          projectId,
          taskId,
          attempt,
          openai.modelId,
          input,
          async () => {
            const generated = await openai.sceneVisual(input);
            const worker = await this.worker.executePayload(
              projectId,
              "T040",
              generated.value
            );
            return {
              responseId: generated.responseId,
              value: generated.value,
              worker
            };
          }
        );
      }

      const visual = agent3.getActive<SceneVisualDocument>(
        projectId,
        "scene_visual_spec"
      );
      if (visual === null) {
        throw new Agent3RuntimeAdapterError(
          "AGENT3_RUNTIME_PREREQUISITE",
          taskId + " requires active scene_visual_spec."
        );
      }

      if (taskId === "T050") {
        const input = {
          projectId,
          projectSpec,
          sceneTiming,
          sceneVisual: visual.value,
          revisionFeedback: feedback
        };
        return this.executeOpenAiRun(
          status.projectDbPath,
          projectId,
          taskId,
          attempt,
          openai.modelId,
          input,
          async () => {
            const generated = await openai.stateImages(input);
            const worker = await this.worker.executePayload(
              projectId,
              "T050",
              generated.value
            );
            return {
              responseId: generated.responseId,
              value: generated.value,
              worker
            };
          }
        );
      }

      const states = agent3.getActive<StateImageDocument>(
        projectId,
        "state_image_spec"
      );
      if (states === null) {
        throw new Agent3RuntimeAdapterError(
          "AGENT3_RUNTIME_PREREQUISITE",
          "T060 requires active state_image_spec."
        );
      }
      const input = {
        projectId,
        projectSpec,
        sceneTiming,
        sceneVisual: visual.value,
        states: states.value,
        revisionFeedback: feedback
      };
      return this.executeOpenAiRun(
        status.projectDbPath,
        projectId,
        taskId,
        attempt,
        openai.modelId,
        input,
        async () => {
          const generated = await openai.clipCamera(input);
          const worker = await this.worker.executePayload(
            projectId,
            "T060",
            generated.value
          );
          return {
            responseId: generated.responseId,
            value: generated.value,
            worker
          };
        }
      );
    } finally {
      agent3.close();
      agent2.close();
      production.close();
    }
  }

  private async executeCodexDispatched(
    projectId: string,
    taskId: Agent3RuntimeTaskId,
    attempt: number
  ): Promise<{
    provider: "CODEX_SESSION";
    model: string;
    worker: Agent3TaskExecutionResult;
  }> {
    const status = await this.projects.getStatus(projectId);
    const codexPin = await resolvePinnedCodexVisualProfile(status.resourcePins);
    const codex = this.codexRunner;
    const production = new ProductionSpecRepository(
      status.projectDbPath,
      { readonly: true }
    );
    const agent2 = new Agent2StoryAudioRepository(
      status.projectDbPath,
      { readonly: true }
    );
    const agent3 = new Agent3VisualProductionRepository(
      status.projectDbPath,
      { readonly: true }
    );

    try {
      const projectSpec = production.getProjectSpec(projectId);
      const sceneTiming = production.getSceneTiming(projectId);
      if (projectSpec === null || sceneTiming === null) {
        throw new Agent3RuntimeAdapterError(
          "AGENT3_RUNTIME_PREREQUISITE",
          "Project Spec and measured Scene Timing are required."
        );
      }
      const managerDirective =
        await this.codexManager.latestDirective(projectId, taskId, attempt);

      if (taskId === "T040") {
        const story = agent2.getActive<Agent2StorySpec>(
          projectId,
          "story_spec"
        );
        const facts = agent2.getActive<Agent2FactCheckSpec>(
          projectId,
          "fact_check_spec"
        );
        if (story === null || facts === null) {
          throw new Agent3RuntimeAdapterError(
            "AGENT3_RUNTIME_PREREQUISITE",
            "T040 requires active story_spec and fact_check_spec."
          );
        }
        const bible = await resolvePinnedVisualBible(status.resourcePins);
        const input = {
          project_id: projectId,
          project_spec: projectSpec,
          scene_timing_spec: sceneTiming,
          story_spec: story.value,
          fact_check_spec: facts.value,
          visual_bible_pin: bible.pin,
          visual_bible_payload: bible.payload,
          provider_profile: codexPin,
          manager_revision_instruction: managerDirective
        };
        return this.executeCodexRun(
          status.projectDbPath,
          projectId,
          taskId,
          attempt,
          codex,
          input,
          AGENT3_SCENE_VISUAL_SCHEMA,
          [
            ...getAgent3TaskInstruction("T040").rules,
            "Return one Scene Visual plan for every current Scene, in order.",
            "Copy Story Scene fact_refs exactly; never add or remove fact references.",
            "Use the least-certain factuality mode required by the referenced fact classifications.",
            "Visual Bible is the show-level authority; do not invent a replacement visual style.",
            "Do not turn missing records or uncertainty into literal magical disappearance.",
            "If manager_revision_instruction is present, repair that exact failure while preserving approved story, facts, timing, and Visual Bible."
          ],
          async output => {
            const value = normalizedSceneVisual(
              output as SceneVisualDocument,
              projectId,
              bible.pin
            );
            const worker = await this.worker.executePayload(
              projectId,
              "T040",
              value
            );
            return { value, worker };
          }
        );
      }

      const visual = agent3.getActive<SceneVisualDocument>(
        projectId,
        "scene_visual_spec"
      );
      if (visual === null) {
        throw new Agent3RuntimeAdapterError(
          "AGENT3_RUNTIME_PREREQUISITE",
          taskId + " requires active scene_visual_spec."
        );
      }

      if (taskId === "T050") {
        const input = {
          project_id: projectId,
          project_spec: projectSpec,
          scene_timing_spec: sceneTiming,
          scene_visual_spec: visual.value,
          provider_profile: codexPin,
          manager_revision_instruction: managerDirective
        };
        return this.executeCodexRun(
          status.projectDbPath,
          projectId,
          taskId,
          attempt,
          codex,
          input,
          AGENT3_STATE_IMAGE_SCHEMA,
          [
            ...getAgent3TaskInstruction("T050").rules,
            "Create an ordered state ladder for every Scene with exactly one ENTRY and one TARGET; MID is optional.",
            "ENTRY handoff_anchor must exactly match Scene handoff.entry_anchor and TARGET must exactly match Scene handoff.exit_anchor.",
            "Use only current Beat IDs or null.",
            "A Scene longer than 10 seconds measured TTS must have enough sequential states to support multiple Clips of at most 10 seconds.",
            "If manager_revision_instruction is present, repair that exact failure without changing approved Scene Visual meaning."
          ],
          async output => {
            const value = normalizedStateImages(
              output as StateImageDocument,
              projectId
            );
            const worker = await this.worker.executePayload(
              projectId,
              "T050",
              value
            );
            return { value, worker };
          }
        );
      }

      const states = agent3.getActive<StateImageDocument>(
        projectId,
        "state_image_spec"
      );
      if (states === null) {
        throw new Agent3RuntimeAdapterError(
          "AGENT3_RUNTIME_PREREQUISITE",
          "T060 requires active state_image_spec."
        );
      }
      const input = {
        project_id: projectId,
        project_spec: projectSpec,
        scene_timing_spec: sceneTiming,
        scene_visual_spec: visual.value,
        state_image_spec: states.value,
        provider_profile: codexPin,
        manager_revision_instruction: managerDirective
      };
      return this.executeCodexRun(
        status.projectDbPath,
        projectId,
        taskId,
        attempt,
        codex,
        input,
        AGENT3_CLIP_CAMERA_SCHEMA,
        [
          ...getAgent3TaskInstruction("T060").rules,
          "Use measured scene_timing_spec TTS duration, never estimated duration.",
          "For each Scene, Clip editorial durations must sum to measured TTS duration within 0.01 sec.",
          "No Clip may exceed 10 seconds.",
          "Adjacent Clips in one Scene must chain previous target state to next entry state.",
          "Use generation_duration_sec=null and safe_trim_start_sec=editorial_duration_sec.",
          "Keep all mandatory core points before narrative_deadline_sec and target state before final hold.",
          "Avoid four adjacent Clips with the same camera movement, shot-size pattern, or transition.",
          "Do not output provider prompts; the deterministic Prompt Compiler runs after Core validation.",
          "If manager_revision_instruction is present, repair that exact failure while preserving measured timing and approved visual states."
        ],
        async output => {
          const value = normalizedClipInput(
            output as Agent3T060Input,
            projectId
          );
          const worker = await this.worker.executePayload(
            projectId,
            "T060",
            value
          );
          return { value, worker };
        }
      );
    } finally {
      agent3.close();
      agent2.close();
      production.close();
    }
  }

  private async executeCodexRun<T>(
    dbPath: string,
    projectId: string,
    taskId: Agent3RuntimeTaskId,
    attempt: number,
    codex: CodexProcessRunner,
    input: unknown,
    outputSchema: unknown,
    instructions: string[],
    materialize: (output: unknown) => Promise<{
      value: T;
      worker: Agent3TaskExecutionResult;
    }>
  ): Promise<{
    provider: "CODEX_SESSION";
    model: string;
    worker: Agent3TaskExecutionResult;
  }> {
    const status = await this.projects.getStatus(projectId);
    const runId = projectId + ":" + taskId + ":A" + attempt + ":CODEX";
    const repo = new Agent3RuntimeRepository(dbPath);
    repo.start({
      run_id: runId,
      project_id: projectId,
      task_id: taskId,
      provider: "CODEX_SESSION",
      model_id: codex.modelId,
      provider_response_id: null,
      input_sha256: sha256Text(JSON.stringify(input)),
      started_at: new Date().toISOString()
    });
    try {
      const generated = await codex.execute<unknown>({
        projectId,
        projectRoot: status.projectRoot,
        dbPath,
        roleId: "CODEX_3_VISUAL_PRODUCTION",
        taskId,
        attempt,
        instructions,
        input,
        outputSchema,
        webSearchMode: "disabled"
      });
      const completed = await materialize(generated.output);
      repo.complete({
        runId,
        providerResponseId: generated.runId,
        outputSha256: generated.outputSha256,
        completedAt: new Date().toISOString()
      });
      return {
        provider: "CODEX_SESSION",
        model: generated.model,
        worker: completed.worker
      };
    } catch (error) {
      repo.fail({
        runId,
        errorCode:
          error instanceof Agent3RuntimeAdapterError
            ? error.code
            : error instanceof Agent3VisualProductionError
              ? error.code
              : error instanceof CodexRuntimeError
                ? error.code
                : "AGENT3_RUNTIME_CORE_REJECTED",
        errorDetail: errorDetail(error),
        completedAt: new Date().toISOString()
      });
      if (error instanceof Agent3VisualProductionError) {
        throw new Agent3RuntimeAdapterError(
          "AGENT3_RUNTIME_CORE_REJECTED",
          error.code + ": " + error.message
        );
      }
      throw error;
    } finally {
      repo.close();
    }
  }

  private async executeOpenAiRun<T>(
    dbPath: string,
    projectId: string,
    taskId: Agent3RuntimeTaskId,
    attempt: number,
    model: string,
    input: unknown,
    execute: () => Promise<{
      responseId: string | null;
      value: T;
      worker: Agent3TaskExecutionResult;
    }>
  ): Promise<{
    provider: "OPENAI";
    model: string;
    worker: Agent3TaskExecutionResult;
  }> {
    const runId = projectId + ":" + taskId +
      ":A" + attempt + ":OPENAI";
    const repo = new Agent3RuntimeRepository(dbPath);
    repo.start({
      run_id: runId,
      project_id: projectId,
      task_id: taskId,
      provider: "OPENAI",
      model_id: model,
      provider_response_id: null,
      input_sha256: sha256Text(JSON.stringify(input)),
      started_at: new Date().toISOString()
    });

    try {
      const generated = await execute();
      repo.complete({
        runId,
        providerResponseId: generated.responseId,
        outputSha256: sha256Text(JSON.stringify(generated.value)),
        completedAt: new Date().toISOString()
      });
      return {
        provider: "OPENAI",
        model,
        worker: generated.worker
      };
    } catch (error) {
      repo.fail({
        runId,
        errorCode: errorCode(error),
        errorDetail: errorDetail(error),
        completedAt: new Date().toISOString()
      });
      if (error instanceof Agent3VisualProductionError) {
        throw new Agent3RuntimeAdapterError(
          "AGENT3_RUNTIME_CORE_REJECTED",
          error.code + ": " + error.message
        );
      }
      throw error;
    } finally {
      repo.close();
    }
  }
}
