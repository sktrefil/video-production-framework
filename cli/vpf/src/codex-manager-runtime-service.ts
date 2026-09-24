import type { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { CodexRuntimeRepository } from "@vpf/storage/codex-runtime";
import { Agent2StoryAudioRepository } from "@vpf/storage/agent2-story-audio";
import { Agent3VisualProductionRepository } from "@vpf/storage/agent3-visual-production";
import { ProductionSpecRepository } from "@vpf/storage/production-spec";
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

  async reviewSuccess(input: {
    projectId: string;
    taskId: "T010" | "T020" | "T040" | "T050" | "T060";
    attempt: number;
    workerRole: "CODEX_2_STORY_AUDIO" | "CODEX_3_VISUAL_PRODUCTION";
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
    taskId: "T010" | "T020" | "T040" | "T050" | "T060"
  ): unknown {
    const agent2 = new Agent2StoryAudioRepository(dbPath, { readonly: true });
    const agent3 = new Agent3VisualProductionRepository(dbPath, { readonly: true });
    const production = new ProductionSpecRepository(dbPath, { readonly: true });
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
      return {
        clip_production_spec: production.getClipProduction(projectId),
        prompt_bundle_spec: agent3.getActive(projectId, "prompt_bundle_spec")?.value ?? null,
        state_image_spec: agent3.getActive(projectId, "state_image_spec")?.value ?? null,
        scene_visual_spec: agent3.getActive(projectId, "scene_visual_spec")?.value ?? null,
        scene_timing_spec: production.getSceneTiming(projectId)
      };
    } finally {
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
