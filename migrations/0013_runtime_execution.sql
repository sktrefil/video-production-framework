PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runtime_execution_receipts (
  receipt_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  provider_job_id TEXT NOT NULL,
  provider_job_revision INTEGER NOT NULL,
  attempt INTEGER NOT NULL,
  stage TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_profile_version TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  runtime_job_json TEXT NOT NULL,
  runtime_result_json TEXT,
  provider_request_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_receipts_job
  ON runtime_execution_receipts(project_id, provider_job_id, attempt, created_at);

CREATE INDEX IF NOT EXISTS idx_runtime_receipts_stage
  ON runtime_execution_receipts(project_id, stage, created_at);
