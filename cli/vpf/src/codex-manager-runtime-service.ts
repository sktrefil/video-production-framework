import type { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { CodexRuntimeRepository } from "@vpf/storage/codex-runtime";
import { Agent2StoryAudioRepository } from "@vpf/storage/agent2-story-audio";
import { Agent3VisualProductionRepository } from "@vpf/storage/agent3-visual-production";
import { ProductionSpecRepository } from "@vpf/storage/production-spec";
import { ProductionTailRepository } from "@vpf/storage/production-tail";
import { CodexProcessRunner, CodexRuntimeError } from "./codex-process-runner.js";

export interface CodexManagerReviewResult {
  schema_version: "1.0";
  verdict: "RETRY" | "BLOCK" | "ESCALATE";
  root_cause: string;
  revision_instruction: string;
  preserve: string[];
}

export interface CodexManagerSuccessReviewResult {
  schema_version: "1.0";
  verdict: "APPROVE" | "RETRY" | "BLOCK" | "ESCALATE";
  root_cause: string;
  revision_instruction: string;
  preserve: string[];
}

export interface T070SeedVisualQcResult {
  schema_version: "1.0";
  verdict: "PASS" | "REVISE" | "FAIL";
  summary: string;
  checks: Array<{
    state_image_id: string;
    verdict: "PASS" | "REVISE" | "FAIL";
    prompt_alignment: "PASS" | "FAIL";
    visual_consistency: "PASS" | "FAIL";
    factual_constraints: "PASS" | "FAIL";
    continuity_readiness: "PASS" | "FAIL";
    artifact_quality: "PASS" | "FAIL";
    notes: string[];
  }>;
  revision_instruction: string;
}

const MANAGER_SUCCESS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "verdict",
    "root_cause",
    "revision_instruction",
    "preserve"
  ],
  properties: {
    schema_version: { type: "string", enum: ["1.0"] },
    verdict: {
      type: "string",
      enum: ["APPROVE", "RETRY", "BLOCK", "ESCALATE"]
    },
    root_cause: { type: "string" },
    revision_instruction: { type: "string" },
    preserve: {
      type: "array",
      items: { type: "string" }
    }
  }
} as const;


const T070_SEED_VISUAL_QC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "verdict",
    "summary",
    "checks",
    "revision_instruction"
  ],
  properties: {
    schema_version: { type: "string", enum: ["1.0"] },
    verdict: { type: "string", enum: ["PASS", "REVISE", "FAIL"] },
    summary: { type: "string" },
    checks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "state_image_id",
          "verdict",
          "prompt_alignment",
          "visual_consistency",
          "factual_constraints",
          "continuity_readiness",
          "artifact_quality",
          "notes"
        ],
        properties: {
          state_image_id: { type: "string" },
          verdict: { type: "string", enum: ["PASS", "REVISE", "FAIL"] },
          prompt_alignment: { type: "string", enum: ["PASS", "FAIL"] },
          visual_consistency: { type: "string", enum: ["PASS", "FAIL"] },
          factual_constraints: { type: "string", enum: ["PASS", "FAIL"] },
          continuity_readiness: { type: "string", enum: ["PASS", "FAIL"] },
          artifact_quality: { type: "string", enum: ["PASS", "FAIL"] },
          notes: { type: "array", items: { type: "string" } }
        }
      }
    },
    revision_instruction: { type: "string" }
  }
} as const;


const MANAGER_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "verdict",
    "root_cause",
    "revision_instruction",
    "preserve"
  ],
  properties: {
    schema_version: { type: "string", enum: ["1.0"] },
    verdict: { type: "string", enum: ["RETRY", "BLOCK", "ESCALATE"] },
    root_cause: { type: "string" },
    revision_instruction: { type: "string" },
    preserve: {
      type: "array",
      items: { type: "string" }
    }
  }
} as const;

export class CodexManagerRuntimeService {
  private readonly runner: CodexProcessRunner;

  constructor(
    private readonly projects: ProjectBootstrapService,
    environment: NodeJS.ProcessEnv = process.env
  ) {
    this.runner = new CodexProcessRunner(environment);
  }

  async reviewFailure(input: {
    projectId: string;
    taskId: string;
    attempt: number;
    workerRole: string;
    errorCode: string;
    errorDetail: string;
    upstreamSummary?: unknown;
  }): Promise<CodexManagerReviewResult> {
    const status = await this.projects.getStatus(input.projectId);
    if (!status.migrations.appliedMigrationIds.includes("0023")) {
      throw new CodexRuntimeError(
        "CODEX_CAPABILITY_MISSING",
        "Codex Manager success/failure review requires migration 0023."
      );
    }
    if (!status.resourcePins.some(pin =>
      pin.resourceType === "PROVIDER_PROFILE" &&
      pin.resourceId === "CODEX_MANAGER_V1"
    )) {
      throw new CodexRuntimeError(
        "CODEX_CAPABILITY_MISSING",
        "Project does not pin CODEX_MANAGER_V1."
      );
    }
    const result = await this.runner.execute<CodexManagerReviewResult>({
      projectId: input.projectId,
      projectRoot: status.projectRoot,
      dbPath: status.projectDbPath,
      roleId: "CODEX_1_MANAGER",
      taskId: "MANAGER_REVIEW:" + input.taskId,
      attempt: input.attempt,
      instructions: [
        "Act as the Agent 1 QC and revision director.",
        "Do not change workflow state or approve a gate; VPF will deterministically enforce your structured verdict after this review.",
        "RETRY means the same assigned worker may run another attempt with your revision_instruction.",
        "BLOCK means automatic execution must stop until required upstream evidence, artifacts, or configuration materially changes.",
        "ESCALATE means automatic execution must stop until an explicit human decision intervenes.",
        "Analyze the deterministic validator/runtime failure and produce a concise corrective directive for the original worker.",
        "Use RETRY when the worker can repair the output without changing approved upstream meaning.",
        "Use BLOCK when a required upstream artifact/configuration is missing or stale.",
        "Use ESCALATE only when a human decision is required.",
        "The revision_instruction must say exactly what to change and what not to change.",
        "preserve must list upstream facts, timing, style, IDs, or other constraints that must remain unchanged."
      ],
      input: {
        project_id: input.projectId,
        failed_task_id: input.taskId,
        failed_attempt: input.attempt,
        worker_role: input.workerRole,
        error_code: input.errorCode,
        error_detail: input.errorDetail,
        upstream_summary: input.upstreamSummary ?? null
      },
      outputSchema: MANAGER_REVIEW_SCHEMA,
      webSearchMode: "disabled"
    });

    const review = {
      ...result.output,
      schema_version: "1.0" as const
    };
    const repo = new CodexRuntimeRepository(status.projectDbPath);
    try {
      repo.saveManagerReview({
        review_id:
          input.projectId + ":" + input.taskId + ":A" + input.attempt +
          ":CODEX_1_MANAGER",
        project_id: input.projectId,
        task_id: input.taskId,
        attempt: input.attempt,
        review_kind: "FAILURE",
        verdict: review.verdict,
        root_cause: review.root_cause,
        revision_instruction: review.revision_instruction,
        preserve: review.preserve,
        created_at: new Date().toISOString()
      });
    } finally {
      repo.close();
    }
    return review;
  }

  async reviewT070SeedVisuals(input: {
    projectId: string;
    attempt: number;
    seedImages: Array<{
      stateImageId: string;
      absolutePath: string;
      sha256: string;
    }>;
  }): Promise<T070SeedVisualQcResult> {
    const status = await this.projects.getStatus(input.projectId);
    if (!status.migrations.appliedMigrationIds.includes("0023")) {
      throw new CodexRuntimeError(
        "CODEX_CAPABILITY_MISSING",
        "T070 seed visual QC requires migration 0023."
      );
    }
    if (!status.resourcePins.some(pin =>
      pin.resourceType === "PROVIDER_PROFILE" &&
      pin.resourceId === "CODEX_MANAGER_V1"
    )) {
      throw new CodexRuntimeError(
        "CODEX_CAPABILITY_MISSING",
        "Project does not pin CODEX_MANAGER_V1."
      );
    }
    if (input.seedImages.length === 0) {
      throw new CodexRuntimeError(
        "CODEX_OUTPUT_INVALID",
        "T070 seed visual QC requires at least one seed image."
      );
    }

    const agent3 = new Agent3VisualProductionRepository(
      status.projectDbPath,
      { readonly: true }
    );
    try {
      const prompts = agent3.getActive<any>(input.projectId, "prompt_bundle_spec");
      const states = agent3.getActive<any>(input.projectId, "state_image_spec");
      const visual = agent3.getActive<any>(input.projectId, "scene_visual_spec");
      if (prompts === null || states === null || visual === null) {
        throw new CodexRuntimeError(
          "CODEX_OUTPUT_INVALID",
          "T070 seed visual QC requires prompt, state-image and scene-visual artifacts."
        );
      }

      const seedInputs = input.seedImages.map((seed, index) => {
        const prompt = prompts.value.image_prompts.find(
          (item: any) => item.state_image_id === seed.stateImageId
        );
        const state = states.value.state_images.find(
          (item: any) => item.state_image_id === seed.stateImageId
        );
        const scene = visual.value.scenes.find(
          (item: any) => item.scene_id === state?.scene_id
        );
        if (prompt === undefined || state === undefined || scene === undefined) {
          throw new CodexRuntimeError(
            "CODEX_OUTPUT_INVALID",
            "T070 seed visual QC input is missing approved design context for " +
              seed.stateImageId + "."
          );
        }
        return {
          attachment_index: index + 1,
          state_image_id: seed.stateImageId,
          image_sha256: seed.sha256,
          scene_id: state.scene_id,
          role: state.role,
          provider_prompt_en: prompt.provider_prompt_en,
          negative_prompt_en: prompt.negative_prompt_en,
          visual_goal_en: state.visual_goal_en || state.visual_goal_ko,
          composition_en: state.composition_en || state.composition_ko,
          subject_state_en: state.subject_state_en || state.subject_state_ko,
          environment_state_en: state.environment_state_en || state.environment_state_ko,
          motion_vector_en: state.motion_vector_en || state.motion_vector_ko,
          handoff_anchor: state.handoff_anchor,
          continuity_refs: state.continuity_refs,
          factual_constraints: [
            ...scene.evidence_constraints,
            ...state.factual_constraints
          ],
          forbidden_visual_claims: scene.forbidden_visual_claims,
          scene_continuity: scene.continuity,
          scene_handoff: scene.handoff
        };
      });

      const result = await this.runner.execute<T070SeedVisualQcResult>({
        projectId: input.projectId,
        projectRoot: status.projectRoot,
        dbPath: status.projectDbPath,
        roleId: "CODEX_1_MANAGER",
        taskId: "MANAGER_VISUAL:T070_SEED",
        attempt: input.attempt,
        instructions: [
          "Act as Agent 1 visual calibration QC for T070 seed images.",
          "The attached images are the actual generated PNG pixels. Inspect every attachment directly.",
          "Attachment order exactly matches seed_images[].attachment_index in request.json.",
          "Do not approve from prompt text, metadata, filenames, dimensions, or hashes alone.",
          "For every seed image assess prompt alignment, visual consistency, factual constraints, continuity/handoff readiness, and visible artifact quality.",
          "FAIL factual contradictions, unsupported visible claims, modern/anachronistic objects, readable generated text, watermarks, severe anatomy/object corruption, or an image that cannot serve its approved state.",
          "Use REVISE when regeneration can repair the seed without changing approved upstream facts or visual policy.",
          "PASS only when every attached seed is visually suitable to calibrate full-batch generation.",
          "Return exactly one check for every state_image_id and no extras.",
          "If overall verdict is PASS, revision_instruction must be empty. Otherwise provide a concrete regeneration instruction.",
          "Web search is disabled; judge only the supplied approved design context and actual attached pixels."
        ],
        input: {
          project_id: input.projectId,
          seed_images: seedInputs
        },
        imagePaths: input.seedImages.map(item => item.absolutePath),
        outputSchema: T070_SEED_VISUAL_QC_SCHEMA,
        webSearchMode: "disabled"
      });

      const review = {
        ...result.output,
        schema_version: "1.0" as const
      };
      const expectedIds = input.seedImages.map(item => item.stateImageId).sort();
      const actualIds = review.checks.map(item => item.state_image_id).sort();
      if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
        throw new CodexRuntimeError(
          "CODEX_OUTPUT_INVALID",
          "T070 seed visual QC must return exactly one check for every seed image."
        );
      }
      if (!review.summary.trim()) {
        throw new CodexRuntimeError(
          "CODEX_OUTPUT_INVALID",
          "T070 seed visual QC requires a non-empty summary."
        );
      }
      if (review.verdict === "PASS" && review.revision_instruction.trim()) {
        throw new CodexRuntimeError(
          "CODEX_OUTPUT_INVALID",
          "T070 seed visual QC PASS must not include a revision instruction."
        );
      }
      if (review.verdict !== "PASS" && !review.revision_instruction.trim()) {
        throw new CodexRuntimeError(
          "CODEX_OUTPUT_INVALID",
          "T070 seed visual QC non-PASS verdict requires a revision instruction."
        );
      }
      if (
        review.verdict === "PASS" &&
        review.checks.some(item => item.verdict !== "PASS")
      ) {
        throw new CodexRuntimeError(
          "CODEX_OUTPUT_INVALID",
          "T070 seed visual QC cannot PASS while an individual seed is non-PASS."
        );
      }
      return review;
    } finally {
      agent3.close();
    }
  }

  async reviewSuccess(input: {
    projectId: string;
    taskId: "T010" | "T020" | "T040" | "T050" | "T060" | "T070" | "T080" | "T090";
    attempt: number;
    workerRole: "CODEX_2_STORY_AUDIO" | "CODEX_3_VISUAL_PRODUCTION" | "EDITOR_REMOTION";
    gateStatus: "PASS";
    gateId: string;
    warnings?: Array<{ code: string; message: string }>;
  }): Promise<CodexManagerSuccessReviewResult> {
    const status = await this.projects.getStatus(input.projectId);
    if (!status.migrations.appliedMigrationIds.includes("0023")) {
      throw new CodexRuntimeError(
        "CODEX_CAPABILITY_MISSING",
        "Codex Manager success QC requires migration 0023."
      );
    }
    if (!status.resourcePins.some(pin =>
      pin.resourceType === "PROVIDER_PROFILE" &&
      pin.resourceId === "CODEX_MANAGER_V1"
    )) {
      throw new CodexRuntimeError(
        "CODEX_CAPABILITY_MISSING",
        "Project does not pin CODEX_MANAGER_V1."
      );
    }

    const outputSummary = this.readSuccessArtifacts(
      status.projectDbPath,
      input.projectId,
      input.taskId
    );

    const result = await this.runner.execute<CodexManagerSuccessReviewResult>({
      projectId: input.projectId,
      projectRoot: status.projectRoot,
      dbPath: status.projectDbPath,
      roleId: "CODEX_1_MANAGER",
      taskId: "MANAGER_SUCCESS:" + input.taskId,
      attempt: input.attempt,
      instructions: [
        "Act as Agent 1 final QC after the deterministic completion gate has already passed.",
        "Do not alter workflow state or any artifact. VPF will deterministically enforce your verdict.",
        "APPROVE only when the supplied successful artifacts are semantically coherent, preserve approved upstream meaning, and need no corrective regeneration.",
        "RETRY when the assigned worker can improve the successful output without changing approved upstream facts, timing authority, IDs, or visual policy.",
        "BLOCK when the successful output exposes a missing or stale upstream artifact/configuration that must change before another worker attempt is meaningful.",
        "ESCALATE only when a human editorial or factual judgment is genuinely required.",
        "Never reverse deterministic authorities: measured TTS timing, exact fact_refs, pinned Visual Bible, state/clip timing limits, and validated IDs remain authoritative.",
        "For APPROVE, revision_instruction must be an empty string.",
        "For non-APPROVE verdicts, revision_instruction must state exactly what to change and what to preserve.",
        "Review only the evidence supplied in request.json. Web search is disabled."
      ],
      input: {
        project_id: input.projectId,
        successful_task_id: input.taskId,
        successful_attempt: input.attempt,
        worker_role: input.workerRole,
        deterministic_gate: {
          gate_id: input.gateId,
          status: input.gateStatus
        },
        warnings: input.warnings ?? [],
        output_artifacts: outputSummary
      },
      outputSchema: MANAGER_SUCCESS_SCHEMA,
      webSearchMode: "disabled"
    });

    const review = {
      ...result.output,
      schema_version: "1.0" as const
    };
    if (!review.root_cause.trim()) {
      throw new CodexRuntimeError(
        "CODEX_OUTPUT_INVALID",
        "Codex1 success review must include a non-empty root_cause/quality assessment."
      );
    }
    if (review.verdict === "APPROVE" && review.revision_instruction.trim()) {
      throw new CodexRuntimeError(
        "CODEX_OUTPUT_INVALID",
        "Codex1 APPROVE success review must not include a revision instruction."
      );
    }
    if (
      review.verdict !== "APPROVE" &&
      !review.revision_instruction.trim()
    ) {
      throw new CodexRuntimeError(
        "CODEX_OUTPUT_INVALID",
        "Codex1 non-APPROVE success review requires a concrete revision instruction."
      );
    }

    const repo = new CodexRuntimeRepository(status.projectDbPath);
    try {
      repo.saveManagerReview({
        review_id:
          input.projectId + ":" + input.taskId + ":A" + input.attempt +
          ":SUCCESS:CODEX_1_MANAGER",
        project_id: input.projectId,
        task_id: input.taskId,
        attempt: input.attempt,
        review_kind: "SUCCESS",
        verdict: review.verdict,
        root_cause: review.root_cause,
        revision_instruction: review.revision_instruction,
        preserve: review.preserve,
        created_at: new Date().toISOString()
      });
    } finally {
      repo.close();
    }
    return review;
  }

  private readSuccessArtifacts(
    dbPath: string,
    projectId: string,
    taskId: "T010" | "T020" | "T040" | "T050" | "T060" | "T070" | "T080" | "T090"
  ): unknown {
    const agent2 = new Agent2StoryAudioRepository(dbPath, { readonly: true });
    const agent3 = new Agent3VisualProductionRepository(dbPath, { readonly: true });
    const production = new ProductionSpecRepository(dbPath, { readonly: true });
    const tail = new ProductionTailRepository(dbPath, { readonly: true });
    try {
      if (taskId === "T010") {
        return {
          research_spec: agent2.getActive(projectId, "research_spec")?.value ?? null,
          fact_check_spec: agent2.getActive(projectId, "fact_check_spec")?.value ?? null
        };
      }
      if (taskId === "T020") {
        return {
          story_spec: agent2.getActive(projectId, "story_spec")?.value ?? null,
          script: agent2.getActive(projectId, "script")?.value ?? null,
          fact_check_spec: agent2.getActive(projectId, "fact_check_spec")?.value ?? null
        };
      }
      if (taskId === "T040") {
        return {
          scene_visual_spec: agent3.getActive(projectId, "scene_visual_spec")?.value ?? null,
          story_spec: agent2.getActive(projectId, "story_spec")?.value ?? null,
          fact_check_spec: agent2.getActive(projectId, "fact_check_spec")?.value ?? null,
          scene_timing_spec: production.getSceneTiming(projectId)
        };
      }
      if (taskId === "T050") {
        return {
          state_image_spec: agent3.getActive(projectId, "state_image_spec")?.value ?? null,
          scene_visual_spec: agent3.getActive(projectId, "scene_visual_spec")?.value ?? null,
          scene_timing_spec: production.getSceneTiming(projectId)
        };
      }
      if (taskId === "T060") {
        return {
          clip_production_spec: production.getClipProduction(projectId),
          prompt_bundle_spec: agent3.getActive(projectId, "prompt_bundle_spec")?.value ?? null,
          state_image_spec: agent3.getActive(projectId, "state_image_spec")?.value ?? null,
          scene_visual_spec: agent3.getActive(projectId, "scene_visual_spec")?.value ?? null,
          scene_timing_spec: production.getSceneTiming(projectId)
        };
      }
      if (taskId === "T070") {
        return {
          generated_images: tail.getActive(projectId, "generated_images")?.value ?? null,
          image_qc_result: tail.getActive(projectId, "image_qc_result")?.value ?? null,
          approved_images: tail.getActive(projectId, "approved_images")?.value ?? null,
          prompt_bundle_spec: agent3.getActive(projectId, "prompt_bundle_spec")?.value ?? null
        };
      }
      if (taskId === "T080") {
        return {
          generated_clips: tail.getActive(projectId, "generated_clips")?.value ?? null,
          clip_qc_result: tail.getActive(projectId, "clip_qc_result")?.value ?? null,
          clip_production_spec: production.getClipProduction(projectId)
        };
      }
      return {
        timeline_spec: tail.getActive(projectId, "timeline_spec")?.value ?? null,
        preview_render: tail.getActive(projectId, "preview_render")?.value ?? null,
        generated_clips: tail.getActive(projectId, "generated_clips")?.value ?? null
      };
    } finally {
      tail.close();
      production.close();
      agent3.close();
      agent2.close();
    }
  }

  async latestDirective(
    projectId: string,
    taskId: string,
    currentAttempt?: number
  ): Promise<string | null> {
    const status = await this.projects.getStatus(projectId);
    if (!status.migrations.appliedMigrationIds.includes("0023")) return null;
    const repo = new CodexRuntimeRepository(
      status.projectDbPath,
      { readonly: true }
    );
    try {
      const review = repo.latestManagerReview(projectId, taskId);
      if (review === null || review.verdict !== "RETRY") return null;
      if (
        currentAttempt !== undefined &&
        review.attempt !== currentAttempt - 1
      ) {
        return null;
      }
      return [
        "Codex 1 revision directive:",
        review.revision_instruction,
        review.preserve.length > 0
          ? "Preserve: " + review.preserve.join("; ")
          : ""
      ].filter(Boolean).join("\n");
    } finally {
      repo.close();
    }
  }
}
