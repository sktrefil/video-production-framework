import type { ProductionFormat } from "./enums.js";

/** Portable exchange contract; canonical revisions and approvals live in project.db. */
export interface ProjectSpec {
  schema_version: "1.0";
  project_id: string;
  format: ProductionFormat;
  target_duration_sec: number;
  resolution: { width: number; height: number };
  language: string;
  generation_policy: {
    image_engine: "chatgpt";
    video_engine: string;
    supported_video_engines: string[];
  };
  workflow: {
    agent1_manager_required: true;
    story_gate_required: true;
    visual_gate_required: true;
    clip_gate_required: true;
    final_gate_required: true;
  };
}

export interface CreateProjectSpecInput {
  project_id: string;
  format: ProductionFormat;
  target_duration_sec: number;
  resolution?: { width: number; height: number };
  language?: string;
}

/** Creates a draft, never a production approval. Validate before persisting. */
export function createProjectSpec(input: CreateProjectSpecInput): ProjectSpec {
  return {
    schema_version: "1.0",
    project_id: input.project_id,
    format: input.format,
    target_duration_sec: input.target_duration_sec,
    resolution: input.resolution ? { ...input.resolution } : input.format === "LONGFORM"
      ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 },
    language: input.language ?? "ko",
    generation_policy: {
      image_engine: "chatgpt", video_engine: "UNDECIDED", supported_video_engines: ["GEMINI", "FLOW"]
    },
    workflow: {
      agent1_manager_required: true, story_gate_required: true, visual_gate_required: true,
      clip_gate_required: true, final_gate_required: true
    }
  };
}
