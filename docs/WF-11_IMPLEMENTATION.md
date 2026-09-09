# WF-11 — Final Clip / Provider Job Pipeline

Status: **PASS**

## Canonical flow

```
HANDOFF_PASS
        ↓
v2 FINAL_CLIP_DESIGN
        ↓
CLIP / CUT / ADDITIONAL_ASSET_REQUIRED
        ↓
Final Design Approval
        ↓
[Provider execution required?]
        ├─ NO  → Editorial/CUT ready
        └─ YES
             ↓
        v2 PROVIDER_PRE_QC
             ↓
        PASS / REVIEW / BLOCKED
             ↓
        v2 VIDEO_PROMPT
             ↓
        Video Provider Job
             ↓
        Provider Result
             ↓
        Candidate Video
             ↓
        WF-12 CLIP_QC
```

WF-11 intentionally stops at **Candidate Video**. It does not run CLIP_QC and does not approve generated video media.

## Boundary

WF-11 owns runtime/orchestration for:

- Final implementation design execution.
- Final Clip/CUT persistence.
- Final design approval state.
- Provider Pre-QC runtime state.
- Provider Job lifecycle.
- Manual external Job Pack export/import.
- Video Media candidate registration.
- Provider failure/retry.
- Final implementation dependency stale detection.
- User-facing readiness and recovery projection.

AI VIDEO PRODUCTION SYSTEM v2.0.0 remains the production decision owner for:

```
FINAL_CLIP_DESIGN
PROVIDER_PRE_QC
VIDEO_PROMPT
```

WF-11 does not implement production-rule heuristics such as motion-budget selection, transition preference, camera choice, safety rewriting, or fallback selection.

## Production-system task mapping

Canonical calls:

```
FINAL_CLIP_DESIGN
target = LINK

PROVIDER_PRE_QC
target = CLIP

VIDEO_PROMPT
target = CLIP
```

No CLIP_QC call exists in WF-11.

## Production implementations

A Link can receive one current final implementation.

### CLIP

```
implementationType = CLIP
implementationRefId = clip_id
```

Supported Clip modes:

```
DIRECT_START_END_I2V
SINGLE_IMAGE_I2V
EDITORIAL_MOVE
STATIC_HOLD
REUSE_REFRAME
```

### CUT

```
implementationType = CUT
implementationRefId = cut_id
```

CUT implementation creates no Provider Job.

### Additional Asset requirement

When Final Clip Design returns:

```
additionalAssetRequired = true
```

WF-11:

- does not create a Clip,
- does not create a Provider Job,
- returns the Link to `REWORK_REQUIRED`,
- records the reason and decision ID in a durable event,
- supersedes any previous active Clip/CUT implementation.

This prevents forcing unstable I2V execution when an additional SPECIAL_END / BRIDGE-type production state is needed.

Actual additional-asset recovery is completed by the later QC/Fallback workflow.

## Clip domain model

`ProductionClip` stores:

```
linkId
linkRevision

clipMode

clipStartStateRef
clipEndStateTarget

startAssetId
startAssetRevision
startMediaId

endAssetId?
endAssetRevision?
endMediaId?

transitionMethod
cameraMove
subjectMotion
environmentMotion
durationMs

providerExecutionRequired

finalDesignApprovalId?
providerPreflightId?

candidateMediaIds
approvedMediaId?

clipStatus
stale
staleReason
```

The Clip remains an implementation of a Link, not a child of Scene.

## Clip mode execution policy

WF-11 does not force AI video generation.

Provider execution is required only for:

```
DIRECT_START_END_I2V
SINGLE_IMAGE_I2V
```

Provider execution is not required for:

```
EDITORIAL_MOVE
STATIC_HOLD
REUSE_REFRAME
```

These editorial modes can become `READY` after Final Design approval and are passed downstream for editor binding.

CUT implementation likewise bypasses Provider execution.

## Final Design approval

Final Clip/CUT design can auto-progress when v2 does not request review.

Normal clear result:

```
AUTO_APPROVED
```

Low-confidence / review-required result:

```
DESIGNED
↓
Human Review
↓
HUMAN_APPROVED
↓
FINAL_DESIGN_READY
```

Provider Pre-QC cannot run before Final Clip Design approval.

## Provider Pre-QC

Provider Pre-QC is not generated-media QC.

It evaluates whether the approved Final Clip Design can be executed by a specific:

```
provider
providerProfileVersion
```

The persisted `ProviderPreflightRecord` includes:

```
clipId
clipRevision
provider
providerProfileVersion

status
safetySafe
capabilityCompatible
requiresAlternativeRepresentation

issueCodes
recommendedAction
decisionId
reviewApprovalId
```

### PASS

Requirements:

- safetySafe = true
- capabilityCompatible = true
- requiresAlternativeRepresentation = false

Result:

```
clipStatus = READY
```

### Safe review

When the result is safe and compatible but requires human review:

```
NEEDS_REVIEW
↓
Human acceptance
↓
ProviderPreflight PASS
↓
clipStatus = READY
```

### Safety / capability block

Unsafe or incompatible results are not approval-overridable.

Examples:

```
safetySafe = false
capabilityCompatible = false
requiresAlternativeRepresentation = true
```

Result:

```
clipStatus = BLOCKED
```

The user must revise the Final Clip design/provider path. WF-11 never performs wording-based safety circumvention.

## Provider execution prompt

`VIDEO_PROMPT` is compiled only after a passing Provider Pre-QC.

The resulting Provider Job stores execution data including:

```
clipMode
transitionMethod
durationMs
prompt
negativePrompt

startMediaId
startMediaPath

endMediaId?
endMediaPath?
```

This keeps the external job reproducible from exact approved endpoint media.

## Video Provider Job

Provider Job uses the shared canonical `provider_jobs` table.

Job type:

```
VIDEO_GENERATION
```

Target:

```
CLIP
```

Execution modes:

```
AUTOMATED
MANUAL_EXTERNAL
```

Initial state:

```
AUTOMATED
→ READY

MANUAL_EXTERNAL
→ WAITING_EXTERNAL
```

Creating a Job moves the Clip to:

```
GENERATING
```

## Manual external Video Job Pack

Manual external production supports batch export.

`VideoJobPack` contains:

```
schemaVersion
projectId
createdAt

jobs[]
  jobId
  clipId
  clipRevision
  provider
  providerProfileVersion
  clipMode
  durationMs
  prompt
  negativePrompt
  startMediaId
  startMediaPath
  endMediaId
  endMediaPath
  resultKey
```

This directly supports external generation workflows such as Google Flow without manually rebuilding the execution mapping.

## Video result registration

A provider result must pass media guards:

- project-relative path only,
- no path traversal,
- video MIME type,
- checksum required,
- positive duration required.

Result registration creates a separate `MediaArtifact`:

```
mediaType = VIDEO
mediaStatus = AVAILABLE
```

The Clip becomes:

```
CANDIDATE_AVAILABLE
```

The generated video is **not** approved.

WF-11 does not write a CLIP_QC result and does not create an ApprovalRecord with selected video media.

## Stale provider-result protection

A Provider Job records the Clip revision it was created from.

When a result or failure returns, WF-11 requires the current Clip to still be the exact expected execution revision:

```
currentClip.revision
=
job.targetRevision + 1

AND

clipStatus = GENERATING
```

If the Clip was redesigned or otherwise changed after Job creation, the late provider result is rejected as:

```
IMPLEMENTATION_STALE
```

This prevents old generated media from being attached to a newer Clip design.

## Provider failure and Retry Failed Only

Provider failure:

```
Job → FAILED
Clip → REGENERATE_REQUIRED
```

Retry:

- only FAILED jobs are retryable,
- creates a new Job ID,
- records `retryOfJobId`,
- increments attempt,
- recompiles VIDEO_PROMPT from current production context,
- reuses only the same passing Provider Pre-QC context.

The failed Job is never destructively overwritten.

## Dependency reconciliation

Active CLIP and CUT implementations retain the exact Link revision they were designed from.

If the current Link changes:

- Link revision mismatch,
- Link becomes stale,
- implementation type/ref changes,

the affected implementation becomes stale.

CLIP and CUT are both checked.

No unrelated implementation is invalidated.

## Final Clip readiness projection

`getReadiness()` exposes user-facing operational readiness:

```
currentLinkMatches
finalDesignApproved
providerPreflightRequired
providerPreflightPassed
videoGenerationReady
editorialReady
candidateAvailable
clipStatus
```

This allows the UI to show the next action without exposing internal production rules.

## User recovery mapping

WF-11 maps technical failures to user actions such as:

```
RUN_HANDOFF_QC
REBIND_APPROVED_ASSETS
REVIEW_FINAL_CLIP_DESIGN
RUN_PROVIDER_PRE_QC
REVIEW_SAFE_ALTERNATIVE
EXPORT_VIDEO_JOB_PACK
IMPORT_VIDEO_AGAIN
REBUILD_OR_REGENERATE_CLIP
```

Safety blocks are presented as revision/alternative actions rather than retry loops.

## Batch workflow

`FinalClipBatchService` supports:

- Batch Final Implementation Design,
- Batch Provider Pre-QC,
- Batch Video Job creation,
- Batch external result import,
- Retry Failed Only.

Batch result:

```
COMPLETE
PARTIAL_COMPLETE
FAILED
```

One failed Clip does not fail unrelated Clips.

## Storage

Migration:

```
migrations/0005_final_clip_provider_job.sql
```

New tables:

```
production_clips
link_cut_implementations
provider_preflights
link_implementation_refs
```

Existing shared tables reused:

```
production_links
provider_jobs
media_artifacts
approval_records
workflow_events
event_outbox
```

No new duplicate Provider Job or Media store is introduced.

## Revision and history model

- Clip stable ID + revision history.
- CUT stable ID + revision history.
- Provider Preflight stable ID + revision history.
- Provider Job failures/retries preserved.
- Link implementation references are revision-bound.
- Previous active implementation is superseded when final design changes.
- Additional-asset rework supersedes previous implementation.
- Candidate video media is never destructively overwritten.

## Cross-WF integration

Validated in one `project.db`:

```
WF-07
Approved Script
→ Approved Scene

WF-08
Project Style
→ Identity Anchors

WF-09
Approved Scene Images

WF-10
Pre-Link
→ Actual Asset Handoff QC
→ HANDOFF_PASS

WF-11
FINAL_CLIP_DESIGN
→ Provider Pre-QC
→ VIDEO_PROMPT
→ Manual Video Provider Job
→ Candidate Video
```

Scene narrative revision remains unchanged by Link/Clip production state.

## Validation

Latest pre-document GitHub Actions run:

```
34330012841
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
Production-system contracts       5 / 5 PASS
WF-07 Story regression            5 / 5 PASS
WF-08 Visual Identity             5 / 5 PASS
WF-09 Scene Asset                 7 / 7 PASS
WF-10 Pre-Link / Handoff          8 / 8 PASS
WF-11 Final Clip / Provider       9 / 9 PASS
SQLite integration                5 / 5 PASS

TOTAL                            44 / 44 PASS
```

Important validated cases:

- canonical FINAL_CLIP_DESIGN / PROVIDER_PRE_QC / VIDEO_PROMPT mapping,
- CUT bypasses Provider execution,
- Editorial modes bypass Provider execution,
- Final Clip review blocks Provider path until approval,
- unsafe Provider Pre-QC cannot be human-overridden,
- safe reviewable Provider Pre-QC requires human acceptance,
- manual Video Job Pack contains START/END media paths,
- provider video result remains Candidate,
- no CLIP_QC generated in WF-11,
- no selected video-media approval generated in WF-11,
- Provider failure/retry creates a new Job,
- batch import isolates failures,
- Additional Asset requirement returns Link to rework,
- old implementation is superseded on additional-asset rework,
- late Provider result is rejected after Clip revision change,
- Clip/CUT stale reconciliation,
- readiness projection,
- WF-07 → WF-11 single-DB integration.

## Scope Audit

WF-11 intentionally does not implement:

- CLIP_QC,
- TRIM_PASS,
- EDITORIAL_FIX decision,
- REGENERATE/FALLBACK production judgment after generated-video QC,
- fallback selection,
- final Clip media approval,
- Sequence/Chapter/Full Video QC.

Those belong to **WF-12 — QC / Fallback Engine**.

## Result

```
WORK_ITEM:
WF-11

FINAL_CLIP_DOMAIN:
PASS

CUT_IMPLEMENTATION:
PASS

EDITORIAL_IMPLEMENTATION:
PASS

AI_VIDEO_IMPLEMENTATION:
PASS

FINAL_DESIGN_APPROVAL:
PASS

ADDITIONAL_ASSET_REWORK:
PASS

PROVIDER_PRE_QC:
PASS

SAFETY_BOUNDARY:
PASS

VIDEO_PROMPT:
PASS

VIDEO_PROVIDER_JOB:
PASS

MANUAL_JOB_PACK:
PASS

VIDEO_RESULT_IMPORT:
PASS

CANDIDATE_NOT_APPROVAL:
PASS

STALE_RESULT_GUARD:
PASS

RETRY_FAILED_ONLY:
PASS

BATCH:
PASS

READINESS:
PASS

DEPENDENCY_RECONCILIATION:
PASS

REVISION_HISTORY:
PASS

DURABLE_EVENT_OUTBOX:
PASS

SQLITE_INTEGRATION:
PASS

WF07_WF08_WF09_WF10_REGRESSION:
PASS

AUTOMATED_TESTS:
44 / 44 PASS

RESULT:
PASS
```

Next: **WF-12 — QC / Fallback Engine**
