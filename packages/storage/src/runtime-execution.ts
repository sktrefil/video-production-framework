import Database from "better-sqlite3";
import type {
  MediaArtifact,
  ProviderJob
} from "@vpf/domain";
import type {
  RuntimeExecutionReceipt,
  RuntimePersistencePort
} from "@vpf/provider-orchestrator";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import { FOUNDATION_MIGRATION_SQL } from "./index.js";
import { SCENE_ASSET_MIGRATION_SQL } from "./scene-assets.js";

export const RUNTIME_EXECUTION_MIGRATION_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runtime_execution_receipts (
  receipt_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  provider_job_id TEXT NOT NULL,
  provider_job_revision INTEGER NOT NULL,
  attempt INTEGER NOT NULL,
  stage TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_profile_version TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  runtime_job_json TEXT NOT NULL,
  runtime_result_json TEXT,
  provider_request_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_receipts_job
  ON runtime_execution_receipts(project_id, provider_job_id, attempt, created_at);

CREATE INDEX IF NOT EXISTS idx_runtime_receipts_stage
  ON runtime_execution_receipts(project_id, stage, created_at);
`;

export class SqliteRuntimeExecutionRepository
  implements RuntimePersistencePort {
  readonly db: Database.Database;

  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(FOUNDATION_MIGRATION_SQL);
    this.db.exec(SCENE_ASSET_MIGRATION_SQL);
    this.db.exec(RUNTIME_EXECUTION_MIGRATION_SQL);
  }

  close(): void {
    this.db.close();
  }

  async getLatestProviderJob(
    projectId: string,
    jobId: string
  ): Promise<ProviderJob | null> {
    const row = this.db.prepare(
      `SELECT * FROM provider_jobs
       WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId, jobId) as any;

    return row === undefined ? null : mapProviderJob(row);
  }

  async recordRuntimeReceipt(input: {
    receipt: RuntimeExecutionReceipt;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      insertRuntimeReceipt(this.db, input.receipt);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitProviderTransition(input: {
    previousJob: ProviderJob;
    nextJob: ProviderJob;
    receipt: RuntimeExecutionReceipt;
    media: MediaArtifact[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      const changed = this.db.prepare(
        `UPDATE provider_jobs
         SET lifecycle_status = 'SUPERSEDED', updated_at = ?
         WHERE project_id = ?
           AND id = ?
           AND revision = ?
           AND lifecycle_status = 'ACTIVE'`
      ).run(
        input.event.createdAt,
        input.previousJob.projectId,
        input.previousJob.id,
        input.previousJob.revision
      );

      if (changed.changes !== 1) {
        throw new Error(
          "Provider job transition lost current revision before commit."
        );
      }

      insertProviderJob(this.db, input.nextJob);
      for (const media of input.media) {
        insertMedia(this.db, media);
      }
      insertRuntimeReceipt(this.db, input.receipt);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async listRuntimeReceipts(
    projectId: string,
    jobId: string
  ): Promise<RuntimeExecutionReceipt[]> {
    const rows = this.db.prepare(
      `SELECT * FROM runtime_execution_receipts
       WHERE project_id = ? AND provider_job_id = ?
       ORDER BY created_at, rowid`
    ).all(projectId, jobId) as any[];

    return rows.map(mapRuntimeReceipt);
  }
}

function insertRuntimeReceipt(
  db: Database.Database,
  receipt: RuntimeExecutionReceipt
): void {
  db.prepare(
    `INSERT INTO runtime_execution_receipts
      (receipt_id, project_id, provider_job_id, provider_job_revision, attempt,
       stage, provider, provider_profile_version, input_hash, runtime_job_json,
       runtime_result_json, provider_request_ids_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    receipt.id,
    receipt.projectId,
    receipt.providerJobId,
    receipt.providerJobRevision,
    receipt.attempt,
    receipt.stage,
    receipt.runtimeJob.provider,
    receipt.runtimeJob.providerProfileVersion,
    receipt.inputHash,
    JSON.stringify(receipt.runtimeJob),
    receipt.runtimeResult === undefined
      ? null
      : JSON.stringify(receipt.runtimeResult),
    JSON.stringify(receipt.runtimeResult?.providerRequestIds ?? []),
    receipt.createdAt
  );
}

function insertEvent(
  db: Database.Database,
  event: WorkflowEvent,
  outbox: OutboxRecord
): void {
  db.prepare(
    `INSERT INTO workflow_events
      (event_id, project_id, event_type, target_type, target_id, trigger_type,
       payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    event.eventId,
    event.projectId,
    event.eventType,
    event.targetType,
    event.targetId,
    event.trigger,
    JSON.stringify(event.payload ?? null),
    event.createdAt
  );

  db.prepare(
    `INSERT INTO event_outbox
      (outbox_id, event_id, status, attempts, created_at, processed_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    outbox.outboxId,
    outbox.eventId,
    outbox.status,
    outbox.attempts,
    outbox.createdAt,
    outbox.processedAt ?? null
  );
}

function insertProviderJob(
  db: Database.Database,
  job: ProviderJob
): void {
  db.prepare(
    `INSERT INTO provider_jobs
      (id, project_id, revision, lifecycle_status, job_type, provider,
       provider_profile_version, target_type, target_id, target_revision,
       execution_mode, status, attempt, retry_of_job_id, input_payload_json,
       result_media_ids_json, error_code, error_detail, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    job.id,
    job.projectId,
    job.revision,
    job.lifecycleStatus,
    job.jobType,
    job.provider,
    job.providerProfileVersion,
    job.targetType,
    job.targetId,
    job.targetRevision,
    job.executionMode,
    job.status,
    job.attempt,
    job.retryOfJobId ?? null,
    JSON.stringify(job.inputPayload),
    JSON.stringify(job.resultMediaIds),
    job.errorCode ?? null,
    job.errorDetail ?? null,
    job.createdAt,
    job.updatedAt
  );
}

function insertMedia(
  db: Database.Database,
  media: MediaArtifact
): void {
  db.prepare(
    `INSERT INTO media_artifacts
      (id, project_id, revision, lifecycle_status, media_type, relative_path,
       mime_type, width, height, duration_ms, checksum, source_job_id,
       media_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    media.id,
    media.projectId,
    media.revision,
    media.lifecycleStatus,
    media.mediaType,
    media.relativePath,
    media.mimeType,
    media.width ?? null,
    media.height ?? null,
    media.durationMs ?? null,
    media.checksum,
    media.sourceJobId ?? null,
    media.mediaStatus,
    media.createdAt,
    media.updatedAt
  );
}

function mapProviderJob(row: any): ProviderJob {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    jobType: row.job_type,
    provider: row.provider,
    providerProfileVersion: row.provider_profile_version,
    targetType: row.target_type,
    targetId: row.target_id,
    targetRevision: row.target_revision,
    executionMode: row.execution_mode,
    status: row.status,
    attempt: row.attempt,
    ...(row.retry_of_job_id == null
      ? {}
      : { retryOfJobId: row.retry_of_job_id }),
    inputPayload: JSON.parse(row.input_payload_json),
    resultMediaIds: JSON.parse(row.result_media_ids_json) as string[],
    ...(row.error_code == null ? {} : { errorCode: row.error_code }),
    ...(row.error_detail == null ? {} : { errorDetail: row.error_detail })
  };
}

function mapRuntimeReceipt(row: any): RuntimeExecutionReceipt {
  return {
    id: row.receipt_id,
    projectId: row.project_id,
    providerJobId: row.provider_job_id,
    providerJobRevision: row.provider_job_revision,
    attempt: row.attempt,
    stage: row.stage,
    inputHash: row.input_hash,
    runtimeJob: JSON.parse(row.runtime_job_json),
    ...(row.runtime_result_json == null
      ? {}
      : { runtimeResult: JSON.parse(row.runtime_result_json) }),
    createdAt: row.created_at
  };
}
