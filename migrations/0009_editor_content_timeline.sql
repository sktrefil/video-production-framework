PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS editor_content_plans (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  plan_status TEXT NOT NULL,
  audio_json TEXT NOT NULL,
  subtitles_json TEXT NOT NULL,
  text_overlays_json TEXT NOT NULL,
  graphics_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_editor_content_plan
  ON editor_content_plans(id) WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_editor_content_plan_project
  ON editor_content_plans(project_id, revision);

CREATE TABLE IF NOT EXISTS editor_timeline_content_refs (
  assembly_id TEXT NOT NULL,
  assembly_revision INTEGER NOT NULL,
  content_plan_id TEXT NOT NULL,
  content_plan_revision INTEGER NOT NULL,
  PRIMARY KEY(assembly_id, assembly_revision)
);

CREATE INDEX IF NOT EXISTS idx_editor_timeline_content_plan_ref
  ON editor_timeline_content_refs(content_plan_id, content_plan_revision);
