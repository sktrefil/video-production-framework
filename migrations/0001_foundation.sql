PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS research_sources (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  url TEXT,
  citation TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS facts (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  statement TEXT NOT NULL,
  classification TEXT NOT NULL,
  source_ids_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS scripts (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  supersedes_revision INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS approval_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  approval_state TEXT NOT NULL,
  reason TEXT NOT NULL,
  approved_by_type TEXT NOT NULL,
  approved_by_id TEXT,
  selected_media_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  display_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  source_script_id TEXT NOT NULL,
  source_script_revision INTEGER NOT NULL,
  sequence_ids_json TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0,
  stale_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS sequences (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  display_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  story_purpose TEXT NOT NULL,
  source_script_id TEXT NOT NULL,
  source_script_revision INTEGER NOT NULL,
  scene_ids_json TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0,
  stale_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS scenes (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  sequence_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  display_number INTEGER NOT NULL,
  script_segment TEXT NOT NULL,
  source_script_id TEXT NOT NULL,
  source_script_revision INTEGER NOT NULL,
  source_start_char INTEGER,
  source_end_char INTEGER,
  state_in TEXT NOT NULL,
  state_current TEXT NOT NULL,
  state_out TEXT NOT NULL,
  primary_visual_idea TEXT NOT NULL,
  must_be_seen_json TEXT NOT NULL,
  can_be_narrated_json TEXT NOT NULL,
  can_be_implied_json TEXT NOT NULL,
  required_identity_anchor_ids_json TEXT NOT NULL,
  primary_asset_id TEXT,
  scene_status TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0,
  stale_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS workflow_events (
  event_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_outbox (
  outbox_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  processed_at TEXT,
  FOREIGN KEY(event_id) REFERENCES workflow_events(event_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_fact
  ON facts(id) WHERE lifecycle_status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_script
  ON scripts(id) WHERE lifecycle_status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_chapter
  ON chapters(id) WHERE lifecycle_status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_sequence
  ON sequences(id) WHERE lifecycle_status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_scene
  ON scenes(id) WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_sources_project ON research_sources(project_id);
CREATE INDEX IF NOT EXISTS idx_facts_project ON facts(project_id);
CREATE INDEX IF NOT EXISTS idx_scripts_project ON scripts(project_id);
CREATE INDEX IF NOT EXISTS idx_approval_target
  ON approval_records(project_id, target_type, target_id, target_revision);
CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id);
CREATE INDEX IF NOT EXISTS idx_sequences_project ON sequences(project_id);
CREATE INDEX IF NOT EXISTS idx_scenes_project ON scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON event_outbox(status);
