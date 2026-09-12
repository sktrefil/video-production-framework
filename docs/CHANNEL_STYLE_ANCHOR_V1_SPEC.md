# Channel Style Anchor V1 Specification

## Status

- Work item: STYLE-ANCHOR-01
- State: SPEC LOCK CANDIDATE
- Scope: History / Mystery channel-wide visual reference system
- Depends on: `HISTORY_MYSTERY_VISUAL_BIBLE@1.1.0`, `HISTORY_MYSTERY_VISUAL_DIRECTION_GRAMMAR_V1@1.0.0`
- This document defines the visual reference contract only. It does not yet enable reference-media transport in WF-09.

## 1. Purpose

Text-only Visual Direction rules are not sufficient to hold painterly surface, subject scale, environment dominance, and camera restraint consistently across generations. Channel Style Anchor V1 adds a small set of fixed visual references that are used together with the existing Visual Direction Grammar.

The anchors are not story assets, evidence, identity references, or continuity references. They are style-only references.

```text
Visual Direction Grammar
+ Channel Style Anchor
+ Scene Asset Design
+ ProductionLink Handoff
= final image-generation input
```

## 2. Core visual identity

Channel Style Anchor V1 must visually express the following invariant:

> Story-first illustrated cinematic historical reconstruction. The sequence and environment carry the story; people, objects, artifacts, and spectacle support it rather than dominate it.

Visual priority:

```text
NARRATIVE FUNCTION
> ENVIRONMENT / SPATIAL CONTEXT
> CONTINUITY / HANDOFF
> EVIDENCE
> CHARACTER / OBJECT
```

## 3. Global anchor rules

All official anchors MUST satisfy all of the following.

### Composition

- Environment-first framing.
- Default camera family: medium-wide or wide.
- People and objects are small-to-medium by default.
- No heroic close-up, poster pose, or oversized foreground object unless the anchor role explicitly requires a closer view.
- Clear foreground / midground / background separation suitable for later parallax and I2V.
- Narrative information must remain readable without relying on a single face or object.

### Surface and rendering

- Historically realistic structure and natural human proportions.
- Restrained painterly matte finish.
- Visible but subtle illustrative simplification.
- Reduced photographic microdetail in skin, metal, textile, stone, vegetation, and weathering.
- Controlled edge sharpness: important forms readable, peripheral forms softer.
- No glossy PBR/game-render finish.
- No film-still hyperrealism.
- No beauty-shot portrait rendering.

### Lighting and color

- Motivated natural or period-plausible practical light.
- Soft-to-moderate contrast.
- No decorative rim-light spectacle by default.
- Color comes from period, place, weather, material, and time of day.
- No fixed ornamental channel palette.

### Historical restraint

- No readable generated historical text.
- No invented heraldry, insignia, emblems, map labels, signatures, or documentary-looking fake writing.
- No unsupported exact identity or exact artifact detail.
- Reconstructions must read as reconstruction, not authenticated evidence.

### Format neutrality

- Anchors are channel-wide and MUST NOT encode a shorts-only or longform-only layout.
- Official anchor masters should use a neutral single-image composition rather than 9:16 or 16:9 production framing.
- Preferred master aspect ratio: `1:1`.
- No title bars, captions, numbers, panel borders, arrows, subtitles, UI, or typography.
- SHORTFORM safe-zone behavior remains a downstream Format Profile / Visual Direction rule, not part of the anchor image canvas.

## 4. Official anchor set

Channel Style Anchor V1 contains exactly three style roles.

### STYLE_REF_A — WIDE_ENVIRONMENT

Purpose:

- Establishing scenes
- Travel / movement
- Geographic context
- World-state and atmosphere
- Open-ended or unresolved historical space

Required visual behavior:

- Environment occupies most of the frame.
- Human figures, if present, remain small.
- Story direction is readable through road, terrain, architecture, weather, light, or movement.
- No single person, banner, weapon, building, or artifact may visually monopolize the frame.
- Painterly matte treatment must remain visible even in landscape detail.

Reject if:

- It looks like a movie still or tourism photograph.
- A lead character becomes the obvious portrait subject.
- A single object becomes the composition's spectacle center.

### STYLE_REF_B — STORY_MEDIUM_WIDE

Purpose:

- Human action within historical space
- Tension, pressure, observation, interaction
- Sequence progression without portrait domination

Required visual behavior:

- Medium-wide camera distance.
- One or more people may be clearly readable, but the surrounding space remains narratively important.
- Faces may be visible but not rendered as beauty portraits.
- Clothing, armor, props, and architecture remain credible but simplified enough to preserve the illustrated matte surface.
- Character identity is subordinate to scene function.

Reject if:

- The frame reads as a character poster.
- Skin/armor/textile microdetail becomes photographic.
- Background is reduced to decorative bokeh.

### STYLE_REF_C — EVIDENCE_MYSTERY

Purpose:

- Evidence-led scenes
- Artifact / inscription / document / map / trace / absence
- Investigative or unresolved transitions

Required visual behavior:

- Evidence is contextualized inside space rather than filling the entire frame without narrative reason.
- The frame preserves ambiguity where the evidence is incomplete.
- Generated text or symbols are unreadable / abstracted unless the source is an actual supplied artifact image.
- Evidence detail is sufficient to communicate material and function, but not so exact that invented detail reads as authenticated fact.
- Painterly matte surface remains consistent with A and B.

Reject if:

- Fake inscription or map labels become readable.
- The object is shot like a product advertisement.
- The evidence image appears to claim documentary authenticity.

## 5. Cross-anchor consistency

A, B, and C MUST look like the same channel even when they depict different periods or regions.

Keep consistent:

- painterly matte surface
- restrained microdetail
- observational camera attitude
- naturalistic light
- realistic structure
- non-heroic subject treatment
- clear spatial depth
- subdued spectacle

May vary:

- period
- geography
- weather
- season
- architecture
- clothing
- material palette
- certainty mode

The set should deliberately avoid all three anchors depicting the same civilization or exact project. This reduces content leakage and encourages style transfer rather than Roman-, Joseon-, or project-specific copying.

## 6. Reference-use contract

When an anchor is later supplied to an image provider, the transport instruction MUST state that the image is for STYLE ONLY.

Required semantic instruction:

```text
Use the attached image only as a visual-style reference.
Match its restrained painterly matte surface, environmental dominance,
observational camera distance, naturalistic light, controlled detail,
and non-heroic subject scale.
Do not copy its people, identities, objects, location, era-specific content,
text, symbols, exact composition, or factual details.
```

The anchor must never override:

- approved factual constraints
- scene narrative function
- Project Style facts
- Identity Anchors
- ProductionLink handoff
- format-specific safe areas

## 7. Reference-selection policy

Default selection:

```text
ESTABLISH / TRAVEL / WORLD / UNKNOWN
→ STYLE_REF_A

HUMAN ACTION / INTERACTION / PRESSURE / RECONSTRUCTION
→ STYLE_REF_B

EVIDENCE / ARTIFACT / TRACE / HYPOTHESIS / INVESTIGATION
→ STYLE_REF_C
```

A generation request should normally use exactly one Channel Style Anchor. More than one style anchor should be exceptional because multiple style images may dilute or conflict with the intended visual signal.

Continuity references are a separate class and may be added later in addition to the single style anchor.

## 8. Candidate acceptance checklist for Stage 2

An anchor candidate can be promoted into Channel Style Anchor V1 only if all answers are YES:

- Does it read as illustrated historical reconstruction rather than a photograph or movie still?
- Is the matte painterly surface visible without becoming cartoon-like?
- Is photographic skin/material microdetail restrained?
- Does environment or spatial context remain important?
- Are people/objects appropriately scaled for the anchor role?
- Is the camera observational rather than heroic?
- Is historical structure plausible?
- Is generated readable text absent?
- Are unsupported insignia/heraldry absent?
- Is the image free of captions, panel numbers, borders, arrows, UI, or watermarks?
- Could the same style plausibly be applied to Roman, Joseon, East Asian legend, medieval, ancient, or other history/mystery topics?
- Does it leave enough spatial structure for future editorial movement / I2V?

Any NO means the candidate is rejected and regenerated.

## 9. Stage boundaries

This Stage 1 document intentionally does NOT:

- generate the three anchor images
- register image hashes or MediaArtifacts
- change `IMAGE_PROVIDER_EXECUTION_V1`
- set `acceptsReferenceMedia=true`
- modify the browser upload flow
- change WF-09 Asset Design compilation
- reset or regenerate Roman IX production images

Those changes belong to later stages after the three anchor images are visually accepted.

## 10. Stage 1 completion criteria

Stage 1 is complete when:

1. The three anchor roles are fixed as `WIDE_ENVIRONMENT`, `STORY_MEDIUM_WIDE`, and `EVIDENCE_MYSTERY`.
2. Global surface, camera, scale, factuality, and no-text constraints are fixed.
3. The anchors are formally defined as STYLE-ONLY references, separate from continuity and identity references.
4. Stage 2 has an explicit candidate acceptance checklist.
5. No provider/runtime behavior has been changed prematurely.
