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
preflight_script_revision: ""
preflight_input_script_hash: ""

visual_skeleton_revision: ""
visual_skeleton_hash: ""
visual_skeleton_script_revision: ""
visual_skeleton_input_script_hash: ""

narrative_spine: ""
locked_unit_ids: []
preflight_unit_ids: []
visual_skeleton_unit_ids: []
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
  - SCRIPT_HASH_MISMATCH
  - UNIT_SPLIT_MERGE_REORDER
  - UNIT_SET_MISMATCH
  - EVIDENCE_OR_FACT_GUARDRAIL_CHANGE
  - PREFLIGHT_INPUT_PROVENANCE_MISMATCH
  - VISUAL_SKELETON_INPUT_PROVENANCE_MISMATCH
  - VISUAL_SKELETON_STRUCTURAL_CHANGE
  - PREFLIGHT_REOPENED
```
