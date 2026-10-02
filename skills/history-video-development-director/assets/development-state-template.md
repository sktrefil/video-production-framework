# Development State Template

```yaml
project_id: ""
development_state: RESEARCH_LOCKED
revision_round: 0

research_revision: ""
script_revision: ""
script_hash: ""
preflight_revision: ""
visual_skeleton_revision: ""

writer_status: ""
directing_preflight_status: ""
visual_skeleton_status: ""
sequence_qc_status: ""

unresolved_issues: []
revision_route: NONE | RESEARCH | WRITER | DIRECTOR | POLISH | AGENT1

script_directing_lock_id: ""
lock_status: NOT_READY | READY_FOR_MANAGER_REVIEW | LOCKED | INVALIDATED

final_tts_permission: DENIED | DEVELOPMENT_READY | GRANTED_AFTER_MANAGER_GATE
next_allowed_action: ""
invalidated_downstream: []
```
