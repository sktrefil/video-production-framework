PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tts_generation_plans (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  source_script_id TEXT NOT NULL,
  source_script_revision INTEGER NOT NULL,
  source_script_sha256 TEXT NOT NULL,
  content_format TEXT NOT NULL,
  provider TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  api_key_env TEXT NOT NULL,
  voice_id_env TEXT NOT NULL,
  voice_preset TEXT NOT NULL,
  model_id TEXT NOT NULL,
  output_format TEXT NOT NULL,
  max_chunk_characters INTEGER NOT NULL,
  configured_voice_settings_json TEXT NOT NULL,
  effective_voice_settings_json TEXT NOT NULL,
  dropped_voice_settings_json TEXT NOT NULL,
  preserve_provider_cadence INTEGER NOT NULL,
  chunks_json TEXT NOT NULL,
  output_paths_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_tts_generation_plan
  ON tts_generation_plans(id) WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_tts_generation_plan_project
  ON tts_generation_plans(project_id);

CREATE TABLE IF NOT EXISTS tts_generation_results (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  plan_revision INTEGER NOT NULL,
  source_script_id TEXT NOT NULL,
  source_script_revision INTEGER NOT NULL,
  source_script_sha256 TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  voice_id TEXT NOT NULL,
  output_format TEXT NOT NULL,
  request_ids_json TEXT NOT NULL,
  audio_media_id TEXT NOT NULL,
  audio_relative_path TEXT NOT NULL,
  audio_sha256 TEXT NOT NULL,
  audio_duration_ms INTEGER NOT NULL,
  alignment_relative_path TEXT NOT NULL,
  alignment_sha256 TEXT NOT NULL,
  metadata_relative_path TEXT NOT NULL,
  chunk_count INTEGER NOT NULL,
  completed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_tts_generation_result
  ON tts_generation_results(id) WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_tts_generation_result_project
  ON tts_generation_results(project_id);
