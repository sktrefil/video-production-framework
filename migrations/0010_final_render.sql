PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS final_render_attempts (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  assembly_id TEXT NOT NULL,
  assembly_revision INTEGER NOT NULL,
  project_sha256 TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  retry_of_render_attempt_id TEXT,
  status TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  paths_json TEXT NOT NULL,
  expected_fps REAL NOT NULL,
  expected_width INTEGER NOT NULL,
  expected_height INTEGER NOT NULL,
  expected_duration_in_frames INTEGER NOT NULL,
  expected_audio INTEGER NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error_code TEXT,
  error_detail TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_final_render_attempt_revision
  ON final_render_attempts(id) WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_final_render_project
  ON final_render_attempts(project_id, rowid);

CREATE TABLE IF NOT EXISTS final_render_technical_qc (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  render_attempt_id TEXT NOT NULL,
  render_attempt_revision INTEGER NOT NULL,
  assembly_id TEXT NOT NULL,
  assembly_revision INTEGER NOT NULL,
  status TEXT NOT NULL,
  issue_codes_json TEXT NOT NULL,
  expected_json TEXT NOT NULL,
  actual_json TEXT NOT NULL,
  output_path TEXT NOT NULL,
  output_size_bytes INTEGER NOT NULL,
  output_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_final_render_qc
  ON final_render_technical_qc(id) WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_final_render_qc_attempt
  ON final_render_technical_qc(project_id, render_attempt_id, rowid);

CREATE TABLE IF NOT EXISTS final_delivery_manifests (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  render_attempt_id TEXT NOT NULL,
  render_attempt_revision INTEGER NOT NULL,
  technical_qc_id TEXT NOT NULL,
  technical_qc_revision INTEGER NOT NULL,
  assembly_id TEXT NOT NULL,
  assembly_revision INTEGER NOT NULL,
  project_sha256 TEXT NOT NULL,
  status TEXT NOT NULL,
  output_path TEXT NOT NULL,
  output_size_bytes INTEGER NOT NULL,
  output_sha256 TEXT NOT NULL,
  codec TEXT NOT NULL,
  audio_codec TEXT,
  pixel_format TEXT NOT NULL,
  fps REAL NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  duration_in_frames INTEGER NOT NULL,
  duration_ms REAL NOT NULL,
  render_manifest_path TEXT NOT NULL,
  technical_qc_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_delivery_manifest
  ON final_delivery_manifests(id) WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_delivery_project
  ON final_delivery_manifests(project_id, rowid);
