# WF-13 — Final Media Binding / Editor Handoff

Status: **PASS**

## Canonical flow

```
WF-11 Candidate Video
        ↓
WF-12 Clip QC / Fallback
        ↓
PASS / TRIM_PASS / approved editorial implementation / CUT
        ↓
WF-13 Final Media Binding
        ↓
media_binding.json
        ↓
Editor / Remotion timeline assembly
```

WF-13 is a deterministic orchestration/editorial handoff stage. It does not make a new creative or QC judgment over WF-12 results.

## Boundary

WF-13 owns:

- selecting only the current approved implementation,
- binding WF-12 approved video media,
- preserving TRIM_PASS usable ranges exactly,
- binding READY editorial Clips to their approved START image,
- representing approved CUTs as media-free editor instructions,
- blocking direct Candidate-media bypass,
- verifying durable media approval for provider Clips,
- validating current Asset/Media/Link/Clip revisions before binding,
- stable binding ID + revision history,
- stale binding detection when upstream implementation revisions change,
- Project batch binding,
- editor handoff manifest generation,
- binding/readiness projection for the editor / Remotion boundary.

WF-13 does not:

- re-score generated video,
- choose a new fallback,
- rewrite a Clip design,
- regenerate media,
- invent a trim range,
- perform encoded final-render technical QC.

Those responsibilities remain in WF-12 or later render/final-QC stages.

## Provider video binding

Provider-backed Clips can bind only when:

```
clip.providerExecutionRequired = true
clip.clipStatus = APPROVED
clip.approvedMediaId exists
```

Additionally:

- the same media ID must be selected by a durable AUTO_APPROVED or HUMAN_APPROVED Clip approval,
- the media must be AVAILABLE VIDEO,
- the latest Clip QC must be PASS or TRIM_PASS,
- the QC candidate media must equal the approved media,
- the Clip must still match the current Link implementation,
- its bound START/END Assets and image media must still be current and approved.

This prevents a raw Candidate Video from being inserted directly into the final editor handoff.

## TRIM_PASS preservation

WF-13 never recalculates the usable range.

Example validated flow:

```
WF-12
usableInMs  = 400
usableOutMs = 4400

WF-13
sourceInMs  = 400
sourceOutMs = 4400
durationMs  = 4000
```

The range is copied from the persisted ClipQcRecord after validating that it remains inside the approved video duration.

## Editorial Clip binding

The following modes bypass video-provider media:

```
EDITORIAL_MOVE
STATIC_HOLD
REUSE_REFRAME
```

Binding requires:

- current non-stale Clip,
- `clipStatus = READY`,
- `providerExecutionRequired = false`,
- approved final design,
- current approved START Asset,
- current AVAILABLE image media.

The editor handoff carries:

- START image path,
- Clip duration,
- transition method,
- camera move,
- subject motion,
- environment motion.

No fake generated video is introduced.

## CUT binding

An approved CUT is represented as a media-free editor instruction.

Required:

- current Link implementation = CUT,
- current non-stale CUT revision,
- `ready = true`,
- final design approval exists.

Binding contains:

- CUT implementation identity,
- Link revision,
- transition method,
- duration 0,
- no media ID/path.

## Domain model

### FinalMediaBinding

```
id
projectId
revision
lifecycleStatus

linkId
linkRevision

implementationType
implementationId
implementationRevision

bindingKind
bindingStatus
stale
staleReason?

clipMode?
mediaId?
sourceAssetId?
sourceQcId?

sourceInMs?
sourceOutMs?
durationMs

transitionMethod
cameraMove?
subjectMotion?
environmentMotion?
```

Binding kinds:

```
VIDEO
EDITORIAL
CUT
```

Binding statuses:

```
READY
STALE
BLOCKED
```

## Idempotency and revision history

If a current implementation is already bound to the exact same Link and implementation revision:

```
bindClip / bindCut
→ existing binding returned
→ no duplicate binding revision
```

When re-binding after a source revision change:

- stable binding ID is reused,
- previous binding revision becomes SUPERSEDED,
- new binding revision becomes ACTIVE.

## Stale binding detection

Existing ACTIVE bindings are reconciled against current production state.

Stale reasons include:

```
UPSTREAM_LINK_IMPLEMENTATION_CHANGED
CLIP_REVISION_CHANGED
CUT_REVISION_CHANGED
BOUND_MEDIA_UNAVAILABLE
```

A stale binding is never emitted as a current editor-handoff item.

## Editor handoff manifest

WF-13 produces a deterministic manifest object intended to be serialized as:

```
media_binding.json
```

Schema:

```
schemaVersion
projectId
createdAt
recommendedFileName
status

totalImplementations
boundImplementations

items[]
blockers[]
```

Each VIDEO item includes:

- approved media ID/path,
- sourceInMs,
- sourceOutMs,
- effective duration,
- transition and motion metadata.

Each EDITORIAL item includes:

- approved image ID/path,
- planned duration,
- transition and editorial motion metadata.

Each CUT item includes:

- no media path,
- transition instruction.

Manifest status:

```
READY
PARTIAL
BLOCKED
```

Remotion/editor handoff is ready only when every current implementation has a current binding.

## Batch workflow

`bindProject(projectId)` binds all current implementations independently.

Batch status:

```
COMPLETE
PARTIAL_COMPLETE
FAILED
```

A blocked implementation does not corrupt unrelated bindings.

## Storage

Migration:

```
migrations/0007_final_media_binding.sql
```

New table:

```
final_media_bindings
```

Existing stores reused:

```
production_links
production_clips
link_cut_implementations
clip_qc_records
production_assets
media_artifacts
approval_records
workflow_events
event_outbox
```

No duplicate media store is introduced.

## Cross-WF integration

Validated in one `project.db`:

```
WF-07 Approved Script / Scene
        ↓
WF-08 Project Style / Identity
        ↓
WF-09 Approved Scene Assets
        ↓
WF-10 Handoff QC / HANDOFF_PASS
        ↓
WF-11 Provider Clip / Candidate Video
        ↓
WF-12 TRIM_PASS
source candidate approved
usableInMs  = 400
usableOutMs = 4400
        ↓
WF-13 Final Media Binding
sourceInMs  = 400
sourceOutMs = 4400
durationMs  = 4000
        ↓
EditorHandoffManifest = READY
media_binding.json
```

Scene narrative revision remains unchanged through WF-13.

## Validation

Pre-document GitHub Actions run:

```
34335156117
```

Result on both Node 22 and Node 24:

```
npm install   PASS
build         PASS
typecheck     PASS
test          PASS
```

Automated tests:

```
Production-system contracts        6 / 6 PASS
WF-07 Story regression             5 / 5 PASS
WF-08 Visual Identity              5 / 5 PASS
WF-09 Scene Asset                  7 / 7 PASS
WF-10 Pre-Link / Handoff           8 / 8 PASS
WF-11 Final Clip / Provider        9 / 9 PASS
WF-12 QC / Fallback                6 / 6 PASS
WF-13 Final Media Binding          6 / 6 PASS
SQLite integration                 5 / 5 PASS

TOTAL                             57 / 57 PASS
```

Important validated cases:

- TRIM_PASS usable range survives binding unchanged,
- unapproved media cannot be bound even if present on the Clip object,
- editorial Clip binds approved START image without fake video QC,
- CUT becomes a media-free editor instruction,
- Clip revision change makes the old binding stale,
- manifest is BLOCKED before required binding,
- manifest becomes READY after current binding,
- WF-07 → WF-13 completes in one project DB,
- final_media_bindings persists trim and media selection,
- Scene revision does not churn during final binding.

## Result

```
WORK_ITEM:
WF-13

APPROVED_VIDEO_BINDING:
PASS

CANDIDATE_BYPASS_GUARD:
PASS

TRIM_PASS_PRESERVATION:
PASS

EDITORIAL_BINDING:
PASS

CUT_BINDING:
PASS

BINDING_IDEMPOTENCY:
PASS

REVISION_HISTORY:
PASS

STALE_BINDING_DETECTION:
PASS

MEDIA_AVAILABILITY_GUARD:
PASS

PROJECT_BATCH_BINDING:
PASS

EDITOR_HANDOFF_MANIFEST:
PASS

REMOTION_HANDOFF_READINESS:
PASS

DURABLE_EVENT_OUTBOX:
PASS

SQLITE_INTEGRATION:
PASS

WF07_WF08_WF09_WF10_WF11_WF12_REGRESSION:
PASS

AUTOMATED_TESTS:
57 / 57 PASS

RESULT:
PASS
```
