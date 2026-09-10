import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import type {ScriptVersion, TtsCharacterAlignment, TtsGenerationResult} from "@vpf/domain";
import {sanitizeTtsText} from "../src/index.js";
import {
  TtsSubtitleBridgeError,
  buildTtsAlignedSubtitleCuesFromArtifacts,
  buildTtsAlignedSubtitleCuesFromResult,
  loadVerifiedTtsAlignmentArtifact
} from "../src/subtitle-bridge.js";

const RAW_SCRIPT = "첫 번째 문장입니다. 두 번째 문장입니다.";
const SPOKEN = sanitizeTtsText(RAW_SCRIPT);

function sha(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function alignmentFor(text: string): TtsCharacterAlignment {
  return {
    characters: [...text],
    characterStartTimesSeconds: [...text].map((_, index) => Number((index * 0.05).toFixed(3))),
    characterEndTimesSeconds: [...text].map((_, index) => Number((index * 0.05 + 0.04).toFixed(3)))
  };
}

function script(): ScriptVersion {
  return {
    id: "script-final",
    projectId: "project",
    revision: 3,
    lifecycleStatus: "ACTIVE",
    createdAt: "2026-09-10T12:00:00.000Z",
    updatedAt: "2026-09-10T12:00:00.000Z",
    kind: "FINAL",
    body: RAW_SCRIPT
  };
}

function result(overrides: Partial<TtsGenerationResult> = {}): TtsGenerationResult {
  return {
    id: "tts-result",
    projectId: "project",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: "2026-09-10T12:00:00.000Z",
    updatedAt: "2026-09-10T12:00:00.000Z",
    planId: "tts-plan",
    planRevision: 2,
    sourceScriptId: "script-final",
    sourceScriptRevision: 3,
    sourceScriptSha256: sha(RAW_SCRIPT),
    provider: "ELEVENLABS",
    modelId: "eleven_v3",
    voiceId: "REDACTED",
    outputFormat: "mp3_44100_128",
    requestIds: ["request-1"],
    audioMediaId: "media-narration",
    audioRelativePath: "03_tts/narration.mp3",
    audioSha256: "a".repeat(64),
    audioDurationMs: Math.ceil(SPOKEN.length * 50 + 100),
    characterAlignmentRelativePath: "03_tts/character_alignment.json",
    characterAlignmentSha256: "b".repeat(64),
    metadataRelativePath: "03_tts/tts_metadata.json",
    chunkCount: 1,
    completedAt: "2026-09-10T12:00:01.000Z",
    ...overrides
  } as TtsGenerationResult;
}

test("ElevenLabs character alignment becomes non-overlapping T1-ready cues with TTS provenance", () => {
  const cues = buildTtsAlignedSubtitleCuesFromResult({
    script: script(),
    result: result(),
    alignment: alignmentFor(SPOKEN),
    audioPlacementId: "narration"
  });

  assert.ok(cues.length >= 2);
  assert.equal(cues[0]?.generationSource, "SCRIPT_TTS_ALIGN");
  assert.deepEqual(cues[0]?.generatedFromAudioPlacementIds, ["narration"]);
  assert.equal(
    cues.map(cue => cue.text).join(" ").replace(/\s+/gu, " ").trim(),
    SPOKEN.replace(/\s+/gu, " ").trim()
  );
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index]!;
    assert.ok(cue.startMs >= 0);
    assert.ok(cue.endMs > cue.startMs);
    assert.ok(cue.endMs <= result().audioDurationMs);
    if (index > 0) assert.ok(cue.startMs >= cues[index - 1]!.endMs);
  }
});

test("subtitle bridge rejects stale TTS/script provenance rather than silently realigning", () => {
  assert.throws(
    () => buildTtsAlignedSubtitleCuesFromResult({
      script: script(),
      result: result({sourceScriptRevision: 2}),
      alignment: alignmentFor(SPOKEN),
      audioPlacementId: "narration"
    }),
    (error: unknown) => error instanceof TtsSubtitleBridgeError && error.code === "SUBTITLE_SCRIPT_PROVENANCE_MISMATCH"
  );
});

test("subtitle bridge verifies the persisted alignment artifact hash before cue generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "vpf-subtitle-align-"));
  const alignment = alignmentFor(SPOKEN);
  const document = JSON.stringify({
    characters: alignment.characters,
    character_start_times_seconds: alignment.characterStartTimesSeconds,
    character_end_times_seconds: alignment.characterEndTimesSeconds
  });
  const path = join(root, "03_tts", "character_alignment.json");
  await import("node:fs/promises").then(fs => fs.mkdir(join(root, "03_tts"), {recursive: true}));
  await writeFile(path, document, "utf8");
  const currentResult = result({characterAlignmentSha256: sha(document)});

  const loaded = await loadVerifiedTtsAlignmentArtifact({projectRoot: root, result: currentResult});
  assert.deepEqual(loaded, alignment);

  const cues = await buildTtsAlignedSubtitleCuesFromArtifacts({
    projectRoot: root,
    script: script(),
    result: currentResult,
    audioPlacementId: "narration",
    maximumCharacters: 18
  });
  assert.ok(cues.length >= 2);

  await assert.rejects(
    loadVerifiedTtsAlignmentArtifact({
      projectRoot: root,
      result: result({characterAlignmentSha256: "0".repeat(64)})
    }),
    (error: unknown) => error instanceof TtsSubtitleBridgeError && error.code === "SUBTITLE_ALIGNMENT_HASH_MISMATCH"
  );
});

test("MIG-10 subtitle bridge does not depend on old subtitle or Whisper orchestration", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../src/subtitle-bridge.ts", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /lived_sentences|subtitle_alignment\.py|whisper_local|old subtitle/iu);
});
