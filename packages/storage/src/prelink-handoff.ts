import type {
  ApprovalRecord,
  MediaArtifact,
  ProductionAsset,
  ProductionLink,
  QcResult
} from "@vpf/domain";
import type {
  OrderedScene,
  PreLinkHandoffContextPort,
  PreLinkHandoffRepository
} from "@vpf/prelink-handoff";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import { SqliteSceneAssetRepository } from "./scene-assets.js";

export const PRELINK_HANDOFF_MIGRATION_SQL = "PRAGMA foreign_keys = ON;\n\nCREATE TABLE IF NOT EXISTS production_links (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n\n  from_scene_id TEXT NOT NULL,\n  from_scene_revision INTEGER NOT NULL,\n  from_state_entity_type TEXT NOT NULL,\n  from_state_entity_id TEXT NOT NULL,\n  from_state_field TEXT NOT NULL,\n  from_state_entity_revision INTEGER,\n\n  to_scene_id TEXT NOT NULL,\n  to_scene_revision INTEGER NOT NULL,\n  to_state_entity_type TEXT NOT NULL,\n  to_state_entity_id TEXT NOT NULL,\n  to_state_field TEXT NOT NULL,\n  to_state_entity_revision INTEGER,\n\n  link_scope TEXT NOT NULL,\n  pre_link_required INTEGER NOT NULL DEFAULT 0,\n  continuity_level TEXT NOT NULL,\n  state_change TEXT NOT NULL,\n  handoff_intent TEXT NOT NULL,\n  handoff_anchor_json TEXT NOT NULL,\n  handoff_channels_json TEXT NOT NULL,\n  transition_intent TEXT NOT NULL,\n  pre_link_approval_id TEXT,\n\n  from_asset_id TEXT,\n  from_asset_revision INTEGER,\n  from_media_id TEXT,\n  to_asset_id TEXT,\n  to_asset_revision INTEGER,\n  to_media_id TEXT,\n\n  handoff_qc_id TEXT,\n  pre_link_match TEXT NOT NULL,\n  link_status TEXT NOT NULL,\n\n  stale INTEGER NOT NULL DEFAULT 0,\n  stale_reason TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n\n  PRIMARY KEY(id, revision)\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_link\n  ON production_links(id)\n  WHERE lifecycle_status = 'ACTIVE';\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_link_pair\n  ON production_links(project_id, from_scene_id, to_scene_id)\n  WHERE lifecycle_status = 'ACTIVE';\n\nCREATE INDEX IF NOT EXISTS idx_links_project\n  ON production_links(project_id);\n\nCREATE INDEX IF NOT EXISTS idx_links_from_scene\n  ON production_links(project_id, from_scene_id);\n\nCREATE INDEX IF NOT EXISTS idx_links_to_scene\n  ON production_links(project_id, to_scene_id);\n\nCREATE INDEX IF NOT EXISTS idx_links_bound_assets\n  ON production_links(project_id, from_asset_id, to_asset_id);\n";

const encode = (value: unknown) => JSON.stringify(value);
const decodeStrings = (value: string): string[] => JSON.parse(value) as string[];

function insertEvent(
  db: SqliteSceneAssetRepository["db"],
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
  db: SqliteSceneAssetRepository["db"],
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

function mapLink(row: any): ProductionLink {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stale: row.stale === 1,
    ...(row.stale_reason == null ? {} : { staleReason: row.stale_reason }),

    fromSceneId: row.from_scene_id,
    fromSceneRevision: row.from_scene_revision,
    fromStateRef: {
      entityType: row.from_state_entity_type,
      entityId: row.from_state_entity_id,
      stateField: row.from_state_field,
      ...(row.from_state_entity_revision == null
        ? {}
        : { entityRevision: row.from_state_entity_revision })
    },

    toSceneId: row.to_scene_id,
    toSceneRevision: row.to_scene_revision,
    toStateRef: {
      entityType: row.to_state_entity_type,
      entityId: row.to_state_entity_id,
      stateField: row.to_state_field,
      ...(row.to_state_entity_revision == null
        ? {}
        : { entityRevision: row.to_state_entity_revision })
    },

    linkScope: row.link_scope,
    preLinkRequired: row.pre_link_required === 1,
    continuityLevel: row.continuity_level,
    stateChange: row.state_change,
    handoffIntent: row.handoff_intent,
    handoffAnchor: decodeStrings(row.handoff_anchor_json),
    handoffChannels: decodeStrings(row.handoff_channels_json) as ProductionLink["handoffChannels"],
    transitionIntent: row.transition_intent,
    ...(row.pre_link_approval_id == null
      ? {}
      : { preLinkApprovalId: row.pre_link_approval_id }),

    ...(row.from_asset_id == null ? {} : { fromAssetId: row.from_asset_id }),
    ...(row.from_asset_revision == null
      ? {}
      : { fromAssetRevision: row.from_asset_revision }),
    ...(row.from_media_id == null ? {} : { fromMediaId: row.from_media_id }),

    ...(row.to_asset_id == null ? {} : { toAssetId: row.to_asset_id }),
    ...(row.to_asset_revision == null
      ? {}
      : { toAssetRevision: row.to_asset_revision }),
    ...(row.to_media_id == null ? {} : { toMediaId: row.to_media_id }),

    ...(row.handoff_qc_id == null ? {} : { handoffQcId: row.handoff_qc_id }),
    preLinkMatch: row.pre_link_match,
    linkStatus: row.link_status
  };
}

export class SqlitePreLinkHandoffRepository
  extends SqliteSceneAssetRepository
  implements PreLinkHandoffRepository, PreLinkHandoffContextPort {
  constructor(filename: string) {
    super(filename);
    this.db.exec(PRELINK_HANDOFF_MIGRATION_SQL);
  }

  async listApprovedSceneChain(projectId: string): Promise<OrderedScene[]> {
    const rows = this.db.prepare(
      `SELECT
         s.id AS scene_id,
         s.sequence_id,
         seq.chapter_id,
         seq.display_number AS sequence_display_number,
         ch.display_number AS chapter_display_number
       FROM scenes s
       JOIN sequences seq
         ON seq.project_id = s.project_id
        AND seq.id = s.sequence_id
        AND seq.lifecycle_status = 'ACTIVE'
        AND seq.stale = 0
       JOIN chapters ch
         ON ch.project_id = seq.project_id
        AND ch.id = seq.chapter_id
        AND ch.lifecycle_status = 'ACTIVE'
        AND ch.stale = 0
       WHERE s.project_id = ?
         AND s.lifecycle_status = 'ACTIVE'
         AND s.stale = 0
         AND s.scene_status = 'APPROVED'
       ORDER BY
         ch.display_number,
         seq.display_number,
         s.display_number`
    ).all(projectId) as Array<{
      scene_id: string;
      sequence_id: string;
      chapter_id: string;
      sequence_display_number: number;
      chapter_display_number: number;
    }>;

    const result: OrderedScene[] = [];
    for (const row of rows) {
      const scene = await this.getScene(projectId, row.scene_id);
      if (scene === null) continue;
      result.push({
        scene,
        chapterId: row.chapter_id,
        chapterDisplayNumber: row.chapter_display_number,
        sequenceId: row.sequence_id,
        sequenceDisplayNumber: row.sequence_display_number
      });
    }
    return result;
  }

  async getApprovedPrimaryAsset(
    projectId: string,
    sceneId: string
  ): Promise<ProductionAsset | null> {
    const asset = await this.getPrimarySceneAsset(projectId, sceneId);
    if (
      asset === null ||
      asset.stale ||
      asset.assetStatus !== "APPROVED" ||
      asset.approvedMediaId === undefined
    ) {
      return null;
    }

    const approval = this.db.prepare(
      `SELECT 1 AS ok
       FROM approval_records
       WHERE project_id = ?
         AND target_type = 'ASSET'
         AND target_id = ?
         AND target_revision = ?
         AND approval_state IN ('HUMAN_APPROVED', 'AUTO_APPROVED')
         AND selected_media_id = ?
       LIMIT 1`
    ).get(
      projectId,
      asset.id,
      asset.revision,
      asset.approvedMediaId
    ) as { ok: number } | undefined;

    return approval === undefined ? null : asset;
  }

  async getAsset(
    projectId: string,
    assetId: string
  ): Promise<ProductionAsset | null> {
    return this.getLatestAsset(projectId, assetId);
  }

  async getLatestLink(
    projectId: string,
    linkId: string
  ): Promise<ProductionLink | null> {
    const row = this.db.prepare(
      `SELECT * FROM production_links
       WHERE project_id = ?
         AND id = ?
         AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC
       LIMIT 1`
    ).get(projectId, linkId) as any;
    return row === undefined ? null : mapLink(row);
  }

  async getLinkByScenes(
    projectId: string,
    fromSceneId: string,
    toSceneId: string
  ): Promise<ProductionLink | null> {
    const row = this.db.prepare(
      `SELECT * FROM production_links
       WHERE project_id = ?
         AND from_scene_id = ?
         AND to_scene_id = ?
         AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC
       LIMIT 1`
    ).get(projectId, fromSceneId, toSceneId) as any;
    return row === undefined ? null : mapLink(row);
  }

  async listActiveLinks(projectId: string): Promise<ProductionLink[]> {
    const rows = this.db.prepare(
      `SELECT * FROM production_links
       WHERE project_id = ?
         AND lifecycle_status = 'ACTIVE'
       ORDER BY rowid`
    ).all(projectId) as any[];
    return rows.map(mapLink);
  }

  async commitLinkGraph(input: {
    changes: Array<{
      previous: ProductionLink | null;
      next: ProductionLink;
    }>;
    staleLinkIds: string[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      for (const change of input.changes) {
        if (change.previous !== null) {
          this.supersedeLink(change.previous, input.event.createdAt);
        }
        this.insertLink(change.next);
      }

      for (const linkId of input.staleLinkIds) {
        this.db.prepare(
          `UPDATE production_links
           SET stale = 1, stale_reason = 'STORY_CHAIN_CHANGED', updated_at = ?
           WHERE id = ? AND lifecycle_status = 'ACTIVE'`
        ).run(input.event.createdAt, linkId);
      }

      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitPreLink(input: {
    previous: ProductionLink;
    next: ProductionLink;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeLink(input.previous, input.event.createdAt);
      this.insertLink(input.next);
      if (input.approval !== undefined) {
        insertApproval(this.db, input.approval);
      }
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitPreLinkApproval(input: {
    previous: ProductionLink;
    next: ProductionLink;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeLink(input.previous, input.event.createdAt);
      this.insertLink(input.next);
      insertApproval(this.db, input.approval);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitAssetBinding(input: {
    previous: ProductionLink;
    next: ProductionLink;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeLink(input.previous, input.event.createdAt);
      this.insertLink(input.next);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitHandoffQc(input: {
    previous: ProductionLink;
    next: ProductionLink;
    qc: QcResult;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.supersedeLink(input.previous, input.event.createdAt);
      this.insertLink(input.next);
      this.insertQc(input.qc);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitDependencyReconciliation(input: {
    staleLinkIds: string[];
    resets: Array<{
      previous: ProductionLink;
      next: ProductionLink;
    }>;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      for (const linkId of input.staleLinkIds) {
        this.db.prepare(
          `UPDATE production_links
           SET stale = 1, stale_reason = 'STORY_STATE_CHANGED', updated_at = ?
           WHERE id = ? AND lifecycle_status = 'ACTIVE'`
        ).run(input.event.createdAt, linkId);
      }

      for (const reset of input.resets) {
        this.supersedeLink(reset.previous, input.event.createdAt);
        this.insertLink(reset.next);
      }

      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  private supersedeLink(link: ProductionLink, updatedAt: string): void {
    this.db.prepare(
      `UPDATE production_links
       SET lifecycle_status = 'SUPERSEDED', updated_at = ?
       WHERE id = ? AND revision = ?`
    ).run(updatedAt, link.id, link.revision);
  }

  private insertLink(link: ProductionLink): void {
    this.db.prepare(`INSERT INTO production_links
      (id, project_id, revision, lifecycle_status,
       from_scene_id, from_scene_revision, from_state_entity_type,
       from_state_entity_id, from_state_field, from_state_entity_revision,
       to_scene_id, to_scene_revision, to_state_entity_type,
       to_state_entity_id, to_state_field, to_state_entity_revision,
       link_scope, pre_link_required, continuity_level, state_change,
       handoff_intent, handoff_anchor_json, handoff_channels_json,
       transition_intent, pre_link_approval_id,
       from_asset_id, from_asset_revision, from_media_id,
       to_asset_id, to_asset_revision, to_media_id,
       handoff_qc_id, pre_link_match, link_status,
       stale, stale_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        link.id,
        link.projectId,
        link.revision,
        link.lifecycleStatus,

        link.fromSceneId,
        link.fromSceneRevision,
        link.fromStateRef.entityType,
        link.fromStateRef.entityId,
        link.fromStateRef.stateField,
        link.fromStateRef.entityRevision ?? null,

        link.toSceneId,
        link.toSceneRevision,
        link.toStateRef.entityType,
        link.toStateRef.entityId,
        link.toStateRef.stateField,
        link.toStateRef.entityRevision ?? null,

        link.linkScope,
        link.preLinkRequired ? 1 : 0,
        link.continuityLevel,
        link.stateChange,
        link.handoffIntent,
        encode(link.handoffAnchor),
        encode(link.handoffChannels),
        link.transitionIntent,
        link.preLinkApprovalId ?? null,

        link.fromAssetId ?? null,
        link.fromAssetRevision ?? null,
        link.fromMediaId ?? null,
        link.toAssetId ?? null,
        link.toAssetRevision ?? null,
        link.toMediaId ?? null,

        link.handoffQcId ?? null,
        link.preLinkMatch,
        link.linkStatus,

        link.stale ? 1 : 0,
        link.staleReason ?? null,
        link.createdAt,
        link.updatedAt
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
