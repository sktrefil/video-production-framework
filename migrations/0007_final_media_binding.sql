PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS final_media_bindings (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  link_id TEXT NOT NULL,
  link_revision INTEGER NOT NULL,
  implementation_type TEXT NOT NULL,
  implementation_id TEXT NOT NULL,
  implementation_revision INTEGER NOT NULL,
  binding_kind TEXT NOT NULL,
  binding_status TEXT NOT NULL,
  stale INTEGER NOT NULL,
  stale_reason TEXT,
  clip_mode TEXT,
  media_id TEXT,
  source_asset_id TEXT,
  source_qc_id TEXT,
  source_in_ms INTEGER,
  source_out_ms INTEGER,
  duration_ms INTEGER NOT NULL,
  transition_method TEXT NOT NULL,
  camera_move TEXT,
  subject_motion TEXT,
  environment_motion TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_final_media_binding
  ON final_media_bindings(id) WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_binding_implementation
  ON final_media_bindings(project_id, implementation_type, implementation_id, revision);

CREATE INDEX IF NOT EXISTS idx_binding_link
  ON final_media_bindings(project_id, link_id, link_revision);
