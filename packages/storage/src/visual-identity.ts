import Database from "better-sqlite3";
import type {
  ApprovalRecord,
  FactRecord,
  IdentityAnchor,
  ProjectStyle,
  Scene,
  ScriptVersion
} from "@vpf/domain";
import type {
  VisualIdentityContextPort,
  VisualIdentityRepository
} from "@vpf/visual-identity";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import { FOUNDATION_MIGRATION_SQL } from "./index.js";

export const VISUAL_IDENTITY_MIGRATION_SQL = "PRAGMA foreign_keys = ON;\n\nCREATE TABLE IF NOT EXISTS project_styles (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  channel_visual_bible_version TEXT NOT NULL,\n  source_script_id TEXT NOT NULL,\n  source_script_revision INTEGER NOT NULL,\n  era_region TEXT NOT NULL,\n  visual_approach TEXT NOT NULL,\n  realism_level TEXT NOT NULL,\n  color_language TEXT NOT NULL,\n  lighting_language TEXT NOT NULL,\n  material_language TEXT NOT NULL,\n  environment_language TEXT NOT NULL,\n  character_rendering_principle TEXT NOT NULL,\n  camera_composition_tendency TEXT NOT NULL,\n  mood_range_json TEXT NOT NULL,\n  factual_constraints_json TEXT NOT NULL,\n  avoidances_json TEXT NOT NULL,\n  stale INTEGER NOT NULL DEFAULT 0,\n  stale_reason TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE TABLE IF NOT EXISTS identity_anchors (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  anchor_type TEXT NOT NULL,\n  name TEXT NOT NULL,\n  rationale TEXT NOT NULL,\n  continuity_reason TEXT NOT NULL,\n  production_priority TEXT NOT NULL,\n  locked_spec_json TEXT NOT NULL,\n  contextual_spec_json TEXT NOT NULL,\n  temporary_spec_json TEXT NOT NULL,\n  required_by_scene_ids_json TEXT NOT NULL,\n  reference_media_ids_json TEXT NOT NULL,\n  source_project_style_id TEXT NOT NULL,\n  source_project_style_revision INTEGER NOT NULL,\n  source_channel_visual_bible_version TEXT NOT NULL,\n  stale INTEGER NOT NULL DEFAULT 0,\n  stale_reason TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_project_style\n  ON project_styles(project_id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_identity_anchor\n  ON identity_anchors(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE INDEX IF NOT EXISTS idx_project_styles_project\n  ON project_styles(project_id);\n\nCREATE INDEX IF NOT EXISTS idx_identity_anchors_project\n  ON identity_anchors(project_id);\n";

const encode = (values: string[]) => JSON.stringify(values);
const decode = (value: string): string[] => JSON.parse(value) as string[];

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

function mapApproval(row: any): ApprovalRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetRevision: row.target_revision,
    approvalState: row.approval_state,
    reason: row.reason,
    approvedByType: row.approved_by_type,
    ...(row.approved_by_id == null ? {} : { approvedById: row.approved_by_id }),
    ...(row.selected_media_id == null ? {} : { selectedMediaId: row.selected_media_id }),
    createdAt: row.created_at
  };
}

function mapScript(row: any): ScriptVersion {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    kind: row.kind,
    body: row.body,
    ...(row.supersedes_revision == null ? {} : { supersedesRevision: row.supersedes_revision })
  };
}

function mapFact(row: any): FactRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    statement: row.statement,
    classification: row.classification,
    sourceIds: decode(row.source_ids_json),
    status: row.status
  };
}

function mapScene(row: any): Scene {
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
    mustBeSeen: decode(row.must_be_seen_json),
    canBeNarrated: decode(row.can_be_narrated_json),
    canBeImplied: decode(row.can_be_implied_json),
    requiredIdentityAnchorIds: decode(row.required_identity_anchor_ids_json),
    ...(row.primary_asset_id == null ? {} : { primaryAssetId: row.primary_asset_id }),
    sceneStatus: row.scene_status,
    stale: row.stale === 1,
    ...(row.stale_reason == null ? {} : { staleReason: row.stale_reason })
  };
}

function mapProjectStyle(row: any): ProjectStyle {
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
    moodRange: decode(row.mood_range_json),
    factualConstraints: decode(row.factual_constraints_json),
    avoidances: decode(row.avoidances_json),
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
      locked: decode(row.locked_spec_json),
      contextual: decode(row.contextual_spec_json),
      temporary: decode(row.temporary_spec_json)
    },
    requiredBySceneIds: decode(row.required_by_scene_ids_json),
    referenceMediaIds: decode(row.reference_media_ids_json),
    sourceProjectStyleId: row.source_project_style_id,
    sourceProjectStyleRevision: row.source_project_style_revision,
    sourceChannelVisualBibleVersion: row.source_channel_visual_bible_version,
    stale: row.stale === 1,
    ...(row.stale_reason == null ? {} : { staleReason: row.stale_reason })
  };
}

export class SqliteVisualIdentityRepository
  implements VisualIdentityRepository, VisualIdentityContextPort {
  readonly db: Database.Database;

  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(FOUNDATION_MIGRATION_SQL);
    this.db.exec(VISUAL_IDENTITY_MIGRATION_SQL);
  }

  close(): void {
    this.db.close();
  }

  async getLatestApprovedFinalScript(projectId: string): Promise<ScriptVersion | null> {
    const row = this.db.prepare(
      `SELECT s.*
       FROM scripts s
       WHERE s.project_id = ?
         AND s.kind = 'FINAL'
         AND s.lifecycle_status = 'ACTIVE'
         AND EXISTS (
           SELECT 1 FROM approval_records a
           WHERE a.project_id = s.project_id
             AND a.target_type = 'SCRIPT'
             AND a.target_id = s.id
             AND a.target_revision = s.revision
             AND a.approval_state = 'HUMAN_APPROVED'
         )
       ORDER BY s.revision DESC
       LIMIT 1`
    ).get(projectId) as any;
    return row === undefined ? null : mapScript(row);
  }

  async listApprovedFacts(projectId: string): Promise<FactRecord[]> {
    const rows = this.db.prepare(
      `SELECT * FROM facts
       WHERE project_id = ?
         AND lifecycle_status = 'ACTIVE'
         AND status = 'APPROVED'
       ORDER BY created_at`
    ).all(projectId) as any[];
    return rows.map(mapFact);
  }

  async listActiveScenes(projectId: string): Promise<Scene[]> {
    const rows = this.db.prepare(
      `SELECT * FROM scenes
       WHERE project_id = ?
         AND lifecycle_status = 'ACTIVE'
         AND stale = 0
       ORDER BY sequence_id, display_number`
    ).all(projectId) as any[];
    return rows.map(mapScene);
  }

  async listApprovedScenes(projectId: string): Promise<Scene[]> {
    const rows = this.db.prepare(
      `SELECT s.*
       FROM scenes s
       WHERE s.project_id = ?
         AND s.lifecycle_status = 'ACTIVE'
         AND s.stale = 0
         AND EXISTS (
           SELECT 1 FROM approval_records a
           WHERE a.project_id = s.project_id
             AND a.target_type = 'SCENE'
             AND a.target_id = s.id
             AND a.target_revision = s.revision
             AND a.approval_state = 'HUMAN_APPROVED'
         )
       ORDER BY s.sequence_id, s.display_number`
    ).all(projectId) as any[];
    return rows.map(mapScene);
  }

  async getLatestProjectStyle(projectId: string): Promise<ProjectStyle | null> {
    const row = this.db.prepare(
      `SELECT * FROM project_styles
       WHERE project_id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId) as any;
    return row === undefined ? null : mapProjectStyle(row);
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
             AND a.approval_state = 'HUMAN_APPROVED'
         )
       ORDER BY ps.revision DESC
       LIMIT 1`
    ).get(projectId) as any;
    return row === undefined ? null : mapProjectStyle(row);
  }

  async commitProjectStyle(input: {
    previous: ProjectStyle | null;
    next: ProjectStyle;
    staleAnchorIds: string[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      if (input.previous !== null) {
        this.db.prepare(
          `UPDATE project_styles
           SET lifecycle_status = 'SUPERSEDED', updated_at = ?
           WHERE id = ? AND revision = ?`
        ).run(input.event.createdAt, input.previous.id, input.previous.revision);
      }
      this.insertProjectStyle(input.next);
      for (const anchorId of input.staleAnchorIds) {
        this.db.prepare(
          `UPDATE identity_anchors
           SET stale = 1, stale_reason = 'PROJECT_STYLE_CHANGED'
           WHERE id = ? AND lifecycle_status = 'ACTIVE'`
        ).run(anchorId);
      }
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitProjectStyleApproval(input: {
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      insertApproval(this.db, input.approval);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async listActiveAnchors(projectId: string): Promise<IdentityAnchor[]> {
    const rows = this.db.prepare(
      `SELECT * FROM identity_anchors
       WHERE project_id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY anchor_type, name`
    ).all(projectId) as any[];
    return rows.map(mapAnchor);
  }

  async getLatestAnchor(projectId: string, anchorId: string): Promise<IdentityAnchor | null> {
    const row = this.db.prepare(
      `SELECT * FROM identity_anchors
       WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId, anchorId) as any;
    return row === undefined ? null : mapAnchor(row);
  }

  async commitAnchorPlan(input: {
    previousAnchors: IdentityAnchor[];
    nextAnchors: IdentityAnchor[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      const projectId =
        input.nextAnchors[0]?.projectId ??
        input.previousAnchors[0]?.projectId ??
        input.event.projectId;
      this.db.prepare(
        `UPDATE identity_anchors
         SET lifecycle_status = 'SUPERSEDED', updated_at = ?
         WHERE project_id = ? AND lifecycle_status = 'ACTIVE'`
      ).run(input.event.createdAt, projectId);

      for (const anchor of input.nextAnchors) this.insertAnchor(anchor);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitAnchorRevision(input: {
    previous: IdentityAnchor;
    next: IdentityAnchor;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare(
        `UPDATE identity_anchors
         SET lifecycle_status = 'SUPERSEDED', updated_at = ?
         WHERE id = ? AND revision = ?`
      ).run(input.event.createdAt, input.previous.id, input.previous.revision);
      this.insertAnchor(input.next);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitAnchorApprovals(input: {
    approvals: ApprovalRecord[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      for (const approval of input.approvals) insertApproval(this.db, approval);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async markAnchorsStale(input: {
    anchorIds: string[];
    reason: string;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      for (const anchorId of input.anchorIds) {
        this.db.prepare(
          `UPDATE identity_anchors
           SET stale = 1, stale_reason = ?
           WHERE id = ? AND lifecycle_status = 'ACTIVE'`
        ).run(input.reason, anchorId);
      }
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async getLatestApproval(
    projectId: string,
    targetType: ApprovalRecord["targetType"],
    targetId: string
  ): Promise<ApprovalRecord | null> {
    const row = this.db.prepare(
      `SELECT * FROM approval_records
       WHERE project_id = ? AND target_type = ? AND target_id = ?
       ORDER BY created_at DESC, rowid DESC LIMIT 1`
    ).get(projectId, targetType, targetId) as any;
    return row === undefined ? null : mapApproval(row);
  }

  private insertProjectStyle(style: ProjectStyle): void {
    this.db.prepare(`INSERT INTO project_styles
      (id, project_id, revision, lifecycle_status, channel_visual_bible_version,
       source_script_id, source_script_revision, era_region, visual_approach,
       realism_level, color_language, lighting_language, material_language,
       environment_language, character_rendering_principle,
       camera_composition_tendency, mood_range_json, factual_constraints_json,
       avoidances_json, stale, stale_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        style.id,
        style.projectId,
        style.revision,
        style.lifecycleStatus,
        style.channelVisualBibleVersion,
        style.sourceScriptId,
        style.sourceScriptRevision,
        style.eraRegion,
        style.visualApproach,
        style.realismLevel,
        style.colorLanguage,
        style.lightingLanguage,
        style.materialLanguage,
        style.environmentLanguage,
        style.characterRenderingPrinciple,
        style.cameraCompositionTendency,
        encode(style.moodRange),
        encode(style.factualConstraints),
        encode(style.avoidances),
        style.stale ? 1 : 0,
        style.staleReason ?? null,
        style.createdAt,
        style.updatedAt
      );
  }

  private insertAnchor(anchor: IdentityAnchor): void {
    this.db.prepare(`INSERT INTO identity_anchors
      (id, project_id, revision, lifecycle_status, anchor_type, name, rationale,
       continuity_reason, production_priority, locked_spec_json, contextual_spec_json,
       temporary_spec_json, required_by_scene_ids_json, reference_media_ids_json,
       source_project_style_id, source_project_style_revision,
       source_channel_visual_bible_version, stale, stale_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        anchor.id,
        anchor.projectId,
        anchor.revision,
        anchor.lifecycleStatus,
        anchor.anchorType,
        anchor.name,
        anchor.rationale,
        anchor.continuityReason,
        anchor.productionPriority,
        encode(anchor.specification.locked),
        encode(anchor.specification.contextual),
        encode(anchor.specification.temporary),
        encode(anchor.requiredBySceneIds),
        encode(anchor.referenceMediaIds),
        anchor.sourceProjectStyleId,
        anchor.sourceProjectStyleRevision,
        anchor.sourceChannelVisualBibleVersion,
        anchor.stale ? 1 : 0,
        anchor.staleReason ?? null,
        anchor.createdAt,
        anchor.updatedAt
      );
  }
}
