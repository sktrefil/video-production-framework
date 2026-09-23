import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateKoreanNarrationDuration,
  validateResearchBundle,
  validateStoryBundle,
  validateTtsCompletionInput
} from "../src/index.js";

test("Agent2 research validation requires sourced verified facts", () => {
  const invalid = validateResearchBundle({
    research_spec: {
      schema_version: "1.0",
      project_id: "p1",
      topic: "topic",
      central_question: "question",
      sources: [{ source_id: "SRC1", title: "Source", source_type: "BOOK", citation: "Citation" }],
      research_notes: []
    },
    fact_check_spec: {
      schema_version: "1.0",
      project_id: "p1",
      facts: [{
        fact_id: "F1",
        statement_ko: "검증 사실",
        classification: "VERIFIED_FACT",
        confidence: "HIGH",
        source_refs: []
      }]
    }
  }, "p1");
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some(issue => issue.code === "VERIFIED_FACT_SOURCE_REQUIRED"));
});

test("Agent2 story validation requires exact Scene and Beat script coverage", () => {
  const facts = {
    schema_version: "1.0" as const,
    project_id: "p1",
    facts: [{
      fact_id: "F1",
      statement_ko: "검증 사실",
      classification: "VERIFIED_FACT" as const,
      confidence: "HIGH" as const,
      source_refs: ["SRC1"]
    }]
  };
  const valid = validateStoryBundle({
    story_spec: {
      schema_version: "1.0",
      project_id: "p1",
      central_question: "무슨 일이 있었나?",
      sections: [{
        section_id: "SEC1",
        role: "HOOK",
        purpose_ko: "질문 제기",
        fact_refs: ["F1"]
      }],
      scenes: [{
        scene_id: "SCENE_01",
        story_role: "HOOK",
        narrative_purpose_ko: "질문 제기",
        script_ko: "로마군단은사라졌다.",
        fact_refs: ["F1"],
        beats: [{
          beat_id: "BEAT_01",
          purpose_ko: "실종 제시",
          script_ko: "로마군단은사라졌다."
        }]
      }]
    },
    script: {
      schema_version: "1.0",
      project_id: "p1",
      language: "ko",
      body_ko: "로마군단은사라졌다.",
      estimated_duration_sec: estimateKoreanNarrationDuration("로마군단은사라졌다."),
      source_fact_refs: ["F1"]
    }
  }, facts, "p1");
  assert.equal(valid.valid, true);
});

test("Agent2 TTS completion requires exact provider character alignment", () => {
  const text = "로마군단";
  const valid = validateTtsCompletionInput({
    schema_version: "1.0",
    project_id: "p1",
    provider: "ELEVENLABS",
    voice_id: "voice",
    model_id: "model",
    sections: [{
      section_id: "SEC1",
      timeline_start_sec: 0,
      text,
      audio_relative_path: "03_tts/narration.mp3",
      audio_sha256: "a".repeat(64),
      audio_duration_sec: 1,
      alignment: {
        characters: Array.from(text),
        character_start_times_seconds: [0, 0.2, 0.4, 0.6],
        character_end_times_seconds: [0.2, 0.4, 0.6, 0.8]
      }
    }]
  }, "p1");
  assert.equal(valid.valid, true);
});
