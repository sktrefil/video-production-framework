import type { StoryRole } from "./enums.js";

export interface SceneBeatTiming {
  beat_id: string;
  purpose_ko: string;
  purpose_en: string;
  /** Global narration timeline seconds, using the same clock as the scene's TTS. */
  start_sec: number;
  end_sec: number;
}

export interface SceneTtsTiming {
  start_sec: number;
  end_sec: number;
  duration_sec: number;
}

export interface SceneTimingSpec {
  scene_id: string;
  script_ko: string;
  script_en: string;
  story_role: StoryRole;
  narrative_purpose_ko: string;
  narrative_purpose_en: string;
  estimated_duration_sec: number;
  /** null is a story draft, which cannot pass the Story/Audio generation gate. */
  tts: SceneTtsTiming | null;
  beats: SceneBeatTiming[];
  /** Optional source links supplement canonical DB revision/hash lineage. */
  provenance?: {
    script_id: string;
    script_revision: number;
    script_sha256: string;
    scene_revision: number;
    sequence_id?: string;
    tts_section_id?: string;
    audio_sha256?: string;
    alignment_sha256?: string;
  };
}

export interface SceneTimingDocument {
  schema_version: "1.0";
  project_id: string;
  scenes: SceneTimingSpec[];
}

/** Worker port produces artifacts only; Agent1 owns canonical gate decisions. */
export interface Agent2StoryAudio {
  prepareSceneTimingSpec(input: {
    project_id: string;
    scenes: SceneTimingSpec[];
  }): Promise<SceneTimingDocument>;
}

export function createSceneTimingDocument(projectId: string, scenes: SceneTimingSpec[]): SceneTimingDocument {
  return { schema_version: "1.0", project_id: projectId, scenes: structuredClone(scenes) };
}

/** An estimate is deliberately never substituted for measured audio at clip planning. */
export function actualSceneDuration(scene: SceneTimingSpec): number | null {
  const timing = scene.tts;
  if (!timing || !Number.isFinite(timing.duration_sec) || timing.duration_sec <= 0
    || !Number.isFinite(timing.start_sec) || timing.start_sec < 0 || !Number.isFinite(timing.end_sec)
    || Math.abs(timing.end_sec - timing.start_sec - timing.duration_sec) > 0.001) return null;
  return timing.duration_sec;
}
