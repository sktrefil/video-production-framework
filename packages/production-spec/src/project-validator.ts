import { PRODUCTION_FORMATS } from "./enums.js";

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface ValidationResult {
  valid: boolean;
  ready_for_generation: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateProjectSpec(input: unknown): ValidationResult {
  const errors: ValidationIssue[] = [];
  const issue = (code: string, path: string, message: string) => { errors.push({ code, path, message }); };
  if (!isRecord(input)) {
    issue("INVALID_PROJECT_SPEC", "", "Project Spec must be an object.");
    return { valid: false, ready_for_generation: false, errors, warnings: [] };
  }
  if (input.schema_version !== "1.0") issue("UNSUPPORTED_SCHEMA_VERSION", "schema_version", "Project Spec schema_version must be 1.0.");
  if (!isNonEmptyString(input.project_id) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(input.project_id)) {
    issue("INVALID_PROJECT_ID", "project_id", "project_id must contain only letters, digits, underscores, or hyphens and start with a letter or digit.");
  }
  if (
    input.topic !== undefined &&
    (!isNonEmptyString(input.topic) || input.topic.length > 500)
  ) {
    issue(
      "INVALID_PROJECT_TOPIC",
      "topic",
      "topic must be a non-empty string up to 500 characters when provided."
    );
  }
  if (!PRODUCTION_FORMATS.includes(input.format as typeof PRODUCTION_FORMATS[number])) {
    issue("INVALID_FORMAT", "format", "Production Spec format must be SHORTS or LONGFORM.");
  }
  if (!isFiniteNumber(input.target_duration_sec) || input.target_duration_sec <= 0) {
    issue("INVALID_TARGET_DURATION", "target_duration_sec", "target_duration_sec must be a finite positive number.");
  }
  if (!isRecord(input.resolution) || !Number.isSafeInteger(input.resolution.width) || !Number.isSafeInteger(input.resolution.height)
    || (input.resolution.width as number) <= 0 || (input.resolution.height as number) <= 0) {
    issue("INVALID_RESOLUTION", "resolution", "Resolution must have positive integer width and height.");
  } else if (input.format === "LONGFORM" && (input.resolution.width !== 1920 || input.resolution.height !== 1080)) {
    issue("INVALID_LONGFORM_RESOLUTION", "resolution", "LONGFORM canonical delivery resolution is 1920x1080 (16:9).");
  }
  if (!isNonEmptyString(input.language)) issue("MISSING_LANGUAGE", "language", "language is required.");
  const policy = input.generation_policy;
  if (!isRecord(policy)) {
    issue("MISSING_GENERATION_POLICY", "generation_policy", "generation_policy is required.");
  } else {
    if (policy.image_engine !== "chatgpt") issue("INVALID_IMAGE_ENGINE", "generation_policy.image_engine", "Image production uses the ChatGPT prompt/reference workflow.");
    const supported = policy.supported_video_engines;
    if (!Array.isArray(supported) || supported.length === 0 || supported.some(v => !isNonEmptyString(v) || v === "UNDECIDED")
      || new Set(supported).size !== supported.length) {
      issue("INVALID_SUPPORTED_VIDEO_ENGINES", "generation_policy.supported_video_engines", "supported_video_engines must list unique non-empty engine identifiers.");
    }
    if (!isNonEmptyString(policy.video_engine) || (policy.video_engine !== "UNDECIDED"
      && (!Array.isArray(supported) || !supported.includes(policy.video_engine)))) {
      issue("INVALID_VIDEO_ENGINE", "generation_policy.video_engine", "video_engine must be UNDECIDED or a supported engine.");
    }
  }
  for (const key of ["agent1_manager_required", "story_gate_required", "visual_gate_required", "clip_gate_required", "final_gate_required"]) {
    if (!isRecord(input.workflow) || input.workflow[key] !== true) {
      issue("REQUIRED_GATE_DISABLED", `workflow.${key}`, `${key} must be true; production gates cannot be disabled by a spec.`);
    }
  }
  return { valid: errors.length === 0, ready_for_generation: false, errors, warnings: [] };
}
