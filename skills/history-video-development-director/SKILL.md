---
name: history-video-development-director
description: >
  Orchestrate history-video development before final TTS by coordinating evidence-driven scriptwriting and storyboard-director preflight. Manage the revision loop, visual-skeleton review, sequence QC, and SCRIPT_DIRECTING_LOCK so narration and directing are reconciled before audio and full storyboard production. This skill does not replace Agent1 canonical approval or project.db gates.
---

# History Video Development Director

## Mission

Prevent downstream rework by making script and directing develop together **before FINAL TTS**.

This skill is an orchestrator. It does not compete with the writer, storyboard director, render-polish skill, or Agent1.

Primary flow:

`STYLE_START_NOTICE -> RESEARCH_LOCK -> SCRIPT_DRAFT -> DIRECTING_PREFLIGHT -> SCRIPT_REVISION -> VISUAL_SKELETON -> SEQUENCE_QC -> SCRIPT_DIRECTING_LOCK -> MANAGER_STORY_GATE -> FINAL_TTS_GATE -> FINAL_TTS -> FULL_STORYBOARD -> RENDER_POLISH`

## Authority Boundary

- For history/mystery LONGFORM script development, this skill is the **workflow authority** for the development sequence and may not be silently skipped.
- Agent1 remains the only **canonical approval authority**.
- `SCRIPT_DIRECTING_LOCK` is a development lock, not a project.db Story Gate.
- Worker skills may recommend PASS/REVISE/BLOCKED but may not self-approve canonical production state.
- Existing LONGFORM requirements for manager-approved FINAL script and Scene graph remain in force.

## Why This Exists

Without an upstream development loop, the pipeline tends to become:

`script -> TTS -> storyboard -> visual mismatch -> script rewrite -> TTS rewrite -> storyboard rewrite`

This skill moves those revisions earlier:

`script draft <-> directing preflight <-> revision -> lock -> TTS`

## Participants

### Writer
`history-mystery-scriptwriter`

Owns:
- narrative spine
- evidence order
- curiosity architecture
- Korean narration
- directing handoff
- revision after preflight

### Preflight Director
`history-fantasy-storyboard-director` in `DIRECTING_PREFLIGHT` mode

Owns:
- visual feasibility
- event density
- attention feasibility
- camera reason
- duration fit
- transition fit
- repetition risk
- visual-skeleton advice

### Full Production Director
`history-fantasy-storyboard-director` in `FULL_PRODUCTION` mode

Runs only after the development lock and canonical Story Gate conditions are met.

### Render Polish
`render-polish-skill`

Runs only after director-approved image contracts exist.

## Development States

Use exactly these development states:

1. `STYLE_START_NOTICE`
2. `RESEARCH_LOCKED`
3. `SCRIPT_DRAFT`
4. `DIRECTING_PREFLIGHT`
5. `SCRIPT_REVISION`
6. `VISUAL_SKELETON`
7. `SEQUENCE_QC`
8. `SCRIPT_DIRECTING_LOCKED`
9. `WAITING_MANAGER_STORY_GATE`
10. `FINAL_TTS_GATE`
11. `FINAL_TTS_ALLOWED`
12. `FULL_STORYBOARD`
13. `RENDER_POLISH`
14. `PRODUCTION_QC`
15. `BLOCKED`

Do not skip directly from `SCRIPT_DRAFT` to `FINAL_TTS_ALLOWED`.

## Mandatory New-Video Style Start Notice

Before any **new HISTORY_MYSTERY video** begins substantive research, script development, Visual Skeleton work, or image planning, surface a user-visible `STYLE_START_NOTICE`.

This notice is mandatory even when the style is unchanged from the previous project. Its purpose is to prevent silent regression.

Required notice content:
- `style_mode: NON_REALISTIC_STYLIZED`
- visual language: stylized history-fantasy / graphic animation
- directing language: strong kinetic camera motion, parallax, scale shifts, spatial traversal, arc/orbit, graphic match, speed contrast
- prohibited: photorealistic, live-action, documentary reenactment, hyperreal, realistic cinematic reconstruction
- evidence policy: facts/evidence remain accurate; unknown details are stylized, abstracted, silhouetted, omitted, or separated into editorial space
- a clear Korean user-facing sentence stating that the video will **not** use a realistic/live-action look

Use `assets/style-start-notice-template.md`.

Rules:
- The notice must be shown to the user in the conversation; storing it only in a file, DB, log, or internal note does not satisfy the gate.
- When the notice matches the canonical lock, it is informational: continue work without asking for confirmation.
- If any planned style conflicts with `NON_REALISTIC_STYLE_LOCK`, do not start production. Return `BLOCKED_STYLE_CONFLICT`.
- A resumed legacy/sample project with no valid current notice must emit the notice before new visual development resumes.
- Any style change would require an explicit architecture/user decision; a worker may never silently change the style.

Validate structured notices with `scripts/validate_style_start_notice.py`.

### Existing / Legacy Visual Plan Invalidation

When an existing sample or project was designed under a realistic, photorealistic, documentary-reenactment, or faux-reconstruction assumption:
- preserve valid research, evidence mapping, Narrative Units, and information-flow structure;
- invalidate prior Visual Skeleton / Visual Beat / image-style approvals that depended on realism;
- rebuild and re-QC those visual artifacts under `NON_REALISTIC_STYLE_LOCK`;
- do not reuse a prior visual PASS merely because its narrative structure remains useful.

For `oase_visual_development_v2`, the 37 Narrative Unit information structure may be reused, but the previous realistic-assumption Visual Skeleton / Visual Beat approval is **withdrawn**. Oase visual development must restart with the user-visible Style Start Notice and be revalidated as **non-realistic + strong fantasy/graphic direction + kinetic camera motion** before image production.

## Standard Workflow

### Step 0 — STYLE_START_NOTICE
Render the mandatory user-visible style notice and validate its structured companion artifact.

Do not proceed to Research Lock if the notice is absent or conflicts with the canonical style.

### Step 1 — Research Lock
Confirm the source/evidence package is sufficiently fact-checked for writing.

If not, return to research. Do not use directing to hide research uncertainty.

### Step 2 — Script Draft
Run the writer and require:
- narrative spine
- evidence map
- script development units
- directing handoff
- fact guardrails

### Step 3 — Directing Preflight
Send the script-development package to the storyboard director in `DIRECTING_PREFLIGHT` mode.

The preflight must evaluate each unit without producing image jobs.

### Step 4 — Revision Loop
If any unit returns `REVISION_REQUIRED`, return it to the writer with the exact reason.

The writer may:
- split the unit;
- shorten technical method narration;
- change reveal order;
- strengthen bridge logic;
- ground abstraction in physical evidence;
- move a result later so the image can reveal it first.

The writer may not change locked evidence meaning.

Default maximum: 3 development revision rounds.
After round 3, unresolved structural conflicts return `BLOCKED` to Agent1 rather than looping indefinitely.

### Step 5 — Visual Skeleton
When unit preflight passes, build a lightweight sequence skeleton.

For each unit capture only:
- `style_mode: NON_REALISTIC_STYLIZED` (mandatory for HISTORY_MYSTERY)
- story event
- expected duration band
- visual mode
- likely scale intent
- attention event
- transition/handoff intent
- abstraction handling

Do not generate final START/TARGET/EXIT prompts here.

### Step 6 — Sequence QC
Review 20-30 second blocks for:
- any drift toward photorealistic/live-action/documentary-reenactment visual grammar;
- whether retention is being carried by kinetic stylized directing rather than faux realism;
- repeated shot-scale intent
- repeated explanatory motif
- long static information runs
- location/subject monotony
- missing attention change
- weak bridge between evidence groups
- TTS density vs visual event density

If sequence QC fails, return to script revision or skeleton revision as appropriate.

### Step 7 — SCRIPT_DIRECTING_LOCK
Create `assets/script-directing-lock-template.md` only when:
- script candidate QC PASS;
- directing preflight PASS;
- visual skeleton PASS;
- NON_REALISTIC_STYLE_LOCK PASS;
- sequence QC PASS;
- fact guardrails unchanged;
- no unresolved revision request;
- final TTS has not yet been generated.

The lock grants **development permission to proceed toward TTS**, subject to Agent1 Story Gate requirements.

### Step 8 — Manager Story Gate
Wait for the repository-defined manager approval of FINAL script and Scene graph.

The development lock does not bypass this gate.

### Step 9 — FINAL_TTS_GATE
Before any final audio generation, create `assets/final-tts-gate-template.md` and run `scripts/validate_final_tts_gate.py`.

The gate must cross-check:
- current script revision/hash against the development lock;
- preflight revision and its input script revision/hash;
- visual-skeleton revision/hash and its input script revision/hash;
- current narrative-unit IDs;
- current fact-guardrail IDs;
- Agent1 Story Gate = PASS;
- Agent1-approved script revision/hash equal the current locked script;
- an approved Scene graph revision/hash is present;
- FINAL TTS does not already exist.

Any mismatch is `BLOCKED_STALE_PROVENANCE`. Do not "refresh" one field to make it pass; return to the owning stage and rebuild the lock.

### Step 10 — Final TTS
Only after `FINAL_TTS_GATE=PASS` may the story/audio worker create final segmented TTS.

If the approved script changes afterward:
- invalidate the development lock;
- invalidate dependent TTS planning according to repository architecture;
- return to the appropriate development state.

### Step 11 — Full Storyboard
Run the storyboard director in `FULL_PRODUCTION` mode using:
- locked script revision
- `SCRIPT_DIRECTING_LOCK_ID`
- approved Scene graph
- segmented TTS timings
- Visual Bible / continuity locks

### Step 12 — Render Polish
Run only on director-approved image contracts. Preserve both script/directing and visual-beat lock identifiers.

## Feedback Routing

Route problems to the earliest owner that can fix them:

- unsupported claim -> RESEARCH
- weak question/payoff -> WRITER
- unvisualizable narration -> WRITER first
- camera/geometry problem after lock -> STORYBOARD DIRECTOR
- clutter/light/material problem -> RENDER POLISH
- generated-image drift -> IMAGE QC / regeneration
- canonical gate conflict -> AGENT1

Do not repair an upstream problem downstream.

## Revision Classification

### SCRIPT_REVISION
Use when narration meaning/order/duration must change.

### DIRECTING_REVISION
Use when narration is sound but camera/visual skeleton needs change.

### POLISH_REVISION
Use when story and directing are sound but rendering readability needs change.

### RESEARCH_REVISION
Use when the underlying evidence package is insufficient or contradictory.

## Lock Invalidation

`SCRIPT_DIRECTING_LOCK` is invalidated by:
- any script revision/hash mismatch against Preflight or Visual Skeleton input provenance;
- any locked-unit set mismatch against the current Script Development Package;
- script text change that affects meaning or timing;
- narrative unit split/merge/reorder;
- evidence ID or fact-guardrail change;
- visual skeleton structural change;
- preflight status reverting to revision required.

Minor punctuation or pronunciation notes may be handled only if they do not alter meaning, unit timing assumptions, or scene boundaries; otherwise relock.

## Output Contract

Produce:
1. latest STYLE_START_NOTICE id/status for new or resumed projects
2. development state
3. current revisions/hashes
4. unresolved issues
5. revision round count
6. writer status
7. preflight status
8. visual-skeleton status
9. sequence-QC status
10. lock status / lock ID
11. next allowed action
12. invalidated downstream artifacts, if any

Use `assets/development-state-template.md`.

## Validation

Use:
- `scripts/validate_style_start_notice.py` at new-video/resumed-visual start
- `scripts/validate_script_directing_lock.py`
- `scripts/validate_final_tts_gate.py` before FINAL TTS

A validator PASS is structural only. Agent1 approval is still required.
