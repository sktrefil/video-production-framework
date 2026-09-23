import type { CameraMovement, CameraPurpose, MovementCurve, ShotSize } from "./enums.js";

export interface MandatoryCorePoint {
  id: string;
  description_ko: string;
  description_en: string;
  /** Clip-local editorial time, never provider generation time. */
  window_start_sec: number;
  window_end_sec: number;
}

export interface ClipCameraDirection {
  purpose: CameraPurpose;
  movement: CameraMovement;
  shot_size_start: ShotSize;
  shot_size_end: ShotSize;
  movement_curve: MovementCurve;
}

export interface ClipStateImages {
  /** Planned image identifiers; these do not imply generated or approved media. */
  entry: string;
  mid: string | null;
  target: string;
}

export interface ClipProductionSpec {
  scene_id: string;
  clip_id: string;
  editorial_duration_sec: number;
  generation_duration_sec: number | null;
  mandatory_core_points: MandatoryCorePoint[];
  narrative_deadline_sec: number;
  target_state_deadline_sec: number;
  start_handle_sec: number;
  end_hold_sec: number;
  safe_trim_start_sec: number;
  camera: ClipCameraDirection;
  state_images: ClipStateImages;
  transition_in?: string;
  transition_out?: string;
  /** Informational only. Readiness must always be recomputed by validation and manager gates. */
  ready_for_generation?: boolean;
}

export interface ClipProductionDocument {
  schema_version: "1.0";
  project_id: string;
  clips: ClipProductionSpec[];
}

/** Agent3 authors plans; this port neither generates media nor grants approval. */
export interface ClipProductionAuthoringPort {
  createClipProductionSpec(input: {
    project_id: string;
    scene_id: string;
    actual_tts_duration_sec: number;
  }): Promise<ClipProductionSpec[]>;
}
