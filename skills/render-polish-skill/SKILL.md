---
name: render-polish-skill
description: >
  Polish motion-ready history-fantasy keyframe prompts after directing is locked.
  Improve visual hierarchy, lighting separation, material readability, clutter control,
  color discipline, anatomy readability, and cinematic finish without altering the
  director-approved story, camera, continuity, motion path, START/TARGET/EXIT states,
  factual locks, or reference priority. Use after history-fantasy-storyboard-director
  produces a locked image contract and before Chrome ChatGPT image generation.
---

# Render Polish Skill

## Mission

Polish the **render quality** of a director-approved image job without re-directing it.

The main director decides:
- story
- clip purpose
- shot size
- camera
- motion
- continuity
- START/TARGET/EXIT
- factual constraints
- reference hierarchy

This skill only improves how clearly and cleanly that locked design is rendered.

Pipeline:

`MAIN DIRECTOR`
→ `LOCKED IMAGE CONTRACT`
→ `PRE-RENDER VALIDATION`
→ `RENDER POLISH`
→ `FINAL CHROME GPT PROMPT`
→ `IMAGE GENERATION`
→ `POST-RENDER VISUAL QC`
→ `MAIN DIRECTOR QC`

## Core Principle

> Do not make a prettier image by breaking the shot.

Prefer:
- readability
- clean focal hierarchy
- controlled depth
- subject separation
- motion-supportive negative space
- restrained lighting
- coherent materials
- controlled color
- reduced clutter

over decorative complexity.

## Required References

Load when relevant:

- `references/visual-hierarchy.md`
- `references/lighting-separation.md`
- `references/material-separation.md`
- `references/clutter-control.md`
- `references/color-discipline.md`
- `references/anatomy-readability.md`
- `references/motion-support.md`
- `references/reference-discipline.md`
- `references/prompt-budget.md`
- `references/negative-patterns.md`

Use templates from `assets/`.

## Non-Negotiable Directing Locks

Never alter:
- FACT_LOCK
- SCRIPT_DIRECTING_LOCK_ID
- VISUAL_BEAT_LOCK_ID
- story_event
- clip_structure_mode
- tension_function
- shot_size
- camera_height
- camera_angle
- camera_path
- camera_speed_profile
- entry_state
- target_state
- exit_state
- continuity_mode
- primary_action
- motion_vector
- next_handoff
- reference_priority

If polish requires changing any locked field, output `BLOCKED`.

## Development Lock Lineage

When supplied by the main director, preserve:
- `SCRIPT_DIRECTING_LOCK_ID` — identifies the script/directing development lock used for the production package.
- `VISUAL_BEAT_LOCK_ID` — identifies the approved beat/directing contract revision.

These identifiers are provenance fields. Render polish may not rewrite, drop, or silently substitute them.
If the input script/directing lock has been invalidated upstream, output `BLOCKED` instead of polishing a stale image job.

### Workflow Mode
Use `workflow_mode: LEGACY | INTEGRATED`.

- `LEGACY`: lock IDs are optional for backward compatibility. If present, they are immutable.
- `INTEGRATED`: both `script_directing_lock_id` and `visual_beat_lock_id` are required, must appear in both locked snapshots, must equal their top-level values, and must remain byte-for-byte unchanged.

An INTEGRATED job missing either ID is P0 `BLOCKED`.

## Locked Snapshot Rule

Before polish:
- capture `locked_snapshot_before`

After polish:
- construct `locked_snapshot_after`

Compare exact locked fields.

If any protected field changes:
- `locked_diff_count > 0`
- P0 = `BLOCKED`

No aesthetic justification overrides this.

## Polish Delta

Record actual changes:

- `reduced`
- `enhanced`
- `preserved`

Prefer reduction and separation before addition.

Example:

```yaml
polish_delta:
  reduced:
    - background micro-detail
    - secondary light hotspots
  enhanced:
    - subject/background luminance separation
    - stone/bone material separation
  preserved:
    - camera corridor
    - subject position
    - exit opening
```

## Polish Priority

1. DIRECTING_LOCK
2. CONTINUITY_LOCK
3. MOTION_READABILITY
4. FOCAL_HIERARCHY
5. LIGHTING
6. MATERIAL
7. COLOR
8. MICRO_DETAIL

Micro-detail is always last.

## Polish Strength

Choose one:

### LIGHT
Use when:
- image contract is already strong
- strict continuity is sensitive
- only small clutter/light cleanup is needed

Prompt-addition target: <=20%

### STANDARD
Default.

Use for:
- hierarchy
- lighting
- material
- color
- clutter

Prompt-addition target: <=35%

### STRONG
Allowed only if:
- P0 Directing Lock passes
- P7 Motion Support passes
- composition is already approved
- identity reference is available when people are present

Prompt-addition target: <=40%

STRONG does not permit camera or composition redesign.

## Visual Hierarchy

Define:
- primary read
- secondary read
- background role

Avoid:
- equal contrast everywhere
- equal detail density everywhere
- brighter background than focal subject without purpose
- ornamental competition

## Lighting

Lighting exists to improve:
- subject separation
- depth separation
- material readability
- focal guidance

Default delta limits:

```yaml
lighting_delta_limit:
  exposure_change: LOW
  contrast_change: LOW
  direction_change: PROHIBITED
  color_temperature_shift: MINIMAL
```

May allow `contrast_change: MEDIUM` only when continuity and Visual Bible remain intact.

Do not:
- redesign light direction in CONTINUATION/EXIT_MATCH
- force teal-orange
- add heavy bloom
- add exaggerated rim light
- add unsupported fantasy light sources

## Material Separation

Improve visual differentiation among relevant materials:
- skin
- hide/fur
- stone
- bone
- wood
- metal when allowed
- cave wall
- soil

The purpose is readability, not hyper-detail.

## Clutter Control

Use:
> Remove detail before adding detail.

Reduce:
- redundant props
- repeated objects
- over-dense textures
- meaningless foreground decoration
- competing light points
- particles that obscure focus
- anything blocking camera corridor

## Color Discipline

Use `STRICT`, `MODERATE`, or `FREE`.

### STRICT
Default for:
- EXIT_MATCH
- CONTINUATION

Rules:
- minimal hue-family shift
- minimal saturation shift
- minimal exposure shift
- no dominant-palette replacement
- minimal accent-color change

### MODERATE
Default for:
- BIBLE_MATCH

Small variations allowed while preserving scene continuity.

### FREE
Default only for:
- STORY_CUT
- explicit location/time/world-state change

Still obey Visual Bible.

## Anatomy Readability

When people appear, priority is:

`identity preservation`
→ `pose preservation`
→ `hand correctness`
→ `facial clarity`
→ `cosmetic improvement`

Do not beautify in a way that changes identity.
Do not change pose to fix anatomy.
If anatomy cannot be fixed without changing pose/composition, request regeneration rather than re-directing.

## Motion Support

Never damage:
- camera corridor
- parallax source
- subject motion space
- negative space
- target readability
- exit readability

If any of these are reduced by polish, P7 = `BLOCKED`.

## Reference Priority

1. CONTINUITY_EXIT
2. CHARACTER_LOCK
3. WORLD_LOCK
4. PROP_LOCK
5. COMPOSITION_REFERENCE
6. STYLE_ANCHOR

STYLE_ANCHOR may influence:
- palette feel
- finish
- cleanliness
- lighting feel
- material treatment

It may not change:
- identity
- costume
- geography
- prop form
- locked continuity
- camera

## Prompt Structure

Final prompt order:

1. LOCKED DIRECTING
2. MUST PRESERVE
3. VISUAL HIERARCHY
4. LIGHTING
5. MATERIAL / DEPTH
6. COLOR
7. MOTION SUPPORT
8. RENDER FINISH
9. NEGATIVE CONSTRAINTS

Do not delete or paraphrase away locked directing instructions.

## Prompt Budget

Measure polish addition against base prompt.

Default:

`polish_added_chars / base_prompt_chars <= 0.40`

Targets:
- LIGHT <= 0.20
- STANDARD <= 0.35
- STRONG <= 0.40

Avoid:
- adjective stacking
- duplicate lighting instructions
- duplicate material instructions
- restating camera direction in polish language
- verbosity that hides directing

P9 can hard-fail when the budget is substantially exceeded.

## Pre-Render Validation

Before image generation validate:
- required fields
- locked snapshot diff
- integrated lock-ID presence/equality when workflow_mode=INTEGRATED
- reference priority
- polish strength
- prompt budget
- continuity color mode
- lighting delta rules
- final prompt section order
- directing rewrite prohibition

Statuses:
- PASS
- PASS_WITH_WARNINGS
- BLOCKED

## Post-Render Visual QC

After image generation inspect:
- focal subject readability
- subject/background separation
- clutter
- camera corridor
- parallax source
- negative space
- depth separation
- lighting separation
- material separation
- color continuity
- face/hand readability
- style drift
- exit readability

Decisions:
- APPROVED
- REVISE
- REGENERATE
- BLOCKED

## Polish Gates

- P0 DIRECTING_LOCK
- P1 FOCAL_HIERARCHY
- P2 LIGHTING_SEPARATION
- P3 MATERIAL_SEPARATION
- P4 CLUTTER_CONTROL
- P5 COLOR_DISCIPLINE
- P6 ANATOMY_READABILITY
- P7 MOTION_SUPPORT
- P8 STYLE_ALIGNMENT
- P9 PROMPT_EFFICIENCY

Hard failures:
- P0
- P7
- severe P9 violation

## Recovery

### REVISE
Use for:
- clutter reduction
- contrast refinement
- saturation cleanup
- material separation

### REGENERATE
Use for:
- major anatomy failure
- major style drift
- identity drift
- renderer output contradicting an approved contract

### BLOCKED
Use for:
- incomplete input contract
- directing-lock change
- broken motion-support
- severe prompt-budget overflow
- impossible request without re-directing

## Output Contract

Produce:
1. locked snapshot before
2. locked snapshot after
3. locked diff result
4. polish strength
5. polish delta
6. hierarchy/light/material/color/motion-support notes
7. prompt budget
8. final prompt
9. pre-render QC
10. post-render QC placeholder or result

## Validation Scripts

Use:
- `scripts/validate_polish_contract.py`
- `scripts/validate_locked_fields.py`
- `scripts/validate_prompt_budget.py`
- `scripts/validate_continuity_color.py`

These scripts validate structure and consistency. They do not replace image-level visual judgment.
