# FINAL_TTS_GATE Template

```yaml
gate_id: FTG-<project>-<revision>
script_directing_lock_id: ""

lock:
  script_revision: ""
  script_hash: ""
  preflight_revision: ""
  preflight_script_revision: ""
  preflight_input_script_hash: ""
  visual_skeleton_revision: ""
  visual_skeleton_hash: ""
  visual_skeleton_script_revision: ""
  visual_skeleton_input_script_hash: ""
  locked_unit_ids: []
  fact_guardrail_ids: []

current_script:
  revision: ""
  hash: ""
  unit_ids: []
  fact_guardrail_ids: []

current_preflight:
  revision: ""
  input_script_revision: ""
  input_script_hash: ""
  status: PASS

current_visual_skeleton:
  revision: ""
  hash: ""
  input_script_revision: ""
  input_script_hash: ""
  status: PASS

manager_story_gate:
  status: PASS
  approved_script_revision: ""
  approved_script_hash: ""
  approved_scene_graph_revision: ""
  approved_scene_graph_hash: ""

final_tts_generated: false
```
