# Example Visual Beat

```yaml
vb_id: SC01_VB01
story_event: "A cave passage gradually reveals the evidence display."
duration_target: "6s"
fact_lock: ["Do not invent inscriptions or excavation context."]
fantasy_allowed: ["restrained fog", "cinematic light"]
invention_prohibited: ["text labels in-scene", "DNA graphics"]
clip_structure_mode: START_TARGET
tension_function: REVEAL
attention_event: "foreground limestone clears at 2.5s"
shot_size_start: WIDE
shot_size_end: MEDIUM
camera_height: LOW
camera_angle: LEVEL
camera_intent: "Reveal evidence through movement, not a static cut."
camera_path: "forward-right tracking"
camera_speed_profile: "controlled medium -> decelerate"
camera_phases:
  - "0-2s REVEAL"
  - "2-4s PARALLAX"
  - "4-6s TARGET_EXIT"
reveal_point: "2.5s"
parallax_source: "foreground limestone edge"
focus_shift: "passage -> evidence"
exit_orientation: "evidence right-center"
foreground: "limestone edge"
midground: "evidence support"
background: "dark cave recess"
primary_subject: "evidence support"
primary_action: "visual reveal only"
secondary_action: ""
environment_motion: "subtle mist"
entry_state: "evidence partly hidden"
key_event: "evidence becomes readable"
target_state: "evidence clearly framed"
exit_state: "medium frame prepared for next detail"
continuity_mode: EXIT_MATCH
next_handoff: "next detail receives evidence right-center"
camera_energy_in: "medium"
camera_energy_out: "controlled"
motion_vector_in: "forward-right"
motion_vector_out: "forward-right"
entry_speed: "medium"
exit_speed: "slow"
reference_images: []
bible_ids: ["WORLD_CAVE_01"]
motion_readiness: "PASS"
horizon_gate: "PASS"
attention_gate: "PASS"
camera_tension_gate: "PASS"
readability_gate: "PASS"
risks: ["foreground may obscure evidence too long"]
fallback_plan: "reduce foreground occlusion width"
```
