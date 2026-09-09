PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS production_assets (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  asset_role TEXT NOT NULL,
  production_priority TEXT NOT NULL,
  source_strategy TEXT NOT NULL,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  state_entity_type TEXT NOT NULL,
  state_entity_id TEXT NOT NULL,
  state_field TEXT NOT NULL,
  state_entity_revision INTEGER,
  visual_goal TEXT NOT NULL,
  composition TEXT NOT NULL,
  continuity_requirements_json TEXT NOT NULL,
  identity_anchor_ids_json TEXT NOT NULL,
  factual_constraints_json TEXT NOT NULL,
  avoidances_json TEXT NOT NULL,
  image_prompt TEXT,
  negative_prompt TEXT,
  candidate_media_ids_json TEXT NOT NULL,
  approved_media_id TEXT,
  asset_status TEXT NOT NULL,
  source_scene_revision INTEGER NOT NULL,
  source_project_style_id TEXT NOT NULL,
  source_project_style_revision INTEGER NOT NULL,
  source_identity_anchor_revisions_json TEXT NOT NULL,
  format_profile_version TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0,
  stale_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS media_artifacts (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  media_type TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  checksum TEXT NOT NULL,
  source_job_id TEXT,
  media_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS provider_jobs (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  job_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_profile_version TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  execution_mode TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  retry_of_job_id TEXT,
  input_payload_json TEXT NOT NULL,
  result_media_ids_json TEXT NOT NULL,
  error_code TEXT,
  error_detail TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS qc_results (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  qc_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  media_id TEXT,
  qc_status TEXT NOT NULL,
  severity TEXT NOT NULL,
  confidence REAL NOT NULL,
  symptom TEXT,
  root_cause TEXT,
  recommended_action TEXT,
  fallback TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_asset
  ON production_assets(id) WHERE lifecycle_status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_primary_scene_asset
  ON production_assets(project_id, owner_id)
  WHERE lifecycle_status = 'ACTIVE'
    AND owner_type = 'SCENE'
    AND asset_class = 'PRIMARY_SCENE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_media
  ON media_artifacts(id) WHERE lifecycle_status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_provider_job
  ON provider_jobs(id) WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_assets_project
  ON production_assets(project_id);

CREATE INDEX IF NOT EXISTS idx_assets_scene
  ON production_assets(project_id, owner_type, owner_id);

CREATE INDEX IF NOT EXISTS idx_media_project
  ON media_artifacts(project_id);

CREATE INDEX IF NOT EXISTS idx_jobs_project_target
  ON provider_jobs(project_id, target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_qc_target_media
  ON qc_results(project_id, target_type, target_id, media_id);
