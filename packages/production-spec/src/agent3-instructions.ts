import { DIRECTING_V2_RULES } from "./directing.js";
export interface Agent3TaskInstruction {
  instruction_id: string;
  task_id: "T025" | "T040" | "T050" | "T060";
  purpose: string;
  rules: string[];
  required_outputs: string[];
}

export const AGENT3_TASK_INSTRUCTIONS: Record<"T025" | "T040" | "T050" | "T060", Agent3TaskInstruction> = {
  T025: {
    instruction_id: "PRE_TTS_VISUAL_DEVELOPMENT_V1",
    task_id: "T025",
    purpose: "Develop visual structure and directing for the approved script before final TTS timing.",
    rules: [
      "Preserve approved story scene and beat IDs, order, facts and script meaning.",
      "Provide a visual plan, beat treatment and directing direction without assigning precise shot seconds.",
      "Use the pinned Visual Bible. For HISTORY_MYSTERY, pre_tts_visual_direction_spec.style_direction MUST contain the exact literal token NON_REALISTIC_STYLIZED; recommended form: \"NON_REALISTIC_STYLIZED — <specific style description>\".",
      "For HISTORY_MYSTERY, descriptive synonyms such as non-realistic, stylized or illustrative are not substitutes for the exact NON_REALISTIC_STYLIZED token. Preserve visibly non-photorealistic, evidence-first visual language, expressive camera motion and no photoreal reenactment.",
      "Mark uncertainty through silhouette, abstraction or symbolic space; do not invent factual details.",
      "T030 measures narration and timing; T040 refines this direction against those measurements."
    ],
    required_outputs: ["pre_tts_visual_plan", "pre_tts_visual_beat_spec", "pre_tts_visual_direction_spec"]
  },
  T040: {
    instruction_id: "VISUAL_SCENE_PLAN_V1",
    task_id: "T040",
    purpose: "Translate approved Scene Timing into scene-level visual intent, uncertainty handling and continuity contracts.",
    rules: [
      "In Workflow v1.3, preserve T025 visual plan, beat order and directing intent while refining against measured TTS and Scene Timing.",
      "Inherit the pinned Channel Visual Bible; do not invent a replacement show style.",
      "Fantasy reconstruction is allowed only when factuality mode and editorial role are explicit.",
      "Scene Visual fact_refs must exactly match the approved Story Scene fact_refs.",
      "VERIFIED_FACT may use EVIDENCE or HISTORICAL_RECONSTRUCTION; HYPOTHESIS, LEGEND and EDITORIAL_RECONSTRUCTION must keep their corresponding reconstruction modes.",
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
      "Every Scene requires exactly one ENTRY and one TARGET design state; MID is optional. These are design descriptions, not a requirement to generate every state as an image file.",
      "State Images are video-ready keyframes, not posters.",
      "Each State needs depth, a continuable motion vector, physical integrity and a handoff anchor.",
      "A Scene longer than 10 seconds of measured TTS must contain enough sequential states to support multiple Clips of at most 10 seconds.",
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
      ...DIRECTING_V2_RULES.map(rule => "LONGFORM v2 only: " + rule),
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

export function getAgent3TaskInstruction(taskId: "T025" | "T040" | "T050" | "T060"): Agent3TaskInstruction {
  return structuredClone(AGENT3_TASK_INSTRUCTIONS[taskId]);
}
