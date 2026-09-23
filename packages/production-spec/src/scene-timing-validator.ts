import { STORY_ROLES } from "./enums.js";
import { isRecord, isNonEmptyString, isFiniteNumber, type ValidationIssue, type ValidationResult } from "./project-validator.js";

export interface SceneTimingValidationOptions {
  /** Draft self-QC may allow missing audio; gate validation requires measured TTS. */
  requireActualTts?: boolean;
}

const EPSILON = 0.001;

export function validateSceneTimingSpec(input: unknown, options: SceneTimingValidationOptions = {}): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const issue = (code: string, path: string, message: string) => { errors.push({ code, path, message }); };
  if (!isRecord(input)) {
    issue("INVALID_SCENE_TIMING_SPEC", "", "Scene Timing Spec must be an object.");
    return { valid: false, ready_for_generation: false, errors, warnings };
  }
  if (!isNonEmptyString(input.scene_id)) issue("MISSING_SCENE_ID", "scene_id", "scene_id is required.");
  for (const key of ["script_ko", "script_en", "narrative_purpose_ko", "narrative_purpose_en"]) {
    if (typeof input[key] !== "string") issue("INVALID_STORY_TEXT", key, `${key} must be a string (unused translations may be empty).`);
  }
  if (!isNonEmptyString(input.script_ko) && !isNonEmptyString(input.script_en)) issue("MISSING_SCRIPT", "script_ko", "At least one script language must be populated.");
  if (!isNonEmptyString(input.narrative_purpose_ko) && !isNonEmptyString(input.narrative_purpose_en)) issue("MISSING_NARRATIVE_PURPOSE", "narrative_purpose_ko", "A narrative purpose is required.");
  if (!STORY_ROLES.includes(input.story_role as typeof STORY_ROLES[number])) issue("INVALID_STORY_ROLE", "story_role", "story_role must be a supported Story Role.");
  if (!isFiniteNumber(input.estimated_duration_sec) || input.estimated_duration_sec <= 0) issue("INVALID_ESTIMATED_DURATION", "estimated_duration_sec", "estimated_duration_sec must be finite and positive.");
  const tts = input.tts;
  if (tts == null) {
    const missing = { code: "ACTUAL_TTS_REQUIRED", path: "tts", message: "Actual TTS timing is required before clip planning; estimated duration is insufficient." };
    (options.requireActualTts === false ? warnings : errors).push(missing);
  } else if (!isRecord(tts)) {
    issue("INVALID_TTS_TIMING", "tts", "tts must be an object or null.");
  } else {
    for (const key of ["start_sec", "end_sec", "duration_sec"]) {
      if (!isFiniteNumber(tts[key]) || (tts[key] as number) < 0) issue("INVALID_TTS_TIMING", `tts.${key}`, `${key} must be finite and non-negative.`);
    }
    if (isFiniteNumber(tts.start_sec) && isFiniteNumber(tts.end_sec) && isFiniteNumber(tts.duration_sec)
      && (tts.end_sec <= tts.start_sec || tts.duration_sec <= 0 || Math.abs(tts.end_sec - tts.start_sec - tts.duration_sec) > EPSILON)) {
      issue("TTS_DURATION_MISMATCH", "tts.duration_sec", "Actual duration must be positive and match end_sec minus start_sec within 1 ms.");
    }
  }
  if (!Array.isArray(input.beats) || input.beats.length === 0) {
    issue("MISSING_BEATS", "beats", "At least one timed beat is required.");
  } else {
    const ids = new Set<string>();
    let previousEnd: number | undefined;
    input.beats.forEach((beat: unknown, index: number) => {
      const base = `beats[${index}]`;
      if (!isRecord(beat)) { issue("INVALID_BEAT", base, "Beat must be an object."); return; }
      if (!isNonEmptyString(beat.beat_id)) issue("MISSING_BEAT_ID", `${base}.beat_id`, "beat_id is required.");
      else if (ids.has(beat.beat_id)) issue("DUPLICATE_BEAT_ID", `${base}.beat_id`, "beat_id must be unique within a scene.");
      else ids.add(beat.beat_id);
      if (typeof beat.purpose_ko !== "string" || typeof beat.purpose_en !== "string"
        || (!isNonEmptyString(beat.purpose_ko) && !isNonEmptyString(beat.purpose_en))) issue("MISSING_BEAT_PURPOSE", base, "Beat purpose strings must include at least one populated language.");
      if (!isFiniteNumber(beat.start_sec) || !isFiniteNumber(beat.end_sec) || beat.start_sec < 0 || beat.end_sec <= beat.start_sec) {
        issue("INVALID_BEAT_TIMING", base, "Beat timing must be finite with 0 <= start_sec < end_sec.");
        return;
      }
      if (isRecord(tts) && isFiniteNumber(tts.start_sec) && isFiniteNumber(tts.end_sec)
        && (beat.start_sec < tts.start_sec - EPSILON || beat.end_sec > tts.end_sec + EPSILON)) issue("BEAT_OUTSIDE_TTS", base, "Beat timing must lie within the scene's actual global TTS interval.");
      if (previousEnd !== undefined && beat.start_sec < previousEnd - EPSILON) issue("BEAT_TIMING_OVERLAP", base, "Beats must be ordered without overlapping windows.");
      previousEnd = beat.end_sec;
    });
  }
  if (input.provenance !== undefined) {
    const p = input.provenance;
    if (!isRecord(p)) issue("INVALID_SCENE_PROVENANCE", "provenance", "provenance must be an object.");
    else {
      if (!isNonEmptyString(p.script_id)) issue("INVALID_SCENE_PROVENANCE", "provenance.script_id", "script_id is required when provenance is supplied.");
      for (const key of ["script_revision", "scene_revision"]) {
        if (!Number.isSafeInteger(p[key]) || (p[key] as number) < 1) issue("INVALID_SCENE_PROVENANCE", `provenance.${key}`, "Revision must be a positive integer.");
      }
      for (const key of ["script_sha256", "audio_sha256", "alignment_sha256"]) {
        if ((key === "script_sha256" || p[key] !== undefined) && (typeof p[key] !== "string" || !/^(sha256:)?[a-fA-F0-9]{64}$/.test(p[key] as string))) issue("INVALID_SCENE_PROVENANCE", `provenance.${key}`, "Expected a SHA256 content hash.");
      }
      for (const key of ["sequence_id", "tts_section_id"]) {
        if (p[key] !== undefined && !isNonEmptyString(p[key])) issue("INVALID_SCENE_PROVENANCE", `provenance.${key}`, "Source identifier must not be empty.");
      }
    }
  }
  return { valid: errors.length === 0, ready_for_generation: false, errors, warnings };
}

export function validateSceneTimingDocument(input: unknown, options: SceneTimingValidationOptions = {}): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (!isRecord(input)) return { valid: false, ready_for_generation: false, errors: [{ code: "INVALID_SCENE_TIMING_DOCUMENT", message: "Scene Timing document must be an object." }], warnings };
  if (input.schema_version !== "1.0") errors.push({ code: "UNSUPPORTED_SCHEMA_VERSION", path: "schema_version", message: "Scene Timing schema_version must be 1.0." });
  if (!isNonEmptyString(input.project_id)) errors.push({ code: "MISSING_PROJECT_ID", path: "project_id", message: "project_id is required." });
  if (!Array.isArray(input.scenes) || input.scenes.length === 0) errors.push({ code: "MISSING_SCENES", path: "scenes", message: "At least one scene is required." });
  else {
    const ids = new Set<string>();
    let previousEnd: number | undefined;
    input.scenes.forEach((scene: unknown, index: number) => {
      const result = validateSceneTimingSpec(scene, options);
      const prefix = (issue: ValidationIssue): ValidationIssue => ({ ...issue, path: `scenes[${index}]${issue.path ? `.${issue.path}` : ""}` });
      errors.push(...result.errors.map(prefix));
      warnings.push(...result.warnings.map(prefix));
      if (!isRecord(scene)) return;
      if (isNonEmptyString(scene.scene_id)) {
        if (ids.has(scene.scene_id)) errors.push({ code: "DUPLICATE_SCENE_ID", path: `scenes[${index}].scene_id`, message: "scene_id must be unique in the document." });
        ids.add(scene.scene_id);
      }
      if (isRecord(scene.tts) && isFiniteNumber(scene.tts.start_sec) && isFiniteNumber(scene.tts.end_sec)) {
        if (previousEnd !== undefined && scene.tts.start_sec < previousEnd - EPSILON) errors.push({ code: "SCENE_TTS_OVERLAP", path: `scenes[${index}].tts`, message: "Scenes must be ordered on the global narration timeline without overlapping TTS intervals." });
        previousEnd = scene.tts.end_sec;
      }
    });
  }
  return { valid: errors.length === 0, ready_for_generation: false, errors, warnings };
}
