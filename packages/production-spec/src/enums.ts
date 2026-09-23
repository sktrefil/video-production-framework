export const PRODUCTION_FORMATS = ["SHORTS", "LONGFORM"] as const;
export type ProductionFormat = typeof PRODUCTION_FORMATS[number];

export const STORY_ROLES = [
  "HOOK", "IDENTIFY", "EVIDENCE", "EXTEND", "BREAK", "HYPOTHESIS",
  "UNCERTAINTY", "CLOSING", "CLOSING_QUESTION", "OTHER"
] as const;
export type StoryRole = typeof STORY_ROLES[number];

export const CAMERA_PURPOSES = [
  "FOLLOW", "REVEAL", "DISCOVER", "APPROACH", "OBSERVE", "WITHDRAW",
  "SEARCH", "IMPACT", "LOSE_SIGHT", "STATIC"
] as const;
export type CameraPurpose = typeof CAMERA_PURPOSES[number];

export const CAMERA_MOVEMENTS = [
  "LOCKED", "SLOW_PUSH", "SLOW_PULL_BACK", "LATERAL_TRACK", "SUBTLE_CRANE",
  "FOREGROUND_REVEAL", "SUBJECT_FOLLOW", "STATIC_HOLD", "LATERAL_TRACK_WITH_SUBTLE_PUSH"
] as const;
export type CameraMovement = typeof CAMERA_MOVEMENTS[number];

export const SHOT_SIZES = ["EXTREME_WIDE", "WIDE", "MEDIUM_WIDE", "MEDIUM", "CLOSE", "CLOSE_DETAIL", "INSERT"] as const;
export type ShotSize = typeof SHOT_SIZES[number];

export const MOVEMENT_CURVES = [
  "HOLD_MOVE_SETTLE", "SLOW_ACCELERATE_SETTLE", "STATIC_REVEAL_HOLD", "CONTINUOUS_CONTROLLED_MOVE"
] as const;
export type MovementCurve = typeof MOVEMENT_CURVES[number];

export const PRODUCTION_GATES = [
  "PROJECT_INIT_GATE", "STORY_AUDIO_GATE", "VISUAL_PLAN_GATE", "CLIP_PLAN_GATE",
  "GENERATION_READY_GATE", "FINAL_GATE"
] as const;
export type ProductionGate = typeof PRODUCTION_GATES[number];
