# Render Polish Job Template

```yaml
render_polish_job_id: ""
image_job_id: ""
workflow_mode: LEGACY | INTEGRATED
style_mode: NON_REALISTIC_STYLIZED
script_directing_lock_id: ""
visual_beat_lock_id: ""

polish_strength: LIGHT | STANDARD | STRONG

locked_snapshot_before:
  script_directing_lock_id: ""
  visual_beat_lock_id: ""
  fact_lock: []
  story_event: ""
  clip_structure_mode: ""
  tension_function: ""
  shot_size: ""
  camera_height: ""
  camera_angle: ""
  camera_path: ""
  camera_speed_profile: ""
  entry_state: ""
  target_state: ""
  exit_state: ""
  continuity_mode: ""
  primary_action: ""
  motion_vector: ""
  next_handoff: ""
  reference_priority: []

locked_snapshot_after: {}

polish_delta:
  reduced: []
  enhanced: []
  preserved: []

visual_hierarchy:
  focal_subject: ""
  secondary_read: ""
  background_role: ""

lighting_polish:
  key_light: ""
  fill_behavior: ""
  contrast_control: ""
  separation_goal: ""
  delta_limit:
    exposure_change: LOW
    contrast_change: LOW
    direction_change: PROHIBITED
    color_temperature_shift: MINIMAL

material_polish:
  subject_materials: []
  environment_materials: []
  separation_notes: []

clutter_control:
  remove_or_reduce: []
  preserve: []

color_discipline:
  dominant_palette: []
  accent_policy: ""
  saturation_policy: ""
  continuity_mode: STRICT | MODERATE | FREE

motion_support:
  camera_corridor_clear: true
  parallax_source_preserved: true
  negative_space_preserved: true
  exit_readability_preserved: true

anatomy_readability:
  face_readability: ""
  hand_readability: ""
  silhouette_readability: ""
  identity_preserved: true
  pose_preserved: true

style_alignment:
  visual_bible_match: ""
  style_anchor_match: ""
  forbidden_style_drift: []

prompt_budget:
  base_prompt_chars: 0
  polish_added_chars: 0
  added_ratio: 0.0
  max_added_ratio: 0.40
  duplicate_instruction_count: 0

base_prompt_en: |
  ...

final_prompt_en: |
  ...

pre_render_qc:
  status: PASS | PASS_WITH_WARNINGS | BLOCKED
  warnings: []

post_render_qc:
  status: PASS | PASS_WITH_WARNINGS | BLOCKED
  warnings: []
```
