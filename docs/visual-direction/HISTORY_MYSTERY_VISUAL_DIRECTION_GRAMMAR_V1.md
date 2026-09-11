# HISTORY_MYSTERY Visual Direction Grammar V1

## Purpose

This document defines how the HISTORY_MYSTERY channel turns approved story material into images and later video clips. The canonical machine-readable source is `HISTORY_MYSTERY_VISUAL_BIBLE@1.1.0`; this document explains the same V1 rules for human review and production use.

The governing principle is:

> Story first. Environment and continuity carry the sequence. Characters, objects, artifacts, and spectacle support the narrative rather than dominate it.

## 1. Visual hierarchy

Every image is designed in this priority order:

1. Narrative function
2. Environment and spatial context
3. Continuity and handoff
4. Evidence
5. Character or object

A frame is not successful merely because a person, artifact, or prop is visually impressive. It must move the story forward and leave useful visual information for the next cut.

## 2. Default shot grammar

The default shot family is **medium-wide or wide** with high environmental visibility. Characters and objects should normally occupy a **small-to-medium** share of the frame.

Close-ups are restricted to moments that have earned them through story function, such as:

- a narrative turning point;
- decisive evidence;
- an emotional transition;
- a reaction to evidence.

Do not enlarge a person or object merely to make the frame dramatic.

## 3. Surface and rendering language

The base look is **Illustrated Cinematic Historical Reconstruction**:

- historically realistic anatomy, architecture, geography, clothing, tools, and material logic;
- restrained painterly / matte surface treatment;
- reduced photographic skin and material micro-detail;
- controlled sharpness rather than hyper-real photographic rendering;
- no glossy game-render finish.

Color is not a fixed decorative palette. It is derived from era, region, weather, materials, light, and story state.

## 4. Evidence discipline

Evidence supports the narrative; it does not replace it.

- Generated readable historical text is forbidden.
- Unsupported heraldry, insignia, emblems, or exact artifact detail are forbidden.
- Consecutive evidence close-ups should be avoided.
- After an evidence-focused close view, return to spatial or interpretive context whenever the story allows.
- Generated reconstruction must not masquerade as authenticated primary evidence.

## 5. Certainty-dependent visual language

### FACT

Observational, legible, restrained. Show supported place, action, material, or evidence without added spectacle.

### RECONSTRUCTION

Cinematic but visibly reconstructed. Preserve plausible structure without presenting the image as primary evidence.

### HYPOTHESIS

Use partial views, distance, occlusion, competing possibilities, or reduced specificity so one proposed explanation does not read as settled fact.

### LEGEND

Permit stronger symbolism and painterly abstraction, while clearly separating legendary imagery from documentary evidence.

### UNKNOWN

Use negative space, distance, fog, incomplete information, or unresolved direction instead of depicting a definitive answer.

## 6. Handoff and sequence continuity

Each image should preserve **2 to 4** useful continuity elements into the adjacent cut when appropriate:

- subject or travel direction;
- depth axis;
- light direction;
- weather / atmosphere;
- dominant geometry;
- handoff anchor.

`ProductionLink` remains the canonical source of handoff intent. WF-09 translates those canonical Link decisions into image-design continuity constraints and the minimum prompt wording needed for generation.

The purpose is not to make adjacent images identical. The purpose is to make the visual change feel motivated rather than reset.

## 7. Motion-ready composition

Images should leave room for later I2V or editorial movement. Preferred motion language includes:

- slow push-in;
- measured forward tracking;
- restrained lateral tracking;
- subtle parallax;
- evidence reveal;
- atmospheric drift.

Avoid spectacle-only camera moves such as whip pans, crash zooms, fast orbits, and unmotivated drone dives unless explicitly justified by the approved story.

## 8. SHORTFORM composition

Short-form delivery may blur or crop the upper and lower peripheral regions. Therefore:

- keep essential narrative information in the central **60–70%** of the frame;
- use the top **15–20%** as a lower-detail atmospheric zone where possible;
- use the bottom **15–20%** as a lower-detail transitional zone where possible;
- keep decisive faces, evidence, handoff anchors, and required story information away from those peripheral zones.

Typical low-detail content for the peripheral zones includes sky, fog, floor, shadow, ground texture, water, or other non-essential atmosphere.

## 9. Prompt compilation rule

The final IMAGE_PROMPT stays compact. Detailed reasoning lives upstream in Scene Asset Design, Project Style, Identity Anchors, canonical handoff links, and this grammar.

A final prompt should communicate only what materially affects the frame:

1. narrative role / action;
2. environment and spatial context;
3. necessary subject scale and camera distance;
4. continuity / handoff constraints that affect composition;
5. historically realistic structure with restrained painterly matte treatment;
6. certainty handling when needed;
7. short-form central-information constraint when the format is SHORTFORM.

Do not inject a long master-style paragraph into every prompt.

## 10. Default prohibitions

The following are prohibited by default:

- readable generated historical text;
- unsupported insignia or heraldry;
- heroic close-up as a default composition;
- character or object dominance without a narrative reason;
- photoreal portrait language as the channel default;
- glossy game-render language;
- legacy master style or palette injection.

## Production flow

```text
Approved Story / Scene
        ↓
Channel Visual Bible
        ↓
Visual Direction Grammar V1
        ↓
Project Style + Identity Anchors
        ↓
Canonical ProductionLink Handoff
        ↓
Scene Asset Design
        ↓
Compact IMAGE_PROMPT
        ↓
Image Generation
        ↓
IMAGE_QC / Human Approval
        ↓
Approved endpoint images
        ↓
Clip Link / Video Prompt / I2V
```

The target is a sequence that feels authored as one investigation, not a slideshow of individually impressive characters and objects.
