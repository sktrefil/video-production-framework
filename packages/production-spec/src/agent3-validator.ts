import type { StoryRole } from "./enums.js";
import type { ValidationIssue, ValidationResult } from "./project-validator.js";
import {
  STATE_IMAGE_ROLES,
  VISUAL_FACTUALITY_MODES,
  type StateImageRole,
  type VisualBibleRef,
  type VisualFactualityMode
} from "./agent3-types.js";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function output(errors: ValidationIssue[], warnings: ValidationIssue[] = []): ValidationResult {
  return { valid: errors.length === 0, ready_for_generation: false, errors, warnings };
}

function required(value: unknown, path: string, errors: ValidationIssue[]): void {
  if (!nonempty(value)) errors.push({ code: "MISSING_REQUIRED_FIELD", path, message: path + " is required." });
}

function strings(value: unknown, path: string, errors: ValidationIssue[], allowEmpty = false): string[] {
  if (!Array.isArray(value) || value.some(item => !nonempty(item))) {
    errors.push({ code: "INVALID_STRING_ARRAY", path, message: path + " must be an array of non-empty strings." });
    return [];
  }
  if (!allowEmpty && value.length === 0) {
    errors.push({ code: "EMPTY_REQUIRED_ARRAY", path, message: path + " must not be empty." });
  }
  return value as string[];
}

export function validateSceneVisualDocument(
  input: unknown,
  context: {
    projectId?: string;
    sceneIds?: readonly string[];
    storyRoles?: ReadonlyMap<string, StoryRole>;
    visualBible?: VisualBibleRef;
  } = {}
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (!record(input)) {
    return output([{ code: "INVALID_SCENE_VISUAL_SPEC", path: "scene_visual_spec", message: "Scene Visual Spec must be an object." }]);
  }
  if (input.schema_version !== "1.0") errors.push({ code: "INVALID_SCHEMA_VERSION", path: "schema_version", message: "Scene Visual Spec schema_version must be 1.0." });
  required(input.project_id, "project_id", errors);
  if (context.projectId !== undefined && input.project_id !== context.projectId) {
    errors.push({ code: "PROJECT_ID_MISMATCH", path: "project_id", message: "Scene Visual Spec project_id mismatch." });
  }

  const bible = record(input.visual_bible) ? input.visual_bible : {};
  required(bible.resource_id, "visual_bible.resource_id", errors);
  required(bible.version, "visual_bible.version", errors);
  required(bible.content_hash, "visual_bible.content_hash", errors);
  if (context.visualBible !== undefined && (
    bible.resource_id !== context.visualBible.resource_id ||
    bible.version !== context.visualBible.version ||
    bible.content_hash !== context.visualBible.content_hash
  )) {
    errors.push({ code: "VISUAL_BIBLE_PIN_MISMATCH", path: "visual_bible", message: "Scene Visual Spec must use the pinned Visual Bible." });
  }

  const scenes = Array.isArray(input.scenes) ? input.scenes : [];
  if (scenes.length === 0) errors.push({ code: "SCENE_VISUAL_REQUIRED", path: "scenes", message: "At least one Scene Visual plan is required." });
  const ids = new Set<string>();

  for (const [index, raw] of scenes.entries()) {
    const base = "scenes[" + index + "]";
    if (!record(raw)) {
      errors.push({ code: "INVALID_SCENE_VISUAL", path: base, message: "Scene Visual plan must be an object." });
      continue;
    }
    required(raw.scene_id, base + ".scene_id", errors);
    if (nonempty(raw.scene_id)) {
      if (ids.has(raw.scene_id)) errors.push({ code: "DUPLICATE_SCENE_ID", path: base + ".scene_id", message: "scene_id must be unique." });
      ids.add(raw.scene_id);
      if (context.sceneIds !== undefined && !context.sceneIds.includes(raw.scene_id)) {
        errors.push({ code: "UNKNOWN_SCENE_ID", path: base + ".scene_id", message: "Unknown Scene " + raw.scene_id + "." });
      }
      const role = context.storyRoles?.get(raw.scene_id);
      if (role !== undefined && raw.story_role !== role) {
        errors.push({ code: "STORY_ROLE_MISMATCH", path: base + ".story_role", message: "story_role must match Scene Timing." });
      }
    }
    if (!VISUAL_FACTUALITY_MODES.includes(raw.factuality_mode as VisualFactualityMode)) {
      errors.push({ code: "INVALID_FACTUALITY_MODE", path: base + ".factuality_mode", message: "Unsupported visual factuality_mode." });
    }
    for (const key of ["narrative_purpose_ko","visual_intent_ko","environment_ko","subject_ko","action_ko","uncertainty_handling_ko"] as const) {
      required(raw[key], base + "." + key, errors);
    }
    strings(raw.evidence_constraints, base + ".evidence_constraints", errors, raw.factuality_mode !== "EVIDENCE");
    strings(raw.forbidden_visual_claims, base + ".forbidden_visual_claims", errors);

    const continuity = record(raw.continuity) ? raw.continuity : {};
    strings(continuity.character_identity, base + ".continuity.character_identity", errors, true);
    strings(continuity.environment_identity, base + ".continuity.environment_identity", errors);
    for (const key of ["lighting_direction","color_language","weather","movement_direction"] as const) {
      required(continuity[key], base + ".continuity." + key, errors);
    }
    if (!["LEFT_TO_RIGHT","RIGHT_TO_LEFT","TOWARD_CAMERA","AWAY_FROM_CAMERA","NEUTRAL"].includes(String(continuity.screen_direction ?? ""))) {
      errors.push({ code: "INVALID_SCREEN_DIRECTION", path: base + ".continuity.screen_direction", message: "Unsupported screen direction." });
    }
    if (!["STATIC","RESTRAINED","ACTIVE"].includes(String(continuity.camera_energy ?? ""))) {
      errors.push({ code: "INVALID_CAMERA_ENERGY", path: base + ".continuity.camera_energy", message: "Unsupported camera energy." });
    }
    strings(continuity.visual_motif, base + ".continuity.visual_motif", errors, true);

    const handoff = record(raw.handoff) ? raw.handoff : {};
    required(handoff.entry_anchor, base + ".handoff.entry_anchor", errors);
    required(handoff.exit_anchor, base + ".handoff.exit_anchor", errors);
    const preserve = strings(handoff.preserve_elements, base + ".handoff.preserve_elements", errors);
    if (preserve.length > 4) errors.push({ code: "HANDOFF_OVERLOAD", path: base + ".handoff.preserve_elements", message: "Preserve at most four primary handoff elements." });
    required(handoff.next_cut_intent, base + ".handoff.next_cut_intent", errors);
  }

  if (context.sceneIds !== undefined) {
    for (const id of context.sceneIds) {
      if (!ids.has(id)) errors.push({ code: "SCENE_VISUAL_COVERAGE_MISSING", path: "scenes", message: "Scene " + id + " is missing." });
    }
    if (ids.size !== context.sceneIds.length) {
      errors.push({ code: "SCENE_VISUAL_COVERAGE_MISMATCH", path: "scenes", message: "Scene Visual Spec must cover every Scene exactly once." });
    }
  }
  return output(errors, warnings);
}

export function validateStateImageDocument(
  input: unknown,
  context: {
    projectId?: string;
    sceneIds?: readonly string[];
    beatIdsByScene?: ReadonlyMap<string, readonly string[]>;
  } = {}
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (!record(input)) {
    return output([{ code: "INVALID_STATE_IMAGE_SPEC", path: "state_image_spec", message: "State Image Spec must be an object." }]);
  }
  if (input.schema_version !== "1.0") errors.push({ code: "INVALID_SCHEMA_VERSION", path: "schema_version", message: "State Image Spec schema_version must be 1.0." });
  required(input.project_id, "project_id", errors);
  if (context.projectId !== undefined && input.project_id !== context.projectId) {
    errors.push({ code: "PROJECT_ID_MISMATCH", path: "project_id", message: "State Image Spec project_id mismatch." });
  }

  const items = Array.isArray(input.state_images) ? input.state_images : [];
  if (items.length === 0) errors.push({ code: "STATE_IMAGE_REQUIRED", path: "state_images", message: "At least one State Image is required." });
  const ids = new Set<string>();
  const perScene = new Map<string, { entry: number; target: number; orders: Set<number> }>();

  for (const [index, raw] of items.entries()) {
    const base = "state_images[" + index + "]";
    if (!record(raw)) {
      errors.push({ code: "INVALID_STATE_IMAGE", path: base, message: "State Image plan must be an object." });
      continue;
    }
    required(raw.state_image_id, base + ".state_image_id", errors);
    required(raw.scene_id, base + ".scene_id", errors);
    if (nonempty(raw.state_image_id)) {
      if (ids.has(raw.state_image_id)) errors.push({ code: "DUPLICATE_STATE_IMAGE_ID", path: base + ".state_image_id", message: "state_image_id must be globally unique." });
      ids.add(raw.state_image_id);
    }
    if (!STATE_IMAGE_ROLES.includes(raw.role as StateImageRole)) {
      errors.push({ code: "INVALID_STATE_IMAGE_ROLE", path: base + ".role", message: "role must be ENTRY, MID or TARGET." });
    }
    if (!Number.isInteger(raw.sequence_order) || Number(raw.sequence_order) <= 0) {
      errors.push({ code: "INVALID_STATE_IMAGE_ORDER", path: base + ".sequence_order", message: "sequence_order must be a positive integer." });
    }
    if (nonempty(raw.scene_id)) {
      if (context.sceneIds !== undefined && !context.sceneIds.includes(raw.scene_id)) {
        errors.push({ code: "UNKNOWN_SCENE_ID", path: base + ".scene_id", message: "Unknown Scene " + raw.scene_id + "." });
      }
      const stats = perScene.get(raw.scene_id) ?? { entry: 0, target: 0, orders: new Set<number>() };
      if (raw.role === "ENTRY") stats.entry += 1;
      if (raw.role === "TARGET") stats.target += 1;
      if (Number.isInteger(raw.sequence_order)) {
        const order = Number(raw.sequence_order);
        if (stats.orders.has(order)) errors.push({ code: "DUPLICATE_STATE_IMAGE_ORDER", path: base + ".sequence_order", message: "sequence_order must be unique within a Scene." });
        stats.orders.add(order);
      }
      perScene.set(raw.scene_id, stats);

      if (raw.beat_id !== null) {
        if (!nonempty(raw.beat_id)) {
          errors.push({ code: "INVALID_BEAT_REF", path: base + ".beat_id", message: "beat_id must be null or non-empty." });
        } else if (!(context.beatIdsByScene?.get(raw.scene_id) ?? []).includes(raw.beat_id)) {
          errors.push({ code: "UNKNOWN_BEAT_REF", path: base + ".beat_id", message: "Unknown Beat " + raw.beat_id + " for Scene " + raw.scene_id + "." });
        }
      }
    }
    for (const key of ["visual_goal_ko","composition_ko","subject_state_ko","environment_state_ko","motion_vector_ko","handoff_anchor"] as const) {
      required(raw[key], base + "." + key, errors);
    }
    strings(raw.continuity_refs, base + ".continuity_refs", errors);
    strings(raw.factual_constraints, base + ".factual_constraints", errors, true);
    strings(raw.avoidances, base + ".avoidances", errors);
  }

  for (const id of context.sceneIds ?? []) {
    const stats = perScene.get(id);
    if (stats === undefined) {
      errors.push({ code: "STATE_IMAGE_SCENE_MISSING", path: "state_images", message: "Scene " + id + " has no State Images." });
      continue;
    }
    if (stats.entry !== 1) errors.push({ code: "ENTRY_STATE_COUNT_INVALID", path: "state_images", message: "Scene " + id + " must have exactly one ENTRY state." });
    if (stats.target !== 1) errors.push({ code: "TARGET_STATE_COUNT_INVALID", path: "state_images", message: "Scene " + id + " must have exactly one TARGET state." });
  }
  return output(errors, warnings);
}

export function validatePromptBundle(
  input: unknown,
  context: { projectId?: string; stateImageIds?: readonly string[]; clipIds?: readonly string[] } = {}
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (!record(input)) return output([{ code: "INVALID_PROMPT_BUNDLE", path: "prompt_bundle_spec", message: "Prompt Bundle must be an object." }]);
  if (input.schema_version !== "1.0" || input.compiler_version !== "AGENT3_PROMPT_COMPILER_V1") {
    errors.push({ code: "INVALID_PROMPT_COMPILER_VERSION", path: "compiler_version", message: "Prompt Bundle must use AGENT3_PROMPT_COMPILER_V1." });
  }
  if (context.projectId !== undefined && input.project_id !== context.projectId) {
    errors.push({ code: "PROJECT_ID_MISMATCH", path: "project_id", message: "Prompt Bundle project_id mismatch." });
  }

  const imagePrompts = Array.isArray(input.image_prompts) ? input.image_prompts : [];
  const videoPrompts = Array.isArray(input.video_prompts) ? input.video_prompts : [];
  const imageIds = new Set<string>();
  const clipIds = new Set<string>();

  imagePrompts.forEach((raw, index) => {
    const base = "image_prompts[" + index + "]";
    if (!record(raw)) return errors.push({ code: "INVALID_IMAGE_PROMPT", path: base, message: "Image prompt must be an object." });
    for (const key of ["state_image_id","scene_id","prompt_ko","prompt_en","provider_prompt_en","negative_prompt_en"] as const) required(raw[key], base + "." + key, errors);
    if (nonempty(raw.state_image_id)) {
      if (imageIds.has(raw.state_image_id)) errors.push({ code: "DUPLICATE_IMAGE_PROMPT", path: base + ".state_image_id", message: "Each State Image needs one image prompt." });
      imageIds.add(raw.state_image_id);
    }
  });

  videoPrompts.forEach((raw, index) => {
    const base = "video_prompts[" + index + "]";
    if (!record(raw)) return errors.push({ code: "INVALID_VIDEO_PROMPT", path: base, message: "Video prompt must be an object." });
    for (const key of ["clip_id","scene_id","entry_state_image_id","target_state_image_id","prompt_ko","prompt_en","provider_prompt_en"] as const) required(raw[key], base + "." + key, errors);
    if (raw.mid_state_image_id !== null && !nonempty(raw.mid_state_image_id)) errors.push({ code: "INVALID_MID_STATE_REF", path: base + ".mid_state_image_id", message: "mid_state_image_id must be null or non-empty." });
    for (const key of ["editorial_duration_sec","narrative_deadline_sec","target_state_deadline_sec","safe_trim_start_sec"] as const) {
      if (!finite(raw[key])) errors.push({ code: "INVALID_PROMPT_TIMING", path: base + "." + key, message: key + " must be finite." });
    }
    if (nonempty(raw.clip_id)) {
      if (clipIds.has(raw.clip_id)) errors.push({ code: "DUPLICATE_VIDEO_PROMPT", path: base + ".clip_id", message: "Each Clip needs one video prompt." });
      clipIds.add(raw.clip_id);
    }
  });

  for (const id of context.stateImageIds ?? []) if (!imageIds.has(id)) errors.push({ code: "IMAGE_PROMPT_COVERAGE_MISSING", path: "image_prompts", message: "State Image " + id + " has no prompt." });
  for (const id of context.clipIds ?? []) if (!clipIds.has(id)) errors.push({ code: "VIDEO_PROMPT_COVERAGE_MISSING", path: "video_prompts", message: "Clip " + id + " has no prompt." });
  if (context.stateImageIds !== undefined && imageIds.size !== context.stateImageIds.length) errors.push({ code: "IMAGE_PROMPT_COVERAGE_MISMATCH", path: "image_prompts", message: "Image prompts must cover current State Images exactly once." });
  if (context.clipIds !== undefined && clipIds.size !== context.clipIds.length) errors.push({ code: "VIDEO_PROMPT_COVERAGE_MISMATCH", path: "video_prompts", message: "Video prompts must cover current Clips exactly once." });
  return output(errors, warnings);
}
