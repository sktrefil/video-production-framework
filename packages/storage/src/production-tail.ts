import { createHash } from "node:crypto";
import Database from "better-sqlite3";

export type ProductionTailTaskId = "T070" | "T080" | "T090" | "T100";

export type ProductionTailArtifactType =
  | "generated_images"
  | "image_qc_result"
  | "approved_images"
  | "t070_seed_visual_qc"
  | "t070_final_visual_qc"
  | "generated_clips"
  | "clip_qc_result"
  | "timeline_spec"
  | "preview_render"
  | "final_qc_result";

export interface ProductionTailStoredArtifact<T = unknown> {
  project_id: string;
  artifact_type: ProductionTailArtifactType;
  revision: number;
  sha256: string;
  value: T;
  source_task_id: ProductionTailTaskId;
  created_at: string;
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export class ProductionTailRepository {
  readonly db: Database.Database;

  constructor(filename: string, options: { readonly?: boolean } = {}) {
    this.db = new Database(filename, {
      readonly: options.readonly ?? false,
      fileMustExist: true
    });
    this.db.pragma("foreign_keys = ON");
  }

  close(): void {
    this.db.close();
  }

  save<T>(
    projectId: string,
    artifactType: ProductionTailArtifactType,
    value: T,
    sourceTaskId: ProductionTailTaskId,
    at: string
  ): ProductionTailStoredArtifact<T> {
    const encoded = JSON.stringify(value);
    const sha256 = hash(encoded);
    const revision = this.db.transaction(() => {
      const row = this.db.prepare(
        "SELECT COALESCE(MAX(revision),0) revision FROM production_tail_artifacts WHERE project_id=? AND artifact_type=?"
      ).get(projectId, artifactType) as { revision: number };
      const next = Number(row.revision) + 1;
      this.db.prepare(
        "UPDATE production_tail_artifacts SET lifecycle_status='SUPERSEDED' WHERE project_id=? AND artifact_type=? AND lifecycle_status='ACTIVE'"
      ).run(projectId, artifactType);
      this.db.prepare(
        "INSERT INTO production_tail_artifacts (project_id, artifact_type, revision, lifecycle_status, schema_version, artifact_json, artifact_sha256, source_task_id, created_at) VALUES (?, ?, ?, 'ACTIVE', '1.0', ?, ?, ?, ?)"
      ).run(projectId, artifactType, next, encoded, sha256, sourceTaskId, at);
      return next;
    })();

    return {
      project_id: projectId,
      artifact_type: artifactType,
      revision,
      sha256,
      value,
      source_task_id: sourceTaskId,
      created_at: at
    };
  }

  getActive<T>(
    projectId: string,
    artifactType: ProductionTailArtifactType
  ): ProductionTailStoredArtifact<T> | null {
    const row = this.db.prepare(
      "SELECT revision, artifact_json, artifact_sha256, source_task_id, created_at FROM production_tail_artifacts WHERE project_id=? AND artifact_type=? AND lifecycle_status='ACTIVE' ORDER BY revision DESC LIMIT 1"
    ).get(projectId, artifactType) as {
      revision: number;
      artifact_json: string;
      artifact_sha256: string;
      source_task_id: ProductionTailTaskId;
      created_at: string;
    } | undefined;

    if (row === undefined) return null;
    return {
      project_id: projectId,
      artifact_type: artifactType,
      revision: Number(row.revision),
      sha256: String(row.artifact_sha256),
      value: JSON.parse(String(row.artifact_json)) as T,
      source_task_id: row.source_task_id,
      created_at: String(row.created_at)
    };
  }

  listActive(projectId: string): ProductionTailStoredArtifact[] {
    const rows = this.db.prepare(
      "SELECT artifact_type, revision, artifact_json, artifact_sha256, source_task_id, created_at FROM production_tail_artifacts WHERE project_id=? AND lifecycle_status='ACTIVE' ORDER BY artifact_type"
    ).all(projectId) as Array<{
      artifact_type: ProductionTailArtifactType;
      revision: number;
      artifact_json: string;
      artifact_sha256: string;
      source_task_id: ProductionTailTaskId;
      created_at: string;
    }>;

    return rows.map(row => ({
      project_id: projectId,
      artifact_type: row.artifact_type,
      revision: Number(row.revision),
      sha256: String(row.artifact_sha256),
      value: JSON.parse(String(row.artifact_json)) as unknown,
      source_task_id: row.source_task_id,
      created_at: String(row.created_at)
    }));
  }
}
