import { createHash } from "node:crypto";
import Database from "better-sqlite3";

export type Agent3VisualArtifactType =
  | "scene_visual_spec"
  | "state_image_spec"
  | "prompt_bundle_spec";

export interface Agent3StoredArtifact<T = unknown> {
  project_id: string;
  artifact_type: Agent3VisualArtifactType;
  revision: number;
  sha256: string;
  value: T;
  source_task_id: "T040" | "T050" | "T060";
  created_at: string;
}

const hash = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

export class Agent3VisualProductionRepository {
  readonly db: Database.Database;

  constructor(filename: string, options: { readonly?: boolean } = {}) {
    this.db = new Database(filename, {
      readonly: options.readonly ?? false,
      fileMustExist: true
    });
    this.db.pragma("foreign_keys = ON");
  }

  close(): void { this.db.close(); }

  save<T>(
    projectId: string,
    artifactType: Agent3VisualArtifactType,
    value: T,
    sourceTaskId: "T040" | "T050" | "T060",
    at: string
  ): Agent3StoredArtifact<T> {
    const encoded = JSON.stringify(value);
    const sha256 = hash(encoded);
    const revision = this.db.transaction(() => {
      const row = this.db.prepare(
        "SELECT COALESCE(MAX(revision),0) revision FROM agent3_visual_artifacts WHERE project_id=? AND artifact_type=?"
      ).get(projectId, artifactType) as { revision: number };
      const next = Number(row.revision) + 1;
      this.db.prepare(
        "UPDATE agent3_visual_artifacts SET lifecycle_status='SUPERSEDED' WHERE project_id=? AND artifact_type=? AND lifecycle_status='ACTIVE'"
      ).run(projectId, artifactType);
      this.db.prepare(
        "INSERT INTO agent3_visual_artifacts (project_id, artifact_type, revision, lifecycle_status, schema_version, artifact_json, artifact_sha256, source_task_id, created_at) VALUES (?, ?, ?, 'ACTIVE', '1.0', ?, ?, ?, ?)"
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
    artifactType: Agent3VisualArtifactType
  ): Agent3StoredArtifact<T> | null {
    const row = this.db.prepare(
      "SELECT revision, artifact_json, artifact_sha256, source_task_id, created_at FROM agent3_visual_artifacts WHERE project_id=? AND artifact_type=? AND lifecycle_status='ACTIVE' ORDER BY revision DESC LIMIT 1"
    ).get(projectId, artifactType) as {
      revision: number;
      artifact_json: string;
      artifact_sha256: string;
      source_task_id: "T040" | "T050" | "T060";
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
}
