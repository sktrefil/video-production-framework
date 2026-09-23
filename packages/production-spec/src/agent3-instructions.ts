export interface Agent3TaskInstruction {
  instruction_id: string;
  task_id: "T040" | "T050" | "T060";
  purpose: string;
  rules: string[];
  required_outputs: string[];
}

export const AGENT3_TASK_INSTRUCTIONS: Record<"T040" | "T050" | "T060", Agent3TaskInstruction> = {
  T040: {
    instruction_id: "VISUAL_SCENE_PLAN_V1",
    task_id: "T040",
    purpose: "Translate approved Scene Timing into scene-level visual intent, uncertainty handling and continuity contracts.",
    rules: [
      "Inherit the pinned Channel Visual Bible; do not invent a replacement show style.",
      "Fantasy reconstruction is allowed only when factuality mode and editorial role are explicit.",
      "Do not turn record disappearance into literal magical disappearance.",
      "Each Scene has one continuity contract and one next-cut handoff contract.",
      "Generated readable historical text, unsupported inscriptions, maps, labels, heraldry and fabricated evidence are forbidden."
    ],
    required_outputs: ["scene_visual_spec"]
  },
  T050: {
    instruction_id: "STATE_IMAGE_PLAN_V1",
    task_id: "T050",
    purpose: "Plan the minimum video-ready visual states needed for each Scene and its clip handoffs.",
    rules: [
      "Every Scene requires exactly one ENTRY and one TARGET state; MID is optional.",
      "State Images are video-ready keyframes, not posters.",
      "Each State needs depth, a continuable motion vector, physical integrity and a handoff anchor.",
      "Do not create extra states merely for visual novelty.",
      "Preserve Scene continuity and factual constraints."
    ],
    required_outputs: ["state_image_spec"]
  },
  T060: {
    instruction_id: "CLIP_CAMERA_PLAN_V1",
    task_id: "T060",
    purpose: "Convert measured TTS timing and visual states into clip timing, camera direction, transitions and compiled prompts.",
    rules: [
      "Scene is not Clip; split a Scene when timing or state progression requires it.",
      "Clip durations must sum to measured Scene TTS duration.",
      "All mandatory core points finish by narrative deadline.",
      "Target state arrives before final hold; later footage is safe disposable continuation.",
      "Camera purpose, movement, shot sizes and movement curve are mandatory.",
      "Avoid repetitive camera and transition patterns.",
      "Compile timing, state, camera, continuity and factual constraints into provider-ready prompts."
    ],
    required_outputs: ["clip_production_spec", "prompt_bundle_spec"]
  }
};

export function getAgent3TaskInstruction(taskId: "T040" | "T050" | "T060"): Agent3TaskInstruction {
  return structuredClone(AGENT3_TASK_INSTRUCTIONS[taskId]);
}
