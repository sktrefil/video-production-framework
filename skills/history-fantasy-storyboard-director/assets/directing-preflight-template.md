# Directing Preflight Template

Use this before FINAL TTS and before full image/keyframe production.

```yaml
preflight_revision: PF01
script_revision: R01
narrative_spine: ""
overall_status: PASS | REVISION_REQUIRED | BLOCKED

unit_reviews:
  - unit_id: NU001
    story_event: ""
    estimated_tts_duration_sec: 0

    visual_feasibility: PASS | WARN | FAIL
    attention_feasibility: PASS | WARN | FAIL
    duration_fit: PASS | WARN | FAIL
    transition_fit: PASS | WARN | FAIL
    repetition_risk: LOW | MEDIUM | HIGH
    abstraction_risk: LOW | MEDIUM | HIGH

    camera_reason: "what information/attention/tension/handoff could justify movement"
    visual_mode_candidate: OBJECT | PLACE | ACTION | COMPARISON | CHANGE | ABSENCE | DOCUMENTED_DIAGRAM | BRIDGE_ONLY
    attention_event_candidate: ""
    hold_back: ""
    reveal_candidate: ""
    handoff_candidate: ""

    revision_required: false
    revision_route: NONE | WRITER | DIRECTOR | RESEARCH
    revision_reason: ""

sequence_notes:
  repeated_motifs: []
  static_zones: []
  scale_rhythm_risks: []
  evidence_transition_risks: []

prohibited_outputs:
  - FINAL_IMAGE_PROMPT
  - START_TARGET_IMAGE_JOB
  - FINAL_I2V_PROMPT
  - FINAL_TTS
```
