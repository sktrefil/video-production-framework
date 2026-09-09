# WF-09 — Scene Asset Pipeline

Status: **PASS**

## Canonical flow

```
Approved Scene
        +
Approved Project Style
        +
Approved Required Identity Anchors
        +
Pinned Channel Visual Bible
        +
Pinned Format Profile
        ↓
v2 ASSET_PLAN
        ↓
v2 IMAGE_ASSET_DESIGN
        ↓
Production Asset
        ↓
GENERATE / IMPORT / REUSE
        ↓
Candidate Media
        ↓
v2 IMAGE_QC
        ↓
QC Result
        ↓
Approval Policy / Human Review
        ↓
Approved Asset
```

Asset, Media, Provider Job, QC, and Approval remain separate domain concepts and separate persistence records.

## Implemented

### Production Asset model

- Asset classes:
  - PRIMARY_SCENE
  - EXTRA_START
  - SPECIAL_END
  - BRIDGE
  - REFERENCE
- Scene production flow rejects REFERENCE as a production Scene Asset.
- Asset roles:
  - HERO
  - STORY_ANCHOR
  - STANDARD
- Production priority:
  - CRITICAL
  - IMPORTANT
  - SUPPORTING
- Source strategy:
  - GENERATE
  - IMPORT
  - REUSE
- Structured Scene StateRef:
  - STATE_IN
  - STATE_CURRENT
  - STATE_OUT
- Stable Asset ID + revision history.
- Candidate Media IDs are separate from approved Media ID.
- Source dependency snapshot records:
  - Scene revision
  - Project Style ID/revision
  - Identity Anchor revision map
  - Format Profile version

### Scene Asset readiness

Scene Asset design requires:

- Scene exists.
- Scene design is APPROVED.
- Scene is not stale.
- Project Style is approved and current.
- Every required Identity Anchor is approved and current.
- Pinned Channel Visual Bible resolves.
- Pinned Format Profile resolves.

This implements the Foundation merge requirements without duplicating v2 production rules inside the Framework.

### v2 Production task mapping

The Scene Asset production adapter uses the canonical tasks:

```
ASSET_PLAN
IMAGE_ASSET_DESIGN
IMAGE_PROMPT
IMAGE_QC
```

No provider-specific creative rules are implemented in the Scene Asset domain.

### Primary Scene Asset

The primary workflow creates/revises a `PRIMARY_SCENE` Asset for the Scene.

The database enforces at most one ACTIVE `PRIMARY_SCENE` per Scene.

When the primary Asset is designed:

- the Scene's `primary_asset_id` projection is updated,
- the Scene narrative revision is NOT incremented,
- Story approval is not invalidated by implementation-only Asset binding.

### Identity continuity

Every required Identity Anchor for the Scene must be included in the Image Asset Design.

The Asset records the exact Anchor revisions used for its design.

If a required Anchor revision, Project Style revision, or Scene revision later changes, the affected Asset can be marked stale without deleting historical revisions.

A cross-WF regression was found and fixed during WF-09:

- revised Identity Anchors originally left `scene_identity_anchor_requirements` pointing to the previous Anchor revision,
- the relation is now rebuilt against the latest Anchor revision,
- regression coverage verifies this behavior.

### GENERATE source strategy

`GENERATE` Assets:

1. compile provider-ready image prompt through `IMAGE_PROMPT`,
2. create an IMAGE_GENERATION Provider Job,
3. automated providers enter `READY`,
4. manual external providers enter `WAITING_EXTERNAL`,
5. Asset enters `GENERATING`.

Provider result registration:

- validates project-relative path,
- requires image MIME,
- requires checksum,
- creates separate MediaArtifact,
- revisions Provider Job to COMPLETE,
- adds Media ID as Asset Candidate,
- does NOT approve the Asset.

### IMPORT source strategy

`IMPORT` Assets can register managed imported image candidates without a Provider Job.

Import validation requires:

- project-relative safe path,
- image MIME,
- checksum.

The imported MediaArtifact remains separate from the Asset and enters the Candidate set.

### REUSE source strategy

`REUSE` Assets can reference an existing AVAILABLE IMAGE MediaArtifact in the same project.

No duplicate Media copy is required.

### Provider Job Pack

Manual external image production supports batch export/import.

Export:

```
ImageJobPack
schemaVersion
projectId
createdAt
jobs[]
  jobId
  assetId
  assetRevision
  provider
  providerProfileVersion
  prompt
  negativePrompt
  resultKey
```

Only manual `WAITING_EXTERNAL` image jobs are exportable.

Batch result import:

- matches results by Job ID,
- validates each result independently,
- supports partial success,
- a bad result does not invalidate successful siblings.

This supports external workflows such as Google Flow without repeated manual prompt bookkeeping.

### Provider failure and Retry Failed Only

Provider failure:

- creates a new revision of the same Job with status FAILED,
- Asset becomes REGENERATE_REQUIRED,
- history is preserved.

Retry:

- only FAILED jobs are retryable through Retry Failed,
- a NEW Job ID is created,
- `retryOfJobId` points to the failed Job,
- attempt number increments,
- prompt is compiled again from current production context.

Batch Retry Failed Only is supported.

### Image QC

Image QC is a separate v2 decision.

QC result remains separate from Asset and Approval.

Mapping:

```
PASS / PASS_WITH_NOTE
→ NEEDS_REVIEW unless ApprovalPolicy auto-approves

FIXABLE
→ NEEDS_REVIEW

REGENERATE
→ REGENERATE_REQUIRED

REDESIGN
→ REDESIGN_REQUIRED

REJECT
→ BLOCKED
```

The Framework does not reinterpret generic FIXABLE as automatic regeneration.

### Approval

Human Asset approval requires:

- candidate Media belongs to the Asset,
- Media is AVAILABLE,
- IMAGE_QC exists,
- QC status is PASS or PASS_WITH_NOTE.

Approval:

- creates separate ApprovalRecord,
- stores `selectedMediaId`,
- revisions the Asset,
- sets `approvedMediaId`,
- changes Asset status to APPROVED.

Auto approval:

- is delegated to `ImageApprovalPolicy`,
- no hard-coded confidence threshold exists in the Scene Asset core,
- only PASS / PASS_WITH_NOTE may be auto-approved.

### Batch workflow

`SceneAssetBatchService` supports:

- batch primary Scene Asset design,
- batch image Provider Job creation,
- batch Image QC,
- batch Asset approval,
- batch external result import,
- Retry Failed Only.

Batch result status:

```
COMPLETE
PARTIAL_COMPLETE
FAILED
```

Each item retains its own success/error result.

### Dependency stale handling

`reconcileDependencies()` compares the active Asset against:

- current Scene revision/stale state,
- current approved Project Style ID/revision,
- current required Identity Anchor revision set.

Only affected Assets become stale.

No destructive delete occurs.

### Media security guard

Image registration rejects:

- absolute paths,
- Windows drive paths,
- parent traversal `..`,
- malformed empty path segments,
- non-image MIME for image results,
- missing checksum.

Canonical stored paths remain project-relative.

## Storage

Migration:

```
migrations/0003_scene_assets.sql
```

Tables:

```
production_assets
media_artifacts
provider_jobs
qc_results
```

Shared Foundation tables:

```
approval_records
workflow_events
event_outbox
```

Important database constraints:

- one ACTIVE revision per Asset ID,
- one ACTIVE PRIMARY_SCENE Asset per Scene,
- one ACTIVE revision per Media ID,
- one ACTIVE revision per Provider Job ID.

State changes, QC, Approval, Provider results, and durable events are transactionally persisted.

## Cross-WF integration

WF-09 is tested with the actual WF-07 and WF-08 persistence in a single `project.db`.

Validated chain:

```
WF-07
Approved Script
→ Scene

WF-08
Project Style
→ Identity Anchor

WF-09
Scene Asset
→ Provider Job
→ Media Candidate
→ Image QC
→ Asset Approval
```

Asset production does not create a new narrative Scene revision.

## Validation

Latest pre-document GitHub Actions run:

```
34323032926
```

Result:

```
npm install   PASS
build         PASS
typecheck     PASS
test          PASS
```

Automated tests at this point:

```
Production-system contracts     3 / 3 PASS
WF-07 Story regression          5 / 5 PASS
WF-08 Visual Identity           5 / 5 PASS
WF-09 Scene Asset               7 / 7 PASS
SQLite integration              4 / 4 PASS

TOTAL                          24 / 24 PASS
```

Important validated cases:

- canonical ASSET_PLAN / IMAGE_ASSET_DESIGN / IMAGE_PROMPT / IMAGE_QC mapping,
- Scene / Style / Anchor / Channel Bible / Format Profile readiness,
- manual external result remains Candidate until QC and Approval,
- auto approval controlled by ApprovalPolicy,
- safe media import validation,
- provider failure and new-job retry,
- partial Batch behavior,
- IMPORT source strategy,
- REUSE source strategy,
- external Image Job Pack export,
- batch external result import,
- one project.db across WF-07/08/09,
- Asset/Media/QC/Approval remain separate,
- Scene primaryAssetId is bound without narrative revision churn,
- Anchor revision relationships stay current.

## Result

```
WORK_ITEM:
WF-09

SCENE_ASSET_MODEL:
PASS

READINESS_GATE:
PASS

V2_TASK_MAPPING:
PASS

PRIMARY_SCENE_ASSET:
PASS

GENERATE:
PASS

IMPORT:
PASS

REUSE:
PASS

PROVIDER_JOB:
PASS

PROVIDER_JOB_PACK:
PASS

RESULT_IMPORT:
PASS

IMAGE_QC:
PASS

APPROVAL:
PASS

AUTO_APPROVAL_POLICY:
PASS

BATCH:
PASS

RETRY_FAILED_ONLY:
PASS

STALE_DEPENDENCY:
PASS

MEDIA_GUARD:
PASS

REVISION_HISTORY:
PASS

DURABLE_EVENT_OUTBOX:
PASS

SQLITE_INTEGRATION:
PASS

WF07_WF08_REGRESSION:
PASS

AUTOMATED_TESTS:
24 / 24 PASS

RESULT:
PASS
```

Next: **WF-10 — Pre-Link / Handoff Pipeline**
