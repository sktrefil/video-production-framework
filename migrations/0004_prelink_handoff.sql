PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS production_links (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,

  from_scene_id TEXT NOT NULL,
  from_scene_revision INTEGER NOT NULL,
  from_state_entity_type TEXT NOT NULL,
  from_state_entity_id TEXT NOT NULL,
  from_state_field TEXT NOT NULL,
  from_state_entity_revision INTEGER,

  to_scene_id TEXT NOT NULL,
  to_scene_revision INTEGER NOT NULL,
  to_state_entity_type TEXT NOT NULL,
  to_state_entity_id TEXT NOT NULL,
  to_state_field TEXT NOT NULL,
  to_state_entity_revision INTEGER,

  link_scope TEXT NOT NULL,
  pre_link_required INTEGER NOT NULL DEFAULT 0,
  continuity_level TEXT NOT NULL,
  state_change TEXT NOT NULL,
  handoff_intent TEXT NOT NULL,
  handoff_anchor_json TEXT NOT NULL,
  handoff_channels_json TEXT NOT NULL,
  transition_intent TEXT NOT NULL,
  pre_link_approval_id TEXT,

  from_asset_id TEXT,
  from_asset_revision INTEGER,
  from_media_id TEXT,
  to_asset_id TEXT,
  to_asset_revision INTEGER,
  to_media_id TEXT,

  handoff_qc_id TEXT,
  handoff_usable INTEGER,
  handoff_review_approval_id TEXT,
  pre_link_match TEXT NOT NULL,
  link_status TEXT NOT NULL,

  stale INTEGER NOT NULL DEFAULT 0,
  stale_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  PRIMARY KEY(id, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_link
  ON production_links(id)
  WHERE lifecycle_status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_link_pair
  ON production_links(project_id, from_scene_id, to_scene_id)
  WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_links_project
  ON production_links(project_id);

CREATE INDEX IF NOT EXISTS idx_links_from_scene
  ON production_links(project_id, from_scene_id);

CREATE INDEX IF NOT EXISTS idx_links_to_scene
  ON production_links(project_id, to_scene_id);

CREATE INDEX IF NOT EXISTS idx_links_bound_assets
  ON production_links(project_id, from_asset_id, to_asset_id);
