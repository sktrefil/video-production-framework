# WF-14 — Editor / Timeline Assembly

Status: **PASS**

## Canonical flow

```
WF-13 Final Media Binding
        ↓
media_binding.json
        ↓
WF-14 Editor / Timeline Assembly
        ↓
Generic Editor schemaVersion = 1
        ↓
edit_project.json
        ↓
Remotion / Generic Editor
```

WF-14 converts current approved media bindings into the concrete timeline contract consumed by the existing Generic Editor.

## Existing Generic Editor compatibility

WF-14 intentionally follows the existing editor contract:

```
schemaVersion: 1

project
tracks
items
settings
```

Standard tracks:

```
V1 = VIDEO
G1 = GRAPHIC
T1 = TEXT
A1 = AUDIO
```

The current WF-14 stage populates the visual track. Later audio/subtitle/graphic stages can append items without replacing the visual assembly.

## VIDEO timeline item

WF-13 VIDEO bindings become Generic Editor VIDEO items.

Example:

```
WF-12 TRIM_PASS
usableInMs  = 400
usableOutMs = 4400

WF-13 Final Media Binding
sourceInMs  = 400
sourceOutMs = 4400

WF-14 @ 30fps
sourceStartFrame           = 12
sourceDurationInFrames     = 120
sourceAssetDurationInFrames = 150
durationInFrames           = 120
```

The approved source window is converted to frames. It is not re-QC'd or creatively changed.

Default visual properties:

```
trackId      = V1
playbackRate = 1
video volume = 0 by default
x / y        = 0
scale        = 1
rotation     = 0
opacity      = 1
fit          = cover
```

Provider-generated clip audio is therefore silent by default until an explicit audio policy changes it.

## STATIC_HOLD

An approved STATIC_HOLD binding becomes an IMAGE item.

```
type = IMAGE
trackId = V1
durationInFrames = binding duration converted at project fps
```

This is directly renderable by the current Generic Editor.

## CUT

CUT is not converted into fake media.

It is stored as a zero-duration editor boundary:

```
EditorCutBoundary
timelineFrame
linkId
implementationId
transitionMethod
```

A CUT does not advance the timeline cursor.

A project containing only CUT boundaries and no visual items is BLOCKED because it has nothing renderable.

## EDITORIAL_MOVE / REUSE_REFRAME

The current Generic Editor IMAGE item supports only static transform values:

```
x
y
scale
rotation
opacity
fit
```

It does not currently expose timeline camera keyframes.

Therefore WF-14 does not silently drop approved motion intent.

For:

```
EDITORIAL_MOVE
REUSE_REFRAME
```

WF-14:

- creates the source IMAGE item,
- preserves the approved camera/subject/environment motion in `EditorMotionDirective`,
- sets `supportedByCurrentRenderer = false`,
- returns assembly status `PARTIAL`,
- keeps `timelineAssemblyReady = true`,
- sets `remotionHandoffReady = false`.

This makes the renderer capability gap explicit instead of rendering a misleading static result.

STATIC_HOLD does not have this blocker.

## Timeline ordering

Renderable V1 items are laid out contiguously.

```
item 1
timelineStartFrame = 0

item 2
timelineStartFrame = item1 end

item 3
timelineStartFrame = item2 end
```

CUT boundaries do not consume frames.

Project duration is the final V1 cursor.

## Timeline profile

Assembly requires:

```
fps
width
height
```

Optional settings:

```
snapEnabled
snapToleranceFrames
timelineZoom
masterVolume
videoVolume
```

The profile participates in idempotency.

If the source bindings remain unchanged but a meaningful timeline setting such as videoVolume changes, WF-14 creates a new assembly revision.

## Idempotency and revision history

Same:

- binding IDs/revisions,
- project name,
- fps,
- width/height,
- timeline settings,

returns the existing active assembly without creating a duplicate revision.

When source bindings or timeline profile change:

```
stable assembly ID
old revision → SUPERSEDED
new revision → ACTIVE
```

## Stale detection

A previously assembled timeline is rechecked against the current WF-13 handoff.

Stale reasons:

```
MEDIA_BINDING_NOT_READY
SOURCE_BINDING_REVISION_CHANGED
```

A stale assembly becomes:

```
assemblyStatus = BLOCKED
stale = true
```

and is not considered Remotion-ready.

## Output

Primary editor artifact:

```
edit_project.json
```

The `editProject` field is compatible with the current Generic Editor `EditProject` visual contract.

WF-14 also exposes an orchestration wrapper containing:

```
status
editProject
cutBoundaries
motionDirectives
blockers
```

The sidecar metadata prevents CUT and unsupported motion semantics from being lost.

## Storage

Migration:

```
migrations/0008_editor_timeline_assembly.sql
```

New table:

```
editor_timeline_assemblies
```

Persisted:

- source binding refs,
- timeline profile,
- assembly status,
- stale state,
- edit project JSON,
- CUT boundaries,
- motion directives,
- blockers,
- revision history.

Workflow event/outbox are committed transactionally with assembly state.

## Cross-WF integration

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
WF-11 Provider Clip
↓
WF-12 TRIM_PASS
400ms → 4400ms
↓
WF-13 Final Media Binding
↓
WF-14 Timeline Assembly @ 30fps
12 → 132 source frames
120 timeline frames
↓
edit_project.json
↓
Remotion handoff READY
```

Scene narrative revision remains unchanged through WF-14.

## Automated validation

Pre-document validation:

```
GitHub Actions: 34351157250

Node 22 PASS
Node 24 PASS

npm install PASS
build PASS
typecheck PASS
test PASS
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
WF-14 Editor / Timeline Assembly   7 / 7 PASS
SQLite integration                 5 / 5 PASS

TOTAL                             64 / 64 PASS
```

Validated WF-14 cases:

- TRIM_PASS milliseconds convert to correct source frames,
- source asset duration is preserved for Generic Editor trim limits,
- visual items are contiguous,
- CUT consumes zero timeline duration,
- CUT-only project is blocked,
- STATIC_HOLD is render-ready,
- EDITORIAL_MOVE intent is preserved instead of discarded,
- unsupported renderer motion blocks Remotion-ready,
- identical assembly is idempotent,
- profile changes create a new revision,
- source binding revision changes stale the old timeline,
- WF-07 → WF-14 completes in one project DB,
- Scene revision does not churn.

## Result

```
WORK_ITEM:
WF-14

GENERIC_EDITOR_SCHEMA:
PASS

VIDEO_TIMELINE_ASSEMBLY:
PASS

TRIM_FRAME_MAPPING:
PASS

SOURCE_DURATION_MAPPING:
PASS

STATIC_HOLD:
PASS

CUT_BOUNDARY:
PASS

CUT_ONLY_GUARD:
PASS

EDITORIAL_MOTION_PRESERVATION:
PASS

CURRENT_RENDERER_CAPABILITY_GUARD:
PASS

TIMELINE_ORDERING:
PASS

PROFILE_IDEMPOTENCY:
PASS

REVISION_HISTORY:
PASS

STALE_DETECTION:
PASS

EDIT_PROJECT_OUTPUT:
PASS

DURABLE_EVENT_OUTBOX:
PASS

SQLITE_INTEGRATION:
PASS

WF07_TO_WF13_REGRESSION:
PASS

AUTOMATED_TESTS:
64 / 64 PASS

RESULT:
PASS
```
