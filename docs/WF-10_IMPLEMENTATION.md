# WF-10 — Pre-Link / Handoff Pipeline

Status: **PASS**

## Canonical flow

```
Approved Scene Chain
        ↓
Structural Link Graph
        ↓
v2 PRE_LINK
        ↓
Pre-Link Ready / Human Review
        ↓
Approved PRIMARY_SCENE Assets
        ↓
Actual Asset Binding
        ↓
v2 QC + LINK scope + qcType=HANDOFF_QC
        ↓
Handoff QC
        ↓
HANDOFF_PASS / NEEDS_REVIEW / REWORK_REQUIRED
        ↓
Final Clip Design readiness
```

WF-10 stops at Handoff readiness. It does **not** perform Final Clip Design, choose Clip mode, or generate video. Those remain WF-11 responsibilities.

## Foundation boundary preserved

The repository Foundation explicitly defines:

```
Actual asset handoff QC
=
QC task
+
LINK scope
```

Therefore WF-10 does not introduce a new Production Task named `HANDOFF_QC`.

Canonical adapter calls are:

```
PRE_LINK
target = LINK

QC
target = LINK
context.qcType = HANDOFF_QC
```

The Framework stores workflow/runtime state. v2 remains the production decision owner.

## Production Link model

Added a revisioned `ProductionLink` entity.

Core fields:

```
fromSceneId
fromSceneRevision
fromStateRef

toSceneId
toSceneRevision
toStateRef

linkScope

preLinkRequired
continuityLevel
stateChange
handoffIntent
handoffAnchor
handoffChannels
transitionIntent
preLinkApprovalId

fromAssetId
fromAssetRevision
fromMediaId

toAssetId
toAssetRevision
toMediaId

handoffQcId
handoffUsable
handoffReviewApprovalId
preLinkMatch

linkStatus
stale
staleReason
```

State references are structured:

```
FROM_STATE_REF
= FROM_SCENE.STATE_OUT

TO_STATE_REF
= TO_SCENE.STATE_IN
```

## Link scope

LONGFORM preserves structural boundaries:

```
same Sequence
→ SEQUENCE_LOCAL

different Sequence, same Chapter
→ SEQUENCE_BOUNDARY

different Chapter
→ CHAPTER_BOUNDARY
```

SHORTFORM uses:

```
FULL_VIDEO_PRIMARY
```

Boundary Links are structural records. The Framework does not invent a hard cut, reset, match cut, sound bridge, or I2V method. Those production decisions remain downstream/v2-owned.

## Link Graph

`buildLinkGraph()`:

- reads only current approved Scenes,
- follows Chapter → Sequence → Scene production order,
- creates stable Link IDs for adjacent Scene pairs,
- preserves unchanged Links,
- creates a new Link revision when endpoint Scene revisions change,
- marks removed pair Links stale instead of deleting history,
- is idempotent when the Story graph is unchanged.

A Link Graph rebuild does not revise Scene narrative entities.

## Conditional Pre-Link

Pre-Link is not universally mandatory.

v2 returns:

```
preLinkRequired: true | false
```

If `false`:

- Framework does not force a continuity requirement,
- an ApprovalRecord with `NOT_REQUIRED` is recorded,
- the Link may proceed to waiting for approved Assets.

If `true` and normal/clear:

- `AUTO_APPROVED` may be recorded,
- the Link progresses automatically.

If v2 returns `requiresHumanReview=true`:

- Link enters `PRE_LINK_DRAFT`,
- no automatic approval is created,
- explicit human approval moves it to `WAITING_FOR_ASSETS`.

This preserves the Foundation automation policy without hard-coded confidence thresholds in WF-10.

## Pre-Link data

Validated Pre-Link decision contains:

- continuity level,
- state change,
- handoff intent,
- handoff anchor,
- handoff channels,
- transition intent.

Required Pre-Link decisions must identify at least one handoff channel.

Supported channels:

```
VISUAL
AUDIO
EDIT
```

WF-10 primarily validates actual visual Assets. Audio/Edit channels remain available as Link intent for later pipelines.

## Actual Asset binding

Handoff QC never runs against a prompt-only or planned Asset.

Both Link endpoints require:

- active PRIMARY_SCENE Asset,
- Asset status APPROVED,
- non-stale Asset,
- revision-bound ASSET ApprovalRecord,
- selected approved Media ID,
- AVAILABLE MediaArtifact.

Binding stores exact endpoint snapshots:

```
fromAssetId
fromAssetRevision
fromMediaId

toAssetId
toAssetRevision
toMediaId
```

After binding:

```
linkStatus = HANDOFF_QC_PENDING
```

Provider output existence alone is never treated as approval.

## Actual Handoff QC

The decision context includes:

- Link,
- FROM Scene,
- TO Scene,
- bound FROM Asset,
- bound FROM Media,
- bound TO Asset,
- bound TO Media,
- qcType = HANDOFF_QC.

A separate `QcResult` is written with:

```
qcType = HANDOFF_QC
targetType = LINK
```

QC and Link status remain separate.

## Handoff result mapping

Normal mapping:

```
PASS / PASS_WITH_NOTE
→ HANDOFF_PASS

FIXABLE + continuityUsable
→ HANDOFF_NEEDS_REVIEW

REGENERATE
→ REWORK_REQUIRED

REDESIGN
→ REWORK_REQUIRED

REJECT
→ REWORK_REQUIRED
```

A contradictory decision such as:

```
qcStatus = PASS
preLinkMatch = MISMATCH
```

is rejected as invalid output.

PASS also requires:

```
continuityUsable = true
```

## Human review on Handoff QC

v2 Decision metadata is respected.

Even if the structured QC payload says PASS, when:

```
requiresHumanReview = true
```

the Framework does not open Final Clip Design automatically.

Instead:

```
HANDOFF_NEEDS_REVIEW
↓
Human acceptance
↓
HUMAN_APPROVED ApprovalRecord
↓
HANDOFF_PASS
```

The Link records:

```
handoffUsable
handoffReviewApprovalId
```

This prevents low-confidence QC bypass and avoids workflow dead ends.

A non-usable Handoff result cannot be manually forced through this approval path.

## Final Clip readiness

WF-10 exposes readiness only.

```
finalClipDesignReady = true
```

only when the Link reaches:

```
HANDOFF_PASS
```

WF-10 itself does not create a Clip or choose a transition implementation.

## Dependency reconciliation

WF-10 distinguishes Story changes from Asset changes.

### Story endpoint change

If:

- Scene missing,
- Scene stale,
- Scene revision changed,

then the Link becomes stale.

Reason:

```
STORY_STATE_CHANGED
```

The Link must be rebuilt from the current Story chain.

### Approved Asset change

If the Story pair is unchanged but an endpoint approved Asset/Media changes:

- Pre-Link design and approval are preserved,
- previous Asset binding is cleared,
- previous Handoff QC reference is cleared,
- Handoff review approval is cleared,
- Link returns to `WAITING_FOR_ASSETS`.

This implements local root-cause recovery instead of invalidating the entire Link design.

## Batch workflow

`PreLinkHandoffBatchService` supports:

- Batch Pre-Link design,
- Batch approved Asset binding,
- Batch Handoff QC.

Batch status:

```
COMPLETE
PARTIAL_COMPLETE
FAILED
```

Each Link keeps its own result/error so one bad pair does not fail unrelated Links.

## Storage

Migration:

```
migrations/0004_prelink_handoff.sql
```

New table:

```
production_links
```

Existing canonical tables are reused:

```
scenes
production_assets
media_artifacts
approval_records
qc_results
workflow_events
event_outbox
```

Database constraints:

- one ACTIVE revision per Link ID,
- one ACTIVE Link per project/fromScene/toScene pair.

Link state changes, Approval, QC and events are transactionally persisted.

## Durable event examples

WF-10 writes durable events including:

```
LINK_GRAPH_REBUILT
PRE_LINK_READY
PRE_LINK_NEEDS_REVIEW
PRE_LINK_APPROVED
LINK_ASSETS_BOUND
HANDOFF_QC_COMPLETED
HANDOFF_QC_REVIEW_ACCEPTED
LINK_DEPENDENCIES_RECONCILED
```

Every event receives an Outbox record.

## Cross-WF integration

Validated in one `project.db`:

```
WF-07
Approved Script
→ Approved Scene

WF-08
Project Style
→ Identity Anchor

WF-09
Scene Asset
→ Image Candidate
→ Image QC
→ Approved Asset

WF-10
Link Graph
→ Pre-Link
→ Actual Asset Binding
→ Handoff QC
→ HANDOFF_PASS
```

Link production does not create new Scene narrative revisions.

## Validation

Latest pre-document GitHub Actions run:

```
34327802952
```

Result:

```
npm install   PASS
build         PASS
typecheck     PASS
test          PASS
```

Automated tests:

```
Production-system contracts     4 / 4 PASS
WF-07 Story regression          5 / 5 PASS
WF-08 Visual Identity           5 / 5 PASS
WF-09 Scene Asset               7 / 7 PASS
WF-10 Pre-Link / Handoff        8 / 8 PASS
SQLite integration              5 / 5 PASS

TOTAL                          34 / 34 PASS
```

Important validated cases:

- PRE_LINK uses LINK target,
- Handoff QC uses canonical QC + LINK + HANDOFF_QC context,
- LONGFORM local/boundary Link scopes,
- SHORTFORM full-video primary Link scope,
- structured STATE_OUT → STATE_IN refs,
- Link Graph idempotency,
- conditional Pre-Link NOT_REQUIRED path,
- auto Pre-Link approval,
- human Pre-Link review path,
- approved Asset-only Handoff binding,
- actual Media binding,
- Handoff PASS readiness,
- invalid contradictory QC rejection,
- low-confidence PASS cannot bypass human review,
- human Handoff review acceptance,
- Asset-only change resets Handoff but preserves Pre-Link,
- Scene change stales Link,
- partial Batch behavior,
- WF-07 → WF-08 → WF-09 → WF-10 single-DB integration,
- Link revision history,
- QC/Approval separation,
- durable event/outbox persistence.

## Scope Audit

WF-10 intentionally does not implement:

- Final Clip Design,
- Clip mode selection,
- camera motion selection,
- video provider prompt generation,
- Video Provider Job,
- Clip QC,
- Additional Asset creation from Final Clip Design.

These belong to WF-11 and later.

## Result

```
WORK_ITEM:
WF-10

LINK_DOMAIN:
PASS

STRUCTURED_STATE_REFS:
PASS

LONGFORM_SCOPE:
PASS

SHORTFORM_SCOPE:
PASS

LINK_GRAPH:
PASS

PRE_LINK:
PASS

CONDITIONAL_PRE_LINK:
PASS

PRE_LINK_APPROVAL:
PASS

ACTUAL_ASSET_BINDING:
PASS

HANDOFF_QC:
PASS

QC_APPROVAL_SEPARATION:
PASS

HUMAN_REVIEW:
PASS

FINAL_CLIP_READINESS:
PASS

DEPENDENCY_RECONCILIATION:
PASS

BATCH:
PASS

REVISION_HISTORY:
PASS

DURABLE_EVENT_OUTBOX:
PASS

SQLITE_INTEGRATION:
PASS

WF07_WF08_WF09_REGRESSION:
PASS

AUTOMATED_TESTS:
34 / 34 PASS

RESULT:
PASS
```

Next: **WF-11 — Final Clip / Provider Job Pipeline**
