PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clip_qc_records (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  clip_id TEXT NOT NULL,
  clip_revision INTEGER NOT NULL,
  candidate_media_id TEXT NOT NULL,
  status TEXT NOT NULL,
  severity TEXT NOT NULL,
  confidence REAL NOT NULL,
  usable_in_ms INTEGER,
  usable_out_ms INTEGER,
  issues_json TEXT NOT NULL,
  regeneration_reason TEXT,
  editorial_instruction TEXT,
  fallback_reason TEXT,
  decision_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS clip_fallback_records (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  clip_id TEXT NOT NULL,
  clip_revision INTEGER NOT NULL,
  source_qc_id TEXT NOT NULL,
  action TEXT NOT NULL,
  rationale TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  requires_human_review INTEGER NOT NULL,
  applied INTEGER NOT NULL,
  resulting_implementation_type TEXT,
  resulting_implementation_ref_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_clip_qc
  ON clip_qc_records(id) WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_clip_qc_clip
  ON clip_qc_records(project_id, clip_id, revision);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_clip_fallback
  ON clip_fallback_records(id) WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_clip_fallback_clip
  ON clip_fallback_records(project_id, clip_id, revision);
