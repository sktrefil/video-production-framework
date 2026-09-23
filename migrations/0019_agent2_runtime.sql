PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agent2_runtime_runs (
  run_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL CHECK(task_id IN ('T010','T020','T030')),
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  provider_response_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('RUNNING','COMPLETE','FAILED')),
  input_sha256 TEXT NOT NULL,
  output_sha256 TEXT,
  error_code TEXT,
  error_detail TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent2_runtime_runs_project_task
  ON agent2_runtime_runs(project_id, task_id, started_at);
