import Database from "better-sqlite3";
import type {
  ApprovalRecord,
  IdentityAnchor,
  MediaArtifact,
  ProductionAsset,
  ProjectStyle,
  ProviderJob,
  QcResult,
  Scene
} from "@vpf/domain";
import type {
  SceneAssetContextPort,
  SceneAssetRepository
} from "@vpf/scene-assets";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import { FOUNDATION_MIGRATION_SQL } from "./index.js";
import { VISUAL_IDENTITY_MIGRATION_SQL } from "./visual-identity.js";

export const SCENE_ASSET_MIGRATION_SQL = "PRAGMA foreign_keys = ON;\n\nCREATE TABLE IF NOT EXISTS production_assets (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  asset_class TEXT NOT NULL,\n  asset_role TEXT NOT NULL,\n  production_priority TEXT NOT NULL,\n  source_strategy TEXT NOT NULL,\n  owner_type TEXT NOT NULL,\n  owner_id TEXT NOT NULL,\n  state_entity_type TEXT NOT NULL,\n  state_entity_id TEXT NOT NULL,\n  state_field TEXT NOT NULL,\n  state_entity_revision INTEGER,\n  visual_goal TEXT NOT NULL,\n  composition TEXT NOT NULL,\n  continuity_requirements_json TEXT NOT NULL,\n  identity_anchor_ids_json TEXT NOT NULL,\n  factual_constraints_json TEXT NOT NULL,\n  avoidances_json TEXT NOT NULL,\n  image_prompt TEXT,\n  negative_prompt TEXT,\n  candidate_media_ids_json TEXT NOT NULL,\n  approved_media_id TEXT,\n  asset_status TEXT NOT NULL,\n  source_scene_revision INTEGER NOT NULL,\n  source_project_style_id TEXT NOT NULL,\n  source_project_style_revision INTEGER NOT NULL,\n  source_identity_anchor_revisions_json TEXT NOT NULL,\n  format_profile_version TEXT NOT NULL,\n  stale INTEGER NOT NULL DEFAULT 0,\n  stale_reason TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE TABLE IF NOT EXISTS media_artifacts (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  media_type TEXT NOT NULL,\n  relative_path TEXT NOT NULL,\n  mime_type TEXT NOT NULL,\n  width INTEGER,\n  height INTEGER,\n  duration_ms INTEGER,\n  checksum TEXT NOT NULL,\n  source_job_id TEXT,\n  media_status TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE TABLE IF NOT EXISTS provider_jobs (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  job_type TEXT NOT NULL,\n  provider TEXT NOT NULL,\n  provider_profile_version TEXT NOT NULL,\n  target_type TEXT NOT NULL,\n  target_id TEXT NOT NULL,\n  target_revision INTEGER NOT NULL,\n  execution_mode TEXT NOT NULL,\n  status TEXT NOT NULL,\n  attempt INTEGER NOT NULL,\n  retry_of_job_id TEXT,\n  input_payload_json TEXT NOT NULL,\n  result_media_ids_json TEXT NOT NULL,\n  error_code TEXT,\n  error_detail TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE TABLE IF NOT EXISTS qc_results (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  qc_type TEXT NOT NULL,\n  target_type TEXT NOT NULL,\n  target_id TEXT NOT NULL,\n  target_revision INTEGER NOT NULL,\n  media_id TEXT,\n  qc_status TEXT NOT NULL,\n  severity TEXT NOT NULL,\n  confidence REAL NOT NULL,\n  symptom TEXT,\n  root_cause TEXT,\n  recommended_action TEXT,\n  fallback TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_asset\n  ON production_assets(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_primary_scene_asset\n  ON production_assets(project_id, owner_id)\n  WHERE lifecycle_status = 'ACTIVE'\n    AND owner_type = 'SCENE'\n    AND asset_class = 'PRIMARY_SCENE';\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_media\n  ON media_artifacts(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_provider_job\n  ON provider_jobs(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE INDEX IF NOT EXISTS idx_assets_project\n  ON production_assets(project_id);\n\nCREATE INDEX IF NOT EXISTS idx_assets_scene\n  ON production_assets(project_id, owner_type, owner_id);\n\nCREATE INDEX IF NOT EXISTS idx_media_project\n  ON media_artifacts(project_id);\n\nCREATE INDEX IF NOT EXISTS idx_jobs_project_target\n  ON provider_jobs(project_id, target_type, target_id);\n\nCREATE INDEX IF NOT EXISTS idx_qc_target_media\n  ON qc_results(project_id, target_type, target_id, media_id);\n";

const encode = (value: unknown) => JSON.stringify(value);
const decodeStrings = (value: string): string[] => JSON.parse(value) as string[];
const decodeRecord = (value: string): Record<string, number> =>
  JSON.parse(value) as Record<string, number>;

function insertEvent(
  db: Database.Database,
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

function insertApproval(db: Database.Database, approval: ApprovalRecord): void {
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

function mapScene(row: any, anchorIds: string[]): Scene {
  return {
    id: row.id,
    projectId: row.project_id,
    sequenceId: row.sequence_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    displayNumber: row.display_number,
    scriptSegment: row.script_segment,
    scriptRef: {
      scriptId: row.source_script_id,
      scriptRevision: row.source_script_revision,
      ...(row.source_start_char == null ? {} : { startChar: row.source_start_char }),
      ...(row.source_end_char == null ? {} : { endChar: row.source_end_char })
    },
    stateIn: row.state_in,
    stateCurrent: row.state_current,
    stateOut: row.state_out,
    primaryVisualIdea: row.primary_visual_idea,
    mustBeSeen: decodeStrings(row.must_be_seen_json),
    canBeNarrated: decodeStrings(row.can_be_narrated_json),
    canBeImplied: decodeStrings(row.can_be_implied_json),
    requiredIdentityAnchorIds: anchorIds,
    ...(row.primary_asset_id == null ? {} : { primaryAssetId: row.primary_asset_id }),
    sceneStatus: row.scene_status,
    stale: row.stale === 1,
    ...(row.stale_reason == null ? {} : { staleReason: row.stale_reason })
  };
}

function mapStyle(row: any): ProjectStyle {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    channelVisualBibleVersion: row.channel_visual_bible_version,
    sourceScriptId: row.source_script_id,
    sourceScriptRevision: row.source_script_revision,
    eraRegion: row.era_region,
    visualApproach: row.visual_approach,
    realismLevel: row.realism_level,
    colorLanguage: row.color_language,
    lightingLanguage: row.lighting_language,
    materialLanguage: row.material_language,
    environmentLanguage: row.environment_language,
    characterRenderingPrinciple: row.character_rendering_principle,
    cameraCompositionTendency: row.camera_composition_tendency,
    moodRange: decodeStrings(row.mood_range_json),
    factualConstraints: decodeStrings(row.factual_constraints_json),
    avoidances: decodeStrings(row.avoidances_json),
    stale: row.stale === 1,
    ...(row.stale_reason == null ? {} : { staleReason: row.stale_reason })
  };
}

function mapAnchor(row: any): IdentityAnchor {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    anchorType: row.anchor_type,
    name: row.name,
    rationale: row.rationale,
    continuityReason: row.continuity_reason,
    productionPriority: row.production_priority,
    specification: {
      locked: decodeStrings(row.locked_spec_json),
      contextual: decodeStrings(row.contextual_spec_json),
      temporary: decodeStrings(row.temporary_spec_json)
    },
    requiredBySceneIds: decodeStrings(row.required_by_scene_ids_json),
    referenceMediaIds: decodeStrings(row.reference_media_ids_json),
    sourceProjectStyleId: row.source_project_style_id,
    sourceProjectStyleRevision: row.source_project_style_revision,
    sourceChannelVisualBibleVersion: row.source_channel_visual_bible_version,
    stale: row.stale === 1,
    ...(row.stale_reason == null ? {} : { staleReason: row.stale_reason })
  };
}

function mapAsset(row: any): ProductionAsset {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stale: row.stale === 1,
    ...(row.stale_reason == null ? {} : { staleReason: row.stale_reason }),
    assetClass: row.asset_class,
    assetRole: row.asset_role,
    productionPriority: row.production_priority,
    sourceStrategy: row.source_strategy,
    owner: { type: row.owner_type, id: row.owner_id },
    stateRef: {
      entityType: row.state_entity_type,
      entityId: row.state_entity_id,
      stateField: row.state_field,
      ...(row.state_entity_revision == null
        ? {}
        : { entityRevision: row.state_entity_revision })
    },
    design: {
      visualGoal: row.visual_goal,
      composition: row.composition,
      continuityRequirements: decodeStrings(row.continuity_requirements_json),
      identityAnchorIds: decodeStrings(row.identity_anchor_ids_json),
      factualConstraints: decodeStrings(row.factual_constraints_json),
      avoidances: decodeStrings(row.avoidances_json),
      ...(row.image_prompt == null ? {} : { imagePrompt: row.image_prompt }),
      ...(row.negative_prompt == null ? {} : { negativePrompt: row.negative_prompt })
    },
    candidateMediaIds: decodeStrings(row.candidate_media_ids_json),
    ...(row.approved_media_id == null ? {} : { approvedMediaId: row.approved_media_id }),
    assetStatus: row.asset_status,
    sourceSceneRevision: row.source_scene_revision,
    sourceProjectStyleId: row.source_project_style_id,
    sourceProjectStyleRevision: row.source_project_style_revision,
    sourceIdentityAnchorRevisions: decodeRecord(row.source_identity_anchor_revisions_json),
    formatProfileVersion: row.format_profile_version
  };
}

function mapMedia(row: any): MediaArtifact {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mediaType: row.media_type,
    relativePath: row.relative_path,
    mimeType: row.mime_type,
    ...(row.width == null ? {} : { width: row.width }),
    ...(row.height == null ? {} : { height: row.height }),
    ...(row.duration_ms == null ? {} : { durationMs: row.duration_ms }),
    checksum: row.checksum,
    ...(row.source_job_id == null ? {} : { sourceJobId: row.source_job_id }),
    mediaStatus: row.media_status
  };
}

function mapJob(row: any): ProviderJob {
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
    ...(row.retry_of_job_id == null ? {} : { retryOfJobId: row.retry_of_job_id }),
    inputPayload: JSON.parse(row.input_payload_json),
    resultMediaIds: decodeStrings(row.result_media_ids_json),
    ...(row.error_code == null ? {} : { errorCode: row.error_code }),
    ...(row.error_detail == null ? {} : { errorDetail: row.error_detail })
  };
}

function mapQc(row: any): QcResult {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    qcType: row.qc_type,
    targetType: row.target_type,
    targetId: row.target_id,
    targetRevision: row.target_revision,
    ...(row.media_id == null ? {} : { mediaId: row.media_id }),
    qcStatus: row.qc_status,
    severity: row.severity,
    confidence: row.confidence,
    ...(row.symptom == null ? {} : { symptom: row.symptom }),
    ...(row.root_cause == null ? {} : { rootCause: row.root_cause }),
    ...(row.recommended_action == null ? {} : { recommendedAction: row.recommended_action }),
    ...(row.fallback == null ? {} : { fallback: row.fallback })
  };
}

export class SqliteSceneAssetRepository
  implements SceneAssetRepository, SceneAssetContextPort {
  readonly db: Database.Database;

  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(FOUNDATION_MIGRATION_SQL);
    this.db.exec(VISUAL_IDENTITY_MIGRATION_SQL);
    this.db.exec(SCENE_ASSET_MIGRATION_SQL);
  }

  close(): void {
    this.db.close();
  }

  async getScene(projectId: string, sceneId: string): Promise<Scene | null> {
    const row = this.db.prepare(
      `SELECT * FROM scenes
       WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId, sceneId) as any;
    if (row === undefined) return null;

    const anchorRows = this.db.prepare(
      `SELECT anchor_id FROM scene_identity_anchor_requirements
       WHERE project_id = ? AND scene_id = ?
       ORDER BY anchor_id`
    ).all(projectId, sceneId) as Array<{ anchor_id: string }>;
    return mapScene(row, anchorRows.map((item) => item.anchor_id));
  }

  async getApprovedProjectStyle(projectId: string): Promise<ProjectStyle | null> {
    const row = this.db.prepare(
      `SELECT ps.*
       FROM project_styles ps
       WHERE ps.project_id = ?
         AND ps.lifecycle_status = 'ACTIVE'
         AND ps.stale = 0
         AND EXISTS (
           SELECT 1 FROM approval_records a
           WHERE a.project_id = ps.project_id
             AND a.target_type = 'PROJECT_STYLE'
             AND a.target_id = ps.id
             AND a.target_revision = ps.revision
             AND a.approval_state IN ('HUMAN_APPROVED', 'AUTO_APPROVED')
         )
       ORDER BY ps.revision DESC
       LIMIT 1`
    ).get(projectId) as any;
    return row === undefined ? null : mapStyle(row);
  }

  async getRequiredIdentityAnchors(
    projectId: string,
    sceneId: string
  ): Promise<IdentityAnchor[]> {
    const rows = this.db.prepare(
      `SELECT ia.*
       FROM scene_identity_anchor_requirements req
       JOIN identity_anchors ia
         ON ia.project_id = req.project_id
        AND ia.id = req.anchor_id
        AND ia.revision = req.anchor_revision
       WHERE req.project_id = ?
         AND req.scene_id = ?
         AND ia.lifecycle_status = 'ACTIVE'
       ORDER BY ia.anchor_type, ia.name`
    ).all(projectId, sceneId) as any[];
    return rows.map(mapAnchor);
  }

  async isIdentityAnchorApproved(
    projectId: string,
    anchor: IdentityAnchor
  ): Promise<boolean> {
    const row = this.db.prepare(
      `SELECT 1 AS ok
       FROM approval_records
       WHERE project_id = ?
         AND target_type = 'IDENTITY_ANCHOR'
         AND target_id = ?
         AND target_revision = ?
         AND approval_state IN ('HUMAN_APPROVED', 'AUTO_APPROVED')
       LIMIT 1`
    ).get(projectId, anchor.id, anchor.revision) as { ok: number } | undefined;
    return row !== undefined;
  }

  async getLatestAsset(projectId: string, assetId: string): Promise<ProductionAsset | null> {
    const row = this.db.prepare(
      `SELECT * FROM production_assets
       WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId, assetId) as any;
    return row === undefined ? null : mapAsset(row);
  }

  async getPrimarySceneAsset(
    projectId: string,
    sceneId: string
  ): Promise<ProductionAsset | null> {
    const row = this.db.prepare(
      `SELECT * FROM production_assets
       WHERE project_id = ?
         AND owner_type = 'SCENE'
         AND owner_id = ?
         AND asset_class = 'PRIMARY_SCENE'
         AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId, sceneId) as any;
    return row === undefined ? null : mapAsset(row);
  }

  async listAssets(projectId: string): Promise<ProductionAsset[]> {
    const rows = this.db.prepare(
      `SELECT * FROM production_assets
       WHERE project_id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY owner_id, asset_class`
    ).all(projectId) as any[];
    return rows.map(mapAsset);
  }

  async commitAssetDesign(input: {
    previous: ProductionAsset | null;
    next: ProductionAsset;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      if (input.previous !== null) this.supersedeAsset(input.previous, input.event.createdAt);
      this.insertAsset(input.next);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async createProviderJob(input: {
    job: ProviderJob;
    asset: ProductionAsset;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      const previousRevision = input.asset.revision - 1;
      this.db.prepare(
        `UPDATE production_assets
         SET lifecycle_status = 'SUPERSEDED', updated_at = ?, asset_status = 'SUPERSEDED'
         WHERE id = ? AND revision = ? AND lifecycle_status = 'ACTIVE'`
      ).run(input.event.createdAt, input.asset.id, previousRevision);
      this.insertAsset(input.asset);
      this.insertJob(input.job);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async getLatestProviderJob(projectId: string, jobId: string): Promise<ProviderJob | null> {
    const row = this.db.prepare(
      `SELECT * FROM provider_jobs
       WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId, jobId) as any;
    return row === undefined ? null : mapJob(row);
  }

  async commitProviderResult(input: {
    previousJob: ProviderJob;
    nextJob: ProviderJob;
    previousAsset: ProductionAsset;
    nextAsset: ProductionAsset;
    media: MediaArtifact;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare(
        `UPDATE provider_jobs
         SET lifecycle_status = 'SUPERSEDED', updated_at = ?
         WHERE id = ? AND revision = ?`
      ).run(input.event.createdAt, input.previousJob.id, input.previousJob.revision);
      this.supersedeAsset(input.previousAsset, input.event.createdAt);
      this.insertJob(input.nextJob);
      this.insertAsset(input.nextAsset);
      this.insertMedia(input.media);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitProviderJobFailure(input: {
    previousJob: ProviderJob;
    nextJob: ProviderJob;
    previousAsset: ProductionAsset;
    nextAsset: ProductionAsset;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare(
        `UPDATE provider_jobs
         SET lifecycle_status = 'SUPERSEDED', updated_at = ?
         WHERE id = ? AND revision = ?`
      ).run(input.event.createdAt, input.previousJob.id, input.previousJob.revision);
      this.supersedeAsset(input.previousAsset, input.event.createdAt);
      this.insertJob(input.nextJob);
      this.insertAsset(input.nextAsset);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async createRetryProviderJob(input: {
    job: ProviderJob;
    previousAsset: ProductionAsset;
    nextAsset: ProductionAsset;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeAsset(input.previousAsset, input.event.createdAt);
      this.insertAsset(input.nextAsset);
      this.insertJob(input.job);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async getMedia(projectId: string, mediaId: string): Promise<MediaArtifact | null> {
    const row = this.db.prepare(
      `SELECT * FROM media_artifacts
       WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId, mediaId) as any;
    return row === undefined ? null : mapMedia(row);
  }

  async getLatestQcForMedia(
    projectId: string,
    assetId: string,
    mediaId: string
  ): Promise<QcResult | null> {
    const row = this.db.prepare(
      `SELECT * FROM qc_results
       WHERE project_id = ?
         AND qc_type = 'IMAGE_QC'
         AND target_type = 'ASSET'
         AND target_id = ?
         AND media_id = ?
         AND lifecycle_status = 'ACTIVE'
       ORDER BY created_at DESC, rowid DESC LIMIT 1`
    ).get(projectId, assetId, mediaId) as any;
    return row === undefined ? null : mapQc(row);
  }

  async commitImageQc(input: {
    previousAsset: ProductionAsset;
    nextAsset: ProductionAsset;
    qc: QcResult;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeAsset(input.previousAsset, input.event.createdAt);
      this.insertAsset(input.nextAsset);
      this.insertQc(input.qc);
      if (input.approval !== undefined) insertApproval(this.db, input.approval);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitAssetApproval(input: {
    previousAsset: ProductionAsset;
    nextAsset: ProductionAsset;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeAsset(input.previousAsset, input.event.createdAt);
      this.insertAsset(input.nextAsset);
      insertApproval(this.db, input.approval);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async markAssetsStale(input: {
    assetIds: string[];
    reason: string;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      for (const assetId of input.assetIds) {
        this.db.prepare(
          `UPDATE production_assets
           SET stale = 1, stale_reason = ?
           WHERE id = ? AND lifecycle_status = 'ACTIVE'`
        ).run(input.reason, assetId);
      }
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  private supersedeAsset(asset: ProductionAsset, updatedAt: string): void {
    this.db.prepare(
      `UPDATE production_assets
       SET lifecycle_status = 'SUPERSEDED', updated_at = ?, asset_status = 'SUPERSEDED'
       WHERE id = ? AND revision = ?`
    ).run(updatedAt, asset.id, asset.revision);
  }

  private insertAsset(asset: ProductionAsset): void {
    this.db.prepare(`INSERT INTO production_assets
      (id, project_id, revision, lifecycle_status, asset_class, asset_role,
       production_priority, source_strategy, owner_type, owner_id, state_entity_type,
       state_entity_id, state_field, state_entity_revision, visual_goal, composition,
       continuity_requirements_json, identity_anchor_ids_json, factual_constraints_json,
       avoidances_json, image_prompt, negative_prompt, candidate_media_ids_json,
       approved_media_id, asset_status, source_scene_revision, source_project_style_id,
       source_project_style_revision, source_identity_anchor_revisions_json,
       format_profile_version, stale, stale_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        asset.id,
        asset.projectId,
        asset.revision,
        asset.lifecycleStatus,
        asset.assetClass,
        asset.assetRole,
        asset.productionPriority,
        asset.sourceStrategy,
        asset.owner.type,
        asset.owner.id,
        asset.stateRef.entityType,
        asset.stateRef.entityId,
        asset.stateRef.stateField,
        asset.stateRef.entityRevision ?? null,
        asset.design.visualGoal,
        asset.design.composition,
        encode(asset.design.continuityRequirements),
        encode(asset.design.identityAnchorIds),
        encode(asset.design.factualConstraints),
        encode(asset.design.avoidances),
        asset.design.imagePrompt ?? null,
        asset.design.negativePrompt ?? null,
        encode(asset.candidateMediaIds),
        asset.approvedMediaId ?? null,
        asset.assetStatus,
        asset.sourceSceneRevision,
        asset.sourceProjectStyleId,
        asset.sourceProjectStyleRevision,
        encode(asset.sourceIdentityAnchorRevisions),
        asset.formatProfileVersion,
        asset.stale ? 1 : 0,
        asset.staleReason ?? null,
        asset.createdAt,
        asset.updatedAt
      );
  }

  private insertMedia(media: MediaArtifact): void {
    this.db.prepare(`INSERT INTO media_artifacts
      (id, project_id, revision, lifecycle_status, media_type, relative_path, mime_type,
       width, height, duration_ms, checksum, source_job_id, media_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
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

  private insertJob(job: ProviderJob): void {
    this.db.prepare(`INSERT INTO provider_jobs
      (id, project_id, revision, lifecycle_status, job_type, provider,
       provider_profile_version, target_type, target_id, target_revision,
       execution_mode, status, attempt, retry_of_job_id, input_payload_json,
       result_media_ids_json, error_code, error_detail, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
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
        encode(job.inputPayload),
        encode(job.resultMediaIds),
        job.errorCode ?? null,
        job.errorDetail ?? null,
        job.createdAt,
        job.updatedAt
      );
  }

  private insertQc(qc: QcResult): void {
    this.db.prepare(`INSERT INTO qc_results
      (id, project_id, revision, lifecycle_status, qc_type, target_type,
       target_id, target_revision, media_id, qc_status, severity, confidence,
       symptom, root_cause, recommended_action, fallback, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        qc.id,
        qc.projectId,
        qc.revision,
        qc.lifecycleStatus,
        qc.qcType,
        qc.targetType,
        qc.targetId,
        qc.targetRevision,
        qc.mediaId ?? null,
        qc.qcStatus,
        qc.severity,
        qc.confidence,
        qc.symptom ?? null,
        qc.rootCause ?? null,
        qc.recommendedAction ?? null,
        qc.fallback ?? null,
        qc.createdAt,
        qc.updatedAt
      );
  }
}
