export interface PreTtsVisualInput {
  schema_version: "1.0";
  project_id: string;
  pre_tts_visual_plan: {
    schema_version: "1.0";
    project_id: string;
    scenes: Array<{ scene_id: string; visual_intent: string; uncertainty_handling: string }>;
  };
  pre_tts_visual_beat_spec: {
    schema_version: "1.0";
    project_id: string;
    beats: Array<{ scene_id: string; beat_id: string; visual_action: string }>;
  };
  pre_tts_visual_direction_spec: {
    schema_version: "1.0";
    project_id: string;
    style_direction: string;
    camera_direction: string;
    continuity_direction: string;
  };
}

export function preTtsVisualMatchesStory(
  plan: unknown,
  beatSpec: unknown,
  story: { scenes: Array<{ scene_id: string; beats: Array<{ beat_id: string }> }> }
): boolean {
  const scenes = (plan as { scenes?: Array<{ scene_id?: string }> } | null)?.scenes;
  const beats = (beatSpec as { beats?: Array<{ scene_id?: string; beat_id?: string }> } | null)?.beats;
  return Array.isArray(scenes) && Array.isArray(beats) &&
    JSON.stringify(scenes.map(scene => scene.scene_id)) === JSON.stringify(story.scenes.map(scene => scene.scene_id)) &&
    JSON.stringify(beats.map(beat => beat.scene_id + ":" + beat.beat_id)) ===
      JSON.stringify(story.scenes.flatMap(scene => scene.beats.map(beat => scene.scene_id + ":" + beat.beat_id)));
}
