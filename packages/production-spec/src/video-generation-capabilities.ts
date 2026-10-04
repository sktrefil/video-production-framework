export const VIDEO_GENERATION_PROVIDERS = ["GEMINI", "GOOGLE_FLOW"] as const;
export type VideoGenerationProvider = typeof VIDEO_GENERATION_PROVIDERS[number];

export const VIDEO_GENERATION_MODELS = [
  "GEMINI_I2V_10S",
  "VEO_3_1_LITE",
  "VEO_3_1_FAST",
  "VEO_3_1_QUALITY",
  "GEMINI_OMNI_FLASH"
] as const;
export type VideoGenerationModel = typeof VIDEO_GENERATION_MODELS[number];

export const VIDEO_GENERATION_IMAGE_MODES = [
  "START_ONLY",
  "START_END",
  "PREVIOUS_END_FRAME"
] as const;
export type VideoGenerationImageMode = typeof VIDEO_GENERATION_IMAGE_MODES[number];

export interface VideoGenerationCapability {
  provider: VideoGenerationProvider;
  model: VideoGenerationModel;
  supported_durations_sec: readonly number[];
  image_modes: readonly VideoGenerationImageMode[];
  selection_note: string;
}

export const VIDEO_GENERATION_CAPABILITIES: readonly VideoGenerationCapability[] = [
  {
    provider: "GEMINI",
    model: "GEMINI_I2V_10S",
    supported_durations_sec: [10],
    image_modes: ["START_ONLY", "PREVIOUS_END_FRAME"],
    selection_note: "Direct Gemini I2V workflow; fixed 10-second generation."
  },
  {
    provider: "GOOGLE_FLOW",
    model: "VEO_3_1_LITE",
    supported_durations_sec: [4, 6, 8],
    image_modes: ["START_ONLY", "START_END", "PREVIOUS_END_FRAME"],
    selection_note: "Google Flow Veo 3.1 Lite; selectable 4/6/8-second generation."
  },
  {
    provider: "GOOGLE_FLOW",
    model: "VEO_3_1_FAST",
    supported_durations_sec: [4, 6, 8],
    image_modes: ["START_ONLY", "START_END", "PREVIOUS_END_FRAME"],
    selection_note: "Google Flow Veo 3.1 Fast; selectable 4/6/8-second generation."
  },
  {
    provider: "GOOGLE_FLOW",
    model: "VEO_3_1_QUALITY",
    supported_durations_sec: [4, 6, 8],
    image_modes: ["START_ONLY", "START_END", "PREVIOUS_END_FRAME"],
    selection_note: "Google Flow Veo 3.1 Quality; selectable 4/6/8-second generation."
  },
  {
    provider: "GOOGLE_FLOW",
    model: "GEMINI_OMNI_FLASH",
    supported_durations_sec: [4, 6, 8, 10],
    image_modes: ["START_ONLY", "START_END", "PREVIOUS_END_FRAME"],
    selection_note: "Google Flow Gemini Omni Flash; selectable 4/6/8/10-second generation."
  }
] as const;

export function resolveVideoGenerationCapability(
  provider: unknown,
  model: unknown
): VideoGenerationCapability | null {
  if (typeof provider !== "string" || typeof model !== "string") return null;
  return VIDEO_GENERATION_CAPABILITIES.find(
    item => item.provider === provider && item.model === model
  ) ?? null;
}

export function videoGenerationCapabilitiesForT060(): VideoGenerationCapability[] {
  return VIDEO_GENERATION_CAPABILITIES.map(item => ({
    ...item,
    supported_durations_sec: [...item.supported_durations_sec],
    image_modes: [...item.image_modes]
  }));
}
