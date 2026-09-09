import type {
  ApprovalRecord,
  ClipFallbackRecord,
  ClipQcRecord,
  ProductionClip
} from "@vpf/domain";
import type { QcFallbackRepository } from "@vpf/qc-fallback";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import { SqliteFinalClipRepository } from "./final-clip.js";

export const QC_FALLBACK_MIGRATION_SQL = "PRAGMA foreign_keys = ON;\n\nCREATE TABLE IF NOT EXISTS clip_qc_records (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  clip_id TEXT NOT NULL,\n  clip_revision INTEGER NOT NULL,\n  candidate_media_id TEXT NOT NULL,\n  status TEXT NOT NULL,\n  severity TEXT NOT NULL,\n  confidence REAL NOT NULL,\n  usable_in_ms INTEGER,\n  usable_out_ms INTEGER,\n  issues_json TEXT NOT NULL,\n  regeneration_reason TEXT,\n  editorial_instruction TEXT,\n  fallback_reason TEXT,\n  decision_id TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE TABLE IF NOT EXISTS clip_fallback_records (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  clip_id TEXT NOT NULL,\n  clip_revision INTEGER NOT NULL,\n  source_qc_id TEXT NOT NULL,\n  action TEXT NOT NULL,\n  rationale TEXT NOT NULL,\n  decision_id TEXT NOT NULL,\n  requires_human_review INTEGER NOT NULL,\n  applied INTEGER NOT NULL,\n  resulting_implementation_type TEXT,\n  resulting_implementation_ref_id TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_clip_qc\n  ON clip_qc_records(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE INDEX IF NOT EXISTS idx_clip_qc_clip\n  ON clip_qc_records(project_id, clip_id, revision);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_clip_fallback\n  ON clip_fallback_records(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE INDEX IF NOT EXISTS idx_clip_fallback_clip\n  ON clip_fallback_records(project_id, clip_id, revision);\n";

const encode = (value: unknown) => JSON.stringify(value);
const decodeStrings = (value: string): string[] => JSON.parse(value) as string[];

function insertEvent(
  db: SqliteFinalClipRepository["db"],
  event: WorkflowEvent,
  outbox: OutboxRecord
): void {
  db.prepare(`INSERT INTO workflow_events
    (event_id, project_id, event_type, target_type, target_id, trigger_type, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      event.eventId,
      event.projectId,
      event.eventType,
      event.targetType,
      event.targetId,
      event.trigger,
      JSON.stringify(event.payload ?? null),
      event.createdAt
    );
  db.prepare(`INSERT INTO event_outbox
    (outbox_id, event_id, status, attempts, created_at, processed_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(
      outbox.outboxId,
      outbox.eventId,
      outbox.status,
      outbox.attempts,
      outbox.createdAt,
      outbox.processedAt ?? null
    );
}

function insertApproval(
  db: SqliteFinalClipRepository["db"],
  approval: ApprovalRecord
): void {
  db.prepare(`INSERT INTO approval_records
    (id, project_id, target_type, target_id, target_revision, approval_state, reason,
     approved_by_type, approved_by_id, selected_media_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      approval.id,
      approval.projectId,
      approval.targetType,
      approval.targetId,
      approval.targetRevision,
      approval.approvalState,
      approval.reason,
      approval.approvedByType,
      approval.approvedById ?? null,
      approval.selectedMediaId ?? null,
      approval.createdAt
    );
}

function mapQc(row: any): ClipQcRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    clipId: row.clip_id,
    clipRevision: row.clip_revision,
    candidateMediaId: row.candidate_media_id,
    status: row.status,
    severity: row.severity,
    confidence: row.confidence,
    ...(row.usable_in_ms == null ? {} : { usableInMs: row.usable_in_ms }),
    ...(row.usable_out_ms == null ? {} : { usableOutMs: row.usable_out_ms }),
    issues: decodeStrings(row.issues_json),
    ...(row.regeneration_reason == null ? {} : { regenerationReason: row.regeneration_reason }),
    ...(row.editorial_instruction == null ? {} : { editorialInstruction: row.editorial_instruction }),
    ...(row.fallback_reason == null ? {} : { fallbackReason: row.fallback_reason }),
    decisionId: row.decision_id
  };
}

function mapFallback(row: any): ClipFallbackRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    clipId: row.clip_id,
    clipRevision: row.clip_revision,
    sourceQcId: row.source_qc_id,
    action: row.action,
    rationale: row.rationale,
    decisionId: row.decision_id,
    requiresHumanReview: row.requires_human_review === 1,
    applied: row.applied === 1,
    ...(row.resulting_implementation_type == null
      ? {}
      : { resultingImplementationType: row.resulting_implementation_type }),
    ...(row.resulting_implementation_ref_id == null
      ? {}
      : { resultingImplementationRefId: row.resulting_implementation_ref_id })
  };
}

export class SqliteQcFallbackRepository
  extends SqliteFinalClipRepository
  implements QcFallbackRepository {
  constructor(filename: string) {
    super(filename);
    this.db.exec(QC_FALLBACK_MIGRATION_SQL);
  }

  async getLatestClipQc(projectId: string, clipId: string): Promise<ClipQcRecord | null> {
    const row = this.db.prepare(
      `SELECT * FROM clip_qc_records
       WHERE project_id = ? AND clip_id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY rowid DESC LIMIT 1`
    ).get(projectId, clipId) as any;
    return row === undefined ? null : mapQc(row);
  }

  async getClipQc(projectId: string, qcId: string): Promise<ClipQcRecord | null> {
    const row = this.db.prepare(
      `SELECT * FROM clip_qc_records
       WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId, qcId) as any;
    return row === undefined ? null : mapQc(row);
  }

  async getLatestFallback(projectId: string, clipId: string): Promise<ClipFallbackRecord | null> {
    const row = this.db.prepare(
      `SELECT * FROM clip_fallback_records
       WHERE project_id = ? AND clip_id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY rowid DESC LIMIT 1`
    ).get(projectId, clipId) as any;
    return row === undefined ? null : mapFallback(row);
  }

  async getFallback(projectId: string, fallbackId: string): Promise<ClipFallbackRecord | null> {
    const row = this.db.prepare(
      `SELECT * FROM clip_fallback_records
       WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId, fallbackId) as any;
    return row === undefined ? null : mapFallback(row);
  }

  async commitClipQc(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    qc: ClipQcRecord;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeClip(input.previousClip, input.event.createdAt);
      this.insertClip(input.nextClip);
      this.insertQc(input.qc);
      if (input.approval !== undefined) insertApproval(this.db, input.approval);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitQcApproval(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeClip(input.previousClip, input.event.createdAt);
      this.insertClip(input.nextClip);
      insertApproval(this.db, input.approval);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitFallbackSelection(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    fallback: ClipFallbackRecord;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeClip(input.previousClip, input.event.createdAt);
      this.insertClip(input.nextClip);
      this.insertFallback(input.fallback);
      if (input.approval !== undefined) insertApproval(this.db, input.approval);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitFallbackRevision(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    previousFallback: ClipFallbackRecord;
    nextFallback: ClipFallbackRecord;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeClip(input.previousClip, input.event.createdAt);
      this.insertClip(input.nextClip);
      this.db.prepare(
        `UPDATE clip_fallback_records
         SET lifecycle_status = 'SUPERSEDED', updated_at = ?
         WHERE id = ? AND revision = ?`
      ).run(
        input.event.createdAt,
        input.previousFallback.id,
        input.previousFallback.revision
      );
      this.insertFallback(input.nextFallback);
      if (input.approval !== undefined) insertApproval(this.db, input.approval);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  private supersedeClip(clip: ProductionClip, updatedAt: string): void {
    this.db.prepare(
      `UPDATE production_clips
       SET lifecycle_status = 'SUPERSEDED', updated_at = ?, clip_status = 'SUPERSEDED'
       WHERE id = ? AND revision = ?`
    ).run(updatedAt, clip.id, clip.revision);
  }

  private insertClip(clip: ProductionClip): void {
    this.db.prepare(`INSERT INTO production_clips
      (id, project_id, revision, lifecycle_status,
       link_id, link_revision, clip_mode,
       clip_start_state_entity_type, clip_start_state_entity_id,
       clip_start_state_field, clip_start_state_entity_revision,
       clip_end_state_entity_type, clip_end_state_entity_id,
       clip_end_state_field, clip_end_state_entity_revision,
       start_asset_id, start_asset_revision, start_media_id,
       end_asset_id, end_asset_revision, end_media_id,
       transition_method, camera_move, subject_motion, environment_motion,
       duration_ms, provider_execution_required,
       final_design_approval_id, provider_preflight_id,
       candidate_media_ids_json, approved_media_id, clip_status,
       stale, stale_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        clip.id,
        clip.projectId,
        clip.revision,
        clip.lifecycleStatus,
        clip.linkId,
        clip.linkRevision,
        clip.clipMode,
        clip.clipStartStateRef.entityType,
        clip.clipStartStateRef.entityId,
        clip.clipStartStateRef.stateField,
        clip.clipStartStateRef.entityRevision ?? null,
        clip.clipEndStateTarget.entityType,
        clip.clipEndStateTarget.entityId,
        clip.clipEndStateTarget.stateField,
        clip.clipEndStateTarget.entityRevision ?? null,
        clip.startAssetId,
        clip.startAssetRevision,
        clip.startMediaId,
        clip.endAssetId ?? null,
        clip.endAssetRevision ?? null,
        clip.endMediaId ?? null,
        clip.transitionMethod,
        clip.cameraMove,
        clip.subjectMotion,
        clip.environmentMotion,
        clip.durationMs,
        clip.providerExecutionRequired ? 1 : 0,
        clip.finalDesignApprovalId ?? null,
        clip.providerPreflightId ?? null,
        encode(clip.candidateMediaIds),
        clip.approvedMediaId ?? null,
        clip.clipStatus,
        clip.stale ? 1 : 0,
        clip.staleReason ?? null,
        clip.createdAt,
        clip.updatedAt
      );
  }

  private insertQc(qc: ClipQcRecord): void {
    this.db.prepare(`INSERT INTO clip_qc_records
      (id, project_id, revision, lifecycle_status,
       clip_id, clip_revision, candidate_media_id,
       status, severity, confidence, usable_in_ms, usable_out_ms,
       issues_json, regeneration_reason, editorial_instruction,
       fallback_reason, decision_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        qc.id,
        qc.projectId,
        qc.revision,
        qc.lifecycleStatus,
        qc.clipId,
        qc.clipRevision,
        qc.candidateMediaId,
        qc.status,
        qc.severity,
        qc.confidence,
        qc.usableInMs ?? null,
        qc.usableOutMs ?? null,
        encode(qc.issues),
        qc.regenerationReason ?? null,
        qc.editorialInstruction ?? null,
        qc.fallbackReason ?? null,
        qc.decisionId,
        qc.createdAt,
        qc.updatedAt
      );
  }

  private insertFallback(fallback: ClipFallbackRecord): void {
    this.db.prepare(`INSERT INTO clip_fallback_records
      (id, project_id, revision, lifecycle_status,
       clip_id, clip_revision, source_qc_id, action, rationale,
       decision_id, requires_human_review, applied,
       resulting_implementation_type, resulting_implementation_ref_id,
       created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        fallback.id,
        fallback.projectId,
        fallback.revision,
        fallback.lifecycleStatus,
        fallback.clipId,
        fallback.clipRevision,
        fallback.sourceQcId,
        fallback.action,
        fallback.rationale,
        fallback.decisionId,
        fallback.requiresHumanReview ? 1 : 0,
        fallback.applied ? 1 : 0,
        fallback.resultingImplementationType ?? null,
        fallback.resultingImplementationRefId ?? null,
        fallback.createdAt,
        fallback.updatedAt
      );
  }
}
