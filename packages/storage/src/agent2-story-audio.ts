import { createHash } from "node:crypto";
import Database from "better-sqlite3";

export type Agent2ArtifactType =
  | "research_spec"
  | "fact_check_spec"
  | "story_spec"
  | "script"
  | "tts_manifest"
  | "subtitle_timing";

export interface Agent2StoredArtifact<T = unknown> {
  project_id: string;
  artifact_type: Agent2ArtifactType;
  revision: number;
  lifecycle_status: "ACTIVE" | "SUPERSEDED";
  schema_version: string;
  value: T;
  sha256: string;
  source_task_id: "T010" | "T020" | "T030";
  created_at: string;
}

const encode = (value: unknown) => JSON.stringify(value);
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export class Agent2StoryAudioRepository {
  readonly db: Database.Database;

  constructor(filename: string, options: { readonly?: boolean } = {}) {
    this.db = new Database(filename, { readonly: options.readonly ?? false, fileMustExist: true });
    this.db.pragma("foreign_keys = ON");
  }

  close(): void { this.db.close(); }

  save<T extends { schema_version: string }>(
    projectId: string,
    artifactType: Agent2ArtifactType,
    value: T,
    sourceTaskId: "T010" | "T020" | "T030",
    at: string
  ): Agent2StoredArtifact<T> {
    const encoded = encode(value);
    const digest = sha256(encoded);
    const save = this.db.transaction(() => {
      const row = this.db.prepare(
        `SELECT COALESCE(MAX(revision), 0) AS revision
         FROM agent2_story_audio_artifacts
         WHERE project_id = ? AND artifact_type = ?`
      ).get(projectId, artifactType) as { revision: number };
      const revision = Number(row.revision) + 1;
      this.db.prepare(
        `UPDATE agent2_story_audio_artifacts
         SET lifecycle_status = 'SUPERSEDED'
         WHERE project_id = ? AND artifact_type = ? AND lifecycle_status = 'ACTIVE'`
      ).run(projectId, artifactType);
      this.db.prepare(
        `INSERT INTO agent2_story_audio_artifacts
         (project_id, artifact_type, revision, lifecycle_status, schema_version,
          artifact_json, artifact_sha256, source_task_id, created_at)
         VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`
      ).run(projectId, artifactType, revision, value.schema_version, encoded, digest, sourceTaskId, at);
      return revision;
    });
    const revision = save();
    return {
      project_id: projectId,
      artifact_type: artifactType,
      revision,
      lifecycle_status: "ACTIVE",
      schema_version: value.schema_version,
      value,
      sha256: digest,
      source_task_id: sourceTaskId,
      created_at: at
    };
  }

  getActive<T>(projectId: string, artifactType: Agent2ArtifactType): Agent2StoredArtifact<T> | null {
    const row = this.db.prepare(
      `SELECT * FROM agent2_story_audio_artifacts
       WHERE project_id = ? AND artifact_type = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId, artifactType) as any;
    if (row === undefined) return null;
    return {
      project_id: String(row.project_id),
      artifact_type: row.artifact_type as Agent2ArtifactType,
      revision: Number(row.revision),
      lifecycle_status: row.lifecycle_status,
      schema_version: String(row.schema_version),
      value: JSON.parse(String(row.artifact_json)) as T,
      sha256: String(row.artifact_sha256),
      source_task_id: row.source_task_id,
      created_at: String(row.created_at)
    };
  }

  getRef(projectId: string, artifactType: Agent2ArtifactType): {
    artifact_type: Agent2ArtifactType;
    revision: number;
    sha256: string;
  } | null {
    const artifact = this.getActive(projectId, artifactType);
    return artifact === null ? null : {
      artifact_type: artifactType,
      revision: artifact.revision,
      sha256: artifact.sha256
    };
  }
}
