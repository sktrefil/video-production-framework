# SCRIPT_DIRECTING_LOCK Template

This is a development lock. It does not replace Agent1's canonical Story Gate.

```yaml
lock_id: SDL-<project>-<revision>
project_id: ""
created_from_revision_round: 0

research_revision: ""
script_revision: ""
script_hash: ""
preflight_revision: ""
visual_skeleton_revision: ""

narrative_spine: ""
locked_unit_ids: []
fact_guardrail_ids: []

script_qc_status: PASS
directing_preflight_status: PASS
visual_skeleton_status: PASS
sequence_qc_status: PASS
fact_status: PASS

unresolved_revision_count: 0
final_tts_generated: false
development_tts_permission: GRANTED
canonical_manager_story_gate: PENDING

invalidation_triggers:
  - SCRIPT_MEANING_CHANGE
  - UNIT_SPLIT_MERGE_REORDER
  - EVIDENCE_OR_FACT_GUARDRAIL_CHANGE
  - VISUAL_SKELETON_STRUCTURAL_CHANGE
  - PREFLIGHT_REOPENED
```
