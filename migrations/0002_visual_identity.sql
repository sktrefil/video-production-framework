PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS project_styles (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  channel_visual_bible_version TEXT NOT NULL,
  source_script_id TEXT NOT NULL,
  source_script_revision INTEGER NOT NULL,
  era_region TEXT NOT NULL,
  visual_approach TEXT NOT NULL,
  realism_level TEXT NOT NULL,
  color_language TEXT NOT NULL,
  lighting_language TEXT NOT NULL,
  material_language TEXT NOT NULL,
  environment_language TEXT NOT NULL,
  character_rendering_principle TEXT NOT NULL,
  camera_composition_tendency TEXT NOT NULL,
  mood_range_json TEXT NOT NULL,
  factual_constraints_json TEXT NOT NULL,
  avoidances_json TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0,
  stale_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS identity_anchors (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  anchor_type TEXT NOT NULL,
  name TEXT NOT NULL,
  rationale TEXT NOT NULL,
  continuity_reason TEXT NOT NULL,
  production_priority TEXT NOT NULL,
  locked_spec_json TEXT NOT NULL,
  contextual_spec_json TEXT NOT NULL,
  temporary_spec_json TEXT NOT NULL,
  required_by_scene_ids_json TEXT NOT NULL,
  reference_media_ids_json TEXT NOT NULL,
  source_project_style_id TEXT NOT NULL,
  source_project_style_revision INTEGER NOT NULL,
  source_channel_visual_bible_version TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0,
  stale_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS scene_identity_anchor_requirements (
  project_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  anchor_id TEXT NOT NULL,
  anchor_revision INTEGER NOT NULL,
  PRIMARY KEY(project_id, scene_id, anchor_id)
);

CREATE INDEX IF NOT EXISTS idx_scene_identity_requirements_scene
  ON scene_identity_anchor_requirements(project_id, scene_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_project_style
  ON project_styles(project_id) WHERE lifecycle_status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_identity_anchor
  ON identity_anchors(id) WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_project_styles_project
  ON project_styles(project_id);

CREATE INDEX IF NOT EXISTS idx_identity_anchors_project
  ON identity_anchors(project_id);
