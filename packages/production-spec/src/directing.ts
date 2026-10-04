import type { ClipProductionDocument } from "./clip-production-spec.js";
import type { ValidationIssue } from "./project-validator.js";

export const DIRECTING_TEXT_FIELDS = [
  "story", "action", "space", "start", "subject_motion", "camera_path",
  "reveal", "end", "handoff", "locks", "risk", "fallback"
] as const;
export type BilingualDirection = { ko: string; en: string };
export type DirectingCard = Record<typeof DIRECTING_TEXT_FIELDS[number], BilingualDirection> & {
  version: "2";
  timeline_start_sec: number;
  timeline_end_sec: number;
  source_in_sec: number;
  source_out_sec: number;
  reveal_deadline_sec: number;
  image_mode: "START_ONLY" | "START_END" | "PREVIOUS_END_FRAME";
  previous_clip_id: string | null;
  continuation: BilingualDirection | null;
  reference_ids: string[];
  precision_physics_required: boolean;
};

const bilingual = {
  type: "object", additionalProperties: false, required: ["ko", "en"],
  properties: { ko: { type: "string", minLength: 1 }, en: { type: "string", minLength: 1 } }
} as const;
export const DIRECTING_CARD_SCHEMA = {
  type: "object", additionalProperties: false,
  required: [...DIRECTING_TEXT_FIELDS, "version", "timeline_start_sec", "timeline_end_sec",
    "source_in_sec", "source_out_sec", "reveal_deadline_sec", "image_mode", "previous_clip_id",
    "continuation", "reference_ids", "precision_physics_required"],
  properties: {
    ...Object.fromEntries(DIRECTING_TEXT_FIELDS.map(key => [key, bilingual])),
    version: { type: "string", enum: ["2"] },
    ...Object.fromEntries(["timeline_start_sec", "timeline_end_sec", "source_in_sec", "source_out_sec", "reveal_deadline_sec"]
      .map(key => [key, { type: "number", minimum: 0 }])),
    image_mode: { type: "string", enum: ["START_ONLY", "START_END", "PREVIOUS_END_FRAME"] },
    previous_clip_id: { anyOf: [{ type: "string" }, { type: "null" }] },
    continuation: { anyOf: [bilingual, { type: "null" }] },
    reference_ids: { type: "array", items: { type: "string" } },
    precision_physics_required: { type: "boolean" }
  }
};

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Structural checks complement, never replace, manager spatial/semantic review. */
export function validateDirectingCard(clip: Record<string, unknown>): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const fail = (code: string, message: string, path = "directing") => errors.push({ code, message, path });
  const d = clip.directing;
  if (!object(d)) { fail("DIRECTING_CARD_REQUIRED", "A v2 directing card is required."); return errors; }
  if (d.version !== "2") fail("DIRECTING_VERSION_INVALID", "Directing card version must be 2.");
  for (const field of DIRECTING_TEXT_FIELDS) {
    const value = d[field];
    if (!object(value) || !text(value.ko) || !text(value.en))
      fail("DIRECTING_BILINGUAL_REQUIRED", "Concrete Korean and equivalent English direction required: " + field, "directing." + field);
  }
  for (const field of ["timeline_start_sec", "timeline_end_sec", "source_in_sec", "source_out_sec", "reveal_deadline_sec"]) {
    if (!number(d[field]) || d[field] < 0) fail("DIRECTING_TIME_INVALID", "Finite nonnegative time required.", "directing." + field);
  }
  if (number(clip.editorial_duration_sec)) {
    for (const [start, end] of [[d.timeline_start_sec, d.timeline_end_sec], [d.source_in_sec, d.source_out_sec]]) {
      if (number(start) && number(end) && (end <= start || Math.abs(end - start - clip.editorial_duration_sec) > 0.01))
        fail("DIRECTING_RANGE_MISMATCH", "Timeline and source ranges must each equal editorial duration.");
    }
    if (!number(d.reveal_deadline_sec) || d.reveal_deadline_sec <= 0 || d.reveal_deadline_sec > Math.min(4, clip.editorial_duration_sec))
      fail("REVEAL_DEADLINE_INVALID", "Reveal must occur within 4 seconds of used footage, or within a shorter clip.");
  }
  if (!number(clip.generation_duration_sec) || !number(d.source_out_sec) || d.source_out_sec > clip.generation_duration_sec)
    fail("DIRECTING_GENERATION_RANGE_INVALID", "Choose the provider generation duration and keep the used range inside it.");
  if (clip.start_handle_sec !== 0) fail("DIRECTING_START_HOLD_FORBIDDEN", "Purposeful movement starts at used frame zero; trim any source handle.");
  const camera = object(clip.camera) ? clip.camera : {};
  if (["LOCKED", "STATIC_HOLD"].includes(String(camera.movement)) || camera.movement_curve !== "CONTINUOUS_CONTROLLED_MOVE")
    fail("DIRECTING_CAMERA_MOTION_REQUIRED", "Use one purposeful continuous camera movement from the start.");
  if (!["START_ONLY", "START_END", "PREVIOUS_END_FRAME"].includes(String(d.image_mode))) fail("DIRECTING_IMAGE_MODE_INVALID", "Select a supported image mode.");
  if (d.image_mode === "PREVIOUS_END_FRAME") {
    if (!text(d.previous_clip_id) || !object(d.continuation) || !text(d.continuation.ko) || !text(d.continuation.en))
      fail("CONTINUATION_REQUIRED", "Previous clip and bilingual direction, speed and action phase are required.");
  } else if (d.previous_clip_id !== null || d.continuation !== null) fail("UNEXPECTED_CONTINUATION", "Fresh angles must not claim previous-frame continuity.");
  if (!Array.isArray(d.reference_ids) || !d.reference_ids.every(text)) fail("REFERENCE_IDS_INVALID", "Provide reference IDs, or an empty list for a non-recurring setting.");
  if (d.precision_physics_required !== false) fail("PRECISION_PHYSICS_REDESIGN", "Replace core meaning dependent on precision contact, friction or weight transfer before production.");
  return errors;
}

/** End states always remain in the design; only necessary image files are generated. */
export function requiredImageStateIds(document: ClipProductionDocument): string[] {
  return [...new Set(document.clips.flatMap(clip => {
    if (!clip.directing) return [clip.state_images.entry, clip.state_images.mid, clip.state_images.target].filter((id): id is string => id !== null);
    return [clip.directing.image_mode === "PREVIOUS_END_FRAME" ? null : clip.state_images.entry,
      clip.directing.image_mode === "START_END" ? clip.state_images.target : null].filter((id): id is string => id !== null);
  }))];
}

export const DIRECTING_V2_RULES = [
  "For LONGFORM use directing guide v2: each Clip requires a bilingual directing card with version=2. SHORTS retains the existing contract.",
  "Design the complete action and camera path before extracting start/end compositions. T050 states are provisional design states, not generated image files; redesign them if the T060 path is impossible.",
  "One primary action, one camera move, one clear visual payoff; begin purposeful motion at used frame zero, start_handle_sec=0 and CONTINUOUS_CONTROLLED_MOVE. Avoid precision-contact-dependent meaning.",
  "Choose the reveal mechanism from the approved story: subject tracking, spatial entry, scale expansion, gaze transition, evidence comparison or another concrete progression. Do not turn every Clip into an occluder reveal, and do not invent spectacle to meet the timing target.",
  "Set reveal_deadline_sec to at most min(4, editorial_duration_sec), measured from source_in_sec. Longer clips continue with meaningful action/composition changes after the first reveal; do not force every clip to 3-4 seconds.",
  "Record global measured-TTS timeline start/end, actual provider generation duration, and source in/out separately. Cut on information/action/gaze, not punctuation. Recheck all timing when TTS changes.",
  "For LONGFORM choose generation_provider, generation_model and generation_duration_sec per Clip from the supplied video_generation_capabilities matrix. Never invent a provider/model/duration. The selected duration must contain source_out_sec and be one of that model's supported durations.",
  "In START and END specify camera position, height, facing, shot size, subject screen/world position and occlusion. SPACE specifies foreground/midground/background and traversable camera/subject paths. CAMERA_PATH specifies departure, arrival, direction coordinate system, speed and tracked subject, separately from SUBJECT_MOTION.",
  "END is always designed. START_ONLY generates only a start; START_END requires provider endpoint support; PREVIOUS_END_FRAME uses the adopted previous clip's used-range end frame and records previous_clip_id plus direction, speed and action phase in continuation. An angle-change cut gets a fresh start image.",
  "LOCKS and reference_ids pin identity, costume, props, spatial relationships and lighting without copying a static reference pose. Resolve reference/path conflicts before image generation.",
  "RISK and FALLBACK give concrete spatial/historical/physical risks and a replacement scene. After one clear correction repeats a structural failure, return to scene selection instead of endless regeneration.",
  "Korean and English fields must express identical direction; no extra English-only creative instructions. Camera pans/tilts rotate, trucks/dollies translate; zoom or rack focus cannot replace a translation path."
];

export function directingReturnStage(failure: "STORY" | "NO_REVEAL" | "SPACE" | "MOTION" | "RHYTHM"): string {
  return { STORY: "T020", NO_REVEAL: "T060", SPACE: "T050", MOTION: "T080", RHYTHM: "T090" }[failure];
}

export const DIRECTING_VIDEO_CHECKS = ["reveal", "camera_path", "action_progression", "physical_identity_continuity", "meaning", "used_range"] as const;
export interface DirectingVideoReview {
  clip_id: string;
  clip_sha256: string;
  directing_sha256: string;
  reviewed_by: "AGENT1_MANAGER";
  reviewed_at: string;
  observed_reveal_sec: number;
  observed_motion_start_sec: number;
  checks: Record<typeof DIRECTING_VIDEO_CHECKS[number], { status: "PASS" | "REVISE" | "NA"; evidence: string }>;
}

/** Actual footage evidence is required; file/duration checks alone cannot pass creative QC. */
export function validateDirectingVideoReview(value: unknown, expected: {
  clipId: string; clipSha256: string; directingSha256: string; card: DirectingCard;
}): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const fail = (message: string) => errors.push({ code: "DIRECTING_VIDEO_REVIEW_REQUIRED", path: "directing_review", message });
  if (!object(value)) { fail("An independent actual-footage review is required."); return errors; }
  if (value.clip_id !== expected.clipId || value.clip_sha256 !== expected.clipSha256 || value.directing_sha256 !== expected.directingSha256)
    fail("Review must bind the current clip bytes and directing card hashes.");
  if (value.reviewed_by !== "AGENT1_MANAGER" || !text(value.reviewed_at) || !Number.isFinite(Date.parse(value.reviewed_at))) fail("Dated manager review required.");
  if (!number(value.observed_reveal_sec) || value.observed_reveal_sec < 0 || value.observed_reveal_sec > expected.card.reveal_deadline_sec)
    fail("Observed reveal must meet the approved deadline measured from used-range start.");
  if (!number(value.observed_motion_start_sec) || value.observed_motion_start_sec < 0 || value.observed_motion_start_sec > 0.1)
    fail("Purposeful camera motion must be visible at the used-range start (0.1s observation tolerance).");
  for (const key of DIRECTING_VIDEO_CHECKS) {
    const check = object(value.checks) ? value.checks[key] : null;
    if (!object(check) || check.status !== "PASS" || !text(check.evidence)) fail("Critical check requires PASS with observed evidence: " + key);
  }
  return errors;
}
