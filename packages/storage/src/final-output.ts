import type {
  ApprovalRecord,
  FinalOutputQcRecord,
  PublishPackageManifest
} from "@vpf/domain";
import type {FinalOutputRepository} from "@vpf/final-output";
import type {OutboxRecord, WorkflowEvent} from "@vpf/workflow";
import {SqliteFinalRenderRepository} from "./final-render.js";

export const FINAL_OUTPUT_MIGRATION_SQL = "PRAGMA foreign_keys = ON;\n\nCREATE TABLE IF NOT EXISTS final_output_qc_records (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  render_attempt_id TEXT NOT NULL,\n  render_attempt_revision INTEGER NOT NULL,\n  delivery_manifest_id TEXT NOT NULL,\n  delivery_manifest_revision INTEGER NOT NULL,\n  project_sha256 TEXT NOT NULL,\n  output_path TEXT NOT NULL,\n  output_sha256 TEXT NOT NULL,\n  status TEXT NOT NULL,\n  confidence REAL NOT NULL,\n  issue_codes_json TEXT NOT NULL,\n  notes_json TEXT NOT NULL,\n  review_required INTEGER NOT NULL,\n  review_approval_id TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_final_output_qc\n  ON final_output_qc_records(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE INDEX IF NOT EXISTS idx_final_output_qc_project\n  ON final_output_qc_records(project_id);\n\nCREATE TABLE IF NOT EXISTS publish_package_manifests (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  render_attempt_id TEXT NOT NULL,\n  render_attempt_revision INTEGER NOT NULL,\n  delivery_manifest_id TEXT NOT NULL,\n  delivery_manifest_revision INTEGER NOT NULL,\n  output_qc_id TEXT NOT NULL,\n  output_qc_revision INTEGER NOT NULL,\n  project_sha256 TEXT NOT NULL,\n  package_status TEXT NOT NULL,\n  package_directory TEXT NOT NULL,\n  package_sha256 TEXT NOT NULL,\n  metadata_json TEXT NOT NULL,\n  files_json TEXT NOT NULL,\n  recommended_file_name TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_publish_package\n  ON publish_package_manifests(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE INDEX IF NOT EXISTS idx_publish_package_project\n  ON publish_package_manifests(project_id);\n";

function insertEvent(
  db: SqliteFinalRenderRepository["db"],
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

function insertFinalOutputApproval(
  db: SqliteFinalRenderRepository["db"],
  approval: ApprovalRecord
): void {
  db.prepare(
    "INSERT INTO approval_records (id, project_id, target_type, target_id, target_revision, approval_state, reason, approved_by_type, approved_by_id, selected_media_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
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

function mapQc(row: any): FinalOutputQcRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    renderAttemptId: row.render_attempt_id,
    renderAttemptRevision: row.render_attempt_revision,
    deliveryManifestId: row.delivery_manifest_id,
    deliveryManifestRevision: row.delivery_manifest_revision,
    projectSha256: row.project_sha256,
    outputPath: row.output_path,
    outputSha256: row.output_sha256,
    status: row.status,
    confidence: row.confidence,
    issueCodes: JSON.parse(row.issue_codes_json),
    notes: JSON.parse(row.notes_json),
    reviewRequired: row.review_required === 1,
    ...(row.review_approval_id == null
      ? {}
      : {reviewApprovalId: row.review_approval_id})
  };
}

function mapPackage(row: any): PublishPackageManifest {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    renderAttemptId: row.render_attempt_id,
    renderAttemptRevision: row.render_attempt_revision,
    deliveryManifestId: row.delivery_manifest_id,
    deliveryManifestRevision: row.delivery_manifest_revision,
    outputQcId: row.output_qc_id,
    outputQcRevision: row.output_qc_revision,
    projectSha256: row.project_sha256,
    packageStatus: row.package_status,
    packageDirectory: row.package_directory,
    packageSha256: row.package_sha256,
    metadata: JSON.parse(row.metadata_json),
    files: JSON.parse(row.files_json),
    recommendedFileName: row.recommended_file_name
  };
}

export class SqliteFinalOutputRepository
  extends SqliteFinalRenderRepository
  implements FinalOutputRepository {
  constructor(filename: string) {
    super(filename);
    this.db.exec(FINAL_OUTPUT_MIGRATION_SQL);
  }

  async getLatestFinalOutputQc(projectId: string): Promise<FinalOutputQcRecord | null> {
    const row = this.db.prepare(
      "SELECT * FROM final_output_qc_records WHERE project_id = ? AND lifecycle_status = 'ACTIVE' ORDER BY rowid DESC LIMIT 1"
    ).get(projectId) as any;
    return row === undefined ? null : mapQc(row);
  }

  async getLatestPublishPackage(projectId: string): Promise<PublishPackageManifest | null> {
    const row = this.db.prepare(
      "SELECT * FROM publish_package_manifests WHERE project_id = ? AND lifecycle_status = 'ACTIVE' ORDER BY rowid DESC LIMIT 1"
    ).get(projectId) as any;
    return row === undefined ? null : mapPackage(row);
  }

  async commitFinalOutputQc(input: {
    previousQc: FinalOutputQcRecord | null;
    nextQc: FinalOutputQcRecord;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      if (input.previousQc !== null) {
        this.supersedeQc(input.previousQc, input.event.createdAt);
      }
      this.insertFinalOutputQc(input.nextQc);
      if (input.approval !== undefined) {
        insertFinalOutputApproval(this.db, input.approval);
      }
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitPublishPackage(input: {
    previousPackage: PublishPackageManifest | null;
    nextPackage: PublishPackageManifest;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      if (input.previousPackage !== null) {
        this.supersedePackage(input.previousPackage, input.event.createdAt);
      }
      this.insertPackage(input.nextPackage);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitPublishPackageStale(input: {
    previousPackage: PublishPackageManifest;
    nextPackage: PublishPackageManifest;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedePackage(input.previousPackage, input.event.createdAt);
      this.insertPackage(input.nextPackage);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  private insertFinalOutputQc(qc: FinalOutputQcRecord): void {
    this.db.prepare(
      "INSERT INTO final_output_qc_records (id, project_id, revision, lifecycle_status, render_attempt_id, render_attempt_revision, delivery_manifest_id, delivery_manifest_revision, project_sha256, output_path, output_sha256, status, confidence, issue_codes_json, notes_json, review_required, review_approval_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      qc.id,
      qc.projectId,
      qc.revision,
      qc.lifecycleStatus,
      qc.renderAttemptId,
      qc.renderAttemptRevision,
      qc.deliveryManifestId,
      qc.deliveryManifestRevision,
      qc.projectSha256,
      qc.outputPath,
      qc.outputSha256,
      qc.status,
      qc.confidence,
      JSON.stringify(qc.issueCodes),
      JSON.stringify(qc.notes),
      qc.reviewRequired ? 1 : 0,
      qc.reviewApprovalId ?? null,
      qc.createdAt,
      qc.updatedAt
    );
  }

  private insertPackage(pkg: PublishPackageManifest): void {
    this.db.prepare(
      "INSERT INTO publish_package_manifests (id, project_id, revision, lifecycle_status, render_attempt_id, render_attempt_revision, delivery_manifest_id, delivery_manifest_revision, output_qc_id, output_qc_revision, project_sha256, package_status, package_directory, package_sha256, metadata_json, files_json, recommended_file_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      pkg.id,
      pkg.projectId,
      pkg.revision,
      pkg.lifecycleStatus,
      pkg.renderAttemptId,
      pkg.renderAttemptRevision,
      pkg.deliveryManifestId,
      pkg.deliveryManifestRevision,
      pkg.outputQcId,
      pkg.outputQcRevision,
      pkg.projectSha256,
      pkg.packageStatus,
      pkg.packageDirectory,
      pkg.packageSha256,
      JSON.stringify(pkg.metadata),
      JSON.stringify(pkg.files),
      pkg.recommendedFileName,
      pkg.createdAt,
      pkg.updatedAt
    );
  }

  private supersedeQc(qc: FinalOutputQcRecord, updatedAt: string): void {
    this.db.prepare(
      "UPDATE final_output_qc_records SET lifecycle_status = 'SUPERSEDED', updated_at = ? WHERE id = ? AND revision = ?"
    ).run(updatedAt, qc.id, qc.revision);
  }

  private supersedePackage(pkg: PublishPackageManifest, updatedAt: string): void {
    this.db.prepare(
      "UPDATE publish_package_manifests SET lifecycle_status = 'SUPERSEDED', updated_at = ? WHERE id = ? AND revision = ?"
    ).run(updatedAt, pkg.id, pkg.revision);
  }
}
