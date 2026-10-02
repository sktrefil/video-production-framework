---
name: history-fantasy-storyboard-director
description: >
  Direct long-form history-fantasy and cinematic animation projects from script-development preflight or locked script/TTS
  into Visual Beats, clip directing contracts, camera choreography, START/TARGET/EXIT
  keyframe plans, Chrome ChatGPT image-generation jobs, I2V motion prompts, and
  continuity handoffs. Prioritize viewer attention, camera tension, readable
  motion-ready compositions, factual locks, Visual Bible consistency, and
  clip-to-clip energy continuity.
---

# History Fantasy Storyboard Director

## Mission

Act as the project's **director**, not its image renderer.

The real production unit is the **video clip**, not the still image. A still image exists to support a future clip.

Use this order:

`script/TTS -> narrative beat -> clip event -> camera choreography -> image geometry -> keyframe prompt -> I2V motion -> exit energy -> next clip`

Never reverse this into `script -> pretty image -> add camera later`.

## Core Principles

1. **Clip-first** — decide what the clip must communicate before designing images.
2. **Camera-first** — decide viewer path, reveal, tension, motion vector, and exit before visual detailing.
3. **Attention-first** — avoid static or slow-default staging; create meaningful visual change within 3-4 seconds when possible.
4. **Readability over excess detail** — preserve clean focal hierarchy and camera-readable depth.
5. **Continuity by design** — connect clips through space, motion, focus, sound, and energy; do not ask the video model to invent continuity.
6. **History/Fantasy boundary** — cinematic fantasy is allowed only where it does not rewrite historical claims.
7. **Renderer separation** — Chrome ChatGPT executes the locked image design; it must not re-direct the scene.
8. **Render-polish separation** — this skill decides whether an image can work as a moving shot. A separate polish skill may improve finish later but cannot alter directing locks.

## Operating Modes

### `DIRECTING_PREFLIGHT`
Use before FINAL TTS to test whether a Script Development Package can become an engaging, executable video.

Input:
- narrative spine
- script-development units
- writer DIRECTING_HANDOFF
- evidence/fact guardrails
- estimated TTS duration per unit

Evaluate each unit for:
- visual feasibility
- attention feasibility, including whether a meaningful change can occur within the first 3-4 seconds when appropriate
- TTS duration versus visible event density
- abstraction and explanatory-motif repetition
- whether a camera/focus change has a narrative reason
- transition/handoff feasibility
- sequence-level repetition risk

Use `assets/directing-preflight-template.md`.

Preflight may return `PASS`, `REVISION_REQUIRED`, or `BLOCKED` and must route a revision to WRITER, DIRECTOR, or RESEARCH.
In this mode do **not** create final image prompts, START/TARGET image jobs, final I2V prompts, or FINAL TTS.
A preflight PASS is advisory development evidence only; it does not approve project.db gates.

### `FULL_PRODUCTION`
Use the existing Standard Workflow only after a stable script is available.
For LONGFORM, require the repository-defined manager-approved FINAL script and Scene graph. When the project uses the integrated development loop, also carry `SCRIPT_DIRECTING_LOCK_ID` into downstream directing provenance.

If the locked script changes in meaning, unit order, evidence mapping, or timing assumptions, stop and return upstream for lock invalidation/review before regenerating dependent production artifacts.

## Required Reading

Load these references when relevant:

- `references/history-fantasy-boundary.md`
- `references/camera-tension-grammar.md`
- `references/horizon-directing-grammar.md`
- `references/motion-readiness.md`
- `references/continuity-rules.md`
- `references/attention-pacing.md`
- `references/reference-priority.md`
- `references/chrome-gpt-image-workflow.md`
- `references/negative-patterns.md`

Use templates from `assets/` rather than inventing incompatible schemas.

## Priority Order

If rules conflict, obey:

1. FACT_LOCK
2. PROJECT_VISUAL_BIBLE
3. CAMERA_FIRST_DIRECTING
4. ATTENTION_TENSION
5. CONTINUITY
6. VISUAL_BEAT_STORY_EVENT
7. RENDER_POLISH
8. GENERATOR_SPECIFIC_OPTIMIZATION

Lower layers may not override higher layers.

## Standard Workflow

### Step 1 — Read the script/TTS and project locks
Identify:
- narrative purpose
- factual constraints
- scene/world locks
- TTS timing
- required characters/props
- previous and next beat context

### Step 2 — Build or update the Visual Beat
Use `assets/visual-beat-template.md`.

Each beat should normally communicate **one new narrative event or information unit**.

### Step 3 — Select clip structure
Choose:

- `SINGLE_IMAGE`
- `START_TARGET`
- `CONTINUATION`

Rules:
- small insert/detail/short atmosphere + limited camera change -> `SINGLE_IMAGE`
- meaningful translation, reveal arrival, pose/state change, or strong target composition -> `START_TARGET`
- direct inheritance of prior exit action/frame/energy -> `CONTINUATION`

`CONTINUATION` describes the relationship between clips and may internally use either one image or START/TARGET.

### Step 4 — Create the Clip Directing Contract
Use `assets/clip-directing-contract.md`.

Before any image prompt, lock:
- clip event
- tension function
- camera start
- camera path
- speed profile
- camera phases
- reveal point
- focus shift
- parallax source
- entry / target / exit
- energy in / out
- motion vector in / out
- next receiver
- TTS/audio cues

### Step 5 — Run gates before image prompting
Run H0-H9.

Hard failures:
- H0 FACT
- H1 BIBLE
- physically impossible camera path
- unresolved START/TARGET contradiction
- required continuity state missing

Do not create an image prompt when status is `BLOCKED`.

### Step 6 — Create the Chrome GPT Image Job
Use `assets/image-job-template.md`.

The image must support the planned camera move:
- enough corridor
- readable FG/MG/BG
- parallax source when needed
- uncluttered focus
- subject position compatible with the planned path
- usable exit composition

### Step 7 — Review generated images
Use `assets/qc-template.md`.

Classify:
- `APPROVED`
- `REVISE`
- `REGENERATE`
- `BLOCKED`

### Step 8 — Create I2V motion instructions
Derive the video prompt from the **same Clip Directing Contract** used to create the image.

Never write a disconnected video prompt that contradicts image geometry.

### Step 9 — Design clip handoff
Use:
- spatial continuity
- action/eyeline match
- screen direction
- motion-vector carry
- focus carry
- visual baton
- J/L cuts
- audio bridge
- occlusion where useful

### Step 10 — Review 20-30 second blocks
Do not approve a sequence only because individual clips pass.

Review:
- tension curve
- shot-scale rhythm
- motion contrast
- repetition
- static dead zones
- TTS continuity
- energy continuity
- information density

Feed block-QC findings into the next beats.

## Camera Rules

### Camera motion is a narrative device
Every move must answer at least one:
- What information does this reveal?
- What attention shift does this create?
- What tension change does this create?
- What handoff does this prepare?

### Complexity limit
Default:
- 1 primary camera move
- at most 1 secondary micro-adjustment

Do not stack pan + dolly + orbit + zoom without a specific reason and model capability.

### Camera phase limit
Recommended:
- 4-7s: 2-3 phases
- 8-12s: 3-5 phases
- <=15s: maximum 5 meaningful phases

### Attention event
Prefer one meaningful visual change within the first 3-4 seconds.

For clips 8s or longer, consider a second attention event around 4-6s if the narrative supports it. Do not repeat the same reveal.

## Tension Functions

Use one primary function per phase or clip:

- `BUILD`
- `HOLD`
- `RELEASE`
- `REVEAL`
- `REDIRECT`
- `HANDOFF`

Static holds are exceptions, not defaults. Allow them only for a clearly stated narrative reason.

## Shot Fingerprint

Track:

`location + shot_size + camera_move + primary_subject + depth_pattern + visual_motif + lighting_state + motion_vector`

Compare against the prior 2-3 beats.

Repeated `WIDE + PUSH + CENTERED` or equivalent composition without a story reason should fail H6.

### Repetition hard-fail
- similarity >= 0.85 against one of the previous 3 shots => `BLOCKED` unless `repeat_justification` is explicit
- similarity 0.75-0.84 => `PASS_WITH_WARNINGS`
- an override must state a concrete narrative reason; `smooth`, `same scene`, `TBD`, or empty text is not sufficient

## Reference Hierarchy

1. CONTINUITY_EXIT
2. CHARACTER_LOCK
3. WORLD_LOCK
4. PROP_LOCK
5. COMPOSITION_REFERENCE
6. STYLE_ANCHOR

A lower-priority reference may not overwrite a higher-priority lock.

## Image Prompt Order

Use this order:

1. MUST PRESERVE
2. CAMERA / COMPOSITION
3. SUBJECT / ACTION
4. ENVIRONMENT / DEPTH
5. RENDER QUALITY
6. NEGATIVE CONSTRAINTS

Do not bury directing instructions under decorative prose.

## Gate Summary

- H0 FACT
- H1 BIBLE
- H2 COMPOSITION
- H3 MOTION_READINESS
- H4 NARRATIVE
- H5 HANDOFF
- H6 RHYTHM
- H7 ATTENTION_PACING
- H8 CAMERA_TENSION_EDIT_RHYTHM
- H9 READABILITY_UNDER_CAMERA_MOTION

Statuses:
- PASS
- PASS_WITH_WARNINGS
- BLOCKED

## H3 Motion Readiness
PASS requires at least 3 of 4:

- visible camera corridor
- usable foreground parallax source
- executable subject motion vector
- visually distinct target/exit state

A SINGLE_IMAGE insert may waive parallax/target requirements when the reason is explicit.

## Failure / Recovery

Use `REVISE` for:
- lighting
- clutter
- small position correction
- minor prop drift

Use `REGENERATE` for:
- wrong shot size
- absent camera corridor
- wrong composition
- broken START/TARGET relation
- major identity drift

Use `BLOCKED` when:
- facts conflict
- camera path is impossible
- continuity is contradictory
- clip purpose is unclear

## Output Contract

For each production beat, output at minimum:

1. Visual Beat
2. Clip Structure Mode
3. Clip Directing Contract
4. Gate results
5. Image job(s)
6. Handoff plan
7. I2V motion plan
8. QC result after generated image review

Do not substitute a mood board for a production keyframe.

## VPF Mapping

Default mapping:
- T040: Visual Beat + Clip Directing Contract + gates
- T050: START/TARGET/EXIT image jobs + image QC
- T060: I2V camera/motion/bridge prompt + TTS/audio sync
- T080: generated video + continuity/cinematic/energy QC

If the repository uses different task numbers, prefer task names and use this as an adapter mapping.

## Validation

Use:
- `scripts/validate_directing_preflight.py` for `DIRECTING_PREFLIGHT`
- `scripts/validate_storyboard_contract.py` for `FULL_PRODUCTION`
- `scripts/validate_shot_fingerprint.py`
- `scripts/validate_attention_gate.py`

These scripts are structural validators. They do not replace human/director judgment.


## Structural Validator Rules

Before accepting a Visual Beat contract:

- required scalar fields must exist **and be non-empty**
- enum values must be valid
- `START_TARGET` requires `target_state` and `key_event`
- `CONTINUATION` requires `camera_energy_in` and `motion_vector_in`
- non-`STORY_CUT` continuity requires an explicit `next_handoff`
- generic placeholders such as `TBD`, `smooth`, or `none` are invalid for directing-critical fields
- clip duration must be positive
- camera phase count must respect duration
- camera complexity defaults to 1 primary move + at most 1 secondary adjustment
- clips >=8s should include a second attention event around 4-6.5s unless an explicit exception is justified
