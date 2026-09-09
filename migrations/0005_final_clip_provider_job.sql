PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS production_clips (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  link_id TEXT NOT NULL,
  link_revision INTEGER NOT NULL,
  clip_mode TEXT NOT NULL,
  clip_start_state_entity_type TEXT NOT NULL,
  clip_start_state_entity_id TEXT NOT NULL,
  clip_start_state_field TEXT NOT NULL,
  clip_start_state_entity_revision INTEGER,
  clip_end_state_entity_type TEXT NOT NULL,
  clip_end_state_entity_id TEXT NOT NULL,
  clip_end_state_field TEXT NOT NULL,
  clip_end_state_entity_revision INTEGER,
  start_asset_id TEXT NOT NULL,
  start_asset_revision INTEGER NOT NULL,
  start_media_id TEXT NOT NULL,
  end_asset_id TEXT,
  end_asset_revision INTEGER,
  end_media_id TEXT,
  transition_method TEXT NOT NULL,
  camera_move TEXT NOT NULL,
  subject_motion TEXT NOT NULL,
  environment_motion TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  provider_execution_required INTEGER NOT NULL,
  final_design_approval_id TEXT,
  provider_preflight_id TEXT,
  candidate_media_ids_json TEXT NOT NULL,
  approved_media_id TEXT,
  clip_status TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0,
  stale_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS link_cut_implementations (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  link_id TEXT NOT NULL,
  link_revision INTEGER NOT NULL,
  transition_method TEXT NOT NULL,
  rationale TEXT NOT NULL,
  final_design_approval_id TEXT,
  ready INTEGER NOT NULL DEFAULT 0,
  stale INTEGER NOT NULL DEFAULT 0,
  stale_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS provider_preflights (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  clip_id TEXT NOT NULL,
  clip_revision INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_profile_version TEXT NOT NULL,
  status TEXT NOT NULL,
  safety_safe INTEGER NOT NULL,
  capability_compatible INTEGER NOT NULL,
  requires_alternative_representation INTEGER NOT NULL,
  issue_codes_json TEXT NOT NULL,
  recommended_action TEXT,
  decision_id TEXT NOT NULL,
  review_approval_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS link_implementation_refs (
  project_id TEXT NOT NULL,
  link_id TEXT NOT NULL,
  link_revision INTEGER NOT NULL,
  implementation_type TEXT NOT NULL,
  implementation_ref_id TEXT NOT NULL,
  PRIMARY KEY(project_id, link_id, link_revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_clip
  ON production_clips(id) WHERE lifecycle_status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_clip_per_link
  ON production_clips(project_id, link_id)
  WHERE lifecycle_status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_cut
  ON link_cut_implementations(id) WHERE lifecycle_status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_cut_per_link
  ON link_cut_implementations(project_id, link_id)
  WHERE lifecycle_status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_provider_preflight
  ON provider_preflights(id) WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_clips_project
  ON production_clips(project_id);

CREATE INDEX IF NOT EXISTS idx_clips_link
  ON production_clips(project_id, link_id);

CREATE INDEX IF NOT EXISTS idx_preflight_clip
  ON provider_preflights(project_id, clip_id);

CREATE INDEX IF NOT EXISTS idx_link_impl_ref
  ON link_implementation_refs(project_id, link_id, link_revision);
