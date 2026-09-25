import {
  CAMERA_MOVEMENTS,
  CAMERA_PURPOSES,
  MOVEMENT_CURVES,
  SHOT_SIZES,
  STORY_ROLES
} from "@vpf/production-spec";
import {
  FANTASY_MODES,
  STATE_IMAGE_ROLES,
  VISUAL_FACTUALITY_MODES
} from "@vpf/production-spec";

const strings = {
  type: "array",
  items: { type: "string" }
} as const;

const TRANSITIONS = [
  "HARD_CUT",
  "MATCH_CUT",
  "MOTION_MATCH",
  "GRAPHIC_MATCH",
  "FOREGROUND_WIPE",
  "ENVIRONMENT_OCCLUSION",
  "LIGHT_TRANSITION",
  "STATIC_BREAK"
] as const;

export const AGENT3_SCENE_VISUAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "project_id", "visual_bible", "scenes"],
  properties: {
    schema_version: { type: "string", enum: ["1.0"] },
    project_id: { type: "string" },
    visual_bible: {
      type: "object",
      additionalProperties: false,
      required: ["resource_id", "version", "content_hash"],
      properties: {
        resource_id: { type: "string" },
        version: { type: "string" },
        content_hash: { type: "string" }
      }
    },
    scenes: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "scene_id", "story_role", "factuality_mode", "fantasy_mode", "fact_refs",
          "narrative_purpose_ko", "narrative_purpose_en",
          "visual_intent_ko", "visual_intent_en",
          "environment_ko", "environment_en",
          "subject_ko", "subject_en",
          "action_ko", "action_en",
          "evidence_constraints",
          "uncertainty_handling_ko", "uncertainty_handling_en",
          "forbidden_visual_claims",
          "continuity", "handoff"
        ],
        properties: {
          scene_id: { type: "string" },
          story_role: { type: "string", enum: STORY_ROLES },
          factuality_mode: { type: "string", enum: VISUAL_FACTUALITY_MODES },
          fantasy_mode: { type: "string", enum: FANTASY_MODES },
          fact_refs: strings,
          narrative_purpose_ko: { type: "string" },
          narrative_purpose_en: { type: "string" },
          visual_intent_ko: { type: "string" },
          visual_intent_en: { type: "string" },
          environment_ko: { type: "string" },
          environment_en: { type: "string" },
          subject_ko: { type: "string" },
          subject_en: { type: "string" },
          action_ko: { type: "string" },
          action_en: { type: "string" },
          evidence_constraints: strings,
          uncertainty_handling_ko: { type: "string" },
          uncertainty_handling_en: { type: "string" },
          forbidden_visual_claims: {
            type: "array",
            minItems: 1,
            items: { type: "string" }
          },
          continuity: {
            type: "object",
            additionalProperties: false,
            required: [
              "character_identity", "environment_identity",
              "lighting_direction", "color_language", "weather",
              "movement_direction", "screen_direction", "camera_energy",
              "visual_motif"
            ],
            properties: {
              character_identity: strings,
              environment_identity: {
                type: "array",
                minItems: 1,
                items: { type: "string" }
              },
              lighting_direction: { type: "string" },
              color_language: { type: "string" },
              weather: { type: "string" },
              movement_direction: { type: "string" },
              screen_direction: {
                type: "string",
                enum: [
                  "LEFT_TO_RIGHT", "RIGHT_TO_LEFT",
                  "TOWARD_CAMERA", "AWAY_FROM_CAMERA", "NEUTRAL"
                ]
              },
              camera_energy: {
                type: "string",
                enum: ["STATIC", "RESTRAINED", "ACTIVE"]
              },
              visual_motif: strings
            }
          },
          handoff: {
            type: "object",
            additionalProperties: false,
            required: [
              "entry_anchor", "exit_anchor",
              "preserve_elements", "next_cut_intent"
            ],
            properties: {
              entry_anchor: { type: "string" },
              exit_anchor: { type: "string" },
              preserve_elements: {
                type: "array",
                minItems: 2,
                maxItems: 4,
                items: { type: "string" }
              },
              next_cut_intent: { type: "string" }
            }
          }
        }
      }
    }
  }
} as const;

export const AGENT3_STATE_IMAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "project_id", "state_images"],
  properties: {
    schema_version: { type: "string", enum: ["1.0"] },
    project_id: { type: "string" },
    state_images: {
      type: "array",
      minItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "state_image_id", "scene_id", "beat_id", "role", "sequence_order",
          "visual_goal_ko", "visual_goal_en",
          "composition_ko", "composition_en",
          "subject_state_ko", "subject_state_en",
          "environment_state_ko", "environment_state_en",
          "motion_vector_ko", "motion_vector_en",
          "handoff_anchor", "continuity_refs",
          "factual_constraints", "avoidances"
        ],
        properties: {
          state_image_id: { type: "string" },
          scene_id: { type: "string" },
          beat_id: {
            anyOf: [
              { type: "string" },
              { type: "null" }
            ]
          },
          role: { type: "string", enum: STATE_IMAGE_ROLES },
          sequence_order: { type: "integer", minimum: 1 },
          visual_goal_ko: { type: "string" },
          visual_goal_en: { type: "string" },
          composition_ko: { type: "string" },
          composition_en: { type: "string" },
          subject_state_ko: { type: "string" },
          subject_state_en: { type: "string" },
          environment_state_ko: { type: "string" },
          environment_state_en: { type: "string" },
          motion_vector_ko: { type: "string" },
          motion_vector_en: { type: "string" },
          handoff_anchor: { type: "string" },
          continuity_refs: {
            type: "array",
            minItems: 1,
            items: { type: "string" }
          },
          factual_constraints: strings,
          avoidances: {
            type: "array",
            minItems: 1,
            items: { type: "string" }
          }
        }
      }
    }
  }
} as const;

export const AGENT3_CLIP_CAMERA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "project_id", "clip_production_spec"],
  properties: {
    schema_version: { type: "string", enum: ["1.0"] },
    project_id: { type: "string" },
    clip_production_spec: {
      type: "object",
      additionalProperties: false,
      required: ["schema_version", "project_id", "clips"],
      properties: {
        schema_version: { type: "string", enum: ["1.0"] },
        project_id: { type: "string" },
        clips: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "scene_id", "clip_id",
              "editorial_duration_sec", "generation_duration_sec",
              "mandatory_core_points",
              "narrative_deadline_sec", "target_state_deadline_sec",
              "start_handle_sec", "end_hold_sec", "safe_trim_start_sec",
              "camera", "state_images",
              "transition_in", "transition_out"
            ],
            properties: {
              scene_id: { type: "string" },
              clip_id: { type: "string" },
              editorial_duration_sec: {
                type: "number",
                exclusiveMinimum: 0,
                maximum: 10
              },
              generation_duration_sec: {
                anyOf: [
                  { type: "number", exclusiveMinimum: 0 },
                  { type: "null" }
                ]
              },
              mandatory_core_points: {
                type: "array",
                minItems: 1,
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "id", "description_ko", "description_en",
                    "window_start_sec", "window_end_sec"
                  ],
                  properties: {
                    id: { type: "string" },
                    description_ko: { type: "string" },
                    description_en: { type: "string" },
                    window_start_sec: { type: "number", minimum: 0 },
                    window_end_sec: { type: "number", exclusiveMinimum: 0 }
                  }
                }
              },
              narrative_deadline_sec: { type: "number", exclusiveMinimum: 0 },
              target_state_deadline_sec: { type: "number", exclusiveMinimum: 0 },
              start_handle_sec: { type: "number", minimum: 0 },
              end_hold_sec: { type: "number", minimum: 0 },
              safe_trim_start_sec: { type: "number", exclusiveMinimum: 0 },
              camera: {
                type: "object",
                additionalProperties: false,
                required: [
                  "purpose", "movement",
                  "shot_size_start", "shot_size_end",
                  "movement_curve"
                ],
                properties: {
                  purpose: { type: "string", enum: CAMERA_PURPOSES },
                  movement: { type: "string", enum: CAMERA_MOVEMENTS },
                  shot_size_start: { type: "string", enum: SHOT_SIZES },
                  shot_size_end: { type: "string", enum: SHOT_SIZES },
                  movement_curve: { type: "string", enum: MOVEMENT_CURVES }
                }
              },
              state_images: {
                type: "object",
                additionalProperties: false,
                required: ["entry", "mid", "target"],
                properties: {
                  entry: { type: "string" },
                  mid: {
                    anyOf: [
                      { type: "string" },
                      { type: "null" }
                    ]
                  },
                  target: { type: "string" }
                }
              },
              transition_in: { type: "string", enum: TRANSITIONS },
              transition_out: { type: "string", enum: TRANSITIONS }
            }
          }
        }
      }
    }
  }
} as const;
