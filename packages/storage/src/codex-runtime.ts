import Database from "better-sqlite3";

export type CodexRoleId =
  | "CODEX_1_MANAGER"
  | "CODEX_2_STORY_AUDIO"
  | "CODEX_3_VISUAL_PRODUCTION";

export interface CodexRuntimeRun {
  run_id: string;
  project_id: string;
  role_id: CodexRoleId;
  task_id: string;
  attempt: number;
  status: "RUNNING" | "COMPLETE" | "FAILED";
  command_name: string;
  cli_version: string | null;
  auth_status: string | null;
  web_search_mode: "live" | "cached" | "disabled";
  input_sha256: string;
  output_sha256: string | null;
  trace_sha256: string | null;
  exit_code: number | null;
  stderr_excerpt: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface CodexManagerReview {
  review_id: string;
  project_id: string;
  task_id: string;
  attempt: number;
  verdict: "RETRY" | "BLOCK" | "ESCALATE";
  root_cause: string;
  revision_instruction: string;
  preserve: string[];
  created_at: string;
}

export class CodexRuntimeRepository {
  readonly db: Database.Database;

  constructor(filename: string, options: { readonly?: boolean } = {}) {
    this.db = new Database(filename, {
      readonly: options.readonly ?? false,
      fileMustExist: true
    });
    this.db.pragma("foreign_keys = ON");
  }

  close(): void {
    this.db.close();
  }

  start(run: Omit<
    CodexRuntimeRun,
    "status" | "output_sha256" | "trace_sha256" | "exit_code" |
    "stderr_excerpt" | "completed_at"
  >): void {
    this.db.prepare(`INSERT INTO codex_runtime_runs
      (run_id, project_id, role_id, task_id, attempt, status, command_name,
       cli_version, auth_status, web_search_mode, input_sha256, output_sha256,
       trace_sha256, exit_code, stderr_excerpt, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, 'RUNNING', ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, NULL)`
    ).run(
      run.run_id,
      run.project_id,
      run.role_id,
      run.task_id,
      run.attempt,
      run.command_name,
      run.cli_version,
      run.auth_status,
      run.web_search_mode,
      run.input_sha256,
      run.started_at
    );
  }

  complete(input: {
    runId: string;
    outputSha256: string;
    traceSha256: string;
    exitCode: number;
    stderrExcerpt: string;
    completedAt: string;
  }): void {
    this.db.prepare(`UPDATE codex_runtime_runs
      SET status='COMPLETE', output_sha256=?, trace_sha256=?, exit_code=?,
          stderr_excerpt=?, completed_at=?
      WHERE run_id=?`
    ).run(
      input.outputSha256,
      input.traceSha256,
      input.exitCode,
      input.stderrExcerpt.slice(0, 2000),
      input.completedAt,
      input.runId
    );
  }

  fail(input: {
    runId: string;
    outputSha256?: string | null;
    traceSha256?: string | null;
    exitCode?: number | null;
    stderrExcerpt: string;
    completedAt: string;
  }): void {
    this.db.prepare(`UPDATE codex_runtime_runs
      SET status='FAILED', output_sha256=?, trace_sha256=?, exit_code=?,
          stderr_excerpt=?, completed_at=?
      WHERE run_id=?`
    ).run(
      input.outputSha256 ?? null,
      input.traceSha256 ?? null,
      input.exitCode ?? null,
      input.stderrExcerpt.slice(0, 2000),
      input.completedAt,
      input.runId
    );
  }

  list(projectId: string): CodexRuntimeRun[] {
    return this.db.prepare(`SELECT * FROM codex_runtime_runs
      WHERE project_id=? ORDER BY started_at, run_id`
    ).all(projectId) as CodexRuntimeRun[];
  }

  saveManagerReview(review: CodexManagerReview): void {
    this.db.prepare(`INSERT INTO codex_manager_reviews
      (review_id, project_id, task_id, attempt, verdict, root_cause,
       revision_instruction, preserve_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      review.review_id,
      review.project_id,
      review.task_id,
      review.attempt,
      review.verdict,
      review.root_cause,
      review.revision_instruction,
      JSON.stringify(review.preserve),
      review.created_at
    );
  }

  latestManagerReview(
    projectId: string,
    taskId: string
  ): CodexManagerReview | null {
    const row = this.db.prepare(`SELECT * FROM codex_manager_reviews
      WHERE project_id=? AND task_id=?
      ORDER BY attempt DESC, created_at DESC LIMIT 1`
    ).get(projectId, taskId) as Record<string, unknown> | undefined;
    if (row === undefined) return null;
    return {
      review_id: String(row.review_id),
      project_id: String(row.project_id),
      task_id: String(row.task_id),
      attempt: Number(row.attempt),
      verdict: row.verdict as CodexManagerReview["verdict"],
      root_cause: String(row.root_cause),
      revision_instruction: String(row.revision_instruction),
      preserve: JSON.parse(String(row.preserve_json)) as string[],
      created_at: String(row.created_at)
    };
  }
}
