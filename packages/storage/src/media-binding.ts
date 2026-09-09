import type {
  CurrentImplementationRef,
  FinalMediaBinding
} from "@vpf/domain";
import type { MediaBindingRepository } from "@vpf/media-binding";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import { SqliteQcFallbackRepository } from "./qc-fallback.js";

export const FINAL_MEDIA_BINDING_MIGRATION_SQL = "PRAGMA foreign_keys = ON;\n\nCREATE TABLE IF NOT EXISTS final_media_bindings (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  link_id TEXT NOT NULL,\n  link_revision INTEGER NOT NULL,\n  implementation_type TEXT NOT NULL,\n  implementation_id TEXT NOT NULL,\n  implementation_revision INTEGER NOT NULL,\n  binding_kind TEXT NOT NULL,\n  binding_status TEXT NOT NULL,\n  stale INTEGER NOT NULL,\n  stale_reason TEXT,\n  clip_mode TEXT,\n  media_id TEXT,\n  source_asset_id TEXT,\n  source_qc_id TEXT,\n  source_in_ms INTEGER,\n  source_out_ms INTEGER,\n  duration_ms INTEGER NOT NULL,\n  transition_method TEXT NOT NULL,\n  camera_move TEXT,\n  subject_motion TEXT,\n  environment_motion TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_final_media_binding\n  ON final_media_bindings(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE INDEX IF NOT EXISTS idx_binding_implementation\n  ON final_media_bindings(project_id, implementation_type, implementation_id, revision);\n\nCREATE INDEX IF NOT EXISTS idx_binding_link\n  ON final_media_bindings(project_id, link_id, link_revision);\n";

function insertEvent(
  db: SqliteQcFallbackRepository["db"],
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

function mapBinding(row: any): FinalMediaBinding {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    linkId: row.link_id,
    linkRevision: row.link_revision,
    implementationType: row.implementation_type,
    implementationId: row.implementation_id,
    implementationRevision: row.implementation_revision,
    bindingKind: row.binding_kind,
    bindingStatus: row.binding_status,
    stale: row.stale === 1,
    ...(row.stale_reason == null ? {} : { staleReason: row.stale_reason }),
    ...(row.clip_mode == null ? {} : { clipMode: row.clip_mode }),
    ...(row.media_id == null ? {} : { mediaId: row.media_id }),
    ...(row.source_asset_id == null ? {} : { sourceAssetId: row.source_asset_id }),
    ...(row.source_qc_id == null ? {} : { sourceQcId: row.source_qc_id }),
    ...(row.source_in_ms == null ? {} : { sourceInMs: row.source_in_ms }),
    ...(row.source_out_ms == null ? {} : { sourceOutMs: row.source_out_ms }),
    durationMs: row.duration_ms,
    transitionMethod: row.transition_method,
    ...(row.camera_move == null ? {} : { cameraMove: row.camera_move }),
    ...(row.subject_motion == null ? {} : { subjectMotion: row.subject_motion }),
    ...(row.environment_motion == null ? {} : { environmentMotion: row.environment_motion })
  };
}

export class SqliteMediaBindingRepository
  extends SqliteQcFallbackRepository
  implements MediaBindingRepository {
  constructor(filename: string) {
    super(filename);
    this.db.exec(FINAL_MEDIA_BINDING_MIGRATION_SQL);
  }

  async getLatestBindingByImplementation(
    projectId: string,
    implementationType: "CLIP" | "CUT",
    implementationId: string
  ): Promise<FinalMediaBinding | null> {
    const row = this.db.prepare(
      `SELECT * FROM final_media_bindings
       WHERE project_id = ?
         AND implementation_type = ?
         AND implementation_id = ?
         AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId, implementationType, implementationId) as any;
    return row === undefined ? null : mapBinding(row);
  }

  async listActiveBindings(projectId: string): Promise<FinalMediaBinding[]> {
    const rows = this.db.prepare(
      `SELECT * FROM final_media_bindings
       WHERE project_id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY rowid`
    ).all(projectId) as any[];
    return rows.map(mapBinding);
  }

  async listCurrentImplementationRefs(projectId: string): Promise<CurrentImplementationRef[]> {
    const rows = this.db.prepare(
      `SELECT l.id AS link_id,
              l.revision AS link_revision,
              r.implementation_type,
              r.implementation_ref_id
       FROM production_links l
       JOIN link_implementation_refs r
         ON r.project_id = l.project_id
        AND r.link_id = l.id
        AND r.link_revision = l.revision
       WHERE l.project_id = ?
         AND l.lifecycle_status = 'ACTIVE'
       ORDER BY l.rowid`
    ).all(projectId) as Array<{
      link_id: string;
      link_revision: number;
      implementation_type: "CLIP" | "CUT";
      implementation_ref_id: string;
    }>;
    return rows.map(row => ({
      linkId: row.link_id,
      linkRevision: row.link_revision,
      implementationType: row.implementation_type,
      implementationId: row.implementation_ref_id
    }));
  }

  async hasClipMediaApproval(
    projectId: string,
    clipId: string,
    clipRevision: number,
    mediaId: string
  ): Promise<boolean> {
    const row = this.db.prepare(
      `SELECT 1 AS ok
       FROM approval_records
       WHERE project_id = ?
         AND target_type = 'CLIP'
         AND target_id = ?
         AND target_revision = ?
         AND selected_media_id = ?
         AND approval_state IN ('AUTO_APPROVED', 'HUMAN_APPROVED')
       ORDER BY rowid DESC
       LIMIT 1`
    ).get(projectId, clipId, clipRevision, mediaId) as { ok: number } | undefined;
    return row !== undefined;
  }

  async commitBinding(input: {
    previousBinding: FinalMediaBinding | null;
    binding: FinalMediaBinding;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      if (input.previousBinding !== null) {
        this.db.prepare(
          `UPDATE final_media_bindings
           SET lifecycle_status = 'SUPERSEDED', updated_at = ?
           WHERE id = ? AND revision = ?`
        ).run(
          input.event.createdAt,
          input.previousBinding.id,
          input.previousBinding.revision
        );
      }
      this.insertBinding(input.binding);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async markBindingsStale(input: {
    items: Array<{ bindingId: string; reason: string }>;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      for (const item of input.items) {
        this.db.prepare(
          `UPDATE final_media_bindings
           SET stale = 1,
               stale_reason = ?,
               binding_status = 'STALE',
               updated_at = ?
           WHERE id = ? AND lifecycle_status = 'ACTIVE'`
        ).run(item.reason, input.event.createdAt, item.bindingId);
      }
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  private insertBinding(binding: FinalMediaBinding): void {
    this.db.prepare(
      `INSERT INTO final_media_bindings
       (id, project_id, revision, lifecycle_status,
        link_id, link_revision,
        implementation_type, implementation_id, implementation_revision,
        binding_kind, binding_status, stale, stale_reason,
        clip_mode, media_id, source_asset_id, source_qc_id,
        source_in_ms, source_out_ms, duration_ms,
        transition_method, camera_move, subject_motion, environment_motion,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      binding.id,
      binding.projectId,
      binding.revision,
      binding.lifecycleStatus,
      binding.linkId,
      binding.linkRevision,
      binding.implementationType,
      binding.implementationId,
      binding.implementationRevision,
      binding.bindingKind,
      binding.bindingStatus,
      binding.stale ? 1 : 0,
      binding.staleReason ?? null,
      binding.clipMode ?? null,
      binding.mediaId ?? null,
      binding.sourceAssetId ?? null,
      binding.sourceQcId ?? null,
      binding.sourceInMs ?? null,
      binding.sourceOutMs ?? null,
      binding.durationMs,
      binding.transitionMethod,
      binding.cameraMove ?? null,
      binding.subjectMotion ?? null,
      binding.environmentMotion ?? null,
      binding.createdAt,
      binding.updatedAt
    );
  }
}
