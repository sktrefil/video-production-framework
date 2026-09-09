import type {
  FinalDeliveryManifest,
  FinalRenderAttempt,
  FinalRenderTechnicalQcRecord
} from "@vpf/domain";
import type {FinalRenderRepository} from "@vpf/final-render";
import type {OutboxRecord, WorkflowEvent} from "@vpf/workflow";
import {SqliteEditorTimelineRepository} from "./editor-timeline.js";

export const FINAL_RENDER_MIGRATION_SQL = "PRAGMA foreign_keys = ON;\n\nCREATE TABLE IF NOT EXISTS final_render_attempts (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  assembly_id TEXT NOT NULL,\n  assembly_revision INTEGER NOT NULL,\n  project_sha256 TEXT NOT NULL,\n  attempt INTEGER NOT NULL,\n  retry_of_render_attempt_id TEXT,\n  status TEXT NOT NULL,\n  profile_json TEXT NOT NULL,\n  paths_json TEXT NOT NULL,\n  expected_fps REAL NOT NULL,\n  expected_width INTEGER NOT NULL,\n  expected_height INTEGER NOT NULL,\n  expected_duration_in_frames INTEGER NOT NULL,\n  expected_audio INTEGER NOT NULL,\n  started_at TEXT,\n  completed_at TEXT,\n  error_code TEXT,\n  error_detail TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_final_render_attempt_revision\n  ON final_render_attempts(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE INDEX IF NOT EXISTS idx_final_render_project\n  ON final_render_attempts(project_id);\n\nCREATE TABLE IF NOT EXISTS final_render_technical_qc (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  render_attempt_id TEXT NOT NULL,\n  render_attempt_revision INTEGER NOT NULL,\n  assembly_id TEXT NOT NULL,\n  assembly_revision INTEGER NOT NULL,\n  status TEXT NOT NULL,\n  issue_codes_json TEXT NOT NULL,\n  expected_json TEXT NOT NULL,\n  actual_json TEXT NOT NULL,\n  output_path TEXT NOT NULL,\n  output_size_bytes INTEGER NOT NULL,\n  output_sha256 TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_final_render_qc\n  ON final_render_technical_qc(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE INDEX IF NOT EXISTS idx_final_render_qc_attempt\n  ON final_render_technical_qc(project_id, render_attempt_id);\n\nCREATE TABLE IF NOT EXISTS final_delivery_manifests (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  render_attempt_id TEXT NOT NULL,\n  render_attempt_revision INTEGER NOT NULL,\n  technical_qc_id TEXT NOT NULL,\n  technical_qc_revision INTEGER NOT NULL,\n  assembly_id TEXT NOT NULL,\n  assembly_revision INTEGER NOT NULL,\n  project_sha256 TEXT NOT NULL,\n  status TEXT NOT NULL,\n  output_path TEXT NOT NULL,\n  output_size_bytes INTEGER NOT NULL,\n  output_sha256 TEXT NOT NULL,\n  codec TEXT NOT NULL,\n  audio_codec TEXT,\n  pixel_format TEXT NOT NULL,\n  fps REAL NOT NULL,\n  width INTEGER NOT NULL,\n  height INTEGER NOT NULL,\n  duration_in_frames INTEGER NOT NULL,\n  duration_ms REAL NOT NULL,\n  render_manifest_path TEXT NOT NULL,\n  technical_qc_path TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_delivery_manifest\n  ON final_delivery_manifests(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE INDEX IF NOT EXISTS idx_delivery_project\n  ON final_delivery_manifests(project_id);\n";

function insertEvent(
  db: SqliteEditorTimelineRepository["db"],
  event: WorkflowEvent,
  outbox: OutboxRecord
): void {
  db.prepare(
    "INSERT INTO workflow_events (event_id, project_id, event_type, target_type, target_id, trigger_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
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
    "INSERT INTO event_outbox (outbox_id, event_id, status, attempts, created_at, processed_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    outbox.outboxId,
    outbox.eventId,
    outbox.status,
    outbox.attempts,
    outbox.createdAt,
    outbox.processedAt ?? null
  );
}

function mapAttempt(row: any): FinalRenderAttempt {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assemblyId: row.assembly_id,
    assemblyRevision: row.assembly_revision,
    projectSha256: row.project_sha256,
    attempt: row.attempt,
    ...(row.retry_of_render_attempt_id == null
      ? {}
      : {retryOfRenderAttemptId: row.retry_of_render_attempt_id}),
    status: row.status,
    profile: JSON.parse(row.profile_json),
    paths: JSON.parse(row.paths_json),
    expectedFps: row.expected_fps,
    expectedWidth: row.expected_width,
    expectedHeight: row.expected_height,
    expectedDurationInFrames: row.expected_duration_in_frames,
    expectedAudio: row.expected_audio === 1,
    ...(row.started_at == null ? {} : {startedAt: row.started_at}),
    ...(row.completed_at == null ? {} : {completedAt: row.completed_at}),
    ...(row.error_code == null ? {} : {errorCode: row.error_code}),
    ...(row.error_detail == null ? {} : {errorDetail: row.error_detail})
  };
}

function mapQc(row: any): FinalRenderTechnicalQcRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    renderAttemptId: row.render_attempt_id,
    renderAttemptRevision: row.render_attempt_revision,
    assemblyId: row.assembly_id,
    assemblyRevision: row.assembly_revision,
    status: row.status,
    issueCodes: JSON.parse(row.issue_codes_json),
    expected: JSON.parse(row.expected_json),
    actual: JSON.parse(row.actual_json),
    outputPath: row.output_path,
    outputSizeBytes: row.output_size_bytes,
    outputSha256: row.output_sha256
  };
}

function mapDelivery(row: any): FinalDeliveryManifest {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    renderAttemptId: row.render_attempt_id,
    renderAttemptRevision: row.render_attempt_revision,
    technicalQcId: row.technical_qc_id,
    technicalQcRevision: row.technical_qc_revision,
    assemblyId: row.assembly_id,
    assemblyRevision: row.assembly_revision,
    projectSha256: row.project_sha256,
    status: row.status,
    outputPath: row.output_path,
    outputSizeBytes: row.output_size_bytes,
    outputSha256: row.output_sha256,
    codec: row.codec,
    ...(row.audio_codec == null ? {} : {audioCodec: row.audio_codec}),
    pixelFormat: row.pixel_format,
    fps: row.fps,
    width: row.width,
    height: row.height,
    durationInFrames: row.duration_in_frames,
    durationMs: row.duration_ms,
    createdFromRenderManifestPath: row.render_manifest_path,
    technicalQcPath: row.technical_qc_path
  };
}

export class SqliteFinalRenderRepository
  extends SqliteEditorTimelineRepository
  implements FinalRenderRepository {
  constructor(filename: string) {
    super(filename);
    this.db.exec(FINAL_RENDER_MIGRATION_SQL);
  }

  async getLatestRenderAttempt(projectId: string): Promise<FinalRenderAttempt | null> {
    const row = this.db.prepare(
      "SELECT * FROM final_render_attempts WHERE project_id = ? AND lifecycle_status = 'ACTIVE' ORDER BY rowid DESC LIMIT 1"
    ).get(projectId) as any;
    return row === undefined ? null : mapAttempt(row);
  }

  async getRenderAttempt(
    projectId: string,
    renderAttemptId: string
  ): Promise<FinalRenderAttempt | null> {
    const row = this.db.prepare(
      "SELECT * FROM final_render_attempts WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE' ORDER BY revision DESC LIMIT 1"
    ).get(projectId, renderAttemptId) as any;
    return row === undefined ? null : mapAttempt(row);
  }

  async getLatestTechnicalQc(
    projectId: string,
    renderAttemptId: string
  ): Promise<FinalRenderTechnicalQcRecord | null> {
    const row = this.db.prepare(
      "SELECT * FROM final_render_technical_qc WHERE project_id = ? AND render_attempt_id = ? AND lifecycle_status = 'ACTIVE' ORDER BY rowid DESC LIMIT 1"
    ).get(projectId, renderAttemptId) as any;
    return row === undefined ? null : mapQc(row);
  }

  async getLatestDeliveryManifest(projectId: string): Promise<FinalDeliveryManifest | null> {
    const row = this.db.prepare(
      "SELECT * FROM final_delivery_manifests WHERE project_id = ? AND lifecycle_status = 'ACTIVE' ORDER BY rowid DESC LIMIT 1"
    ).get(projectId) as any;
    return row === undefined ? null : mapDelivery(row);
  }

  async commitRenderAttempt(input: {
    previousAttempt: FinalRenderAttempt | null;
    nextAttempt: FinalRenderAttempt;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      if (input.previousAttempt !== null) {
        this.supersedeAttempt(input.previousAttempt, input.event.createdAt);
      }
      this.insertAttempt(input.nextAttempt);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitRenderOutcome(input: {
    previousAttempt: FinalRenderAttempt;
    nextAttempt: FinalRenderAttempt;
    technicalQc: FinalRenderTechnicalQcRecord;
    previousDelivery: FinalDeliveryManifest | null;
    delivery: FinalDeliveryManifest;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeAttempt(input.previousAttempt, input.event.createdAt);
      this.insertAttempt(input.nextAttempt);
      this.insertQc(input.technicalQc);
      if (input.previousDelivery !== null) {
        this.supersedeDelivery(input.previousDelivery, input.event.createdAt);
      }
      this.insertDelivery(input.delivery);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitRenderFailure(input: {
    previousAttempt: FinalRenderAttempt;
    nextAttempt: FinalRenderAttempt;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeAttempt(input.previousAttempt, input.event.createdAt);
      this.insertAttempt(input.nextAttempt);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitRenderStale(input: {
    previousAttempt: FinalRenderAttempt;
    nextAttempt: FinalRenderAttempt;
    previousDelivery: FinalDeliveryManifest | null;
    nextDelivery: FinalDeliveryManifest | null;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeAttempt(input.previousAttempt, input.event.createdAt);
      this.insertAttempt(input.nextAttempt);
      if (input.previousDelivery !== null && input.nextDelivery !== null) {
        this.supersedeDelivery(input.previousDelivery, input.event.createdAt);
        this.insertDelivery(input.nextDelivery);
      }
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  private insertAttempt(attempt: FinalRenderAttempt): void {
    this.db.prepare(
      "INSERT INTO final_render_attempts (id, project_id, revision, lifecycle_status, assembly_id, assembly_revision, project_sha256, attempt, retry_of_render_attempt_id, status, profile_json, paths_json, expected_fps, expected_width, expected_height, expected_duration_in_frames, expected_audio, started_at, completed_at, error_code, error_detail, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      attempt.id,
      attempt.projectId,
      attempt.revision,
      attempt.lifecycleStatus,
      attempt.assemblyId,
      attempt.assemblyRevision,
      attempt.projectSha256,
      attempt.attempt,
      attempt.retryOfRenderAttemptId ?? null,
      attempt.status,
      JSON.stringify(attempt.profile),
      JSON.stringify(attempt.paths),
      attempt.expectedFps,
      attempt.expectedWidth,
      attempt.expectedHeight,
      attempt.expectedDurationInFrames,
      attempt.expectedAudio ? 1 : 0,
      attempt.startedAt ?? null,
      attempt.completedAt ?? null,
      attempt.errorCode ?? null,
      attempt.errorDetail ?? null,
      attempt.createdAt,
      attempt.updatedAt
    );
  }

  private insertQc(qc: FinalRenderTechnicalQcRecord): void {
    this.db.prepare(
      "INSERT INTO final_render_technical_qc (id, project_id, revision, lifecycle_status, render_attempt_id, render_attempt_revision, assembly_id, assembly_revision, status, issue_codes_json, expected_json, actual_json, output_path, output_size_bytes, output_sha256, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      qc.id,
      qc.projectId,
      qc.revision,
      qc.lifecycleStatus,
      qc.renderAttemptId,
      qc.renderAttemptRevision,
      qc.assemblyId,
      qc.assemblyRevision,
      qc.status,
      JSON.stringify(qc.issueCodes),
      JSON.stringify(qc.expected),
      JSON.stringify(qc.actual),
      qc.outputPath,
      qc.outputSizeBytes,
      qc.outputSha256,
      qc.createdAt,
      qc.updatedAt
    );
  }

  private insertDelivery(delivery: FinalDeliveryManifest): void {
    this.db.prepare(
      "INSERT INTO final_delivery_manifests (id, project_id, revision, lifecycle_status, render_attempt_id, render_attempt_revision, technical_qc_id, technical_qc_revision, assembly_id, assembly_revision, project_sha256, status, output_path, output_size_bytes, output_sha256, codec, audio_codec, pixel_format, fps, width, height, duration_in_frames, duration_ms, render_manifest_path, technical_qc_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      delivery.id,
      delivery.projectId,
      delivery.revision,
      delivery.lifecycleStatus,
      delivery.renderAttemptId,
      delivery.renderAttemptRevision,
      delivery.technicalQcId,
      delivery.technicalQcRevision,
      delivery.assemblyId,
      delivery.assemblyRevision,
      delivery.projectSha256,
      delivery.status,
      delivery.outputPath,
      delivery.outputSizeBytes,
      delivery.outputSha256,
      delivery.codec,
      delivery.audioCodec ?? null,
      delivery.pixelFormat,
      delivery.fps,
      delivery.width,
      delivery.height,
      delivery.durationInFrames,
      delivery.durationMs,
      delivery.createdFromRenderManifestPath,
      delivery.technicalQcPath,
      delivery.createdAt,
      delivery.updatedAt
    );
  }

  private supersedeAttempt(attempt: FinalRenderAttempt, updatedAt: string): void {
    this.db.prepare(
      "UPDATE final_render_attempts SET lifecycle_status = 'SUPERSEDED', updated_at = ? WHERE id = ? AND revision = ?"
    ).run(updatedAt, attempt.id, attempt.revision);
  }

  private supersedeDelivery(
    delivery: FinalDeliveryManifest,
    updatedAt: string
  ): void {
    this.db.prepare(
      "UPDATE final_delivery_manifests SET lifecycle_status = 'SUPERSEDED', updated_at = ? WHERE id = ? AND revision = ?"
    ).run(updatedAt, delivery.id, delivery.revision);
  }
}
