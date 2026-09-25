PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS production_tail_artifacts (
  project_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL CHECK(lifecycle_status IN ('ACTIVE','SUPERSEDED')),
  schema_version TEXT NOT NULL,
  artifact_json TEXT NOT NULL,
  artifact_sha256 TEXT NOT NULL,
  source_task_id TEXT NOT NULL CHECK(source_task_id IN ('T070','T080','T090','T100')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, artifact_type, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_production_tail_artifact
  ON production_tail_artifacts(project_id, artifact_type)
  WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_production_tail_artifacts_task
  ON production_tail_artifacts(project_id, source_task_id, artifact_type);
