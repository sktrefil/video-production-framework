# Chrome GPT Image Job Template

```yaml
image_job_id: SC01_VB01_START
renderer: CHROME_CHATGPT
aspect_ratio: "16:9"
style_mode: NON_REALISTIC_STYLIZED
style_lock:
  photorealistic: PROHIBITED
  live_action: PROHIBITED
  documentary_reenactment: PROHIBITED
  realistic_cinematic_reconstruction: PROHIBITED
  real_reference_usage: FACT_SHAPE_ONLY

purpose: ""
story_event: ""

reference_images:
  - id: ""
    role: CONTINUITY_EXIT | CHARACTER_LOCK | WORLD_LOCK | PROP_LOCK | COMPOSITION_REFERENCE | STYLE_ANCHOR

must_preserve: []
must_change: []
must_not_add: []

shot_size: ""
camera_height: ""
camera_angle: ""
camera_path_support: ""
composition: ""
depth_design: ""
camera_corridor: ""

subject_state: ""
environment_state: ""
motion_ready_space: ""
next_handoff: ""

canonical_prompt_en: |
  MUST PRESERVE:
  ...

  CAMERA / COMPOSITION:
  ...

  SUBJECT / ACTION:
  ...

  ENVIRONMENT / DEPTH:
  ...

  RENDER QUALITY:
  Visibly stylized non-photorealistic history-fantasy animation frame.
  Use bold designed depth, graphic material separation, expressive lighting, and motion-ready composition.
  ...

  NEGATIVE CONSTRAINTS:
  ...

review_summary_ko: |
  ...

negative_constraints: []
```
