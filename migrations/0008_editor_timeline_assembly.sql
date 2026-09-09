PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS editor_timeline_assemblies (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  source_binding_refs_json TEXT NOT NULL,
  fps INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  assembly_status TEXT NOT NULL,
  stale INTEGER NOT NULL,
  stale_reason TEXT,
  edit_project_json TEXT NOT NULL,
  cut_boundaries_json TEXT NOT NULL,
  motion_directives_json TEXT NOT NULL,
  blockers_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_editor_timeline_assembly
  ON editor_timeline_assemblies(id) WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_editor_timeline_project
  ON editor_timeline_assemblies(project_id, revision);
