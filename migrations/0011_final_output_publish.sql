PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS final_output_qc_records (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  render_attempt_id TEXT NOT NULL,
  render_attempt_revision INTEGER NOT NULL,
  delivery_manifest_id TEXT NOT NULL,
  delivery_manifest_revision INTEGER NOT NULL,
  project_sha256 TEXT NOT NULL,
  output_path TEXT NOT NULL,
  output_sha256 TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence REAL NOT NULL,
  issue_codes_json TEXT NOT NULL,
  notes_json TEXT NOT NULL,
  review_required INTEGER NOT NULL,
  review_approval_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_final_output_qc
  ON final_output_qc_records(id) WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_final_output_qc_project
  ON final_output_qc_records(project_id);

CREATE TABLE IF NOT EXISTS publish_package_manifests (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  render_attempt_id TEXT NOT NULL,
  render_attempt_revision INTEGER NOT NULL,
  delivery_manifest_id TEXT NOT NULL,
  delivery_manifest_revision INTEGER NOT NULL,
  output_qc_id TEXT NOT NULL,
  output_qc_revision INTEGER NOT NULL,
  project_sha256 TEXT NOT NULL,
  package_status TEXT NOT NULL,
  package_directory TEXT NOT NULL,
  package_sha256 TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  files_json TEXT NOT NULL,
  recommended_file_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_publish_package
  ON publish_package_manifests(id) WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_publish_package_project
  ON publish_package_manifests(project_id);
