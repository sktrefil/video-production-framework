# Script Development Unit Template

```yaml
unit_id: NU001
section_id: SC01
story_function: HOOK | DISCOVERY | DEEPENING | REVERSAL | SYNTHESIS | RESIDUAL_QUESTION | BRIDGE

evidence_ids: []
evidence_distance: CORE | SUPPORT | CONTEXT

viewer_question: ""
tts_text: ""
estimated_duration_sec: 0
information_unit_count: 1
visual_event_budget: 1
compression_justification: ""

claim_types: []
fact_guardrails: []

visualizable_event:
  type: OBJECT | PLACE | ACTION | COMPARISON | CHANGE | ABSENCE | DOCUMENTED_DIAGRAM | BRIDGE_ONLY
  description: ""

directing_intent: ""
attention_event:
  type: REVEAL | ACTION | PARALLAX | FOCUS_SHIFT | SPATIAL_DISCOVERY | QUESTION | REORIENTATION | HOLD
  target_time_sec: 0.0
attention_timing_exception: ""
secondary_attention_event:
  required: false
  type: ""
  target_time_sec: null
  exception_reason: ""

reveal_policy: ""
payoff: ""
transition_intent: ""
next_question: ""

abstraction_risk: LOW | MEDIUM | HIGH
preflight_status: NOT_REVIEWED | PASS | REVISION_REQUIRED
revision_reason: ""
```
