import type { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { CodexRuntimeRepository } from "@vpf/storage/codex-runtime";
import { CodexProcessRunner, CodexRuntimeError } from "./codex-process-runner.js";

export interface CodexManagerReviewResult {
  schema_version: "1.0";
  verdict: "RETRY" | "BLOCK" | "ESCALATE";
  root_cause: string;
  revision_instruction: string;
  preserve: string[];
}

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
    if (!status.migrations.appliedMigrationIds.includes("0022")) {
      throw new CodexRuntimeError(
        "CODEX_CAPABILITY_MISSING",
        "Codex Manager requires migration 0022."
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
        "Do not change workflow state or approve a gate.",
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

  async latestDirective(
    projectId: string,
    taskId: string
  ): Promise<string | null> {
    const status = await this.projects.getStatus(projectId);
    if (!status.migrations.appliedMigrationIds.includes("0022")) return null;
    const repo = new CodexRuntimeRepository(
      status.projectDbPath,
      { readonly: true }
    );
    try {
      const review = repo.latestManagerReview(projectId, taskId);
      if (review === null) return null;
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
