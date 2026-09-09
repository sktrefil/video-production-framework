import type {
  ApprovalRecord,
  LinkCutImplementation,
  MediaArtifact,
  ProductionClip,
  ProductionLink,
  ProviderJob,
  ProviderPreflightRecord
} from "@vpf/domain";
import type {
  FinalClipContextPort,
  FinalClipRepository
} from "@vpf/final-clip";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import { SqlitePreLinkHandoffRepository } from "./prelink-handoff.js";

export const FINAL_CLIP_MIGRATION_SQL = "PRAGMA foreign_keys = ON;\n\nCREATE TABLE IF NOT EXISTS production_clips (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  link_id TEXT NOT NULL,\n  link_revision INTEGER NOT NULL,\n  clip_mode TEXT NOT NULL,\n  clip_start_state_entity_type TEXT NOT NULL,\n  clip_start_state_entity_id TEXT NOT NULL,\n  clip_start_state_field TEXT NOT NULL,\n  clip_start_state_entity_revision INTEGER,\n  clip_end_state_entity_type TEXT NOT NULL,\n  clip_end_state_entity_id TEXT NOT NULL,\n  clip_end_state_field TEXT NOT NULL,\n  clip_end_state_entity_revision INTEGER,\n  start_asset_id TEXT NOT NULL,\n  start_asset_revision INTEGER NOT NULL,\n  start_media_id TEXT NOT NULL,\n  end_asset_id TEXT,\n  end_asset_revision INTEGER,\n  end_media_id TEXT,\n  transition_method TEXT NOT NULL,\n  camera_move TEXT NOT NULL,\n  subject_motion TEXT NOT NULL,\n  environment_motion TEXT NOT NULL,\n  duration_ms INTEGER NOT NULL,\n  provider_execution_required INTEGER NOT NULL,\n  final_design_approval_id TEXT,\n  provider_preflight_id TEXT,\n  candidate_media_ids_json TEXT NOT NULL,\n  approved_media_id TEXT,\n  clip_status TEXT NOT NULL,\n  stale INTEGER NOT NULL DEFAULT 0,\n  stale_reason TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE TABLE IF NOT EXISTS link_cut_implementations (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  link_id TEXT NOT NULL,\n  link_revision INTEGER NOT NULL,\n  transition_method TEXT NOT NULL,\n  rationale TEXT NOT NULL,\n  final_design_approval_id TEXT,\n  ready INTEGER NOT NULL DEFAULT 0,\n  stale INTEGER NOT NULL DEFAULT 0,\n  stale_reason TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE TABLE IF NOT EXISTS provider_preflights (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  clip_id TEXT NOT NULL,\n  clip_revision INTEGER NOT NULL,\n  provider TEXT NOT NULL,\n  provider_profile_version TEXT NOT NULL,\n  status TEXT NOT NULL,\n  safety_safe INTEGER NOT NULL,\n  capability_compatible INTEGER NOT NULL,\n  requires_alternative_representation INTEGER NOT NULL,\n  issue_codes_json TEXT NOT NULL,\n  recommended_action TEXT,\n  decision_id TEXT NOT NULL,\n  review_approval_id TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE TABLE IF NOT EXISTS link_implementation_refs (\n  project_id TEXT NOT NULL,\n  link_id TEXT NOT NULL,\n  link_revision INTEGER NOT NULL,\n  implementation_type TEXT NOT NULL,\n  implementation_ref_id TEXT NOT NULL,\n  PRIMARY KEY(project_id, link_id, link_revision)\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_clip\n  ON production_clips(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_clip_per_link\n  ON production_clips(project_id, link_id)\n  WHERE lifecycle_status = 'ACTIVE';\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_cut\n  ON link_cut_implementations(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_cut_per_link\n  ON link_cut_implementations(project_id, link_id)\n  WHERE lifecycle_status = 'ACTIVE';\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_provider_preflight\n  ON provider_preflights(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE INDEX IF NOT EXISTS idx_clips_project\n  ON production_clips(project_id);\n\nCREATE INDEX IF NOT EXISTS idx_clips_link\n  ON production_clips(project_id, link_id);\n\nCREATE INDEX IF NOT EXISTS idx_preflight_clip\n  ON provider_preflights(project_id, clip_id);\n\nCREATE INDEX IF NOT EXISTS idx_link_impl_ref\n  ON link_implementation_refs(project_id, link_id, link_revision);\n";

const encode = (value: unknown) => JSON.stringify(value);
const decodeStrings = (value: string): string[] => JSON.parse(value) as string[];

function insertEvent(
  db: SqlitePreLinkHandoffRepository["db"],
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
  db: SqlitePreLinkHandoffRepository["db"],
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

function mapClip(row: any): ProductionClip {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stale: row.stale === 1,
    ...(row.stale_reason == null ? {} : { staleReason: row.stale_reason }),
    linkId: row.link_id,
    linkRevision: row.link_revision,
    clipMode: row.clip_mode,
    clipStartStateRef: {
      entityType: row.clip_start_state_entity_type,
      entityId: row.clip_start_state_entity_id,
      stateField: row.clip_start_state_field,
      ...(row.clip_start_state_entity_revision == null
        ? {}
        : { entityRevision: row.clip_start_state_entity_revision })
    },
    clipEndStateTarget: {
      entityType: row.clip_end_state_entity_type,
      entityId: row.clip_end_state_entity_id,
      stateField: row.clip_end_state_field,
      ...(row.clip_end_state_entity_revision == null
        ? {}
        : { entityRevision: row.clip_end_state_entity_revision })
    },
    startAssetId: row.start_asset_id,
    startAssetRevision: row.start_asset_revision,
    startMediaId: row.start_media_id,
    ...(row.end_asset_id == null ? {} : { endAssetId: row.end_asset_id }),
    ...(row.end_asset_revision == null
      ? {}
      : { endAssetRevision: row.end_asset_revision }),
    ...(row.end_media_id == null ? {} : { endMediaId: row.end_media_id }),
    transitionMethod: row.transition_method,
    cameraMove: row.camera_move,
    subjectMotion: row.subject_motion,
    environmentMotion: row.environment_motion,
    durationMs: row.duration_ms,
    providerExecutionRequired: row.provider_execution_required === 1,
    ...(row.final_design_approval_id == null
      ? {}
      : { finalDesignApprovalId: row.final_design_approval_id }),
    ...(row.provider_preflight_id == null
      ? {}
      : { providerPreflightId: row.provider_preflight_id }),
    candidateMediaIds: decodeStrings(row.candidate_media_ids_json),
    ...(row.approved_media_id == null ? {} : { approvedMediaId: row.approved_media_id }),
    clipStatus: row.clip_status
  };
}

function mapCut(row: any): LinkCutImplementation {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stale: row.stale === 1,
    ...(row.stale_reason == null ? {} : { staleReason: row.stale_reason }),
    linkId: row.link_id,
    linkRevision: row.link_revision,
    transitionMethod: row.transition_method,
    rationale: row.rationale,
    ...(row.final_design_approval_id == null
      ? {}
      : { finalDesignApprovalId: row.final_design_approval_id }),
    ready: row.ready === 1
  };
}

function mapPreflight(row: any): ProviderPreflightRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    clipId: row.clip_id,
    clipRevision: row.clip_revision,
    provider: row.provider,
    providerProfileVersion: row.provider_profile_version,
    status: row.status,
    safetySafe: row.safety_safe === 1,
    capabilityCompatible: row.capability_compatible === 1,
    requiresAlternativeRepresentation:
      row.requires_alternative_representation === 1,
    issueCodes: decodeStrings(row.issue_codes_json),
    ...(row.recommended_action == null
      ? {}
      : { recommendedAction: row.recommended_action }),
    decisionId: row.decision_id,
    ...(row.review_approval_id == null
      ? {}
      : { reviewApprovalId: row.review_approval_id })
  };
}

export class SqliteFinalClipRepository
  extends SqlitePreLinkHandoffRepository
  implements FinalClipRepository, FinalClipContextPort {
  constructor(filename: string) {
    super(filename);
    this.db.exec(FINAL_CLIP_MIGRATION_SQL);
  }

  async getLink(projectId: string, linkId: string): Promise<ProductionLink | null> {
    const link = await super.getLatestLink(projectId, linkId);
    if (link === null) return null;

    const row = this.db.prepare(
      `SELECT implementation_type, implementation_ref_id
       FROM link_implementation_refs
       WHERE project_id = ? AND link_id = ? AND link_revision = ?
       LIMIT 1`
    ).get(projectId, linkId, link.revision) as
      | { implementation_type: "CLIP" | "CUT"; implementation_ref_id: string }
      | undefined;

    return row === undefined
      ? link
      : {
          ...link,
          implementationType: row.implementation_type,
          implementationRefId: row.implementation_ref_id
        };
  }

  async getActiveClipByLink(
    projectId: string,
    linkId: string
  ): Promise<ProductionClip | null> {
    const row = this.db.prepare(
      `SELECT * FROM production_clips
       WHERE project_id = ? AND link_id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId, linkId) as any;
    return row === undefined ? null : mapClip(row);
  }

  async getLatestClip(
    projectId: string,
    clipId: string
  ): Promise<ProductionClip | null> {
    const row = this.db.prepare(
      `SELECT * FROM production_clips
       WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId, clipId) as any;
    return row === undefined ? null : mapClip(row);
  }

  async listActiveClips(projectId: string): Promise<ProductionClip[]> {
    const rows = this.db.prepare(
      `SELECT * FROM production_clips
       WHERE project_id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY rowid`
    ).all(projectId) as any[];
    return rows.map(mapClip);
  }

  async getActiveCutByLink(
    projectId: string,
    linkId: string
  ): Promise<LinkCutImplementation | null> {
    const row = this.db.prepare(
      `SELECT * FROM link_cut_implementations
       WHERE project_id = ? AND link_id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId, linkId) as any;
    return row === undefined ? null : mapCut(row);
  }

  async getLatestCut(
    projectId: string,
    cutId: string
  ): Promise<LinkCutImplementation | null> {
    const row = this.db.prepare(
      `SELECT * FROM link_cut_implementations
       WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId, cutId) as any;
    return row === undefined ? null : mapCut(row);
  }

  async commitAdditionalAssetRequirement(input: {
    previousLink: ProductionLink;
    nextLink: ProductionLink;
    reason: string;
    decisionId: string;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeLink(input.previousLink, input.event.createdAt);
      this.insertLink(input.nextLink);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitClipDesign(input: {
    previousLink: ProductionLink;
    nextLink: ProductionLink;
    previousClip: ProductionClip | null;
    previousCut: LinkCutImplementation | null;
    clip: ProductionClip;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeLink(input.previousLink, input.event.createdAt);
      this.insertLink(input.nextLink);
      this.supersedeExistingImplementations(
        input.previousClip,
        input.previousCut,
        input.event.createdAt
      );
      this.insertClip(input.clip);
      this.insertImplementationRef(
        input.nextLink.projectId,
        input.nextLink.id,
        input.nextLink.revision,
        "CLIP",
        input.clip.id
      );
      if (input.approval !== undefined) {
        insertApproval(this.db, input.approval);
      }
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitCutDesign(input: {
    previousLink: ProductionLink;
    nextLink: ProductionLink;
    previousClip: ProductionClip | null;
    previousCut: LinkCutImplementation | null;
    cut: LinkCutImplementation;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeLink(input.previousLink, input.event.createdAt);
      this.insertLink(input.nextLink);
      this.supersedeExistingImplementations(
        input.previousClip,
        input.previousCut,
        input.event.createdAt
      );
      this.insertCut(input.cut);
      this.insertImplementationRef(
        input.nextLink.projectId,
        input.nextLink.id,
        input.nextLink.revision,
        "CUT",
        input.cut.id
      );
      if (input.approval !== undefined) {
        insertApproval(this.db, input.approval);
      }
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitClipDesignApproval(input: {
    previousLink: ProductionLink;
    nextLink: ProductionLink;
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeLink(input.previousLink, input.event.createdAt);
      this.insertLink(input.nextLink);
      this.supersedeClip(input.previousClip, input.event.createdAt);
      this.insertClip(input.nextClip);
      this.insertImplementationRef(
        input.nextLink.projectId,
        input.nextLink.id,
        input.nextLink.revision,
        "CLIP",
        input.nextClip.id
      );
      insertApproval(this.db, input.approval);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitCutDesignApproval(input: {
    previousLink: ProductionLink;
    nextLink: ProductionLink;
    previousCut: LinkCutImplementation;
    nextCut: LinkCutImplementation;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeLink(input.previousLink, input.event.createdAt);
      this.insertLink(input.nextLink);
      this.supersedeCut(input.previousCut, input.event.createdAt);
      this.insertCut(input.nextCut);
      this.insertImplementationRef(
        input.nextLink.projectId,
        input.nextLink.id,
        input.nextLink.revision,
        "CUT",
        input.nextCut.id
      );
      insertApproval(this.db, input.approval);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async getProviderPreflight(
    projectId: string,
    preflightId: string
  ): Promise<ProviderPreflightRecord | null> {
    const row = this.db.prepare(
      `SELECT * FROM provider_preflights
       WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId, preflightId) as any;
    return row === undefined ? null : mapPreflight(row);
  }

  async commitProviderPreflight(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    preflight: ProviderPreflightRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeClip(input.previousClip, input.event.createdAt);
      this.insertClip(input.nextClip);
      this.insertPreflight(input.preflight);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitProviderPreflightReview(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    previousPreflight: ProviderPreflightRecord;
    nextPreflight: ProviderPreflightRecord;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeClip(input.previousClip, input.event.createdAt);
      this.insertClip(input.nextClip);
      this.db.prepare(
        `UPDATE provider_preflights
         SET lifecycle_status = 'SUPERSEDED', updated_at = ?
         WHERE id = ? AND revision = ?`
      ).run(
        input.event.createdAt,
        input.previousPreflight.id,
        input.previousPreflight.revision
      );
      this.insertPreflight(input.nextPreflight);
      insertApproval(this.db, input.approval);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async createVideoProviderJob(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    job: ProviderJob;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeClip(input.previousClip, input.event.createdAt);
      this.insertClip(input.nextClip);
      this.insertJob(input.job);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitVideoProviderFailure(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    previousJob: ProviderJob;
    nextJob: ProviderJob;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeClip(input.previousClip, input.event.createdAt);
      this.insertClip(input.nextClip);
      this.supersedeJob(input.previousJob, input.event.createdAt);
      this.insertJob(input.nextJob);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async createRetryVideoProviderJob(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    job: ProviderJob;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeClip(input.previousClip, input.event.createdAt);
      this.insertClip(input.nextClip);
      this.insertJob(input.job);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitVideoProviderResult(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    previousJob: ProviderJob;
    nextJob: ProviderJob;
    media: MediaArtifact;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeClip(input.previousClip, input.event.createdAt);
      this.insertClip(input.nextClip);
      this.supersedeJob(input.previousJob, input.event.createdAt);
      this.insertJob(input.nextJob);
      this.insertMedia(input.media);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async markImplementationsStale(input: {
    clipIds: string[];
    cutIds: string[];
    reason: string;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      for (const clipId of input.clipIds) {
        this.db.prepare(
          `UPDATE production_clips
           SET stale = 1, stale_reason = ?, updated_at = ?
           WHERE id = ? AND lifecycle_status = 'ACTIVE'`
        ).run(input.reason, input.event.createdAt, clipId);
      }
      for (const cutId of input.cutIds) {
        this.db.prepare(
          `UPDATE link_cut_implementations
           SET stale = 1, stale_reason = ?, updated_at = ?
           WHERE id = ? AND lifecycle_status = 'ACTIVE'`
        ).run(input.reason, input.event.createdAt, cutId);
      }
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  private supersedeExistingImplementations(
    clip: ProductionClip | null,
    cut: LinkCutImplementation | null,
    updatedAt: string
  ): void {
    if (clip !== null) this.supersedeClip(clip, updatedAt);
    if (cut !== null) this.supersedeCut(cut, updatedAt);
  }

  private supersedeClip(clip: ProductionClip, updatedAt: string): void {
    this.db.prepare(
      `UPDATE production_clips
       SET lifecycle_status = 'SUPERSEDED', updated_at = ?, clip_status = 'SUPERSEDED'
       WHERE id = ? AND revision = ?`
    ).run(updatedAt, clip.id, clip.revision);
  }

  private supersedeCut(cut: LinkCutImplementation, updatedAt: string): void {
    this.db.prepare(
      `UPDATE link_cut_implementations
       SET lifecycle_status = 'SUPERSEDED', updated_at = ?
       WHERE id = ? AND revision = ?`
    ).run(updatedAt, cut.id, cut.revision);
  }

  private supersedeJob(job: ProviderJob, updatedAt: string): void {
    this.db.prepare(
      `UPDATE provider_jobs
       SET lifecycle_status = 'SUPERSEDED', updated_at = ?
       WHERE id = ? AND revision = ?`
    ).run(updatedAt, job.id, job.revision);
  }

  private insertImplementationRef(
    projectId: string,
    linkId: string,
    linkRevision: number,
    implementationType: "CLIP" | "CUT",
    implementationRefId: string
  ): void {
    this.db.prepare(
      `INSERT INTO link_implementation_refs
       (project_id, link_id, link_revision, implementation_type, implementation_ref_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      projectId,
      linkId,
      linkRevision,
      implementationType,
      implementationRefId
    );
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

  private insertCut(cut: LinkCutImplementation): void {
    this.db.prepare(`INSERT INTO link_cut_implementations
      (id, project_id, revision, lifecycle_status,
       link_id, link_revision, transition_method, rationale,
       final_design_approval_id, ready,
       stale, stale_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        cut.id,
        cut.projectId,
        cut.revision,
        cut.lifecycleStatus,
        cut.linkId,
        cut.linkRevision,
        cut.transitionMethod,
        cut.rationale,
        cut.finalDesignApprovalId ?? null,
        cut.ready ? 1 : 0,
        cut.stale ? 1 : 0,
        cut.staleReason ?? null,
        cut.createdAt,
        cut.updatedAt
      );
  }

  private insertPreflight(preflight: ProviderPreflightRecord): void {
    this.db.prepare(`INSERT INTO provider_preflights
      (id, project_id, revision, lifecycle_status,
       clip_id, clip_revision, provider, provider_profile_version,
       status, safety_safe, capability_compatible,
       requires_alternative_representation, issue_codes_json,
       recommended_action, decision_id, review_approval_id,
       created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        preflight.id,
        preflight.projectId,
        preflight.revision,
        preflight.lifecycleStatus,
        preflight.clipId,
        preflight.clipRevision,
        preflight.provider,
        preflight.providerProfileVersion,
        preflight.status,
        preflight.safetySafe ? 1 : 0,
        preflight.capabilityCompatible ? 1 : 0,
        preflight.requiresAlternativeRepresentation ? 1 : 0,
        encode(preflight.issueCodes),
        preflight.recommendedAction ?? null,
        preflight.decisionId,
        preflight.reviewApprovalId ?? null,
        preflight.createdAt,
        preflight.updatedAt
      );
  }
}
