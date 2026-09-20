import type {
  MediaArtifact,
  ScriptVersion,
  TtsGenerationPlan,
  TtsGenerationResult
} from "@vpf/domain";
import type {TtsGenerationRepository} from "@vpf/tts-generation";
import type {OutboxRecord, WorkflowEvent} from "@vpf/workflow";
import {SqliteSceneAssetRepository} from "./scene-assets.js";

export const TTS_GENERATION_MIGRATION_SQL = "PRAGMA foreign_keys = ON;\n\nCREATE TABLE IF NOT EXISTS tts_generation_plans (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  source_script_id TEXT NOT NULL,\n  source_script_revision INTEGER NOT NULL,\n  source_script_sha256 TEXT NOT NULL,\n  content_format TEXT NOT NULL,\n  provider TEXT NOT NULL,\n  endpoint TEXT NOT NULL,\n  api_key_env TEXT NOT NULL,\n  voice_id_env TEXT NOT NULL,\n  voice_preset TEXT NOT NULL,\n  model_id TEXT NOT NULL,\n  output_format TEXT NOT NULL,\n  max_chunk_characters INTEGER NOT NULL,\n  configured_voice_settings_json TEXT NOT NULL,\n  effective_voice_settings_json TEXT NOT NULL,\n  dropped_voice_settings_json TEXT NOT NULL,\n  preserve_provider_cadence INTEGER NOT NULL,\n  chunks_json TEXT NOT NULL,\n  output_paths_json TEXT NOT NULL,\n  status TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_tts_generation_plan\n  ON tts_generation_plans(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE INDEX IF NOT EXISTS idx_tts_generation_plan_project\n  ON tts_generation_plans(project_id);\n\nCREATE TABLE IF NOT EXISTS tts_generation_results (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  plan_id TEXT NOT NULL,\n  plan_revision INTEGER NOT NULL,\n  source_script_id TEXT NOT NULL,\n  source_script_revision INTEGER NOT NULL,\n  source_script_sha256 TEXT NOT NULL,\n  provider TEXT NOT NULL,\n  model_id TEXT NOT NULL,\n  voice_id TEXT NOT NULL,\n  output_format TEXT NOT NULL,\n  request_ids_json TEXT NOT NULL,\n  audio_media_id TEXT NOT NULL,\n  audio_relative_path TEXT NOT NULL,\n  audio_sha256 TEXT NOT NULL,\n  audio_duration_ms INTEGER NOT NULL,\n  alignment_relative_path TEXT NOT NULL,\n  alignment_sha256 TEXT NOT NULL,\n  metadata_relative_path TEXT NOT NULL,\n  chunk_count INTEGER NOT NULL,\n  completed_at TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_tts_generation_result\n  ON tts_generation_results(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE INDEX IF NOT EXISTS idx_tts_generation_result_project\n  ON tts_generation_results(project_id);";


function ensureSegmentedTtsColumns(db: SqliteSceneAssetRepository["db"]): void {
  const ensure = (table: string, column: string, ddl: string) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{name: string}>;
    if (!columns.some(item => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  ensure("tts_generation_plans", "narration_mode", "narration_mode TEXT NOT NULL DEFAULT 'SINGLE'");
  ensure("tts_generation_plans", "sections_json", "sections_json TEXT");
  ensure("tts_generation_results", "narration_mode", "narration_mode TEXT NOT NULL DEFAULT 'SINGLE'");
  ensure("tts_generation_results", "sections_json", "sections_json TEXT");
  ensure("tts_generation_results", "narration_manifest_relative_path", "narration_manifest_relative_path TEXT");
  ensure("tts_generation_results", "narration_manifest_sha256", "narration_manifest_sha256 TEXT");
  ensure("tts_generation_results", "total_audio_duration_ms", "total_audio_duration_ms INTEGER");
}

function insertEvent(
  db: SqliteSceneAssetRepository["db"],
  event: WorkflowEvent,
  outbox: OutboxRecord
): void {
  db.prepare(
    "INSERT INTO workflow_events (event_id, project_id, event_type, target_type, target_id, trigger_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    event.eventId,
    event.projectId,
    event.eventType,
    event.targetType,
    event.targetId,
    event.trigger,
    JSON.stringify(event.payload ?? null),
    event.createdAt
  );
  db.prepare(
    "INSERT INTO event_outbox (outbox_id, event_id, status, attempts, created_at, processed_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    outbox.outboxId,
    outbox.eventId,
    outbox.status,
    outbox.attempts,
    outbox.createdAt,
    outbox.processedAt ?? null
  );
}

function mapScript(row: any): ScriptVersion {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    kind: row.kind,
    body: row.body,
    ...(row.supersedes_revision == null
      ? {}
      : {supersedesRevision: row.supersedes_revision})
  };
}

function mapPlan(row: any): TtsGenerationPlan {
  if (row.preserve_provider_cadence !== 1) {
    throw new Error("Stored TTS plan must preserve Eleven v3 provider cadence.");
  }
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceScriptId: row.source_script_id,
    sourceScriptRevision: row.source_script_revision,
    sourceScriptSha256: row.source_script_sha256,
    contentFormat: row.content_format,
    provider: row.provider,
    endpoint: row.endpoint,
    apiKeyEnv: row.api_key_env,
    voiceIdResolution: "VOICE_PRESET_THEN_ENV",
    voiceIdFallbackEnv: row.voice_id_env,
    voicePreset: row.voice_preset,
    modelId: row.model_id,
    outputFormat: row.output_format,
    maxChunkCharacters: row.max_chunk_characters,
    configuredVoiceSettings: JSON.parse(row.configured_voice_settings_json),
    effectiveVoiceSettings: JSON.parse(row.effective_voice_settings_json),
    droppedVoiceSettings: JSON.parse(row.dropped_voice_settings_json),
    preserveProviderCadence: true,
    narrationMode: row.narration_mode ?? "SINGLE",
    ...(row.sections_json == null ? {} : {sections: JSON.parse(row.sections_json)}),
    chunks: JSON.parse(row.chunks_json),
    outputPaths: JSON.parse(row.output_paths_json),
    status: row.status
  };
}

function mapResult(row: any): TtsGenerationResult {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    planId: row.plan_id,
    planRevision: row.plan_revision,
    sourceScriptId: row.source_script_id,
    sourceScriptRevision: row.source_script_revision,
    sourceScriptSha256: row.source_script_sha256,
    provider: row.provider,
    modelId: row.model_id,
    voiceId: row.voice_id,
    outputFormat: row.output_format,
    narrationMode: row.narration_mode ?? "SINGLE",
    requestIds: JSON.parse(row.request_ids_json),
    ...(row.sections_json == null ? {} : {sections: JSON.parse(row.sections_json)}),
    ...(row.total_audio_duration_ms == null ? {} : {totalAudioDurationMs: row.total_audio_duration_ms}),
    ...(row.narration_manifest_relative_path == null ? {} : {narrationManifestRelativePath: row.narration_manifest_relative_path}),
    ...(row.narration_manifest_sha256 == null ? {} : {narrationManifestSha256: row.narration_manifest_sha256}),
    audioMediaId: row.audio_media_id,
    audioRelativePath: row.audio_relative_path,
    audioSha256: row.audio_sha256,
    audioDurationMs: row.audio_duration_ms,
    characterAlignmentRelativePath: row.alignment_relative_path,
    characterAlignmentSha256: row.alignment_sha256,
    metadataRelativePath: row.metadata_relative_path,
    chunkCount: row.chunk_count,
    completedAt: row.completed_at
  };
}

export class SqliteTtsGenerationRepository
  extends SqliteSceneAssetRepository
  implements TtsGenerationRepository {
  constructor(filename: string) {
    super(filename);
    this.db.exec(TTS_GENERATION_MIGRATION_SQL);
    ensureSegmentedTtsColumns(this.db);
  }

  async getLatestApprovedFinalScript(projectId: string): Promise<ScriptVersion | null> {
    const row = this.db.prepare(
      `SELECT s.*
       FROM scripts s
       WHERE s.project_id = ?
         AND s.kind = 'FINAL'
         AND s.lifecycle_status = 'ACTIVE'
         AND EXISTS (
           SELECT 1 FROM approval_records a
           WHERE a.project_id = s.project_id
             AND a.target_type = 'SCRIPT'
             AND a.target_id = s.id
             AND a.target_revision = s.revision
             AND a.approval_state = 'HUMAN_APPROVED'
         )
       ORDER BY s.revision DESC
       LIMIT 1`
    ).get(projectId) as any;
    return row === undefined ? null : mapScript(row);
  }

  async listApprovedTtsScenes(projectId: string) {
    const rows = this.db.prepare(
      `SELECT
         c.display_number AS chapter_order,
         q.id AS sequence_id,
         q.display_number AS sequence_order,
         s.id AS scene_id,
         s.display_number AS scene_order,
         s.script_segment,
         s.source_script_revision
       FROM scenes s
       JOIN sequences q ON q.project_id = s.project_id AND q.id = s.sequence_id AND q.lifecycle_status = 'ACTIVE'
       JOIN chapters c ON c.project_id = q.project_id AND c.id = q.chapter_id AND c.lifecycle_status = 'ACTIVE'
       WHERE s.project_id = ?
         AND s.lifecycle_status = 'ACTIVE'
         AND s.stale = 0
         AND EXISTS (
           SELECT 1 FROM approval_records a
           WHERE a.project_id = s.project_id
             AND a.target_type = 'SCENE'
             AND a.target_id = s.id
             AND a.target_revision = s.revision
             AND a.approval_state = 'HUMAN_APPROVED'
         )
       ORDER BY c.display_number, q.display_number, s.display_number`
    ).all(projectId) as any[];
    return rows.map(row => ({
      chapterOrder: row.chapter_order,
      sequenceId: row.sequence_id,
      sequenceOrder: row.sequence_order,
      sceneId: row.scene_id,
      sceneOrder: row.scene_order,
      scriptSegment: row.script_segment,
      sourceScriptRevision: row.source_script_revision
    }));
  }

  async getLatestTtsPlan(projectId: string): Promise<TtsGenerationPlan | null> {
    const row = this.db.prepare(
      "SELECT * FROM tts_generation_plans WHERE project_id = ? AND lifecycle_status = 'ACTIVE' ORDER BY rowid DESC LIMIT 1"
    ).get(projectId) as any;
    return row === undefined ? null : mapPlan(row);
  }

  async getLatestTtsResult(projectId: string): Promise<TtsGenerationResult | null> {
    const row = this.db.prepare(
      "SELECT * FROM tts_generation_results WHERE project_id = ? AND lifecycle_status = 'ACTIVE' ORDER BY rowid DESC LIMIT 1"
    ).get(projectId) as any;
    return row === undefined ? null : mapResult(row);
  }

  async commitTtsPlan(input: {
    previousPlan: TtsGenerationPlan | null;
    nextPlan: TtsGenerationPlan;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      if (input.previousPlan !== null) {
        this.db.prepare(
          "UPDATE tts_generation_plans SET lifecycle_status = 'SUPERSEDED', updated_at = ? WHERE id = ? AND revision = ?"
        ).run(
          input.event.createdAt,
          input.previousPlan.id,
          input.previousPlan.revision
        );
      }
      this.insertPlan(input.nextPlan);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitTtsResult(input: {
    previousPlan: TtsGenerationPlan;
    nextPlan: TtsGenerationPlan;
    previousResult: TtsGenerationResult | null;
    result: TtsGenerationResult;
    audioMedia: MediaArtifact;
    audioMediaItems?: MediaArtifact[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare(
        "UPDATE tts_generation_plans SET lifecycle_status = 'SUPERSEDED', updated_at = ? WHERE id = ? AND revision = ?"
      ).run(
        input.event.createdAt,
        input.previousPlan.id,
        input.previousPlan.revision
      );
      this.insertPlan(input.nextPlan);

      if (input.previousResult !== null) {
        this.db.prepare(
          "UPDATE tts_generation_results SET lifecycle_status = 'SUPERSEDED', updated_at = ? WHERE id = ? AND revision = ?"
        ).run(
          input.event.createdAt,
          input.previousResult.id,
          input.previousResult.revision
        );
      }

      this.insertResult(input.result);
      for (const media of input.audioMediaItems ?? [input.audioMedia]) {
        this.insertMedia(media);
      }
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  private insertPlan(plan: TtsGenerationPlan): void {
    this.db.prepare(
      "INSERT INTO tts_generation_plans (id, project_id, revision, lifecycle_status, source_script_id, source_script_revision, source_script_sha256, content_format, provider, endpoint, api_key_env, voice_id_env, voice_preset, model_id, output_format, max_chunk_characters, configured_voice_settings_json, effective_voice_settings_json, dropped_voice_settings_json, preserve_provider_cadence, chunks_json, output_paths_json, narration_mode, sections_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      plan.id,
      plan.projectId,
      plan.revision,
      plan.lifecycleStatus,
      plan.sourceScriptId,
      plan.sourceScriptRevision,
      plan.sourceScriptSha256,
      plan.contentFormat,
      plan.provider,
      plan.endpoint,
      plan.apiKeyEnv,
      plan.voiceIdFallbackEnv,
      plan.voicePreset,
      plan.modelId,
      plan.outputFormat,
      plan.maxChunkCharacters,
      JSON.stringify(plan.configuredVoiceSettings),
      JSON.stringify(plan.effectiveVoiceSettings),
      JSON.stringify(plan.droppedVoiceSettings),
      plan.preserveProviderCadence ? 1 : 0,
      JSON.stringify(plan.chunks),
      JSON.stringify(plan.outputPaths),
      plan.narrationMode ?? "SINGLE",
      plan.sections === undefined ? null : JSON.stringify(plan.sections),
      plan.status,
      plan.createdAt,
      plan.updatedAt
    );
  }

  private insertResult(result: TtsGenerationResult): void {
    this.db.prepare(
      "INSERT INTO tts_generation_results (id, project_id, revision, lifecycle_status, plan_id, plan_revision, source_script_id, source_script_revision, source_script_sha256, provider, model_id, voice_id, output_format, request_ids_json, audio_media_id, audio_relative_path, audio_sha256, audio_duration_ms, alignment_relative_path, alignment_sha256, metadata_relative_path, chunk_count, narration_mode, sections_json, narration_manifest_relative_path, narration_manifest_sha256, total_audio_duration_ms, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      result.id,
      result.projectId,
      result.revision,
      result.lifecycleStatus,
      result.planId,
      result.planRevision,
      result.sourceScriptId,
      result.sourceScriptRevision,
      result.sourceScriptSha256,
      result.provider,
      result.modelId,
      result.voiceId,
      result.outputFormat,
      JSON.stringify(result.requestIds),
      result.audioMediaId,
      result.audioRelativePath,
      result.audioSha256,
      result.audioDurationMs,
      result.characterAlignmentRelativePath,
      result.characterAlignmentSha256,
      result.metadataRelativePath,
      result.chunkCount,
      result.narrationMode ?? "SINGLE",
      result.sections === undefined ? null : JSON.stringify(result.sections),
      result.narrationManifestRelativePath ?? null,
      result.narrationManifestSha256 ?? null,
      result.totalAudioDurationMs ?? result.audioDurationMs,
      result.completedAt,
      result.createdAt,
      result.updatedAt
    );
  }
}
