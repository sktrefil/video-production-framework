PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS codex_runtime_runs (
  run_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  role_id TEXT NOT NULL CHECK(role_id IN (
    'CODEX_1_MANAGER',
    'CODEX_2_STORY_AUDIO',
    'CODEX_3_VISUAL_PRODUCTION'
  )),
  task_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('RUNNING','COMPLETE','FAILED')),
  command_name TEXT NOT NULL,
  cli_version TEXT,
  auth_status TEXT,
  web_search_mode TEXT NOT NULL CHECK(web_search_mode IN ('live','cached','disabled')),
  input_sha256 TEXT NOT NULL,
  output_sha256 TEXT,
  trace_sha256 TEXT,
  exit_code INTEGER,
  stderr_excerpt TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_codex_runtime_project_task
  ON codex_runtime_runs(project_id, task_id, started_at);

CREATE TABLE IF NOT EXISTS codex_manager_reviews (
  review_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  verdict TEXT NOT NULL CHECK(verdict IN ('RETRY','BLOCK','ESCALATE')),
  root_cause TEXT NOT NULL,
  revision_instruction TEXT NOT NULL,
  preserve_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_codex_manager_reviews_project_task
  ON codex_manager_reviews(project_id, task_id, attempt);
