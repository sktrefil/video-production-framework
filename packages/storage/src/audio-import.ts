import type {MediaArtifact} from "@vpf/domain";
import type {UnifiedProjectPolicy} from "@vpf/legacy-guard";
import type {AudioImportPersistencePort} from "@vpf/provider-orchestrator/audio-import";
import type {OutboxRecord, WorkflowEvent} from "@vpf/workflow";
import {SqliteSceneAssetRepository} from "./scene-assets.js";
import {readProjectPolicy} from "./project-policy.js";

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
    ...(row.width == null ? {} : {width: row.width}),
    ...(row.height == null ? {} : {height: row.height}),
    ...(row.duration_ms == null ? {} : {durationMs: row.duration_ms}),
    checksum: row.checksum,
    ...(row.source_job_id == null ? {} : {sourceJobId: row.source_job_id}),
    mediaStatus: row.media_status
  };
}

function insertEvent(
  db: SqliteSceneAssetRepository["db"],
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

export class SqliteAudioImportRepository
  extends SqliteSceneAssetRepository
  implements AudioImportPersistencePort {
  async getProjectPolicy(projectId: string): Promise<UnifiedProjectPolicy | null> {
    return readProjectPolicy(this.db, projectId);
  }

  async findAvailableAudio(input: {
    projectId: string;
    checksum: string;
    relativePath: string;
  }): Promise<MediaArtifact | null> {
    const row = this.db.prepare(
      `SELECT * FROM media_artifacts
       WHERE project_id = ?
         AND media_type = 'AUDIO'
         AND media_status = 'AVAILABLE'
         AND lifecycle_status = 'ACTIVE'
         AND checksum = ?
         AND relative_path = ?
       ORDER BY revision DESC
       LIMIT 1`
    ).get(input.projectId, input.checksum, input.relativePath) as any;
    return row === undefined ? null : mapMedia(row);
  }

  async commitImportedAudio(input: {
    media: MediaArtifact;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare(
        `INSERT INTO media_artifacts
          (id, project_id, revision, lifecycle_status, media_type, relative_path, mime_type,
           width, height, duration_ms, checksum, source_job_id, media_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.media.id,
        input.media.projectId,
        input.media.revision,
        input.media.lifecycleStatus,
        input.media.mediaType,
        input.media.relativePath,
        input.media.mimeType,
        input.media.width ?? null,
        input.media.height ?? null,
        input.media.durationMs ?? null,
        input.media.checksum,
        input.media.sourceJobId ?? null,
        input.media.mediaStatus,
        input.media.createdAt,
        input.media.updatedAt
      );
      insertEvent(this.db, input.event, input.outbox);
    })();
  }
}
