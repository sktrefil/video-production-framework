# NON_REALISTIC_STYLE_LOCK Validation v1.2

## Result

**99/100 — PASS**

The HISTORY_MYSTERY visual stack now treats non-realistic stylization as a production invariant, not a preference.

## Root cause fixed

A previous directing example still contained the phrase `사실적인 영화 재현`, and the upper architecture did not carry an explicit non-realistic hard lock. That allowed downstream prompts to drift back toward realistic reconstruction.

## Enforcement layers

1. LONGFORM Master Design: HISTORY_MYSTERY = `NON_REALISTIC_STYLIZED`
2. AGENTS.md: Agent1 production invariant
3. history-video-development-director: Visual Skeleton and Sequence QC
4. history-mystery-scriptwriter: stylization-ready writing
5. history-fantasy-storyboard-director: priority #2 after FACT_LOCK
6. Visual Beat template: mandatory `style_mode`
7. Image Job template: explicit photoreal/live-action prohibitions
8. storyboard structural validator: only `NON_REALISTIC_STYLIZED` accepted
9. dedicated non-realistic style validator
10. visual_image agent: no photorealistic requests
11. render-polish: cannot increase photographic realism
12. render-polish validator: positive photoreal/live-action request blocks

## Camera / retention policy

Fast pacing is driven by stylized animation-space direction:
- foreground parallax
- spatial dives
- bold scale transitions
- arc/orbit
- perspective reorientation
- graphic match
- occlusion transitions
- speed contrast
- focus redirection

Realistic detail is not the retention engine.

## Reference policy

Real photos, scans, fossils, excavation imagery and museum references are FACT/SHAPE/PROPORTION references only. They are not final STYLE references. Unknown historical detail is stylized, abstracted, silhouetted or omitted instead of being filled with faux-exact realism.

## Contract cases

Expected PASS:
- `style_mode: NON_REALISTIC_STYLIZED`
- "no photorealistic or live-action output" inside negative constraints

Expected BLOCK:
- `style_mode` missing or different in storyboard contracts
- "photorealistic live-action documentary reenactment"
- "realistic cinematic reconstruction"
- Render Polish changing the final style toward photography

## Oase consequence

The prior `oase_visual_development_v2` remains useful for narrative-unit and information-flow structure, but any visual approval based on a realistic/reconstruction assumption is withdrawn. Oase Visual Skeleton and Visual Beats must be revalidated under `NON_REALISTIC_STYLE_LOCK` before image production.
