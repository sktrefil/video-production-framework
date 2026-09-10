import type {
  MediaArtifact,
  ProviderJob,
  TtsGenerationPlan,
  TtsGenerationResult
} from "@vpf/domain";
import type {RuntimeTargetRevisionPort} from "@vpf/provider-orchestrator";
import type {TtsRuntimeBridgeRepository} from "@vpf/tts-generation/runtime-adapter";
import type {OutboxRecord, WorkflowEvent} from "@vpf/workflow";
import {SqliteTtsGenerationRepository} from "./tts-generation.js";

function mapProviderJob(row: any): ProviderJob {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    jobType: row.job_type,
    provider: row.provider,
    providerProfileVersion: row.provider_profile_version,
    targetType: row.target_type,
    targetId: row.target_id,
    targetRevision: row.target_revision,
    executionMode: row.execution_mode,
    status: row.status,
    attempt: row.attempt,
    ...(row.retry_of_job_id == null ? {} : {retryOfJobId: row.retry_of_job_id}),
    inputPayload: JSON.parse(row.input_payload_json),
    resultMediaIds: JSON.parse(row.result_media_ids_json),
    ...(row.error_code == null ? {} : {errorCode: row.error_code}),
    ...(row.error_detail == null ? {} : {errorDetail: row.error_detail})
  };
}

function insertEvent(
  db: SqliteTtsGenerationRepository["db"],
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

function insertProviderJob(
  db: SqliteTtsGenerationRepository["db"],
  job: ProviderJob
): void {
  db.prepare(
    `INSERT INTO provider_jobs
      (id, project_id, revision, lifecycle_status, job_type, provider,
       provider_profile_version, target_type, target_id, target_revision,
       execution_mode, status, attempt, retry_of_job_id, input_payload_json,
       result_media_ids_json, error_code, error_detail, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    job.id,
    job.projectId,
    job.revision,
    job.lifecycleStatus,
    job.jobType,
    job.provider,
    job.providerProfileVersion,
    job.targetType,
    job.targetId,
    job.targetRevision,
    job.executionMode,
    job.status,
    job.attempt,
    job.retryOfJobId ?? null,
    JSON.stringify(job.inputPayload),
    JSON.stringify(job.resultMediaIds),
    job.errorCode ?? null,
    job.errorDetail ?? null,
    job.createdAt,
    job.updatedAt
  );
}

function insertPlan(
  db: SqliteTtsGenerationRepository["db"],
  plan: TtsGenerationPlan
): void {
  db.prepare(
    "INSERT INTO tts_generation_plans (id, project_id, revision, lifecycle_status, source_script_id, source_script_revision, source_script_sha256, content_format, provider, endpoint, api_key_env, voice_id_env, voice_preset, model_id, output_format, max_chunk_characters, configured_voice_settings_json, effective_voice_settings_json, dropped_voice_settings_json, preserve_provider_cadence, chunks_json, output_paths_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
    plan.status,
    plan.createdAt,
    plan.updatedAt
  );
}

function insertResult(
  db: SqliteTtsGenerationRepository["db"],
  result: TtsGenerationResult
): void {
  db.prepare(
    "INSERT INTO tts_generation_results (id, project_id, revision, lifecycle_status, plan_id, plan_revision, source_script_id, source_script_revision, source_script_sha256, provider, model_id, voice_id, output_format, request_ids_json, audio_media_id, audio_relative_path, audio_sha256, audio_duration_ms, alignment_relative_path, alignment_sha256, metadata_relative_path, chunk_count, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
    result.completedAt,
    result.createdAt,
    result.updatedAt
  );
}

function normalizedSha(value: string): string {
  return value.toLowerCase().replace(/^sha256:/u, "");
}

function assertExistingMediaMatches(row: any, media: MediaArtifact): void {
  const matches =
    row.project_id === media.projectId &&
    row.revision === media.revision &&
    row.lifecycle_status === media.lifecycleStatus &&
    row.media_type === media.mediaType &&
    row.relative_path === media.relativePath &&
    row.mime_type === media.mimeType &&
    row.duration_ms === (media.durationMs ?? null) &&
    normalizedSha(row.checksum) === normalizedSha(media.checksum) &&
    row.source_job_id === (media.sourceJobId ?? null) &&
    row.media_status === media.mediaStatus;
  if (!matches) {
    throw new Error(
      "Existing runtime-ingested narration media does not match the TTS completion reference."
    );
  }
}

export class SqliteTtsRuntimeRepository
  extends SqliteTtsGenerationRepository
  implements TtsRuntimeBridgeRepository, RuntimeTargetRevisionPort {
  async getLatestTtsProviderJob(
    projectId: string,
    planId: string
  ): Promise<ProviderJob | null> {
    const row = this.db.prepare(
      `SELECT * FROM provider_jobs
       WHERE project_id = ?
         AND target_type = 'AUDIO'
         AND target_id = ?
         AND job_type = 'TTS_GENERATION'
         AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC, rowid DESC LIMIT 1`
    ).get(projectId, planId) as any;
    return row === undefined ? null : mapProviderJob(row);
  }

  async commitTtsProviderJob(input: {
    job: ProviderJob;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      const existing = this.db.prepare(
        `SELECT id FROM provider_jobs
         WHERE project_id = ?
           AND target_type = 'AUDIO'
           AND target_id = ?
           AND job_type = 'TTS_GENERATION'
           AND lifecycle_status = 'ACTIVE'
         LIMIT 1`
      ).get(input.job.projectId, input.job.targetId);
      if (existing !== undefined) {
        throw new Error("An active TTS provider job already exists for this plan.");
      }
      insertProviderJob(this.db, input.job);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async getCurrentTargetRevision(input: {
    projectId: string;
    targetType: ProviderJob["targetType"];
    targetId: string;
  }): Promise<number | null> {
    if (input.targetType !== "AUDIO") return null;
    const row = this.db.prepare(
      `SELECT revision FROM tts_generation_plans
       WHERE project_id = ?
         AND id = ?
         AND lifecycle_status = 'ACTIVE'
         AND status IN ('READY', 'RUNNING')
       ORDER BY revision DESC LIMIT 1`
    ).get(input.projectId, input.targetId) as {revision: number} | undefined;
    return row?.revision ?? null;
  }

  override async commitTtsResult(input: {
    previousPlan: TtsGenerationPlan;
    nextPlan: TtsGenerationPlan;
    previousResult: TtsGenerationResult | null;
    result: TtsGenerationResult;
    audioMedia: MediaArtifact;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    const existingMedia = this.db.prepare(
      `SELECT * FROM media_artifacts
       WHERE id = ? AND project_id = ? AND revision = ?`
    ).get(
      input.audioMedia.id,
      input.audioMedia.projectId,
      input.audioMedia.revision
    ) as any;

    if (existingMedia === undefined) {
      await super.commitTtsResult(input);
      return;
    }
    assertExistingMediaMatches(existingMedia, input.audioMedia);

    this.db.transaction(() => {
      const changed = this.db.prepare(
        `UPDATE tts_generation_plans
         SET lifecycle_status = 'SUPERSEDED', updated_at = ?
         WHERE id = ? AND revision = ? AND lifecycle_status = 'ACTIVE'`
      ).run(
        input.event.createdAt,
        input.previousPlan.id,
        input.previousPlan.revision
      );
      if (changed.changes !== 1) {
        throw new Error("TTS completion lost the current plan revision before commit.");
      }
      insertPlan(this.db, input.nextPlan);

      if (input.previousResult !== null) {
        this.db.prepare(
          `UPDATE tts_generation_results
           SET lifecycle_status = 'SUPERSEDED', updated_at = ?
           WHERE id = ? AND revision = ? AND lifecycle_status = 'ACTIVE'`
        ).run(
          input.event.createdAt,
          input.previousResult.id,
          input.previousResult.revision
        );
      }
      insertResult(this.db, input.result);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }
}
