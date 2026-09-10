import type {
  MediaArtifact,
  ProviderJob,
  TtsCharacterAlignment,
  TtsGenerationPlan,
  TtsGenerationResult
} from "@vpf/domain";
import type {
  RuntimeExpectedOutput,
  RuntimeJob,
  RuntimeResult,
  RuntimeSecretRequirement
} from "@vpf/runtime-contracts";
import {
  validateRuntimeJob,
  validateRuntimeResult
} from "@vpf/runtime-contracts";
import type {
  ProviderProfilePayload,
  ResourcePin,
  ResourceSnapshot
} from "@vpf/resource-registry";
import type {OutboxRecord, WorkflowEvent} from "@vpf/workflow";
import type {TtsGenerationRepository} from "./index.js";

export const ELEVENLABS_PROVIDER_PROFILE_ID = "ELEVENLABS_V3_HISTORY_V1";
export const ELEVENLABS_PROVIDER_PROFILE_VERSION = "1.0.0";

export interface ElevenLabsRuntimeInput {
  schemaVersion: 1;
  providerProfile: {
    resourceId: typeof ELEVENLABS_PROVIDER_PROFILE_ID;
    version: typeof ELEVENLABS_PROVIDER_PROFILE_VERSION;
    contentHash: string;
  };
  plan: {
    id: string;
    revision: number;
    sourceScript: {
      id: string;
      revision: number;
      sha256: string;
    };
    contentFormat: TtsGenerationPlan["contentFormat"];
    endpoint: TtsGenerationPlan["endpoint"];
    modelId: TtsGenerationPlan["modelId"];
    outputFormat: TtsGenerationPlan["outputFormat"];
    voiceIdResolution: TtsGenerationPlan["voiceIdResolution"];
    voiceIdFallbackEnv: TtsGenerationPlan["voiceIdFallbackEnv"];
    voicePreset: TtsGenerationPlan["voicePreset"];
    configuredVoiceSettings: TtsGenerationPlan["configuredVoiceSettings"];
    effectiveVoiceSettings: TtsGenerationPlan["effectiveVoiceSettings"];
    droppedVoiceSettings: TtsGenerationPlan["droppedVoiceSettings"];
    preserveProviderCadence: true;
    chunks: TtsGenerationPlan["chunks"];
    outputPaths: TtsGenerationPlan["outputPaths"];
  };
}

export interface TtsRuntimeResourceRegistry {
  resolve<TPayload = unknown>(input: {
    resourceType: "PROVIDER_PROFILE";
    resourceId: string;
    version: string;
    expectedHash?: string;
  }): Promise<ResourceSnapshot<TPayload> | null>;
}

export interface TtsRuntimeBridgeRepository extends TtsGenerationRepository {
  getLatestTtsProviderJob(
    projectId: string,
    planId: string
  ): Promise<ProviderJob | null>;
  commitTtsProviderJob(input: {
    job: ProviderJob;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
}

export interface TtsRuntimeClock {
  nowIso(): string;
}

export interface TtsRuntimeIdFactory {
  next(prefix: "provider-job" | "tts-result" | "evt" | "outbox"): string;
}

export class TtsRuntimeBridgeError extends Error {
  constructor(
    public readonly code:
      | "TTS_PLAN_NOT_READY"
      | "PROVIDER_PROFILE_INVALID"
      | "PROVIDER_JOB_ALREADY_EXISTS"
      | "RUNTIME_RESULT_INVALID"
      | "RUNTIME_MEDIA_INVALID"
      | "RUNTIME_ALIGNMENT_INVALID",
    message: string
  ) {
    super(message);
    this.name = "TtsRuntimeBridgeError";
  }
}

const EXPECTED_OUTPUTS: readonly RuntimeExpectedOutput[] = [
  {
    role: "narration",
    mediaType: "AUDIO",
    required: true,
    acceptedMimeTypes: ["audio/mpeg"]
  },
  {
    role: "character_alignment",
    mediaType: "DOCUMENT",
    required: true,
    acceptedMimeTypes: ["application/json"]
  },
  {
    role: "tts_metadata",
    mediaType: "DOCUMENT",
    required: true,
    acceptedMimeTypes: ["application/json"]
  },
  {
    role: "resolved_voice_profile",
    mediaType: "DOCUMENT",
    required: true,
    acceptedMimeTypes: ["application/json"]
  }
];

const SECRET_REQUIREMENTS: readonly RuntimeSecretRequirement[] = [
  {envName: "ELEVENLABS_API_KEY", required: true}
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function makeEvent(
  ids: TtsRuntimeIdFactory,
  clock: TtsRuntimeClock,
  input: Omit<WorkflowEvent, "eventId" | "createdAt">
): {event: WorkflowEvent; outbox: OutboxRecord} {
  const createdAt = clock.nowIso();
  const event: WorkflowEvent = {
    ...input,
    eventId: ids.next("evt"),
    createdAt
  };
  return {
    event,
    outbox: {
      outboxId: ids.next("outbox"),
      eventId: event.eventId,
      status: "PENDING",
      attempts: 0,
      createdAt
    }
  };
}

function validatePlan(plan: TtsGenerationPlan): void {
  if (
    plan.lifecycleStatus !== "ACTIVE" ||
    plan.status !== "READY" ||
    plan.provider !== "ELEVENLABS" ||
    plan.endpoint !== "/v1/text-to-speech/{voice_id}/with-timestamps" ||
    plan.modelId !== "eleven_v3" ||
    plan.outputFormat !== "mp3_44100_128" ||
    plan.maxChunkCharacters !== 4000 ||
    plan.preserveProviderCadence !== true ||
    plan.chunks.length === 0 ||
    plan.chunks.some((chunk, index) =>
      chunk.index !== index + 1 ||
      !chunk.text ||
      chunk.text.length > 4000 ||
      chunk.textCharacterCount !== chunk.text.length
    )
  ) {
    throw new TtsRuntimeBridgeError(
      "TTS_PLAN_NOT_READY",
      "Only an ACTIVE READY ElevenLabs v3 TTS plan can be materialized for runtime execution."
    );
  }
}

function validateProviderProfile(
  snapshot: ResourceSnapshot<ProviderProfilePayload>,
  pin: ResourcePin
): void {
  const payload = snapshot.payload;
  const capabilities = payload.capabilities;
  if (
    snapshot.resourceType !== "PROVIDER_PROFILE" ||
    snapshot.resourceId !== ELEVENLABS_PROVIDER_PROFILE_ID ||
    snapshot.version !== ELEVENLABS_PROVIDER_PROFILE_VERSION ||
    snapshot.contentHash !== pin.contentHash ||
    payload.provider !== "ELEVENLABS" ||
    payload.model !== "eleven_v3" ||
    payload.executionMode !== "AUTOMATED" ||
    !payload.jobTypes.includes("TTS_GENERATION") ||
    capabilities.endpoint !== "/with-timestamps" ||
    capabilities.maxLongformChunkCharacters !== 4000 ||
    capabilities.returnsCharacterAlignment !== true ||
    !payload.runtimeSecretNames.includes("ELEVENLABS_API_KEY")
  ) {
    throw new TtsRuntimeBridgeError(
      "PROVIDER_PROFILE_INVALID",
      "Pinned provider profile does not satisfy the MIG-05 ElevenLabs v3 runtime contract."
    );
  }
}

export async function resolvePinnedElevenLabsProfile(
  registry: TtsRuntimeResourceRegistry,
  pin: ResourcePin
): Promise<ResourceSnapshot<ProviderProfilePayload>> {
  if (
    pin.resourceType !== "PROVIDER_PROFILE" ||
    pin.resourceId !== ELEVENLABS_PROVIDER_PROFILE_ID ||
    pin.version !== ELEVENLABS_PROVIDER_PROFILE_VERSION ||
    !/^sha256:[a-f0-9]{64}$/u.test(pin.contentHash)
  ) {
    throw new TtsRuntimeBridgeError(
      "PROVIDER_PROFILE_INVALID",
      "MIG-05 requires an exact version+hash pin for ELEVENLABS_V3_HISTORY_V1@1.0.0."
    );
  }
  const snapshot = await registry.resolve<ProviderProfilePayload>({
    resourceType: "PROVIDER_PROFILE",
    resourceId: pin.resourceId,
    version: pin.version,
    expectedHash: pin.contentHash
  });
  if (snapshot === null) {
    throw new TtsRuntimeBridgeError(
      "PROVIDER_PROFILE_INVALID",
      "Pinned ElevenLabs provider profile could not be resolved."
    );
  }
  validateProviderProfile(snapshot, pin);
  return snapshot;
}

export function elevenLabsRuntimeExecutionOptions(): {
  expectedOutputs: RuntimeExpectedOutput[];
  secretRequirements: RuntimeSecretRequirement[];
} {
  return {
    expectedOutputs: EXPECTED_OUTPUTS.map(item => ({
      ...item,
      ...(item.acceptedMimeTypes === undefined
        ? {}
        : {acceptedMimeTypes: [...item.acceptedMimeTypes]})
    })),
    secretRequirements: SECRET_REQUIREMENTS.map(item => ({...item}))
  };
}

export function toElevenLabsRuntimeInput(
  plan: TtsGenerationPlan,
  profile: ResourceSnapshot<ProviderProfilePayload>
): ElevenLabsRuntimeInput {
  validatePlan(plan);
  return {
    schemaVersion: 1,
    providerProfile: {
      resourceId: ELEVENLABS_PROVIDER_PROFILE_ID,
      version: ELEVENLABS_PROVIDER_PROFILE_VERSION,
      contentHash: profile.contentHash
    },
    plan: {
      id: plan.id,
      revision: plan.revision,
      sourceScript: {
        id: plan.sourceScriptId,
        revision: plan.sourceScriptRevision,
        sha256: plan.sourceScriptSha256
      },
      contentFormat: plan.contentFormat,
      endpoint: plan.endpoint,
      modelId: plan.modelId,
      outputFormat: plan.outputFormat,
      voiceIdResolution: plan.voiceIdResolution,
      voiceIdFallbackEnv: plan.voiceIdFallbackEnv,
      voicePreset: plan.voicePreset,
      configuredVoiceSettings: structuredClone(plan.configuredVoiceSettings),
      effectiveVoiceSettings: structuredClone(plan.effectiveVoiceSettings),
      droppedVoiceSettings: [...plan.droppedVoiceSettings],
      preserveProviderCadence: true,
      chunks: structuredClone(plan.chunks),
      outputPaths: structuredClone(plan.outputPaths)
    }
  };
}

export class TtsRuntimePreparationService {
  constructor(
    private readonly repository: TtsRuntimeBridgeRepository,
    private readonly registry: TtsRuntimeResourceRegistry,
    private readonly clock: TtsRuntimeClock,
    private readonly ids: TtsRuntimeIdFactory
  ) {}

  async prepare(input: {
    projectId: string;
    providerPin: ResourcePin;
  }): Promise<{job: ProviderJob; created: boolean}> {
    const plan = await this.repository.getLatestTtsPlan(input.projectId);
    if (plan === null) {
      throw new TtsRuntimeBridgeError(
        "TTS_PLAN_NOT_READY",
        "A prepared Framework TTS plan is required before runtime execution."
      );
    }
    validatePlan(plan);
    const profile = await resolvePinnedElevenLabsProfile(
      this.registry,
      input.providerPin
    );

    const existing = await this.repository.getLatestTtsProviderJob(
      input.projectId,
      plan.id
    );
    if (existing !== null) {
      const same =
        existing.targetRevision === plan.revision &&
        existing.providerProfileVersion === profile.version &&
        existing.provider === "ELEVENLABS" &&
        existing.jobType === "TTS_GENERATION" &&
        existing.executionMode === "AUTOMATED";
      if (same) return {job: existing, created: false};
      throw new TtsRuntimeBridgeError(
        "PROVIDER_JOB_ALREADY_EXISTS",
        "An incompatible active provider job already exists for this TTS plan."
      );
    }

    const now = this.clock.nowIso();
    const job: ProviderJob = {
      id: this.ids.next("provider-job"),
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      jobType: "TTS_GENERATION",
      provider: "ELEVENLABS",
      providerProfileVersion: profile.version,
      targetType: "AUDIO",
      targetId: plan.id,
      targetRevision: plan.revision,
      executionMode: "AUTOMATED",
      status: "READY",
      attempt: 1,
      inputPayload: toElevenLabsRuntimeInput(plan, profile),
      resultMediaIds: []
    };
    const {event, outbox} = makeEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "TTS_PROVIDER_JOB_PREPARED",
      targetType: "PROJECT",
      targetId: input.projectId,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        planId: plan.id,
        planRevision: plan.revision,
        providerJobId: job.id,
        providerProfileId: ELEVENLABS_PROVIDER_PROFILE_ID,
        providerProfileVersion: profile.version,
        providerProfileHash: profile.contentHash
      }
    });
    await this.repository.commitTtsProviderJob({job, event, outbox});
    return {job, created: true};
  }
}

function parseAlignment(value: unknown): TtsCharacterAlignment {
  if (!isRecord(value)) {
    throw new TtsRuntimeBridgeError(
      "RUNTIME_ALIGNMENT_INVALID",
      "Runtime alignment document must be an object."
    );
  }
  const characters = value.characters;
  const starts = value.character_start_times_seconds;
  const ends = value.character_end_times_seconds;
  if (
    !Array.isArray(characters) ||
    !Array.isArray(starts) ||
    !Array.isArray(ends) ||
    characters.length === 0 ||
    characters.length !== starts.length ||
    characters.length !== ends.length ||
    !characters.every(item => typeof item === "string") ||
    !starts.every(item => typeof item === "number" && Number.isFinite(item)) ||
    !ends.every(item => typeof item === "number" && Number.isFinite(item))
  ) {
    throw new TtsRuntimeBridgeError(
      "RUNTIME_ALIGNMENT_INVALID",
      "Runtime alignment arrays are incomplete or invalid."
    );
  }
  return {
    characters: [...characters] as string[],
    characterStartTimesSeconds: [...starts] as number[],
    characterEndTimesSeconds: [...ends] as number[]
  };
}

export function parseElevenLabsAlignmentDocument(
  value: string | unknown
): TtsCharacterAlignment {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new TtsRuntimeBridgeError(
        "RUNTIME_ALIGNMENT_INVALID",
        "Runtime alignment file is not valid JSON."
      );
    }
  }
  return parseAlignment(parsed);
}

function validateAlignment(
  alignment: TtsCharacterAlignment,
  expectedText: string
): void {
  const count = alignment.characters.length;
  if (
    count === 0 ||
    alignment.characterStartTimesSeconds.length !== count ||
    alignment.characterEndTimesSeconds.length !== count ||
    alignment.characters.join("") !== expectedText
  ) {
    throw new TtsRuntimeBridgeError(
      "RUNTIME_ALIGNMENT_INVALID",
      "Runtime alignment does not exactly match the Framework TTS text."
    );
  }
  let previousStart = 0;
  for (let index = 0; index < count; index += 1) {
    const start = alignment.characterStartTimesSeconds[index]!;
    const end = alignment.characterEndTimesSeconds[index]!;
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start ||
      start < previousStart
    ) {
      throw new TtsRuntimeBridgeError(
        "RUNTIME_ALIGNMENT_INVALID",
        "Runtime alignment timestamps are invalid or out of order."
      );
    }
    previousStart = start;
  }
}

function rawSha(value: string): string {
  const normalized = value.toLowerCase();
  const raw = normalized.startsWith("sha256:")
    ? normalized.slice("sha256:".length)
    : normalized;
  if (!/^[a-f0-9]{64}$/u.test(raw)) {
    throw new TtsRuntimeBridgeError(
      "RUNTIME_MEDIA_INVALID",
      "Runtime media checksum is not a SHA-256 value."
    );
  }
  return raw;
}

export class TtsRuntimeCompletionService {
  constructor(
    private readonly repository: TtsRuntimeBridgeRepository,
    private readonly clock: TtsRuntimeClock,
    private readonly ids: TtsRuntimeIdFactory
  ) {}

  async complete(input: {
    projectId: string;
    runtimeJob: RuntimeJob<ElevenLabsRuntimeInput>;
    runtimeResult: RuntimeResult;
    media: MediaArtifact[];
    alignmentDocument: string | unknown;
  }): Promise<{result: TtsGenerationResult; audioMedia: MediaArtifact}> {
    validateRuntimeJob(input.runtimeJob);
    validateRuntimeResult(input.runtimeJob, input.runtimeResult);
    if (
      input.runtimeResult.status !== "COMPLETE" ||
      input.runtimeJob.provider !== "ELEVENLABS" ||
      input.runtimeJob.jobType !== "TTS_GENERATION" ||
      input.runtimeJob.projectId !== input.projectId
    ) {
      throw new TtsRuntimeBridgeError(
        "RUNTIME_RESULT_INVALID",
        "Only a COMPLETE ElevenLabs TTS RuntimeResult can complete the Framework TTS plan."
      );
    }

    const plan = await this.repository.getLatestTtsPlan(input.projectId);
    if (
      plan === null ||
      plan.id !== input.runtimeJob.target.id ||
      plan.revision !== input.runtimeJob.target.revision ||
      plan.status !== "READY" ||
      plan.id !== input.runtimeJob.input.plan.id ||
      plan.revision !== input.runtimeJob.input.plan.revision
    ) {
      throw new TtsRuntimeBridgeError(
        "TTS_PLAN_NOT_READY",
        "Runtime result no longer targets the current READY TTS plan revision."
      );
    }

    const narration = input.runtimeResult.outputs.find(
      output => output.role === "narration"
    );
    const alignmentOutput = input.runtimeResult.outputs.find(
      output => output.role === "character_alignment"
    );
    const metadataOutput = input.runtimeResult.outputs.find(
      output => output.role === "tts_metadata"
    );
    if (
      narration === undefined ||
      alignmentOutput === undefined ||
      metadataOutput === undefined ||
      narration.relativePath !== plan.outputPaths.narration ||
      narration.mimeType !== "audio/mpeg" ||
      narration.durationMs === undefined ||
      narration.durationMs <= 0 ||
      alignmentOutput.relativePath !== plan.outputPaths.characterAlignment ||
      metadataOutput.relativePath !== plan.outputPaths.metadata
    ) {
      throw new TtsRuntimeBridgeError(
        "RUNTIME_RESULT_INVALID",
        "RuntimeResult is missing required TTS outputs or paths."
      );
    }

    const candidates = input.media.filter(media =>
      media.projectId === input.projectId &&
      media.lifecycleStatus === "ACTIVE" &&
      media.mediaStatus === "AVAILABLE" &&
      media.mediaType === "AUDIO" &&
      media.relativePath === narration.relativePath &&
      media.mimeType === "audio/mpeg" &&
      media.sourceJobId === input.runtimeJob.jobId
    );
    if (candidates.length !== 1) {
      throw new TtsRuntimeBridgeError(
        "RUNTIME_MEDIA_INVALID",
        "Framework artifact ingestion must provide exactly one narration AUDIO MediaArtifact."
      );
    }
    const audioMedia = candidates[0]!;
    const narrationSha = rawSha(narration.sha256);
    if (
      rawSha(audioMedia.checksum) !== narrationSha ||
      audioMedia.durationMs !== narration.durationMs
    ) {
      throw new TtsRuntimeBridgeError(
        "RUNTIME_MEDIA_INVALID",
        "Ingested narration media does not match the verified RuntimeResult artifact."
      );
    }

    const alignment = parseElevenLabsAlignmentDocument(input.alignmentDocument);
    validateAlignment(
      alignment,
      plan.chunks.map(chunk => chunk.text).join("\n\n")
    );

    const now = this.clock.nowIso();
    const previousResult = await this.repository.getLatestTtsResult(input.projectId);
    const result: TtsGenerationResult = {
      id: previousResult?.id ?? this.ids.next("tts-result"),
      projectId: input.projectId,
      revision: previousResult === null ? 1 : previousResult.revision + 1,
      lifecycleStatus: "ACTIVE",
      createdAt: previousResult?.createdAt ?? now,
      updatedAt: now,
      planId: plan.id,
      planRevision: plan.revision + 1,
      sourceScriptId: plan.sourceScriptId,
      sourceScriptRevision: plan.sourceScriptRevision,
      sourceScriptSha256: plan.sourceScriptSha256,
      provider: "ELEVENLABS",
      modelId: "eleven_v3",
      voiceId: "REDACTED",
      outputFormat: "mp3_44100_128",
      requestIds: [...input.runtimeResult.providerRequestIds],
      audioMediaId: audioMedia.id,
      audioRelativePath: plan.outputPaths.narration,
      audioSha256: narrationSha,
      audioDurationMs: narration.durationMs,
      characterAlignmentRelativePath: plan.outputPaths.characterAlignment,
      characterAlignmentSha256: rawSha(alignmentOutput.sha256),
      metadataRelativePath: plan.outputPaths.metadata,
      chunkCount: plan.chunks.length,
      completedAt: now
    };
    const nextPlan: TtsGenerationPlan = {
      ...plan,
      revision: plan.revision + 1,
      lifecycleStatus: "ACTIVE",
      updatedAt: now,
      status: "COMPLETE"
    };
    const {event, outbox} = makeEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "TTS_GENERATION_COMPLETE",
      targetType: "PROJECT",
      targetId: input.projectId,
      trigger: "PROVIDER_RESULT",
      payload: {
        planId: plan.id,
        planRevision: nextPlan.revision,
        providerJobId: input.runtimeJob.jobId,
        audioMediaId: audioMedia.id,
        modelId: result.modelId,
        audioDurationMs: result.audioDurationMs
      }
    });
    await this.repository.commitTtsResult({
      previousPlan: plan,
      nextPlan,
      previousResult,
      result,
      audioMedia,
      event,
      outbox
    });
    return {result, audioMedia};
  }
}
