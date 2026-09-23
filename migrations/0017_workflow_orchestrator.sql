PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS production_workflow_instances (
  project_id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  workflow_version TEXT NOT NULL,
  workflow_sha256 TEXT NOT NULL,
  workflow_json TEXT NOT NULL,
  profile TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS production_task_instances (
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_instance_id TEXT NOT NULL UNIQUE,
  task_order INTEGER NOT NULL,
  assigned_agent TEXT NOT NULL,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN (
    'BLOCKED','PENDING','READY','RUNNING','COMPLETE','REVISION_REQUIRED','FAILED','CANCELLED'
  )),
  attempt INTEGER NOT NULL DEFAULT 0,
  manual_approval_required INTEGER NOT NULL CHECK(manual_approval_required IN (0,1)),
  input_refs_json TEXT NOT NULL DEFAULT '[]',
  output_refs_json TEXT NOT NULL DEFAULT '[]',
  last_gate_id TEXT,
  last_gate_status TEXT CHECK(last_gate_status IS NULL OR last_gate_status IN ('PASS','FAIL')),
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(project_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_production_tasks_status
  ON production_task_instances(project_id, status, task_order);

CREATE TABLE IF NOT EXISTS production_task_dispatches (
  dispatch_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  dispatch_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_production_dispatches_task
  ON production_task_dispatches(project_id, task_id, attempt);
