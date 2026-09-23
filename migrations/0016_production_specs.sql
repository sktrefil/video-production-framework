PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS production_project_specs (
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL CHECK(lifecycle_status IN ('ACTIVE', 'SUPERSEDED')),
  schema_version TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  spec_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, revision)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_production_project_spec
  ON production_project_specs(project_id) WHERE lifecycle_status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS production_scene_timing_specs (
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL CHECK(lifecycle_status IN ('ACTIVE', 'SUPERSEDED')),
  schema_version TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  spec_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, revision)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_scene_timing_spec
  ON production_scene_timing_specs(project_id) WHERE lifecycle_status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS production_clip_specs (
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL CHECK(lifecycle_status IN ('ACTIVE', 'SUPERSEDED')),
  schema_version TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  spec_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, revision)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_clip_production_spec
  ON production_clip_specs(project_id) WHERE lifecycle_status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS production_gate_evaluations (
  project_id TEXT NOT NULL,
  gate_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PASS', 'FAIL')),
  result_json TEXT NOT NULL,
  input_sha256 TEXT NOT NULL,
  evaluated_by TEXT NOT NULL CHECK(evaluated_by = 'AGENT1_MANAGER'),
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, gate_id, revision)
);
CREATE INDEX IF NOT EXISTS idx_production_gate_latest
  ON production_gate_evaluations(project_id, gate_id, revision DESC);
