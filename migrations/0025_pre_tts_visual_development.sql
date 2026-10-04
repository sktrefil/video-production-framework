CREATE TABLE agent3_visual_artifacts_v13 (
  project_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL CHECK(artifact_type IN (
    'pre_tts_visual_plan', 'pre_tts_visual_beat_spec',
    'pre_tts_visual_direction_spec', 'scene_visual_spec',
    'state_image_spec', 'prompt_bundle_spec'
  )),
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL CHECK(lifecycle_status IN ('ACTIVE','SUPERSEDED')),
  schema_version TEXT NOT NULL,
  artifact_json TEXT NOT NULL,
  artifact_sha256 TEXT NOT NULL,
  source_task_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, artifact_type, revision)
);
INSERT INTO agent3_visual_artifacts_v13 SELECT * FROM agent3_visual_artifacts;
DROP TABLE agent3_visual_artifacts;
ALTER TABLE agent3_visual_artifacts_v13 RENAME TO agent3_visual_artifacts;
CREATE UNIQUE INDEX idx_agent3_visual_active ON agent3_visual_artifacts(project_id, artifact_type) WHERE lifecycle_status = 'ACTIVE';
CREATE INDEX idx_agent3_visual_project ON agent3_visual_artifacts(project_id, artifact_type, revision);

CREATE TABLE agent3_runtime_runs_v13 (
  run_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL CHECK(task_id IN ('T025','T040','T050','T060')),
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
INSERT INTO agent3_runtime_runs_v13 SELECT * FROM agent3_runtime_runs;
DROP TABLE agent3_runtime_runs;
ALTER TABLE agent3_runtime_runs_v13 RENAME TO agent3_runtime_runs;
CREATE INDEX idx_agent3_runtime_runs_project_task ON agent3_runtime_runs(project_id, task_id, started_at);
