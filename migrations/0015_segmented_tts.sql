PRAGMA foreign_keys = ON;

ALTER TABLE tts_generation_plans ADD COLUMN narration_mode TEXT NOT NULL DEFAULT 'SINGLE';
ALTER TABLE tts_generation_plans ADD COLUMN sections_json TEXT;

ALTER TABLE tts_generation_results ADD COLUMN narration_mode TEXT NOT NULL DEFAULT 'SINGLE';
ALTER TABLE tts_generation_results ADD COLUMN sections_json TEXT;
ALTER TABLE tts_generation_results ADD COLUMN narration_manifest_relative_path TEXT;
ALTER TABLE tts_generation_results ADD COLUMN narration_manifest_sha256 TEXT;
ALTER TABLE tts_generation_results ADD COLUMN total_audio_duration_ms INTEGER;
