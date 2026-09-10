import type {MediaArtifact} from "@vpf/domain";
import type {EditorMaterializationRepository} from "@vpf/editor-materializer";
import {SqliteFinalOutputRepository} from "./final-output.js";

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

export class SqliteEditorMaterializationRepository
  extends SqliteFinalOutputRepository
  implements EditorMaterializationRepository {
  async listAvailableMedia(projectId: string): Promise<MediaArtifact[]> {
    const rows = this.db.prepare(
      `SELECT * FROM media_artifacts
       WHERE project_id = ?
         AND lifecycle_status = 'ACTIVE'
         AND media_status = 'AVAILABLE'
       ORDER BY id, revision`
    ).all(projectId) as any[];
    return rows.map(mapMedia);
  }
}
