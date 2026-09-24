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
      source_refs: ["SRC1", "SRC2"]
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


test("Agent2 research topic must exactly match the active Project Spec topic", () => {
  const bundle = {
    research_spec: {
      schema_version: "1.0",
      project_id: "p1",
      topic: "네안데르탈인은 왜 사라졌는가",
      central_question: "왜 사라졌는가?",
      sources: [{
        source_id: "SRC1",
        title: "Source One",
        source_type: "RESEARCH_INSTITUTE",
        url: "https://research.example.org/source-one",
        citation: "Source One",
        publisher: "Example Research Institute"
      }, {
        source_id: "SRC2",
        title: "Source Two",
        source_type: "UNIVERSITY",
        url: "https://university.example.edu/source-two",
        citation: "Source Two",
        publisher: "Example University"
      }],
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
        source_refs: ["SRC1", "SRC2"]
      }]
    }
  };

  const mismatch = validateResearchBundle(
    bundle,
    "p1",
    "네안데르탈인은 왜 약 4만 년 전 고고학 기록에서 사라졌으며, 현생인류와의 교배와 유전적 흡수가 그 과정에 어떤 역할을 했는가"
  );
  assert.equal(mismatch.valid, false);
  assert.ok(mismatch.errors.some(issue => issue.code === "RESEARCH_TOPIC_MISMATCH"));

  const whitespaceMismatch = validateResearchBundle(
    {
      ...bundle,
      research_spec: {
        ...bundle.research_spec,
        topic: "네안데르탈인은 왜 약 4만 년 전 고고학 기록에서 사라졌으며, 현생인류와의 교배와 유전적 흡수가 그 과정에 어떤 역할을 했는가 "
      }
    },
    "p1",
    "네안데르탈인은 왜 약 4만 년 전 고고학 기록에서 사라졌으며, 현생인류와의 교배와 유전적 흡수가 그 과정에 어떤 역할을 했는가"
  );
  assert.equal(whitespaceMismatch.valid, false);
  assert.ok(whitespaceMismatch.errors.some(issue => issue.code === "RESEARCH_TOPIC_MISMATCH"));

  const exact = validateResearchBundle(
    {
      ...bundle,
      research_spec: {
        ...bundle.research_spec,
        topic: "네안데르탈인은 왜 약 4만 년 전 고고학 기록에서 사라졌으며, 현생인류와의 교배와 유전적 흡수가 그 과정에 어떤 역할을 했는가"
      }
    },
    "p1",
    "네안데르탈인은 왜 약 4만 년 전 고고학 기록에서 사라졌으며, 현생인류와의 교배와 유전적 흡수가 그 과정에 어떤 역할을 했는가"
  );
  assert.equal(exact.valid, true);
});


test("Agent2 research rejects same-publisher URLs as independent verification", () => {
  const result = validateResearchBundle({
    research_spec: {
      schema_version: "1.0",
      project_id: "p1",
      topic: "topic",
      central_question: "question",
      sources: [{
        source_id: "SRC1",
        title: "Publisher article one",
        source_type: "RESEARCH_INSTITUTE",
        url: "https://example.org/article-one",
        citation: "Article one",
        publisher: "Same Institute"
      }, {
        source_id: "SRC2",
        title: "Publisher article two",
        source_type: "RESEARCH_INSTITUTE",
        url: "https://mirror.example.net/article-two",
        citation: "Article two",
        publisher: "Same Institute"
      }],
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
        source_refs: ["SRC1", "SRC2"]
      }]
    }
  }, "p1");

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(issue => issue.code === "VERIFIED_FACT_INDEPENDENT_SOURCES_REQUIRED"));
  assert.ok(result.errors.some(issue => issue.code === "HIGH_CONFIDENCE_INDEPENDENT_SOURCES_REQUIRED"));
});

test("Agent2 research accepts two independent sources with an authority source", () => {
  const result = validateResearchBundle({
    research_spec: {
      schema_version: "1.0",
      project_id: "p1",
      topic: "topic",
      central_question: "question",
      sources: [{
        source_id: "SRC1",
        title: "Peer reviewed evidence",
        source_type: "PEER_REVIEWED_JOURNAL",
        url: "https://journal.example.org/article",
        citation: "Peer reviewed evidence",
        publisher: "Example Journal"
      }, {
        source_id: "SRC2",
        title: "Independent institutional evidence",
        source_type: "MUSEUM",
        url: "https://museum.example.net/evidence",
        citation: "Museum evidence",
        publisher: "Example Museum"
      }],
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
        source_refs: ["SRC1", "SRC2"]
      }]
    }
  }, "p1");

  assert.equal(result.valid, true);
});

test("Agent2 HIGH confidence requires at least one authority-class source", () => {
  const result = validateResearchBundle({
    research_spec: {
      schema_version: "1.0",
      project_id: "p1",
      topic: "topic",
      central_question: "question",
      sources: [{
        source_id: "SRC1",
        title: "General web source one",
        source_type: "WEB",
        url: "https://one.example.org/article",
        citation: "Web one",
        publisher: "Publisher One"
      }, {
        source_id: "SRC2",
        title: "General web source two",
        source_type: "WEB",
        url: "https://two.example.net/article",
        citation: "Web two",
        publisher: "Publisher Two"
      }],
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
        source_refs: ["SRC1", "SRC2"]
      }]
    }
  }, "p1");

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(issue => issue.code === "HIGH_CONFIDENCE_AUTHORITY_SOURCE_REQUIRED"));
});


test("Agent2 research rejects same-host sources even when publisher labels differ", () => {
  const result = validateResearchBundle({
    research_spec: {
      schema_version: "1.0",
      project_id: "p1",
      topic: "topic",
      central_question: "question",
      sources: [{
        source_id: "SRC1",
        title: "Host article one",
        source_type: "RESEARCH_INSTITUTE",
        url: "https://evidence.example.org/article-one",
        citation: "Article one",
        publisher: "Institute Division A"
      }, {
        source_id: "SRC2",
        title: "Host article two",
        source_type: "UNIVERSITY",
        url: "https://evidence.example.org/article-two",
        citation: "Article two",
        publisher: "Institute Division B"
      }],
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
        source_refs: ["SRC1", "SRC2"]
      }]
    }
  }, "p1");

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(issue => issue.code === "VERIFIED_FACT_INDEPENDENT_SOURCES_REQUIRED"));
});
