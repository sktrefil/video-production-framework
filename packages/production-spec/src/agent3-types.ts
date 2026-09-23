import type { StoryRole } from "./enums.js";
import type { ClipProductionDocument } from "./clip-production-spec.js";

export const VISUAL_FACTUALITY_MODES = [
  "EVIDENCE",
  "HISTORICAL_RECONSTRUCTION",
  "HYPOTHESIS_RECONSTRUCTION",
  "LEGEND_RECONSTRUCTION",
  "EDITORIAL_FANTASY_RECONSTRUCTION",
  "UNKNOWN"
] as const;
export type VisualFactualityMode = typeof VISUAL_FACTUALITY_MODES[number];

export const STATE_IMAGE_ROLES = ["ENTRY", "MID", "TARGET"] as const;
export type StateImageRole = typeof STATE_IMAGE_ROLES[number];

export interface VisualBibleRef {
  resource_id: string;
  version: string;
  content_hash: string;
}

export interface SceneContinuityContract {
  character_identity: string[];
  environment_identity: string[];
  lighting_direction: string;
  color_language: string;
  weather: string;
  movement_direction: string;
  screen_direction: "LEFT_TO_RIGHT" | "RIGHT_TO_LEFT" | "TOWARD_CAMERA" | "AWAY_FROM_CAMERA" | "NEUTRAL";
  camera_energy: "STATIC" | "RESTRAINED" | "ACTIVE";
  visual_motif: string[];
}

export interface SceneHandoffContract {
  entry_anchor: string;
  exit_anchor: string;
  preserve_elements: string[];
  next_cut_intent: string;
}

export interface SceneVisualPlan {
  scene_id: string;
  story_role: StoryRole;
  factuality_mode: VisualFactualityMode;
  narrative_purpose_ko: string;
  narrative_purpose_en: string;
  visual_intent_ko: string;
  visual_intent_en: string;
  environment_ko: string;
  environment_en: string;
  subject_ko: string;
  subject_en: string;
  action_ko: string;
  action_en: string;
  evidence_constraints: string[];
  uncertainty_handling_ko: string;
  uncertainty_handling_en: string;
  forbidden_visual_claims: string[];
  continuity: SceneContinuityContract;
  handoff: SceneHandoffContract;
}

export interface SceneVisualDocument {
  schema_version: "1.0";
  project_id: string;
  visual_bible: VisualBibleRef;
  scenes: SceneVisualPlan[];
}

export interface StateImagePlan {
  state_image_id: string;
  scene_id: string;
  beat_id: string | null;
  role: StateImageRole;
  sequence_order: number;
  visual_goal_ko: string;
  visual_goal_en: string;
  composition_ko: string;
  composition_en: string;
  subject_state_ko: string;
  subject_state_en: string;
  environment_state_ko: string;
  environment_state_en: string;
  motion_vector_ko: string;
  motion_vector_en: string;
  handoff_anchor: string;
  continuity_refs: string[];
  factual_constraints: string[];
  avoidances: string[];
}

export interface StateImageDocument {
  schema_version: "1.0";
  project_id: string;
  state_images: StateImagePlan[];
}

export interface ImagePromptPlan {
  state_image_id: string;
  scene_id: string;
  prompt_ko: string;
  prompt_en: string;
  provider_prompt_en: string;
  negative_prompt_en: string;
}

export interface VideoPromptPlan {
  clip_id: string;
  scene_id: string;
  entry_state_image_id: string;
  mid_state_image_id: string | null;
  target_state_image_id: string;
  prompt_ko: string;
  prompt_en: string;
  provider_prompt_en: string;
  editorial_duration_sec: number;
  narrative_deadline_sec: number;
  target_state_deadline_sec: number;
  safe_trim_start_sec: number;
}

export interface PromptBundleDocument {
  schema_version: "1.0";
  project_id: string;
  compiler_version: "AGENT3_PROMPT_COMPILER_V1";
  image_prompts: ImagePromptPlan[];
  video_prompts: VideoPromptPlan[];
}

export interface Agent3T060Input {
  schema_version: "1.0";
  project_id: string;
  clip_production_spec: ClipProductionDocument;
}


export interface Agent3TaskExecutionResult {
  project_id: string;
  task_id: "T040" | "T050" | "T060";
  assigned_agent: "AGENT3_VISUAL_PRODUCTION";
  stored_artifacts: Array<{
    artifact_type: string;
    revision: number;
    sha256: string;
  }>;
  warnings: Array<{ code: string; message: string }>;
}
