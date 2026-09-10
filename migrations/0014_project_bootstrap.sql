PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  title TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('LONGFORM', 'SHORTFORM')),
  versions_json TEXT NOT NULL,
  resource_pins_json TEXT NOT NULL,
  pipeline TEXT NOT NULL CHECK(pipeline = 'VPF_UNIFIED_V1'),
  legacy_allowed INTEGER NOT NULL CHECK(legacy_allowed = 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_project_record
  ON projects(project_id) WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_projects_id
  ON projects(id, revision);
