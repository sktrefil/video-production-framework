import type { ValidationResult, ValidationIssue } from "./project-validator.js";
import { STORY_ROLES, type StoryRole } from "./enums.js";

export const FACT_CLASSIFICATIONS = [
  "VERIFIED_FACT",
  "LIKELY_INTERPRETATION",
  "HYPOTHESIS",
  "LEGEND",
  "EDITORIAL_RECONSTRUCTION"
] as const;
export type Agent2FactClassification = typeof FACT_CLASSIFICATIONS[number];

export interface Agent2ResearchSource {
  source_id: string;
  title: string;
  source_type: string;
  url?: string;
  citation?: string;
  publisher?: string;
  published_at?: string;
  notes?: string;
}

export interface Agent2ResearchSpec {
  schema_version: "1.0";
  project_id: string;
  topic: string;
  central_question: string;
  sources: Agent2ResearchSource[];
  research_notes: string[];
}

export interface Agent2FactCheckItem {
  fact_id: string;
  statement_ko: string;
  statement_en?: string;
  classification: Agent2FactClassification;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  source_refs: string[];
  visualisation_note?: string;
  uncertainty_note?: string;
}

export interface Agent2FactCheckSpec {
  schema_version: "1.0";
  project_id: string;
  facts: Agent2FactCheckItem[];
}

export interface Agent2StorySection {
  section_id: string;
  role: StoryRole;
  purpose_ko: string;
  purpose_en?: string;
  fact_refs: string[];
}

export interface Agent2BeatDraft {
  beat_id: string;
  purpose_ko: string;
  purpose_en?: string;
  script_ko: string;
}

export interface Agent2SceneDraft {
  scene_id: string;
  story_role: StoryRole;
  narrative_purpose_ko: string;
  narrative_purpose_en?: string;
  script_ko: string;
  script_en?: string;
  fact_refs: string[];
  beats: Agent2BeatDraft[];
}

export interface Agent2StorySpec {
  schema_version: "1.0";
  project_id: string;
  central_question: string;
  sections: Agent2StorySection[];
  scenes: Agent2SceneDraft[];
}

export interface Agent2ScriptSpec {
  schema_version: "1.0";
  project_id: string;
  language: string;
  body_ko: string;
  body_en?: string;
  estimated_duration_sec: number;
  source_fact_refs: string[];
}

export interface Agent2ResearchBundle {
  research_spec: Agent2ResearchSpec;
  fact_check_spec: Agent2FactCheckSpec;
}

export interface Agent2StoryBundle {
  story_spec: Agent2StorySpec;
  script: Agent2ScriptSpec;
}

export interface Agent2TtsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface Agent2TtsSectionInput {
  section_id: string;
  timeline_start_sec: number;
  text: string;
  audio_relative_path: string;
  audio_sha256: string;
  audio_duration_sec: number;
  alignment: Agent2TtsAlignment;
}

export interface Agent2TtsCompletionInput {
  schema_version: "1.0";
  project_id: string;
  provider: string;
  voice_id: string;
  model_id: string;
  sections: Agent2TtsSectionInput[];
}

export interface Agent2TtsManifestSection {
  section_id: string;
  timeline_start_sec: number;
  timeline_end_sec: number;
  text: string;
  audio_relative_path: string;
  audio_sha256: string;
  audio_duration_sec: number;
}

export interface Agent2TtsManifest {
  schema_version: "1.0";
  project_id: string;
  provider: string;
  voice_id: string;
  model_id: string;
  total_duration_sec: number;
  sections: Agent2TtsManifestSection[];
}

export interface Agent2SubtitleCue {
  subtitle_id: string;
  scene_id: string;
  start_sec: number;
  end_sec: number;
  text_ko: string;
}

export interface Agent2SubtitleTimingSpec {
  schema_version: "1.0";
  project_id: string;
  cues: Agent2SubtitleCue[];
}

export interface Agent2TaskExecutionResult {
  project_id: string;
  task_id: "T010" | "T020" | "T030";
  assigned_agent: "AGENT2_STORY_AUDIO";
  stored_artifacts: Array<{
    artifact_type: string;
    revision: number;
    sha256: string;
  }>;
  warnings: Array<{ code: string; message: string }>;
}

export function estimateKoreanNarrationDuration(text: string): number {
  const characters = text.replace(/\s+/gu, "").length;
  if (characters === 0) return 0;
  const punctuationCount = (text.match(/[,.!?。！？:;，、]/gu) ?? []).length;
  const base = characters / 4.3;
  const pauseAdjustment = Math.min(base * 0.15, punctuationCount * 0.12);
  return Math.round((base + pauseAdjustment) * 1000) / 1000;
}


function validation(errors: ValidationIssue[], warnings: ValidationIssue[] = []): ValidationResult {
  return { valid: errors.length === 0, ready_for_generation: false, errors, warnings };
}

function requiredString(value: unknown, path: string, errors: ValidationIssue[]): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push({ code: "REQUIRED_STRING", path, message: `${path} must be a non-empty string.` });
    return null;
  }
  return value.trim();
}

export function validateResearchBundle(input: unknown, expectedProjectId?: string): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return validation([{ code: "INVALID_RESEARCH_BUNDLE", message: "Research bundle must be an object." }]);
  }
  const bundle = input as Partial<Agent2ResearchBundle>;
  const research = bundle.research_spec;
  const facts = bundle.fact_check_spec;
  if (typeof research !== "object" || research === null || Array.isArray(research) || research.schema_version !== "1.0") {
    errors.push({ code: "RESEARCH_SPEC_REQUIRED", path: "research_spec", message: "research_spec schema 1.0 is required." });
  }
  if (typeof facts !== "object" || facts === null || Array.isArray(facts) || facts.schema_version !== "1.0") {
    errors.push({ code: "FACT_CHECK_SPEC_REQUIRED", path: "fact_check_spec", message: "fact_check_spec schema 1.0 is required." });
  }
  if (!research || !facts || typeof research !== "object" || typeof facts !== "object") return validation(errors, warnings);

  if (research.project_id !== facts.project_id) errors.push({ code: "PROJECT_ID_MISMATCH", path: "fact_check_spec.project_id", message: "Research and fact-check project IDs must match." });
  if (expectedProjectId && research.project_id !== expectedProjectId) errors.push({ code: "PROJECT_ID_MISMATCH", path: "research_spec.project_id", message: "Research bundle project_id must match the canonical project." });
  requiredString(research.topic, "research_spec.topic", errors);
  requiredString(research.central_question, "research_spec.central_question", errors);
  const sources = Array.isArray(research.sources) ? research.sources : [];
  if (sources.length === 0) {
    errors.push({ code: "RESEARCH_SOURCE_REQUIRED", path: "research_spec.sources", message: "At least one research source is required." });
  }

  const sourceIds = new Set<string>();
  for (const [index, source] of sources.entries()) {
    const id = requiredString(source.source_id, `research_spec.sources[${index}].source_id`, errors);
    requiredString(source.title, `research_spec.sources[${index}].title`, errors);
    requiredString(source.source_type, `research_spec.sources[${index}].source_type`, errors);
    if (id) {
      if (sourceIds.has(id)) errors.push({ code: "DUPLICATE_SOURCE_ID", path: `research_spec.sources[${index}].source_id`, message: `Duplicate source_id ${id}.` });
      sourceIds.add(id);
    }
    if (!source.url && !source.citation) {
      warnings.push({ code: "SOURCE_REFERENCE_WEAK", path: `research_spec.sources[${index}]`, message: "Source should include a URL or citation." });
    }
  }

  const factItems = Array.isArray(facts.facts) ? facts.facts : [];
  if (factItems.length === 0) {
    errors.push({ code: "FACT_CHECK_REQUIRED", path: "fact_check_spec.facts", message: "At least one fact-check item is required." });
  }
  const factIds = new Set<string>();
  for (const [index, fact] of factItems.entries()) {
    const id = requiredString(fact.fact_id, `fact_check_spec.facts[${index}].fact_id`, errors);
    requiredString(fact.statement_ko, `fact_check_spec.facts[${index}].statement_ko`, errors);
    if (id) {
      if (factIds.has(id)) errors.push({ code: "DUPLICATE_FACT_ID", path: `fact_check_spec.facts[${index}].fact_id`, message: `Duplicate fact_id ${id}.` });
      factIds.add(id);
    }
    if (!FACT_CLASSIFICATIONS.includes(fact.classification)) {
      errors.push({ code: "INVALID_FACT_CLASSIFICATION", path: `fact_check_spec.facts[${index}].classification`, message: "Unsupported fact classification." });
    }
    if (!["HIGH", "MEDIUM", "LOW"].includes(fact.confidence)) {
      errors.push({ code: "INVALID_FACT_CONFIDENCE", path: `fact_check_spec.facts[${index}].confidence`, message: "confidence must be HIGH, MEDIUM or LOW." });
    }
    if (fact.classification === "VERIFIED_FACT" && (!Array.isArray(fact.source_refs) || fact.source_refs.length === 0)) {
      errors.push({ code: "VERIFIED_FACT_SOURCE_REQUIRED", path: `fact_check_spec.facts[${index}].source_refs`, message: "VERIFIED_FACT requires at least one source reference." });
    }
    for (const ref of fact.source_refs ?? []) {
      if (!sourceIds.has(ref)) errors.push({ code: "UNKNOWN_SOURCE_REF", path: `fact_check_spec.facts[${index}].source_refs`, message: `Unknown source reference ${ref}.` });
    }
  }
  return validation(errors, warnings);
}

export function validateStoryBundle(
  input: unknown,
  facts: Agent2FactCheckSpec | null,
  expectedProjectId?: string
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return validation([{ code: "INVALID_STORY_BUNDLE", message: "Story bundle must be an object." }]);
  }
  const bundle = input as Partial<Agent2StoryBundle>;
  const story = bundle.story_spec;
  const script = bundle.script;
  if (typeof story !== "object" || story === null || Array.isArray(story) || story.schema_version !== "1.0") {
    errors.push({ code: "STORY_SPEC_REQUIRED", path: "story_spec", message: "story_spec schema 1.0 is required." });
  }
  if (typeof script !== "object" || script === null || Array.isArray(script) || script.schema_version !== "1.0") {
    errors.push({ code: "SCRIPT_SPEC_REQUIRED", path: "script", message: "script schema 1.0 is required." });
  }
  if (!story || !script || typeof story !== "object" || typeof script !== "object") return validation(errors, warnings);
  if (story.project_id !== script.project_id) errors.push({ code: "PROJECT_ID_MISMATCH", path: "script.project_id", message: "Story and script project IDs must match." });
  if (expectedProjectId && story.project_id !== expectedProjectId) errors.push({ code: "PROJECT_ID_MISMATCH", path: "story_spec.project_id", message: "Story bundle project_id must match the canonical project." });
  requiredString(story.central_question, "story_spec.central_question", errors);
  requiredString(script.body_ko, "script.body_ko", errors);
  if (!Number.isFinite(script.estimated_duration_sec) || script.estimated_duration_sec <= 0) {
    errors.push({ code: "INVALID_ESTIMATED_DURATION", path: "script.estimated_duration_sec", message: "Estimated narration duration must be positive." });
  }
  const sections = Array.isArray(story.sections) ? story.sections : [];
  const scenes = Array.isArray(story.scenes) ? story.scenes : [];
  if (sections.length === 0) errors.push({ code: "STORY_SECTION_REQUIRED", path: "story_spec.sections", message: "Story requires at least one section." });
  if (scenes.length === 0) errors.push({ code: "SCENE_DRAFT_REQUIRED", path: "story_spec.scenes", message: "Story requires at least one scene draft." });

  const knownFacts = new Set((facts?.facts ?? []).map(fact => fact.fact_id));
  const usedFacts = new Set<string>();
  for (const [index, section] of sections.entries()) {
    requiredString(section.section_id, `story_spec.sections[${index}].section_id`, errors);
    requiredString(section.purpose_ko, `story_spec.sections[${index}].purpose_ko`, errors);
    if (!STORY_ROLES.includes(section.role)) errors.push({ code: "INVALID_STORY_ROLE", path: `story_spec.sections[${index}].role`, message: "Unsupported Story Role." });
    for (const ref of Array.isArray(section.fact_refs) ? section.fact_refs : []) {
      usedFacts.add(ref);
      if (!knownFacts.has(ref)) errors.push({ code: "UNKNOWN_FACT_REF", path: `story_spec.sections[${index}].fact_refs`, message: `Unknown fact reference ${ref}.` });
    }
  }
  for (const [index, scene] of scenes.entries()) {
    requiredString(scene.scene_id, `story_spec.scenes[${index}].scene_id`, errors);
    requiredString(scene.narrative_purpose_ko, `story_spec.scenes[${index}].narrative_purpose_ko`, errors);
    requiredString(scene.script_ko, `story_spec.scenes[${index}].script_ko`, errors);
    if (!STORY_ROLES.includes(scene.story_role)) errors.push({ code: "INVALID_STORY_ROLE", path: `story_spec.scenes[${index}].story_role`, message: "Unsupported Story Role." });
    if (!Array.isArray(scene.beats) || scene.beats.length === 0) {
      errors.push({ code: "BEAT_REQUIRED", path: `story_spec.scenes[${index}].beats`, message: "Each scene needs at least one narrative beat." });
    } else {
      for (const [beatIndex, beat] of scene.beats.entries()) {
        requiredString(beat.beat_id, `story_spec.scenes[${index}].beats[${beatIndex}].beat_id`, errors);
        requiredString(beat.purpose_ko, `story_spec.scenes[${index}].beats[${beatIndex}].purpose_ko`, errors);
        requiredString(beat.script_ko, `story_spec.scenes[${index}].beats[${beatIndex}].script_ko`, errors);
      }
      const beatText = scene.beats.map(beat => beat.script_ko).join("").replace(/\s+/gu, "");
      if (beatText !== scene.script_ko.replace(/\s+/gu, "")) {
        errors.push({ code: "BEAT_SCRIPT_COVERAGE_MISMATCH", path: `story_spec.scenes[${index}].beats`, message: "Beat script segments must cover the complete Scene script in order." });
      }
    }
    for (const ref of Array.isArray(scene.fact_refs) ? scene.fact_refs : []) {
      usedFacts.add(ref);
      if (!knownFacts.has(ref)) errors.push({ code: "UNKNOWN_FACT_REF", path: `story_spec.scenes[${index}].fact_refs`, message: `Unknown fact reference ${ref}.` });
    }
  }
  for (const ref of Array.isArray(script.source_fact_refs) ? script.source_fact_refs : []) {
    if (!knownFacts.has(ref)) errors.push({ code: "UNKNOWN_FACT_REF", path: "script.source_fact_refs", message: `Unknown fact reference ${ref}.` });
  }
  if (knownFacts.size > 0 && usedFacts.size === 0) warnings.push({ code: "STORY_FACT_LINK_WEAK", message: "Story scenes do not reference any fact-check items." });

  const joined = scenes.map(scene => scene.script_ko.trim()).join("");
  const scriptNormalized = script.body_ko.replace(/\s+/gu, "");
  const scenesNormalized = joined.replace(/\s+/gu, "");
  if (scriptNormalized && scenesNormalized && scriptNormalized !== scenesNormalized) {
    errors.push({ code: "SCENE_SCRIPT_COVERAGE_MISMATCH", path: "story_spec.scenes", message: "Scene script segments must cover the complete Korean script in order." });
  }
  return validation(errors, warnings);
}

export function validateTtsCompletionInput(input: unknown, expectedProjectId?: string): ValidationResult {
  const errors: ValidationIssue[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) return validation([{ code: "INVALID_TTS_COMPLETION", message: "TTS completion input must be an object." }]);
  const value = input as Partial<Agent2TtsCompletionInput>;
  if (value.schema_version !== "1.0") errors.push({ code: "UNSUPPORTED_SCHEMA_VERSION", path: "schema_version", message: "TTS completion schema_version must be 1.0." });
  if (expectedProjectId && value.project_id !== expectedProjectId) errors.push({ code: "PROJECT_ID_MISMATCH", path: "project_id", message: "TTS completion project_id must match the canonical project." });
  requiredString(value.provider, "provider", errors);
  requiredString(value.voice_id, "voice_id", errors);
  requiredString(value.model_id, "model_id", errors);
  const ttsSections = Array.isArray(value.sections) ? value.sections : [];
  if (ttsSections.length === 0) errors.push({ code: "TTS_SECTION_REQUIRED", path: "sections", message: "At least one completed TTS section is required." });
  let previousEnd = 0;
  if ((ttsSections[0]?.timeline_start_sec ?? 0) !== 0) {
    errors.push({ code: "TTS_TIMELINE_MUST_START_AT_ZERO", path: "sections[0].timeline_start_sec", message: "Project narration TTS timeline must start at 0 seconds." });
  }
  for (const [index, section] of ttsSections.entries()) {
    const path = `sections[${index}]`;
    requiredString(section.section_id, `${path}.section_id`, errors);
    requiredString(section.text, `${path}.text`, errors);
    requiredString(section.audio_relative_path, `${path}.audio_relative_path`, errors);
    if (!/^[a-f0-9]{64}$/iu.test(section.audio_sha256 ?? "")) errors.push({ code: "INVALID_AUDIO_SHA256", path: `${path}.audio_sha256`, message: "audio_sha256 must be 64 hexadecimal characters." });
    if (!Number.isFinite(section.timeline_start_sec) || section.timeline_start_sec < previousEnd - 0.001) errors.push({ code: "INVALID_SECTION_TIMELINE", path: `${path}.timeline_start_sec`, message: "TTS sections must be ordered without overlap." });
    if (!Number.isFinite(section.audio_duration_sec) || section.audio_duration_sec <= 0) errors.push({ code: "INVALID_AUDIO_DURATION", path: `${path}.audio_duration_sec`, message: "audio_duration_sec must be positive." });
    const alignment = section.alignment;
    const count = alignment?.characters?.length ?? 0;
    if (!alignment || count === 0 || alignment.character_start_times_seconds.length !== count || alignment.character_end_times_seconds.length !== count) {
      errors.push({ code: "INVALID_ALIGNMENT", path: `${path}.alignment`, message: "Character alignment arrays must be non-empty and equal length." });
    } else {
      const alignedText = alignment.characters.join("");
      if (alignedText !== section.text) errors.push({ code: "ALIGNMENT_TEXT_MISMATCH", path: `${path}.alignment`, message: "Character alignment text must exactly match section.text." });
      for (let i = 0; i < count; i += 1) {
        const start = alignment.character_start_times_seconds[i]!;
        const end = alignment.character_end_times_seconds[i]!;
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end > section.audio_duration_sec + 0.1) {
          errors.push({ code: "INVALID_ALIGNMENT_TIME", path: `${path}.alignment[${i}]`, message: "Alignment timestamp is outside the section duration." });
          break;
        }
      }
    }
    previousEnd = (section.timeline_start_sec ?? 0) + (section.audio_duration_sec ?? 0);
  }
  return validation(errors);
}
