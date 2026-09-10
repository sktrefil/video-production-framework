import assert from "node:assert/strict";
import test from "node:test";
import type {EditorContentPlan, MediaArtifact} from "@vpf/domain";
import type {EditorContentPlanRepository} from "../src/index.js";
import {SubtitleCorrectionService} from "../src/subtitle-correction.js";

function initialPlan(): EditorContentPlan {
  return {
    id: "content-plan",
    projectId: "project",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: "2026-09-10T12:00:00.000Z",
    updatedAt: "2026-09-10T12:00:00.000Z",
    planStatus: "APPROVED",
    audio: [{
      id: "narration",
      type: "TTS",
      mediaId: "media-narration",
      timelineStartMs: 0
    }],
    subtitles: [{
      id: "tts-align-0001",
      startMs: 100,
      endMs: 900,
      text: "원래 자막",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromAudioPlacementIds: ["narration"]
    }],
    textOverlays: [],
    graphics: []
  };
}

class MemoryRepository implements EditorContentPlanRepository {
  current = initialPlan();
  committed: EditorContentPlan[] = [];

  async getLatestEditorContentPlan(): Promise<EditorContentPlan | null> {
    return structuredClone(this.current);
  }

  async getMedia(): Promise<MediaArtifact | null> {
    return null;
  }

  async commitEditorContentPlan(input: {plan: EditorContentPlan}): Promise<void> {
    this.committed.push(structuredClone(input.plan));
    this.current = structuredClone(input.plan);
  }
}

test("manual subtitle correction creates a new DRAFT content-plan revision without mutating TTS provenance", async () => {
  const repository = new MemoryRepository();
  const original = structuredClone(repository.current);
  let idCounter = 0;
  const service = new SubtitleCorrectionService(
    repository,
    {nowIso: () => "2026-09-10T12:30:00.000Z"},
    {next: prefix => `${prefix}-${++idCounter}`}
  );

  const revised = await service.correctCue({
    projectId: "project",
    cueId: "tts-align-0001",
    text: "사용자가 수정한 자막",
    startMs: 120,
    endMs: 880
  });

  assert.equal(revised.id, original.id);
  assert.equal(revised.revision, 2);
  assert.equal(revised.planStatus, "DRAFT");
  assert.equal(revised.subtitles[0]?.generationSource, "MANUAL");
  assert.equal(revised.subtitles[0]?.text, "사용자가 수정한 자막");
  assert.deepEqual(revised.subtitles[0]?.generatedFromAudioPlacementIds, ["narration"]);
  assert.deepEqual(revised.audio, original.audio);
  assert.equal(original.subtitles[0]?.generationSource, "SCRIPT_TTS_ALIGN");
  assert.equal(repository.committed.length, 1);
});
