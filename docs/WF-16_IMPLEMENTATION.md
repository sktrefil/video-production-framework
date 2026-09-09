# WF-16 — Audio / TTS / Subtitle / BGM / SFX Timeline Assembly

Status: **PASS**

## Purpose

WF-16 fills the non-visual layers of the Generic Editor timeline without changing the approved WF-13/WF-14/WF-15 visual result.

```
WF-13 Final Media Binding
        ↓
WF-14 / WF-15 Visual Timeline
        ↓
V1 VIDEO / IMAGE / motion
        +
WF-16 Approved Editor Content Plan
        ↓
A1 TTS
A2 Clip Audio
A3 BGM
A4 SFX
T1 Subtitles
T2 Text
G1 Graphics
        ↓
edit_project.json
        ↓
Generic Editor / GenericFinalRender
```

WF-16 is deterministic assembly. It does not choose music, generate TTS, write subtitles, or invent SFX. It receives already-approved content/media references and binds them to the editor timeline.

## Canonical tracks

When an Editor Content Plan exists, the generated Generic Editor project exposes:

```
V1  Main Visual
G1  Graphics
T1  Subtitles
A1  TTS
T2  Text
A2  Clip Audio
A3  BGM
A4  SFX
```

The original WF-14 four-track project remains backward-compatible when no content plan exists.

## Editor Content Plan

WF-16 introduces a revisioned `EditorContentPlan`.

It contains:

```
planStatus

audio[]
subtitles[]
textOverlays[]
graphics[]
```

Only:

```
planStatus = APPROVED
```

is assembled into editor items.

A DRAFT plan does not pollute `edit_project.json`; it produces:

```
CONTENT_PLAN_NOT_APPROVED
```

and the assembly remains PARTIAL until approval.

## Audio placement

Supported item types:

```
TTS
CLIP_AUDIO
BGM
SFX
```

Each audio placement references an existing `MediaArtifact` by media ID.

WF-16 verifies that the media is:

```
lifecycleStatus = ACTIVE
mediaStatus     = AVAILABLE
mediaType       = AUDIO
durationMs      > 0
relativePath    present
```

The source window is converted from milliseconds to Generic Editor frames:

```
timelineStartFrame
sourceStartFrame
sourceDurationInFrames
sourceAssetDurationInFrames
durationInFrames
```

No audio item is allowed to extend the visual composition duration.

The V1 visual timeline remains authoritative for project duration.

## Default audio policy

Default volume:

```
TTS        1.00
CLIP_AUDIO 0.12
BGM        0.10
SFX        0.35
```

Default fades:

```
TTS
fade in  = 0
fade out = 0

CLIP_AUDIO
fade in  = 0
fade out = 0

BGM
fade in  = 0.5 sec
fade out = 1.2 sec

SFX
fade in  = 0
fade out = 0.08 sec
```

Explicit plan values override these defaults.

## Loop rule

Only BGM can loop.

```
BGM + loop=true
→ timeline duration may exceed source duration
→ source window repeats inside the Audio renderer
```

For all non-loop audio:

```
durationInFrames <= sourceDurationInFrames
```

A source-shorter audio item without an approved BGM loop is blocked:

```
CONTENT_AUDIO_EXCEEDS_SOURCE
```

This prevents accidental silence after the source file ends.

## Subtitle assembly

Subtitle cues become:

```
type    = SUBTITLE
trackId = T1
```

WF-16 keeps TTS provenance.

Input:

```
generatedFromAudioPlacementIds = ["narration"]
```

Output:

```
generatedFromTtsIds = ["audio-narration"]
```

For non-MANUAL subtitle generation, a valid TTS reference is required.

WF-16 validates:

- finite positive cue timing,
- cue inside composition,
- no cue overlap,
- non-empty text,
- referenced TTS placement exists,
- cue remains inside the referenced TTS timeline window.

Blocking examples:

```
CONTENT_SUBTITLE_TIMING_INVALID
CONTENT_SUBTITLE_OVERLAP
CONTENT_SUBTITLE_TTS_REFERENCE_INVALID
CONTENT_SUBTITLE_TTS_REFERENCE_REQUIRED
CONTENT_SUBTITLE_OUTSIDE_TTS_RANGE
```

The Generic Editor production gate remains the later final subtitle QC boundary.

## Default subtitle style

When the approved content plan does not override a style, WF-16 emits a renderer-compatible VITRO preset.

For a 1080 × 1920 project this resolves approximately to:

```
x          = 540
y          = 1651.2
width      = 936
fontFamily = VITRO
fontSize   = 91.8
fontWeight = 700
maxLines   = 2
color      = #FFFDF7
stroke     = #17130F / 4px
```

The defaults are dimension-relative so they do not depend on a single 9:16 project size.

## Text overlay assembly

Approved text overlays become:

```
type    = TEXT
trackId = T2
```

Supported roles match the actual Generic Editor:

```
TOP_TITLE
LOWER_THIRD
SOURCE
LABEL
FREE_TEXT
```

Timing and essential geometry must be valid before the item is emitted.

## Graphic assembly

Approved graphics become:

```
type    = GRAPHIC
trackId = G1
```

Supported Generic Editor graphic types:

```
BLUR_PANEL
GRADIENT
SOLID_PANEL
DIM_LAYER
```

WF-16 preserves:

```
x / y
width / height
opacity
blurPx
backgroundColor
borderRadius
gradient colors / angle
zIndex
```

## Project duration policy

WF-16 does not extend the project to fit audio.

```
V1 visual assembly
→ project.durationInFrames
→ fixed composition boundary

A1/A2/A3/A4/T1/T2/G1
→ must fit inside that boundary
```

This prevents a narration or music file from silently creating uncovered black frames at the end of a video.

If narration is longer than the visual timeline, the result is a blocking content/timeline issue that must be resolved upstream.

## Revision and stale behavior

`EditorContentPlan` uses stable ID + revision history.

```
revision N   → SUPERSEDED
revision N+1 → ACTIVE
```

The timeline assembly stores a durable content reference:

```
sourceContentPlanRef
  contentPlanId
  contentPlanRevision
```

If a later content plan revision appears, the existing timeline becomes stale:

```
SOURCE_CONTENT_PLAN_REVISION_CHANGED
```

If the current plan loses approval:

```
CONTENT_PLAN_NOT_APPROVED
```

The stale assembly is BLOCKED until rebuilt.

## Storage

Migration:

```
migrations/0009_editor_content_timeline.sql
```

New tables:

```
editor_content_plans
editor_timeline_content_refs
```

The existing table remains:

```
editor_timeline_assemblies
```

Content plan changes and timeline assembly writes use the existing durable workflow event/outbox mechanism.

## Full single-DB integration

Validated in one `project.db`:

```
WF-07 Story
↓
WF-08 Visual Identity
↓
WF-09 Scene Assets
↓
WF-10 Handoff
↓
WF-11 Provider Video
↓
WF-12 TRIM_PASS
↓
WF-13 Final Media Binding
↓
WF-14 Visual Timeline
↓
WF-15 Executable Editorial Motion Contract
↓
WF-16 Approved Content Plan
    ├─ TTS MediaArtifact
    ├─ BGM MediaArtifact
    ├─ SFX MediaArtifact
    ├─ Subtitle cues
    ├─ Text overlay
    └─ Graphic overlay
↓
edit_project.json
    ├─ V1
    ├─ A1
    ├─ A3
    ├─ A4
    ├─ T1
    ├─ T2
    └─ G1
↓
Remotion handoff READY
```

The integration also verifies that Scene narrative revision does not churn during editor-content assembly.

## Framework validation

Pre-document GitHub Actions:

```
run: 34356166141
head: 08882cc3114c3f22a23e0bdc6405aeb4d790f63b
```

Node 22 and Node 24:

```
npm install   PASS
build         PASS
typecheck     PASS
test          PASS
```

Test groups:

```
Production-system contracts        6 / 6 PASS
WF-07 Story                        5 / 5 PASS
WF-08 Visual Identity              5 / 5 PASS
WF-09 Scene Asset                  7 / 7 PASS
WF-10 Pre-Link / Handoff           8 / 8 PASS
WF-11 Final Clip / Provider        9 / 9 PASS
WF-12 QC / Fallback                6 / 6 PASS
WF-13 Final Media Binding          6 / 6 PASS
WF-14/15/16 Editor Timeline       13 / 13 PASS
SQLite integration                 5 / 5 PASS

TOTAL                             70 / 70 PASS
```

New WF-16 unit coverage includes:

- TTS → A1,
- Clip Audio → A2,
- BGM → A3,
- SFX → A4,
- Subtitle → T1,
- Text → T2,
- Graphic → G1,
- BGM source loop shorter than timeline,
- non-loop source-overrun rejection,
- subtitle TTS provenance,
- subtitle-outside-TTS rejection,
- DRAFT content-plan rejection,
- content-plan revision stale detection.

## Actual Generic Editor validation

Repository:

```
sktrefil/video-production
branch: feature/wf16-audio-subtitle-timeline-assembly
```

Pre-document GitHub Actions:

```
run: 34356375473
head: e24b11ea4546aaeaae0f33b25f26a3cd2692d527
```

The actual Generic Editor already had renderer implementations for these item types. WF-16 adds a contract regression fixture to prove the Framework output remains compatible.

Validated:

```
editor-state            PASS
editor-renderer         PASS
editor-timeline         PASS
editor-video            PASS
editor-audio            PASS
editor-subtitles        PASS
editor-overlays         PASS
editor-bgm-sfx          PASS
editor-persistence      PASS
editor-production       PASS
editor-wf16             PASS
TypeScript / ESLint     PASS
Remotion bundle         PASS
```

The dedicated WF-16 check confirms:

```
A1/A2/A3/A4 track normalization     PASS
T1/T2/G1 track normalization        PASS
BGM loop persistence                PASS
Subtitle → TTS provenance           PASS
Production gate compatibility       PASS
Full visual coverage                PASS
AudioItemRenderer routing           PASS
TextItemRenderer routing            PASS
GraphicItemRenderer routing         PASS
```

## Result

```
WORK_ITEM:
WF-16

CONTENT_PLAN_REVISIONING:
PASS

APPROVED_PLAN_GATE:
PASS

TTS_A1_ASSEMBLY:
PASS

CLIP_AUDIO_A2_ASSEMBLY:
PASS

BGM_A3_ASSEMBLY:
PASS

SFX_A4_ASSEMBLY:
PASS

SUBTITLE_T1_ASSEMBLY:
PASS

TEXT_T2_ASSEMBLY:
PASS

GRAPHIC_G1_ASSEMBLY:
PASS

AUDIO_MEDIA_VALIDATION:
PASS

AUDIO_SOURCE_WINDOW:
PASS

BGM_LOOP_POLICY:
PASS

SUBTITLE_TTS_PROVENANCE:
PASS

SUBTITLE_TIMING_GUARD:
PASS

CONTENT_STALE_DETECTION:
PASS

SQLITE_CONTENT_PERSISTENCE:
PASS

WF07_TO_WF16_SINGLE_DB:
PASS

GENERIC_EDITOR_CONTRACT:
PASS

REMOTION_BUNDLE:
PASS

FRAMEWORK_TESTS:
70 / 70 PASS

RESULT:
PASS
```
