import Database from "better-sqlite3";

export interface Agent3RuntimeRun {
  run_id: string;
  project_id: string;
  task_id: "T040" | "T050" | "T060";
  provider: string;
  model_id: string;
  provider_response_id: string | null;
  status: "RUNNING" | "COMPLETE" | "FAILED";
  input_sha256: string;
  output_sha256: string | null;
  error_code: string | null;
  error_detail: string | null;
  started_at: string;
  completed_at: string | null;
}

export class Agent3RuntimeRepository {
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

  start(
    run: Omit<
      Agent3RuntimeRun,
      "status" | "output_sha256" | "error_code" | "error_detail" | "completed_at"
    >
  ): void {
    this.db.prepare(`INSERT INTO agent3_runtime_runs
      (run_id, project_id, task_id, provider, model_id, provider_response_id, status,
       input_sha256, output_sha256, error_code, error_detail, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, 'RUNNING', ?, NULL, NULL, NULL, ?, NULL)`
    ).run(
      run.run_id,
      run.project_id,
      run.task_id,
      run.provider,
      run.model_id,
      run.provider_response_id,
      run.input_sha256,
      run.started_at
    );
  }

  complete(input: {
    runId: string;
    providerResponseId?: string | null;
    outputSha256: string;
    completedAt: string;
  }): void {
    this.db.prepare(`UPDATE agent3_runtime_runs
      SET status='COMPLETE',
          provider_response_id=COALESCE(?, provider_response_id),
          output_sha256=?,
          completed_at=?
      WHERE run_id=?`
    ).run(
      input.providerResponseId ?? null,
      input.outputSha256,
      input.completedAt,
      input.runId
    );
  }

  fail(input: {
    runId: string;
    providerResponseId?: string | null;
    errorCode: string;
    errorDetail: string;
    completedAt: string;
  }): void {
    this.db.prepare(`UPDATE agent3_runtime_runs
      SET status='FAILED',
          provider_response_id=COALESCE(?, provider_response_id),
          error_code=?,
          error_detail=?,
          completed_at=?
      WHERE run_id=?`
    ).run(
      input.providerResponseId ?? null,
      input.errorCode,
      input.errorDetail.slice(0, 2000),
      input.completedAt,
      input.runId
    );
  }

  list(projectId: string): Agent3RuntimeRun[] {
    return this.db.prepare(`SELECT * FROM agent3_runtime_runs
      WHERE project_id=? ORDER BY started_at, run_id`
    ).all(projectId) as Agent3RuntimeRun[];
  }
}
