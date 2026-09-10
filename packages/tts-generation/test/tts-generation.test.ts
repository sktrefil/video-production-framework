import assert from "node:assert/strict";
import test from "node:test";
import type {
  MediaArtifact,
  ScriptVersion,
  TtsGenerationPlan,
  TtsGenerationResult
} from "@vpf/domain";
import {
  TtsGenerationPipeline,
  TtsGenerationValidationError,
  splitTextForTts,
  type TtsGenerationClock,
  type TtsGenerationIdFactory,
  type TtsGenerationRepository
} from "../src/index.js";

const now = "2026-09-10T01:00:00.000Z";
const clock: TtsGenerationClock = {nowIso: () => now};

function ids(): TtsGenerationIdFactory {
  let n = 0;
  return {next: prefix => prefix + "_" + ++n};
}

class FakeRepo implements TtsGenerationRepository {
  script: ScriptVersion | null = {
    id: "script1",
    projectId: "p1",
    revision: 2,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    kind: "FINAL",
    body: "첫 문장입니다. 둘째 문장입니다."
  };
  plans: TtsGenerationPlan[] = [];
  results: TtsGenerationResult[] = [];
  media: MediaArtifact[] = [];

  async getLatestApprovedFinalScript(): Promise<ScriptVersion | null> {
    return this.script;
  }

  async getLatestTtsPlan(): Promise<TtsGenerationPlan | null> {
    return [...this.plans].reverse().find(x => x.lifecycleStatus === "ACTIVE") ?? null;
  }

  async getLatestTtsResult(): Promise<TtsGenerationResult | null> {
    return [...this.results].reverse().find(x => x.lifecycleStatus === "ACTIVE") ?? null;
  }

  async commitTtsPlan(input: {
    previousPlan: TtsGenerationPlan | null;
    nextPlan: TtsGenerationPlan;
  }): Promise<void> {
    if (input.previousPlan) {
      const prev = this.plans.find(
        x => x.id === input.previousPlan!.id &&
          x.revision === input.previousPlan!.revision
      );
      if (prev) prev.lifecycleStatus = "SUPERSEDED";
    }
    this.plans.push(structuredClone(input.nextPlan));
  }

  async commitTtsResult(input: {
    previousPlan: TtsGenerationPlan;
    nextPlan: TtsGenerationPlan;
    previousResult: TtsGenerationResult | null;
    result: TtsGenerationResult;
    audioMedia: MediaArtifact;
  }): Promise<void> {
    const prevPlan = this.plans.find(
      x => x.id === input.previousPlan.id &&
        x.revision === input.previousPlan.revision
    );
    if (prevPlan) prevPlan.lifecycleStatus = "SUPERSEDED";
    if (input.previousResult) {
      const prevResult = this.results.find(
        x => x.id === input.previousResult!.id &&
          x.revision === input.previousResult!.revision
      );
      if (prevResult) prevResult.lifecycleStatus = "SUPERSEDED";
    }
    this.plans.push(structuredClone(input.nextPlan));
    this.results.push(structuredClone(input.result));
    this.media.push(structuredClone(input.audioMedia));
  }
}

test("TTS requires the current human-approved FINAL script", async () => {
  const repo = new FakeRepo();
  repo.script = null;
  const pipeline = new TtsGenerationPipeline(repo, clock, ids());

  await assert.rejects(
    pipeline.prepare({projectId: "p1", format: "LONGFORM"}),
    (error: unknown) =>
      error instanceof TtsGenerationValidationError &&
      error.code === "APPROVED_FINAL_SCRIPT_REQUIRED"
  );
});

test("LONGFORM reuses the legacy history preset with Eleven v3 and 4000-char chunks", async () => {
  const repo = new FakeRepo();
  repo.script = {
    ...repo.script!,
    body: ("가".repeat(3990) + ". ") + ("나".repeat(3990) + ".")
  };
  const pipeline = new TtsGenerationPipeline(repo, clock, ids());
  const result = await pipeline.prepare({
    projectId: "p1",
    format: "LONGFORM"
  });

  assert.equal(result.created, true);
  assert.equal(result.plan.voicePreset, "HISTORY_MYSTERY_LONGFORM");
  assert.equal(result.plan.modelId, "eleven_v3");
  assert.equal(result.plan.outputFormat, "mp3_44100_128");
  assert.equal(result.plan.maxChunkCharacters, 4000);
  assert.ok(result.plan.chunks.length >= 2);
  assert.ok(result.plan.chunks.every(chunk => chunk.text.length <= 4000));
  assert.deepEqual(result.plan.configuredVoiceSettings, {
    stability: 0.62,
    similarityBoost: 0.8,
    style: 0.04,
    speed: 1,
    useSpeakerBoost: true
  });
  assert.deepEqual(result.plan.effectiveVoiceSettings, {
    stability: 0.62,
    style: 0.04
  });
  assert.deepEqual(result.plan.droppedVoiceSettings, [
    "similarity_boost",
    "speed",
    "use_speaker_boost"
  ]);
  assert.equal(result.plan.preserveProviderCadence, true);
  assert.equal(
    result.runtimeJob.endpoint,
    "/v1/text-to-speech/{voice_id}/with-timestamps"
  );
  assert.equal(result.runtimeJob.secretRefs.apiKeyEnv, "ELEVENLABS_API_KEY");
  assert.equal(result.runtimeJob.secretRefs.voiceIdFallbackEnv, "ELEVENLABS_VOICE_ID");
  assert.equal(
    result.runtimeJob.outputPaths.narration,
    "03_tts/narration.mp3"
  );
});

test("SHORTFORM uses the existing history shorts voice preset with Eleven v3", async () => {
  const repo = new FakeRepo();
  const pipeline = new TtsGenerationPipeline(repo, clock, ids());
  const result = await pipeline.prepare({
    projectId: "p1",
    format: "SHORTFORM"
  });

  assert.equal(result.plan.voicePreset, "HISTORY_MYSTERY_SHORTS");
  assert.equal(result.plan.modelId, "eleven_v3");
  assert.deepEqual(result.plan.effectiveVoiceSettings, {
    stability: 0.6,
    style: 0.05
  });
  assert.equal(result.plan.chunks.length, 1);
});

test("identical approved script and format reuse the same TTS plan", async () => {
  const repo = new FakeRepo();
  const pipeline = new TtsGenerationPipeline(repo, clock, ids());

  const first = await pipeline.prepare({
    projectId: "p1",
    format: "LONGFORM"
  });
  const second = await pipeline.prepare({
    projectId: "p1",
    format: "LONGFORM"
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.plan.id, first.plan.id);
  assert.equal(second.plan.revision, first.plan.revision);
});

test("completed ElevenLabs alignment becomes a WF-16 compatible AUDIO MediaArtifact", async () => {
  const repo = new FakeRepo();
  repo.script = {
    ...repo.script!,
    body: "『첫 문장』입니다."
  };
  const pipeline = new TtsGenerationPipeline(repo, clock, ids());
  const prepared = await pipeline.prepare({
    projectId: "p1",
    format: "LONGFORM"
  });
  const expectedText = prepared.plan.chunks.map(chunk => chunk.text).join("\n\n");
  const chars = [...expectedText];
  const alignment = {
    characters: chars,
    characterStartTimesSeconds: chars.map((_, index) => index * 0.05),
    characterEndTimesSeconds: chars.map((_, index) => (index + 1) * 0.05)
  };

  const completed = await pipeline.complete({
    projectId: "p1",
    planId: prepared.plan.id,
    requestIds: ["req_1"],
    audioSha256: "a".repeat(64),
    audioDurationMs: 1750,
    characterAlignmentSha256: "b".repeat(64),
    characterAlignment: alignment
  });

  assert.equal(completed.result.modelId, "eleven_v3");
  assert.equal(completed.result.voiceId, "REDACTED");
  assert.equal(completed.result.audioRelativePath, "03_tts/narration.mp3");
  assert.equal(completed.audioMedia.mediaType, "AUDIO");
  assert.equal(completed.audioMedia.mediaStatus, "AVAILABLE");
  assert.equal(completed.audioMedia.mimeType, "audio/mpeg");
  assert.equal(completed.audioMedia.durationMs, 1750);
  assert.equal(completed.audioMedia.checksum, "sha256:" + "a".repeat(64));
  assert.equal(
    completed.result.characterAlignmentRelativePath,
    "03_tts/character_alignment.json"
  );
});

test("alignment mismatch is rejected instead of drifting subtitles from TTS", async () => {
  const repo = new FakeRepo();
  const pipeline = new TtsGenerationPipeline(repo, clock, ids());
  const prepared = await pipeline.prepare({
    projectId: "p1",
    format: "SHORTFORM"
  });

  await assert.rejects(
    pipeline.complete({
      projectId: "p1",
      planId: prepared.plan.id,
      requestIds: [],
      audioSha256: "a".repeat(64),
      audioDurationMs: 1000,
      characterAlignmentSha256: "b".repeat(64),
      characterAlignment: {
        characters: ["다", "름"],
        characterStartTimesSeconds: [0, 0.2],
        characterEndTimesSeconds: [0.2, 0.4]
      }
    }),
    (error: unknown) =>
      error instanceof TtsGenerationValidationError &&
      error.code === "TTS_RESULT_INVALID"
  );
});

test("splitTextForTts preserves the legacy 4000-character hard ceiling", () => {
  const chunks = splitTextForTts(
    "가".repeat(3995) + ". " + "나".repeat(3995) + "."
  );
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every(chunk => chunk.length <= 4000));
});
