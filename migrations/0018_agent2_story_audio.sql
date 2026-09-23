PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agent2_story_audio_artifacts (
  project_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL CHECK(artifact_type IN (
    'research_spec',
    'fact_check_spec',
    'story_spec',
    'script',
    'tts_manifest',
    'subtitle_timing'
  )),
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL CHECK(lifecycle_status IN ('ACTIVE','SUPERSEDED')),
  schema_version TEXT NOT NULL,
  artifact_json TEXT NOT NULL,
  artifact_sha256 TEXT NOT NULL,
  source_task_id TEXT NOT NULL CHECK(source_task_id IN ('T010','T020','T030')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, artifact_type, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_agent2_artifact
  ON agent2_story_audio_artifacts(project_id, artifact_type)
  WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_agent2_artifact_revision
  ON agent2_story_audio_artifacts(project_id, artifact_type, revision DESC);
