# WF-12 — QC / Fallback Engine

Status: **PASS**

## Canonical flow

```
WF-11 Candidate Video
        ↓
v2 CLIP_QC
        ↓
PASS / TRIM_PASS / EDITORIAL_FIX / REGENERATE / FALLBACK / BLOCKED
        │
        ├─ PASS
        │    ↓
        │  Final Clip Media Approval
        │
        ├─ TRIM_PASS
        │    ↓
        │  Final Clip Media Approval
        │  + usableInMs / usableOutMs
        │
        ├─ EDITORIAL_FIX / REGENERATE / FALLBACK
        │    ↓
        │  v2 EXCEPTION_REVIEW
        │    ↓
        │  REGENERATE / EDITORIAL_MOVE / STATIC_HOLD /
        │  REUSE_REFRAME / CUT / ADDITIONAL_ASSET_REQUIRED / BLOCK
        │
        └─ BLOCKED
             ↓
           Stop / Review
```

Generated Provider media is never promoted directly from WF-11 Candidate state to final approved media.

## Boundary

WF-12 owns runtime/orchestration for:

- generated Clip QC execution,
- PASS / TRIM_PASS final media approval,
- usable trim range persistence,
- human review for review-required PASS / TRIM_PASS,
- post-QC fallback selection,
- safe editorial fallback application,
- regeneration re-entry into the existing WF-11 Provider Job path,
- explicit CUT / Additional Asset handoff decisions,
- blocked-result stop behavior,
- Clip QC / Fallback durable persistence,
- batch Clip QC,
- aggregate Sequence / Chapter / Project implementation readiness summaries,
- user-facing QC/Fallback recovery projection.

AI VIDEO PRODUCTION SYSTEM v2.0.0 remains the production decision owner for:

```
CLIP_QC
EXCEPTION_REVIEW
```

WF-12 does not embed production heuristics such as deciding whether identity drift is acceptable, choosing a fallback mode from symptoms, or rewriting unsafe content.

## Production-system task mapping

Canonical calls:

```
CLIP_QC
target = CLIP

EXCEPTION_REVIEW
target = CLIP
```

The Framework validates and persists the structured decision. The decision plane owns the judgment.

## Clip QC input gate

CLIP_QC can run only when:

- the Clip is current and not stale,
- `clipStatus = CANDIDATE_AVAILABLE`,
- the requested media ID is registered in `candidateMediaIds`,
- the candidate is an AVAILABLE VIDEO MediaArtifact,
- the Clip still matches the current Link implementation,
- bound endpoint Scene / Asset / Media context is current and approved.

This prevents late or unrelated generated video from entering QC.

## Clip QC outcomes

### PASS

Clear, non-review result:

```
Candidate Video
→ CLIP_QC PASS
→ ApprovalRecord(selectedMediaId = candidate)
→ clip.approvedMediaId = candidate
→ clipStatus = APPROVED
```

The generated video becomes final Clip media only here.

### TRIM_PASS

A partially usable generated clip is not discarded.

```
Candidate Video
→ CLIP_QC TRIM_PASS
→ validate usableInMs / usableOutMs
→ ApprovalRecord(selectedMediaId = candidate)
→ clip.approvedMediaId = candidate
→ clipStatus = APPROVED
```

Required trim validation:

- `usableInMs >= 0`
- `usableOutMs > usableInMs`
- `usableOutMs <= candidate.durationMs`

The trim range is persisted on `ClipQcRecord` and exposed by readiness projection for the editor/binding stage.

### Review-required PASS / TRIM_PASS

A low-confidence or explicitly review-required result is not auto-approved.

```
CLIP_QC PASS / TRIM_PASS
→ NEEDS_REVIEW
→ Human acceptance
→ HUMAN_APPROVED
→ approvedMediaId
→ APPROVED
```

No selected video media is written before explicit acceptance.

### EDITORIAL_FIX

```
clipStatus = EDITORIAL_FIX_REQUIRED
→ EXCEPTION_REVIEW
```

The bad generated candidate remains unapproved.

### REGENERATE

```
clipStatus = REGENERATE_REQUIRED
→ EXCEPTION_REVIEW
```

A regeneration decision does not overwrite the failed/candidate media.

### FALLBACK

```
clipStatus = FALLBACK_REQUIRED
→ EXCEPTION_REVIEW
```

### BLOCKED

```
clipStatus = BLOCKED
```

BLOCKED is a stop state. WF-12 does not turn it into an automatic retry/fallback loop.

## Fallback actions

Structured fallback actions:

```
REGENERATE
EDITORIAL_MOVE
STATIC_HOLD
REUSE_REFRAME
CUT
ADDITIONAL_ASSET_REQUIRED
BLOCK
```

### REGENERATE

When the current Clip still has a passing Provider Pre-QC context:

```
REGENERATE
→ clipStatus = READY
→ providerExecutionRequired = true
→ existing passing providerPreflightId retained
→ nextAction = CREATE_VIDEO_JOB
```

Control returns to the WF-11 video-job creation path.

The retry is a new Provider Job. Existing candidate media/history is not destructively overwritten.

### Editorial fallback

For:

```
EDITORIAL_MOVE
STATIC_HOLD
REUSE_REFRAME
```

WF-12:

- switches the Clip mode,
- sets `providerExecutionRequired = false`,
- clears Provider Preflight state,
- never approves the bad generated candidate,
- moves the Clip to editorial `READY`,
- records an ApprovalRecord for the accepted fallback implementation.

This allows the editor to use the already approved source image/state instead of forcing another AI video.

### CUT

CUT changes Link implementation topology, so WF-12 does not silently mutate a CLIP into a CUT inside the Clip record.

Result:

```
action = CUT
applied = false
nextAction = REBUILD_AS_CUT
```

The selected fallback is persisted and handed to the Link/final-design workflow.

### ADDITIONAL_ASSET_REQUIRED

Likewise, an additional image requirement is not synthesized inside QC.

Result:

```
action = ADDITIONAL_ASSET_REQUIRED
applied = false
nextAction = CREATE_ADDITIONAL_ASSET
```

This preserves the responsibility boundary with Asset / Link production.

### BLOCK

```
clipStatus = BLOCKED
nextAction = STOP
```

No automatic circumvention path is created.

## Human review of fallback

When Production System requests human review:

```
Fallback selected
→ clipStatus = FALLBACK_REQUIRED
→ fallback.applied = false
→ Human acceptance
→ apply allowed Clip-local fallback
```

Editorial-mode approval is recorded explicitly.

CUT and Additional Asset remain explicit upstream handoffs even after review.

## Domain model

### ClipQcRecord

```
clipId
clipRevision
candidateMediaId

status
severity
confidence

usableInMs?
usableOutMs?

issues[]
regenerationReason?
editorialInstruction?
fallbackReason?

decisionId
```

### ClipFallbackRecord

```
clipId
clipRevision
sourceQcId

action
rationale
decisionId

requiresHumanReview
applied

resultingImplementationType?
resultingImplementationRefId?
```

## Aggregate QC readiness

WF-12 provides deterministic implementation rollup for:

```
SEQUENCE
CHAPTER
PROJECT
```

Statuses:

```
PASS
PARTIAL
BLOCKED
```

Rules:

- approved video Clip or ready editorial Clip/CUT = ready,
- unresolved QC/fallback/regeneration = pending,
- any blocked implementation = BLOCKED.

This is an orchestration/readiness summary over current production implementations.

Encoded final-render technical QC is not fabricated before an assembled render artifact exists; that remains a later editor/render boundary.

## User-facing readiness

`getReadiness()` exposes:

```
qcComplete
finalMediaApproved
editorialReady
regenerationReady
fallbackRequired
usableInMs?
usableOutMs?
```

This lets the UI show the next safe action without exposing internal production heuristics.

## Batch workflow

`QcFallbackBatchService` supports batch Clip QC.

Batch result:

```
COMPLETE
PARTIAL_COMPLETE
FAILED
```

One failing candidate does not fail unrelated Clip QC work.

## Storage

Migration:

```
migrations/0006_qc_fallback.sql
```

New tables:

```
clip_qc_records
clip_fallback_records
```

Existing shared tables reused:

```
production_clips
production_links
media_artifacts
provider_jobs
approval_records
workflow_events
event_outbox
```

No duplicate Media or Provider Job store is introduced.

## Revision and history model

- Clip keeps stable ID + revision history.
- QC and fallback decisions are durable records.
- Candidate media is never overwritten by approval.
- PASS/TRIM_PASS approval selects an existing candidate media ID.
- Regeneration re-enters WF-11 and creates a new Provider Job.
- Editorial fallback preserves the failed generated candidate as history.
- Workflow events and outbox records are committed transactionally with state changes.

## Cross-WF integration

Validated in one `project.db`:

```
WF-07
Approved Script / Scene
        ↓
WF-08
Project Style / Identity Anchors
        ↓
WF-09
Approved Scene Images
        ↓
WF-10
Pre-Link / Handoff QC / HANDOFF_PASS
        ↓
WF-11
Final Clip Design
Provider Pre-QC
Video Job
Candidate Video
        ↓
WF-12
CLIP_QC
TRIM_PASS
usableInMs = 400
usableOutMs = 4400
Final Clip Media Approval
```

Scene narrative revision remains unchanged through Clip QC.

## Validation

Pre-document GitHub Actions run:

```
34332197730
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
Production-system contracts        6 / 6 PASS
WF-07 Story regression             5 / 5 PASS
WF-08 Visual Identity              5 / 5 PASS
WF-09 Scene Asset                  7 / 7 PASS
WF-10 Pre-Link / Handoff           8 / 8 PASS
WF-11 Final Clip / Provider        9 / 9 PASS
WF-12 QC / Fallback                6 / 6 PASS
SQLite integration                 5 / 5 PASS

TOTAL                             51 / 51 PASS
```

Important validated cases:

- canonical CLIP_QC / EXCEPTION_REVIEW task mapping,
- Candidate-only CLIP_QC gate,
- TRIM_PASS preserves usable range,
- invalid trim range rejected before persistence,
- generated video remains unapproved on QC failure,
- review-required PASS waits for human approval,
- REGENERATE rearms the WF-11 Provider Job path,
- EDITORIAL_MOVE fallback bypasses Provider execution,
- bad generated media is not selected by editorial fallback,
- aggregate PASS / PARTIAL / BLOCKED rollup,
- WF-07 → WF-12 single-DB integration,
- `clip_qc_records` trim persistence,
- selected media approval persistence,
- Scene revision does not churn during Clip QC.

## Result

```
WORK_ITEM:
WF-12

CLIP_QC:
PASS

PASS_MEDIA_APPROVAL:
PASS

TRIM_PASS:
PASS

TRIM_RANGE_GUARD:
PASS

HUMAN_QC_REVIEW:
PASS

FALLBACK_SELECTION:
PASS

REGENERATE_REENTRY:
PASS

EDITORIAL_FALLBACK:
PASS

CUT_HANDOFF:
PASS

ADDITIONAL_ASSET_HANDOFF:
PASS

BLOCKED_STOP:
PASS

BAD_MEDIA_NOT_APPROVED:
PASS

BATCH:
PASS

READINESS:
PASS

AGGREGATE_QC:
PASS

REVISION_HISTORY:
PASS

DURABLE_EVENT_OUTBOX:
PASS

SQLITE_INTEGRATION:
PASS

WF07_WF08_WF09_WF10_WF11_REGRESSION:
PASS

AUTOMATED_TESTS:
51 / 51 PASS

RESULT:
PASS
```
