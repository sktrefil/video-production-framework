import {createHash} from "node:crypto";
import type {
  MediaArtifact,
  ProjectFormat,
  ScriptVersion,
  TtsCharacterAlignment,
  TtsGenerationPlan,
  TtsGenerationResult,
  TtsVoicePresetId
} from "@vpf/domain";
import type {OutboxRecord, WorkflowEvent} from "@vpf/workflow";

export interface TtsGenerationRepository {
  getLatestApprovedFinalScript(projectId: string): Promise<ScriptVersion | null>;
  getLatestTtsPlan(projectId: string): Promise<TtsGenerationPlan | null>;
  getLatestTtsResult(projectId: string): Promise<TtsGenerationResult | null>;
  commitTtsPlan(input: {
    previousPlan: TtsGenerationPlan | null;
    nextPlan: TtsGenerationPlan;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  commitTtsResult(input: {
    previousPlan: TtsGenerationPlan;
    nextPlan: TtsGenerationPlan;
    previousResult: TtsGenerationResult | null;
    result: TtsGenerationResult;
    audioMedia: MediaArtifact;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
}

export interface TtsGenerationClock {
  nowIso(): string;
}

export interface TtsGenerationIdFactory {
  next(prefix: "tts-plan" | "tts-result" | "media" | "evt" | "outbox"): string;
}

export class TtsGenerationValidationError extends Error {
  constructor(
    public readonly code:
      | "APPROVED_FINAL_SCRIPT_REQUIRED"
      | "TTS_PLAN_NOT_READY"
      | "TTS_RESULT_INVALID",
    message: string
  ) {
    super(message);
    this.name = "TtsGenerationValidationError";
  }
}

export interface ElevenLabsRuntimeJob {
  schemaVersion: 1;
  projectId: string;
  provider: "ELEVENLABS";
  endpoint: "/v1/text-to-speech/{voice_id}/with-timestamps";
  secretRefs: {
    apiKeyEnv: "ELEVENLABS_API_KEY";
    voiceIdEnv: "ELEVENLABS_VOICE_ID";
  };
  modelId: "eleven_v3";
  outputFormat: "mp3_44100_128";
  voicePreset: TtsVoicePresetId;
  configuredVoiceSettings: TtsGenerationPlan["configuredVoiceSettings"];
  effectiveVoiceSettings: TtsGenerationPlan["effectiveVoiceSettings"];
  preserveProviderCadence: true;
  sourceScript: {
    id: string;
    revision: number;
    sha256: string;
  };
  chunks: TtsGenerationPlan["chunks"];
  outputPaths: TtsGenerationPlan["outputPaths"];
}

const PRESETS: Record<
  TtsVoicePresetId,
  Pick<
    TtsGenerationPlan,
    | "configuredVoiceSettings"
    | "effectiveVoiceSettings"
    | "droppedVoiceSettings"
  >
> = {
  HISTORY_MYSTERY_SHORTS: {
    configuredVoiceSettings: {
      stability: 0.6,
      similarityBoost: 0.8,
      style: 0.05,
      speed: 1.0,
      useSpeakerBoost: true
    },
    effectiveVoiceSettings: {
      stability: 0.6,
      style: 0.05
    },
    droppedVoiceSettings: [
      "similarity_boost",
      "speed",
      "use_speaker_boost"
    ]
  },
  HISTORY_MYSTERY_LONGFORM: {
    configuredVoiceSettings: {
      stability: 0.62,
      similarityBoost: 0.8,
      style: 0.04,
      speed: 1.0,
      useSpeakerBoost: true
    },
    effectiveVoiceSettings: {
      stability: 0.62,
      style: 0.04
    },
    droppedVoiceSettings: [
      "similarity_boost",
      "speed",
      "use_speaker_boost"
    ]
  }
};

const IGNORED_TTS_SYMBOLS = /[『』「」【】《》“”‘’"'*]/g;

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sanitizeTtsText(text: string): string {
  return String(text ?? "")
    .replace(IGNORED_TTS_SYMBOLS, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitTextForTts(
  text: string,
  maximumCharacters = 4000
): string[] {
  const normalized = text
    .trim()
    .split(/\n\s*\n/)
    .map(part => part.trim())
    .filter(Boolean)
    .join("\n\n");

  if (!normalized) return [];
  if (!Number.isInteger(maximumCharacters) || maximumCharacters < 100) {
    throw new TtsGenerationValidationError(
      "TTS_RESULT_INVALID",
      "TTS chunk maximum must be an integer of at least 100 characters."
    );
  }

  const units: string[] = [];
  for (const paragraph of normalized.split("\n\n")) {
    if (paragraph.length <= maximumCharacters) {
      units.push(paragraph);
      continue;
    }
    const matches = paragraph.match(/.*?(?:[.!?。！？]+|$)/g) ?? [];
    for (const raw of matches) {
      const sentence = raw.trim();
      if (!sentence) continue;
      if (sentence.length <= maximumCharacters) {
        units.push(sentence);
      } else {
        for (let index = 0; index < sentence.length; index += maximumCharacters) {
          units.push(sentence.slice(index, index + maximumCharacters));
        }
      }
    }
  }

  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    const separator = current ? "\n\n" : "";
    if (
      current &&
      current.length + separator.length + unit.length > maximumCharacters
    ) {
      chunks.push(current);
      current = unit;
    } else {
      current += separator + unit;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function voicePresetForFormat(format: ProjectFormat): TtsVoicePresetId {
  return format === "LONGFORM"
    ? "HISTORY_MYSTERY_LONGFORM"
    : "HISTORY_MYSTERY_SHORTS";
}

function durableEvent(
  ids: TtsGenerationIdFactory,
  clock: TtsGenerationClock,
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

function alignmentText(alignment: TtsCharacterAlignment): string {
  return alignment.characters.join("");
}

function validateAlignment(
  alignment: TtsCharacterAlignment,
  expectedText: string
): void {
  const count = alignment.characters.length;
  if (
    count === 0 ||
    alignment.characterStartTimesSeconds.length !== count ||
    alignment.characterEndTimesSeconds.length !== count
  ) {
    throw new TtsGenerationValidationError(
      "TTS_RESULT_INVALID",
      "ElevenLabs character alignment arrays are incomplete."
    );
  }
  if (alignmentText(alignment) !== expectedText) {
    throw new TtsGenerationValidationError(
      "TTS_RESULT_INVALID",
      "ElevenLabs character alignment does not match the requested TTS text."
    );
  }
  for (let index = 0; index < count; index += 1) {
    const start = alignment.characterStartTimesSeconds[index]!;
    const end = alignment.characterEndTimesSeconds[index]!;
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start
    ) {
      throw new TtsGenerationValidationError(
        "TTS_RESULT_INVALID",
        "ElevenLabs character alignment contains invalid timestamps."
      );
    }
  }
}

export class TtsGenerationPipeline {
  constructor(
    private readonly repository: TtsGenerationRepository,
    private readonly clock: TtsGenerationClock,
    private readonly ids: TtsGenerationIdFactory
  ) {}

  async prepare(input: {
    projectId: string;
    format: ProjectFormat;
  }): Promise<{plan: TtsGenerationPlan; runtimeJob: ElevenLabsRuntimeJob; created: boolean}> {
    const script = await this.repository.getLatestApprovedFinalScript(input.projectId);
    if (script === null || script.kind !== "FINAL") {
      throw new TtsGenerationValidationError(
        "APPROVED_FINAL_SCRIPT_REQUIRED",
        "ElevenLabs TTS generation requires the current human-approved FINAL script."
      );
    }

    const sanitized = sanitizeTtsText(script.body);
    const chunks =
      input.format === "LONGFORM"
        ? splitTextForTts(sanitized, 4000)
        : [sanitized].filter(Boolean);

    if (chunks.length === 0 || chunks.some(chunk => chunk.length > 4000)) {
      throw new TtsGenerationValidationError(
        "TTS_RESULT_INVALID",
        "Approved script could not be converted into valid ElevenLabs chunks."
      );
    }

    const scriptSha = sha256Text(script.body);
    const preset = voicePresetForFormat(input.format);
    const previous = await this.repository.getLatestTtsPlan(input.projectId);

    if (
      previous !== null &&
      previous.lifecycleStatus === "ACTIVE" &&
      previous.status !== "STALE" &&
      previous.sourceScriptId === script.id &&
      previous.sourceScriptRevision === script.revision &&
      previous.sourceScriptSha256 === scriptSha &&
      previous.contentFormat === input.format &&
      previous.voicePreset === preset &&
      previous.modelId === "eleven_v3"
    ) {
      return {
        plan: previous,
        runtimeJob: this.toRuntimeJob(previous),
        created: false
      };
    }

    const now = this.clock.nowIso();
    const presetSettings = PRESETS[preset];
    const next: TtsGenerationPlan = {
      id: previous?.id ?? this.ids.next("tts-plan"),
      projectId: input.projectId,
      revision: previous === null ? 1 : previous.revision + 1,
      lifecycleStatus: "ACTIVE",
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      sourceScriptId: script.id,
      sourceScriptRevision: script.revision,
      sourceScriptSha256: scriptSha,
      contentFormat: input.format,
      provider: "ELEVENLABS",
      endpoint: "/v1/text-to-speech/{voice_id}/with-timestamps",
      apiKeyEnv: "ELEVENLABS_API_KEY",
      voiceIdEnv: "ELEVENLABS_VOICE_ID",
      voicePreset: preset,
      modelId: "eleven_v3",
      outputFormat: "mp3_44100_128",
      maxChunkCharacters: 4000,
      configuredVoiceSettings: structuredClone(
        presetSettings.configuredVoiceSettings
      ),
      effectiveVoiceSettings: structuredClone(
        presetSettings.effectiveVoiceSettings
      ),
      droppedVoiceSettings: [...presetSettings.droppedVoiceSettings],
      preserveProviderCadence: true,
      chunks: chunks.map((text, index) => ({
        index: index + 1,
        text,
        textCharacterCount: text.length,
        outputRelativePath:
          "03_tts/chunks/chunk_" +
          String(index + 1).padStart(3, "0") +
          ".mp3"
      })),
      outputPaths: {
        narration: "03_tts/narration.mp3",
        characterAlignment: "03_tts/character_alignment.json",
        metadata: "03_tts/tts_metadata.json",
        resolvedVoiceProfile: "03_tts/resolved_voice_profile.json"
      },
      status: "READY"
    };

    const {event, outbox} = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "TTS_GENERATION_PREPARED",
      targetType: "PROJECT",
      targetId: input.projectId,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        planId: next.id,
        planRevision: next.revision,
        scriptId: script.id,
        scriptRevision: script.revision,
        voicePreset: next.voicePreset,
        modelId: next.modelId,
        chunkCount: next.chunks.length
      }
    });

    await this.repository.commitTtsPlan({
      previousPlan: previous,
      nextPlan: next,
      event,
      outbox
    });

    return {
      plan: next,
      runtimeJob: this.toRuntimeJob(next),
      created: true
    };
  }

  async complete(input: {
    projectId: string;
    planId: string;
    requestIds: string[];
    audioSha256: string;
    audioDurationMs: number;
    characterAlignmentSha256: string;
    characterAlignment: TtsCharacterAlignment;
  }): Promise<{result: TtsGenerationResult; audioMedia: MediaArtifact}> {
    const plan = await this.repository.getLatestTtsPlan(input.projectId);
    if (
      plan === null ||
      plan.id !== input.planId ||
      plan.status === "STALE" ||
      plan.status === "FAILED"
    ) {
      throw new TtsGenerationValidationError(
        "TTS_PLAN_NOT_READY",
        "Current ElevenLabs TTS plan is not ready for completion."
      );
    }
    if (
      !/^[a-f0-9]{64}$/i.test(input.audioSha256) ||
      !/^[a-f0-9]{64}$/i.test(input.characterAlignmentSha256) ||
      !Number.isFinite(input.audioDurationMs) ||
      input.audioDurationMs <= 0
    ) {
      throw new TtsGenerationValidationError(
        "TTS_RESULT_INVALID",
        "TTS output hashes and duration must be valid."
      );
    }

    const expectedText = plan.chunks.map(chunk => chunk.text).join("\n\n");
    validateAlignment(input.characterAlignment, expectedText);

    const now = this.clock.nowIso();
    const previousResult = await this.repository.getLatestTtsResult(input.projectId);
    const audioMedia: MediaArtifact = {
      id: this.ids.next("media"),
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      mediaType: "AUDIO",
      relativePath: plan.outputPaths.narration,
      mimeType: "audio/mpeg",
      durationMs: input.audioDurationMs,
      checksum: "sha256:" + input.audioSha256,
      sourceJobId: plan.id,
      mediaStatus: "AVAILABLE"
    };
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
      requestIds: [...input.requestIds],
      audioMediaId: audioMedia.id,
      audioRelativePath: "03_tts/narration.mp3",
      audioSha256: input.audioSha256.toLowerCase(),
      audioDurationMs: input.audioDurationMs,
      characterAlignmentRelativePath: "03_tts/character_alignment.json",
      characterAlignmentSha256:
        input.characterAlignmentSha256.toLowerCase(),
      metadataRelativePath: "03_tts/tts_metadata.json",
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

    const {event, outbox} = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "TTS_GENERATION_COMPLETE",
      targetType: "PROJECT",
      targetId: input.projectId,
      trigger: "PROVIDER_RESULT",
      payload: {
        planId: plan.id,
        planRevision: nextPlan.revision,
        resultId: result.id,
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

  toRuntimeJob(plan: TtsGenerationPlan): ElevenLabsRuntimeJob {
    return {
      schemaVersion: 1,
      projectId: plan.projectId,
      provider: "ELEVENLABS",
      endpoint: plan.endpoint,
      secretRefs: {
        apiKeyEnv: plan.apiKeyEnv,
        voiceIdEnv: plan.voiceIdEnv
      },
      modelId: plan.modelId,
      outputFormat: plan.outputFormat,
      voicePreset: plan.voicePreset,
      configuredVoiceSettings: structuredClone(plan.configuredVoiceSettings),
      effectiveVoiceSettings: structuredClone(plan.effectiveVoiceSettings),
      preserveProviderCadence: true,
      sourceScript: {
        id: plan.sourceScriptId,
        revision: plan.sourceScriptRevision,
        sha256: plan.sourceScriptSha256
      },
      chunks: structuredClone(plan.chunks),
      outputPaths: structuredClone(plan.outputPaths)
    };
  }
}
