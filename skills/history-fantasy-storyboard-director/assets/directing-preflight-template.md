# Directing Preflight Template

Use this before FINAL TTS and before full image/keyframe production.

```yaml
preflight_revision: PF01
script_revision: R01
input_script_hash: ""
narrative_spine: ""
overall_status: PASS | REVISION_REQUIRED | BLOCKED

unit_reviews:
  - unit_id: NU001
    story_event: ""
    estimated_tts_duration_sec: 0

    information_unit_count: 1
    visual_event_budget: 1
    visual_feasibility: PASS | WARN | FAIL
    attention_feasibility: PASS | WARN | FAIL
    duration_fit: PASS | WARN | FAIL
    transition_fit: PASS | WARN | FAIL
    repetition_risk: LOW | MEDIUM | HIGH
    abstraction_risk: LOW | MEDIUM | HIGH

    camera_reason: "what information/attention/tension/handoff could justify movement"
    visual_mode_candidate: OBJECT | PLACE | ACTION | COMPARISON | CHANGE | ABSENCE | DOCUMENTED_DIAGRAM | BRIDGE_ONLY
    attention_event:
      type: REVEAL | ACTION | PARALLAX | FOCUS_SHIFT | SPATIAL_DISCOVERY | QUESTION | REORIENTATION | HOLD
      target_time_sec: 0.0
    attention_timing_exception: ""
    secondary_attention_event:
      required: false
      type: ""
      target_time_sec: null
      exception_reason: ""

    hold_back: ""
    reveal_candidate: ""
    handoff_candidate: ""

    revision_required: false
    revision_route: NONE | WRITER | DIRECTOR | RESEARCH
    revision_reason: ""

sequence_reviews:
  - block_id: B01
    duration_sec: 25
    consecutive_same_explanatory_motif_max: 1
    consecutive_same_scale_intent_max: 1
    max_static_information_run_sec: 8
    max_consecutive_abstract_units: 1
    has_meaningful_attention_change: true
    exception_justification: ""
    revision_required: false
    revision_route: NONE | WRITER | DIRECTOR
    revision_reason: ""

prohibited_outputs:
  - FINAL_IMAGE_PROMPT
  - START_TARGET_IMAGE_JOB
  - FINAL_I2V_PROMPT
  - FINAL_TTS
```
