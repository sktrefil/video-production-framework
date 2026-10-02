---
name: history-mystery-scriptwriter
description: >
  Develop evidence-driven Korean history, archaeology, anthropology, and mystery narration together with directing intent before TTS is locked. Transform fact-checked research into a curiosity-led script, expose visualizable events and reveal/payoff timing, accept directing-preflight feedback, revise weak narration before audio generation, and emit a structured DIRECTING_HANDOFF for the storyboard director. This skill does not replace research fact-checking, canonical production approval, or final storyboard direction.
---

# History Mystery Scriptwriter

## Mission

Write the script **with the future video already in mind**.

Do not treat the script as a finished literary artifact that will be adapted later. The output must be a development package in which narration, evidence order, curiosity, TTS rhythm, visualizability, reveal timing, transition intent, and directing handoff are designed together.

Primary goal:

`fact-checked research -> narrative spine -> script draft -> directing handoff -> preflight feedback -> script revision -> script candidate`

The script is not final until the development director and storyboard-director preflight agree that it is narratively strong **and** practically directable.

## Authority Boundary

This skill:
- may rewrite narration and reorder already-supported evidence for clarity and suspense;
- may split or merge narrative units;
- may propose visualizable evidence treatment;
- may respond to directing-preflight feedback;
- may mark a script candidate ready for lock review.

This skill may not:
- invent evidence, dialogue, meetings, motives, identities, kinship, locations, or causal certainty;
- promote inference to fact;
- create canonical production approvals;
- generate FINAL TTS before `SCRIPT_DIRECTING_LOCK` and the repository's manager Story Gate are satisfied;
- override `FACT_LOCK`, approved source constraints, Visual Bible, or manager decisions.

## Core Principles

1. **Evidence-first** — the mystery comes from real evidence and real uncertainty.
2. **Scene-aware writing** — every important narration unit must suggest something concrete that can be shown, compared, changed, revealed, or withheld.
3. **Question-chain structure** — each section should answer something while opening the next useful question.
4. **Meaning before method overload** — explain why a method matters before dwelling on procedure.
5. **Evidence as protagonist** — avoid turning the narration into a sequence of "researchers found..." sentences.
6. **No fake drama** — tension comes from contradiction, absence, revised dates, contamination, comparison, or limits of evidence.
7. **TTS rhythm** — alternate sentence lengths; use short judgment lines strategically; avoid report prose.
8. **Directing feedback is upstream feedback** — if the video cannot express a passage cleanly, revise the script before TTS rather than forcing the visual stage to rescue it.
9. **No premature finalization** — a polished script that has not passed directing preflight is still a draft.
10. **Visual event budget** — do not compress several independent information units into one weak visual event merely to preserve prose.
11. **Timed attention** — identify when the first meaningful visual/attention change can occur, not only what it is.
12. **Final-quarter synthesis** — the last quarter must recover the Narrative Spine and expand meaning; it may not collapse into a list of late research results.
13. **Stylization-ready writing** — do not make narrative comprehension depend on photorealistic reenactment of unknown people, clothing, interiors, meetings, or daily-life behavior. Prefer evidence, transformation, comparison, symbolic space, silhouette, editorial visualization, and other non-realistic visual events that can move quickly.

## Required Reading

Use when relevant:
- `references/narrative-bridge.md`
- `references/retention-rhythm.md`
- `references/tts-rhythm.md`

Use templates from `assets/`.

## Development Pipeline

### Pass 0 — Input readiness
Require:
- fact-checked research or approved evidence notes;
- explicit FACT / INFERENCE / UNCERTAINTY / LIMIT distinctions when relevant;
- no unresolved source contradiction hidden as certainty.

If core facts are unresolved, return `BLOCKED_RESEARCH` rather than inventing connective tissue.

### Pass 1 — Evidence Map
For each evidence unit capture:
- evidence_id
- claim_type: FACT | INFERENCE | UNCERTAINTY | DISPUTED | LIMIT
- what happened / what exists
- what it means
- what it does **not** prove
- relationship to the main question

### Pass 2 — Narrative Spine
Before drafting narration, define one sentence that the whole video explores.

Example pattern:
> The disappearance of a population and the disappearance of its ancestry are not the same question.

Every major section must either:
- advance the spine;
- complicate it;
- limit an overclaim;
- provide the final synthesis.

Material that does none of these is compressed or removed.

### Pass 3 — Curiosity Architecture
Map:
- HOOK
- DISCOVERY
- DEEPENING
- REVERSAL
- SYNTHESIS
- RESIDUAL QUESTION

Also define for each narrative unit:
- viewer_question
- reveal_policy
- payoff
- next_question or transition purpose

Do not ask rhetorical questions mechanically at the end of every paragraph.

### Pass 4 — Script Draft
Prefer structures such as:
- scene -> anomaly -> question
- problem -> risk -> method -> discovery
- clue -> interpretation rule -> meaning
- old interpretation -> new evidence -> revision
- question -> comparison -> difference -> next question

Avoid:
- paper-abstract prose;
- three or more results listed without narrative change;
- repeated "researchers/studies confirmed" phrasing;
- hype words such as shocking, unbelievable, chilling;
- unsupported cinematic invention.

### Pass 5 — Directing Handoff
For each narrative unit, fill `assets/directing-handoff-template.md`.

At minimum describe:
- what new information is delivered;
- what the viewer should wonder;
- the physical evidence or visualizable event;
- what should be hidden at entry;
- what should be revealed/pay off;
- the preferred attention event;
- abstraction risk;
- transition intent;
- estimated TTS duration band;
- information-unit count and visual-event budget;
- first attention-event type and target time;
- a secondary attention event for >=8s units, or an explicit exception.

This is **not** a final shot list. Camera and keyframe decisions belong to the storyboard director.

### Pass 6 — Preflight Revision
When `history-fantasy-storyboard-director` returns `DIRECTING_PREFLIGHT` feedback:
- revise every `REVISION_REQUIRED` unit;
- preserve evidence meaning;
- prefer splitting over compressing multiple meanings into one visual beat;
- convert abstract runs into physical evidence, comparison, change, or absence where possible;
- remove narration that only exists because the visual stage cannot express the intended claim;
- record the revision reason.

Typical revision triggers:
- 12-20s of narration with one weak visual event;
- two or more abstract beats in sequence;
- repeated DNA/panel/map-style explanatory visuals;
- a location/research jump without narrative bridge;
- no reason for camera or focus change;
- payoff is spoken before the visual can reveal it;
- TTS duration and event duration are incompatible;
- information-unit count materially exceeds the visual-event budget;
- first meaningful attention change cannot occur by about 4 seconds without an explicit narrative exception.

### Pass 7 — TTS Rhythm Polish
Apply only after the structure is stable.

Rules:
- one primary idea per sentence;
- avoid long compound sentences in sequence;
- avoid same sentence ending four times in a row;
- numbers require context;
- technical terms receive a plain-language consequence;
- short emphasis sentences must carry real meaning, not filler;
- do not optimize pronunciation by changing factual meaning.

### Pass 8 — Script Candidate QC
A script candidate may be sent for lock review only when:
- evidence integrity passes;
- narrative spine is coherent;
- major transitions have bridge logic;
- all high-risk abstraction units have directing handoff;
- no preflight-required revision remains unresolved;
- ending pays off the original question without overclaiming;
- final-quarter QC confirms Theme Spine recovery, meaning expansion, and no result-list collapse.

## Directability Rules

### Evidence-to-Image Contract
Every important unit should primarily resolve to at least one non-photorealistic, stylization-ready visual event:
- OBJECT
- PLACE
- ACTION
- COMPARISON
- CHANGE
- ABSENCE
- DOCUMENTED_DIAGRAM

If the answer is `NONE`, revise, split, or explicitly mark it as a short narration bridge that does not deserve its own visual beat.

### Abstraction Breaker
If abstract explanation runs for three sentences or two consecutive units, interrupt it with one of:
- return to physical evidence;
- before/after comparison;
- scale or location change;
- an observable consequence;
- a short judgment line;
- a new evidentiary question.

### Bridge Rule
When place, time, paper, specimen, or method changes, explain **why the next evidence is needed**.

Use:
- LIMIT_BRIDGE
- CONTRAST_BRIDGE
- METHOD_BRIDGE
- SCALE_BRIDGE
- REVERSAL_BRIDGE

Do not rely on "meanwhile", "next", or "another study" alone.

### Attention Timing Contract
Each production-worthy narrative unit must carry:

```yaml
attention_event:
  type: REVEAL | ACTION | PARALLAX | FOCUS_SHIFT | SPATIAL_DISCOVERY | QUESTION | REORIENTATION | HOLD
  target_time_sec: 0.0
```

Default:
- target the first meaningful attention change at <=4.0s;
- for units >=8s, define a second meaningful change around 4.0-6.5s when the story supports it;
- a deliberate HOLD may exceed the default only with `attention_timing_exception` explaining the narrative purpose.

The writer proposes timing; the storyboard director validates executability.

### Visual Event Budget
For every unit record:
- `information_unit_count`
- `visual_event_budget`

Do not hide four facts inside one generic diagram or slow push.
As a default, if information units exceed visual-event budget by more than one, split the unit or provide a concrete compression justification that preflight can test.

### Final-Quarter Rule
The final 20-25% must:
- recover the original Narrative Spine;
- synthesize, not merely enumerate, late evidence;
- distinguish what is known from what remains unresolved;
- expand the meaning of the opening question;
- avoid introducing a new unrelated major mystery in the final seconds.

A candidate cannot pass if `final_quarter_qc.result_listing_only=true` or if Theme Spine recovery/meaning expansion is absent.

### Evidence Distance
Classify supporting material:
- CORE — central evidence, full development allowed;
- SUPPORT — directly tests the main question, medium treatment;
- CONTEXT — constrains interpretation, concise treatment.

Do not let context evidence become a new protagonist.

## Output Contract

Produce a **Script Development Package**:

1. `NARRATIVE_SPINE`
2. `EVIDENCE_MAP`
3. `CURIOSITY_MAP`
4. `SCRIPT_DRAFT`
5. `SCRIPT_DEVELOPMENT_UNITS`
6. `DIRECTING_HANDOFF`
7. `FACT_GUARDRAILS`
8. `REVISION_LOG`
9. `SCRIPT_QC`
10. `STATUS`

Valid status values:
- `DRAFT_READY_FOR_PREFLIGHT`
- `REVISION_REQUIRED`
- `CANDIDATE_READY_FOR_LOCK_REVIEW`
- `BLOCKED_RESEARCH`

Do **not** output `FINAL_TTS_READY` from this skill alone.

## Quality Gate

Internal script-candidate target: >=96/100. The integrated skill-package validation target is >=98/100.

- Factual integrity 20
- Narrative causality 15
- Curiosity / retention 15
- Directability 15
- Bridge quality 10
- TTS rhythm 10
- Uncertainty discipline 10
- Ending / payoff 5

Hard block:
- fabricated event or relationship;
- inference promoted to fact;
- unsupported causal claim;
- unresolved directing-preflight revision;
- final quarter collapses into research-result listing;
- script marked final before lock review;
- attention timing or visual-event density unresolved at candidate status;
- final quarter fails Theme Spine recovery or meaning expansion.

## Validation

Use:
- `scripts/validate_script_development.py`

Structural validation does not replace factual review or director judgment.
