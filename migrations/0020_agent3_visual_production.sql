PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agent3_visual_artifacts (
  project_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL CHECK(artifact_type IN (
    'scene_visual_spec',
    'state_image_spec',
    'prompt_bundle_spec'
  )),
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL CHECK(lifecycle_status IN ('ACTIVE','SUPERSEDED')),
  schema_version TEXT NOT NULL,
  artifact_json TEXT NOT NULL,
  artifact_sha256 TEXT NOT NULL,
  source_task_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, artifact_type, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent3_visual_active
  ON agent3_visual_artifacts(project_id, artifact_type)
  WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_agent3_visual_project
  ON agent3_visual_artifacts(project_id, artifact_type, revision);
