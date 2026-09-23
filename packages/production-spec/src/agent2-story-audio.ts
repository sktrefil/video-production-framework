import type { StoryRole } from "./enums.js";

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

export interface Agent2SceneDraft {
  scene_id: string;
  story_role: StoryRole;
  narrative_purpose_ko: string;
  narrative_purpose_en?: string;
  script_ko: string;
  script_en?: string;
  fact_refs: string[];
  beat_purposes_ko: string[];
  beat_purposes_en?: string[];
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
