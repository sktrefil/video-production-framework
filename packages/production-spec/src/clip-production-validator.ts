import { CAMERA_MOVEMENTS, CAMERA_PURPOSES, MOVEMENT_CURVES, SHOT_SIZES } from "./enums.js";
import type { ValidationIssue, ValidationResult } from "./project-validator.js";

export interface ClipValidationContext {
  sceneIds?: readonly string[];
  sceneTimings?: readonly {
    scene_id: string;
    tts: { duration_sec: number } | null;
  }[];
}

const EPSILON = 1e-9;
/** Allows rounding to video frames without substituting estimated duration for TTS. */
export const CLIP_TTS_DURATION_TOLERANCE_SEC = 0.05;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function result(errors: ValidationIssue[], warnings: ValidationIssue[]): ValidationResult {
  return { valid: errors.length === 0, ready_for_generation: errors.length === 0, errors, warnings };
}

/** Inclusive upper bounds: (0,3] => 1; (3,5] => 2; (5,10] => 3. */
export function maxCorePointsForDuration(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 10) return 0;
  return duration <= 3 ? 1 : duration <= 5 ? 2 : 3;
}

export function validateClipProductionSpec(
  input: unknown,
  context: ClipValidationContext = {}
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const fail = (code: string, message: string, path: string) => errors.push({ code, message, path });
  if (!record(input)) {
    fail("INVALID_CLIP_SPEC", "Clip production spec must be an object.", "clip");
    return result(errors, warnings);
  }
  for (const key of ["scene_id", "clip_id"] as const) {
    if (!nonempty(input[key])) fail("MISSING_REQUIRED_FIELD", `${key} is required.`, key);
  }
  const sceneIds = context.sceneIds ?? context.sceneTimings?.map(scene => scene.scene_id);
  if (nonempty(input.scene_id) && sceneIds && !sceneIds.includes(input.scene_id)) {
    fail("INVALID_SCENE_CLIP_RELATION", "Clip must belong to a scene in the current timing plan.", "scene_id");
  }
  for (const key of ["editorial_duration_sec", "narrative_deadline_sec", "target_state_deadline_sec",
    "start_handle_sec", "end_hold_sec", "safe_trim_start_sec"] as const) {
    if (!finite(input[key])) fail("MISSING_OR_INVALID_TIMING", `${key} must be a finite number.`, key);
    else if (input[key] < 0) fail("NEGATIVE_TIMING", `${key} cannot be negative.`, key);
  }
  const duration = input.editorial_duration_sec;
  const narrative = input.narrative_deadline_sec;
  const target = input.target_state_deadline_sec;
  if (finite(duration) && duration <= 0) fail("INVALID_EDITORIAL_DURATION", "Editorial duration must be positive.", "editorial_duration_sec");
  if (finite(duration) && duration > 10) fail("CLIP_SPLIT_REQUIRED", "Clips longer than 10 seconds require splitting before generation.", "editorial_duration_sec");
  if (finite(duration) && duration > 8 && duration <= 10) warnings.push({ code: "BEAT_SPLIT_RECOMMENDED", message: "Consider splitting this 8–10 second clip into beats.", path: "editorial_duration_sec" });
  if (input.generation_duration_sec !== undefined && input.generation_duration_sec !== null) {
    if (!finite(input.generation_duration_sec) || input.generation_duration_sec <= 0) fail("INVALID_GENERATION_DURATION", "Generation duration must be null or a positive finite number.", "generation_duration_sec");
    else if (finite(duration) && input.generation_duration_sec < duration) fail("GENERATION_DURATION_TOO_SHORT", "Generated footage cannot be shorter than editorial duration.", "generation_duration_sec");
  }
  if (finite(duration)) {
    if (finite(narrative) && narrative >= duration) fail("NARRATIVE_DEADLINE_OUT_OF_RANGE", "Narrative deadline must precede editorial end.", "narrative_deadline_sec");
    if (finite(target) && target >= duration) fail("TARGET_STATE_DEADLINE_OUT_OF_RANGE", "Target state deadline must precede editorial end.", "target_state_deadline_sec");
    if (finite(input.safe_trim_start_sec) && input.safe_trim_start_sec < duration) fail("UNSAFE_TRIM_START", "Safe trim start cannot precede editorial end.", "safe_trim_start_sec");
    if (finite(input.start_handle_sec) && input.start_handle_sec >= duration) fail("INVALID_START_HANDLE", "Start handle must end before editorial end.", "start_handle_sec");
    if (finite(target) && finite(input.end_hold_sec) && input.end_hold_sec > duration - target + EPSILON) fail("END_HOLD_OVERLAPS_TARGET_STATE", "Final hold cannot begin before the target state deadline.", "end_hold_sec");
  }
  if (finite(narrative) && finite(target) && narrative > target) fail("INVALID_DEADLINE_ORDER", "Narrative deadline must not follow target state deadline.", "narrative_deadline_sec");
  const points = input.mandatory_core_points;
  if (!Array.isArray(points) || points.length === 0) {
    fail("MISSING_MANDATORY_CORE_POINT", "At least one mandatory core point is required.", "mandatory_core_points");
  } else {
    if (finite(duration) && duration > 0 && duration <= 10 && points.length > maxCorePointsForDuration(duration)) {
      fail("CORE_POINT_OVERLOAD", `${duration} sec clip allows at most ${maxCorePointsForDuration(duration)} primary core points.`, "mandatory_core_points");
    }
    const ids = new Set<string>();
    const windows: { start: number; end: number; index: number }[] = [];
    points.forEach((point: unknown, index: number) => {
      const path = `mandatory_core_points[${index}]`;
      if (!record(point)) { fail("INVALID_CORE_POINT", "Core point must be an object.", path); return; }
      if (!nonempty(point.id)) fail("MISSING_REQUIRED_FIELD", "Core point id is required.", `${path}.id`);
      else if (ids.has(point.id)) fail("DUPLICATE_CORE_POINT_ID", "Core point ids must be unique within a clip.", `${path}.id`);
      else ids.add(point.id);
      if (!nonempty(point.description_ko) && !nonempty(point.description_en)) fail("MISSING_CORE_POINT_DESCRIPTION", "Core point needs a Korean or English description.", path);
      const start = point.window_start_sec;
      const end = point.window_end_sec;
      if (!finite(start) || !finite(end)) fail("INVALID_CORE_POINT_WINDOW", "Core point window needs finite start and end times.", path);
      else {
        if (start < 0 || end < 0) fail("NEGATIVE_TIMING", "Core point times cannot be negative.", path);
        if (start >= end) fail("INVALID_CORE_POINT_WINDOW", "Core point window start must precede its end.", path);
        if (finite(duration) && (end > duration || start >= duration)) fail("CORE_POINT_OUTSIDE_EDITORIAL_DURATION", "Core point window exceeds editorial duration.", path);
        if (finite(narrative) && end > narrative) fail("CORE_POINT_AFTER_NARRATIVE_DEADLINE", "Every mandatory core point must finish by the narrative deadline.", path);
        if (finite(input.start_handle_sec) && start < input.start_handle_sec) fail("CORE_POINT_OVERLAPS_START_HANDLE", "Core point cannot begin inside the start handle.", path);
        windows.push({ start, end, index });
      }
    });
    windows.sort((a, b) => a.start - b.start);
    let latestEnd = -Infinity;
    for (const window of windows) {
      if (window.start < latestEnd) fail("CORE_POINT_WINDOW_OVERLAP", "Mandatory core point windows must not overlap.", `mandatory_core_points[${window.index}]`);
      latestEnd = Math.max(latestEnd, window.end);
    }
  }
  const camera = record(input.camera) ? input.camera : {};
  const cameraFields = {
    purpose: CAMERA_PURPOSES, movement: CAMERA_MOVEMENTS, shot_size_start: SHOT_SIZES,
    shot_size_end: SHOT_SIZES, movement_curve: MOVEMENT_CURVES
  };
  for (const [key, allowed] of Object.entries(cameraFields)) {
    if (!nonempty(camera[key])) fail("MISSING_CAMERA_FIELD", `Camera ${key} is required.`, `camera.${key}`);
    else if (!(allowed as readonly string[]).includes(camera[key] as string)) fail("INVALID_CAMERA_FIELD", `Unsupported camera ${key}.`, `camera.${key}`);
  }
  const states = record(input.state_images) ? input.state_images : {};
  for (const key of ["entry", "target"] as const) {
    if (!nonempty(states[key])) fail("MISSING_STATE_IMAGE", `${key} state image identifier is required.`, `state_images.${key}`);
  }
  if (states.mid !== undefined && states.mid !== null && !nonempty(states.mid)) fail("INVALID_STATE_IMAGE", "Mid state must be null or a nonempty image identifier.", "state_images.mid");
  for (const key of ["transition_in", "transition_out"] as const) {
    if (input[key] !== undefined && !nonempty(input[key])) fail("INVALID_TRANSITION", `${key} must be a nonempty string when supplied.`, key);
  }
  return result(errors, warnings);
}

export function validateClipProductionSpecs(input: unknown, context: ClipValidationContext = {}): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const fail = (code: string, message: string, path: string) => errors.push({ code, message, path });
  const clips = record(input) ? input.clips : input;
  if (record(input)) {
    if (input.schema_version !== "1.0") fail("INVALID_SCHEMA_VERSION", "Clip production schema_version must be 1.0.", "schema_version");
    if (!nonempty(input.project_id)) fail("MISSING_PROJECT_ID", "Clip production project_id is required.", "project_id");
  }
  if (!Array.isArray(clips) || clips.length === 0) {
    fail("MISSING_CLIP_PRODUCTION_SPEC", "At least one clip production spec is required.", "clips");
    return result(errors, warnings);
  }
  const ids = new Set<string>();
  const durations = new Map<string, number>();
  clips.forEach((clip: unknown, index: number) => {
    const checked = validateClipProductionSpec(clip, context);
    const prefix = (issue: ValidationIssue): ValidationIssue => ({ ...issue, path: `clips[${index}]${issue.path ? `.${issue.path}` : ""}` });
    errors.push(...checked.errors.map(prefix));
    warnings.push(...checked.warnings.map(prefix));
    if (!record(clip)) return;
    if (nonempty(clip.clip_id)) {
      if (ids.has(clip.clip_id)) fail("DUPLICATE_CLIP_ID", "Clip ids must be unique within a project.", `clips[${index}].clip_id`);
      ids.add(clip.clip_id);
    }
    if (nonempty(clip.scene_id) && finite(clip.editorial_duration_sec)) durations.set(clip.scene_id, (durations.get(clip.scene_id) ?? 0) + clip.editorial_duration_sec);
  });
  for (const scene of context.sceneTimings ?? []) {
    if (!scene.tts || !finite(scene.tts.duration_sec) || scene.tts.duration_sec <= 0) {
      fail("ACTUAL_TTS_REQUIRED", `Scene ${scene.scene_id} needs actual TTS timing before clip production.`, `scenes.${scene.scene_id}.tts`);
      continue;
    }
    const duration = durations.get(scene.scene_id);
    if (duration === undefined) fail("SCENE_CLIP_REQUIRED", `Scene ${scene.scene_id} has no clip production plan.`, "clips");
    else if (Math.abs(duration - scene.tts.duration_sec) > CLIP_TTS_DURATION_TOLERANCE_SEC + EPSILON) fail("CLIP_TTS_DURATION_MISMATCH", `Scene ${scene.scene_id} clip duration ${duration} sec does not cover actual TTS ${scene.tts.duration_sec} sec.`, "clips");
  }
  return result(errors, warnings);
}
