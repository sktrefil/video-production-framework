# WF-18 — Final Output QC / Packaging / Publish Handoff

Status: **PASS**

## Purpose

WF-18 starts only after WF-17 has produced a current delivery-qualified final render.

```
WF-17
DELIVERY_READY
    ↓
WF-18
Final Output QC
    ↓
PASS / NEEDS_REVIEW / FIX_REQUIRED / BLOCKED
    ↓
Publish Package
    ↓
publish_handoff.json
    ↓
PUBLISH_HANDOFF_READY
```

WF-18 does **not** upload to YouTube. It prepares and verifies the complete handoff package for a later publish-execution workflow.

## Responsibility boundary

### Framework

The Framework is the durable control/orchestration plane.

It stores:

- exact WF-17 render/delivery references,
- Final Output QC decision and review approval,
- exact final-video SHA-256,
- publish metadata,
- publish package manifest,
- package SHA,
- stale/revision state,
- workflow events and outbox records.

The Framework does not invent a subjective visual-quality score by itself. Final Output QC is supplied by a human or an external review system.

### Actual Generic Editor runtime

The `video-production` repository performs the physical filesystem work.

It provides:

```
scripts/final-output-qc.mjs
scripts/package-publish-handoff.mjs
```

The runtime:

1. verifies the current WF-17 delivery,
2. verifies the final MP4 still matches the recorded byte size and SHA-256,
3. records the human Final Output QC sidecar,
4. verifies publish metadata,
5. physically copies the final video and required manifests into the publish package,
6. hashes the copied artifacts,
7. writes `publish_handoff.json`.

## Entry gate

WF-18 requires all of the following:

```
FinalRenderAttempt.status = DELIVERY_READY
FinalDeliveryManifest.status = READY
FinalRenderTechnicalQcRecord.status = PASS
```

The following references must agree:

```
renderAttemptId / revision
deliveryManifestId / revision
projectSha256
outputSha256
```

If WF-17 is not current and READY, Final Output QC cannot be recorded.

## Final Output QC

Domain object:

```
FinalOutputQcRecord
```

Statuses:

```
PASS
NEEDS_REVIEW
FIX_REQUIRED
BLOCKED
```

A QC record pins:

- render attempt ID/revision,
- delivery manifest ID/revision,
- project SHA,
- output path,
- output SHA-256,
- confidence,
- issue codes,
- notes,
- review requirement,
- optional human approval ID.

### Review-required flow

An external QC result may be technically PASS but still require a person to approve it.

```
recordFinalOutputQc(
  status = PASS,
  reviewRequired = true
)
        ↓
NEEDS_REVIEW
        ↓
approveFinalOutputQc()
        ↓
ApprovalRecord
targetType = FINAL_OUTPUT
approvalState = HUMAN_APPROVED
        ↓
PASS
```

Packaging is blocked until the current QC record is PASS.

### Fix/block flow

```
FIX_REQUIRED
BLOCKED
```

must carry at least one issue code.

The Framework intentionally leaves issue-code taxonomy open so the review system can record items such as:

```
VISIBLE_RENDER_DEFECT
AV_SYNC_ISSUE
SUBTITLE_READABILITY_ISSUE
AUDIO_MIX_ISSUE
EDITORIAL_CONTENT_ISSUE
UNAPPROVED_CONTENT
```

These are examples, not a closed enum.

## Publish metadata

WF-18 currently defines the first publish target as:

```
platform = YOUTUBE
```

Metadata contract:

```json
{
  "platform": "YOUTUBE",
  "title": "Video title",
  "description": "Video description",
  "tags": ["history", "mystery"],
  "visibility": "PRIVATE",
  "madeForKids": false,
  "language": "ko",
  "categoryId": "optional",
  "thumbnail": {
    "relativePath": "path/to/thumbnail.png"
  }
}
```

The Framework validates the JSON boundary at runtime:

- platform,
- non-empty title,
- description string,
- tags array,
- visibility,
- madeForKids boolean,
- optional thumbnail path.

Duplicate/blank tags are normalized out.

WF-18 does not hard-code changing platform policy such as current title/tag quota rules. Those belong in the later platform execution adapter.

## Logical publish package

After current Final Output QC PASS:

```
FinalOutputPipeline.createPublishPackage()
```

produces a revisioned:

```
PublishPackageManifest
```

with:

- render attempt reference,
- delivery manifest reference,
- Final Output QC reference,
- project SHA,
- package directory,
- package SHA,
- normalized publish metadata,
- required package file roles,
- recommended filename `publish_handoff.json`.

Default package directory:

```
out/<project_id>/publish
```

Required roles:

```
VIDEO
RENDER_MANIFEST
TECHNICAL_QC
DELIVERY_MANIFEST
FINAL_OUTPUT_QC
PUBLISH_METADATA
```

Optional:

```
THUMBNAIL
```

Repeated creation with the same delivery, QC and metadata is idempotent.

## Stale protection

A publish package becomes STALE if any source contract changes:

- WF-17 delivery is no longer READY,
- delivery ID/revision changes,
- Final Output QC is no longer PASS,
- Final Output QC ID/revision changes,
- project SHA changes.

Then:

```
PublishPackageManifest.packageStatus = STALE
```

and:

```
publishHandoffReady = false
```

This prevents an older final video/package from remaining publish-ready after a rerender or renewed final review.

## SQLite

Migration:

```
migrations/0011_final_output_publish.sql
```

Tables:

```
final_output_qc_records
publish_package_manifests
```

Human Final Output QC approval is also persisted in the existing:

```
approval_records
```

Every mutation writes through the workflow event/outbox mechanism.

## Actual runtime — Final Output QC

After reviewing the rendered video:

```powershell
cd Youtubu_projects

npm run qc:final-output -- <project_id> --status PASS --reviewer reviewer-name
```

For a fix request:

```powershell
npm run qc:final-output -- <project_id> --status FIX_REQUIRED --issue VISIBLE_RENDER_DEFECT --note "frame review note"
```

The command first re-hashes `final.mp4` and requires an exact match with the current WF-17 `delivery_manifest.json`.

Output:

```
out/<project_id>/final_output_qc.json
```

The physical packager accepts both:

- the runtime Final Output QC sidecar shape,
- a serialized Framework `FinalOutputQcRecord` shape.

## Actual runtime — Publish packaging

Create:

```
out/<project_id>/publish_metadata.json
```

Example:

```json
{
  "platform": "YOUTUBE",
  "title": "History Mystery",
  "description": "Description",
  "tags": ["history", "mystery"],
  "visibility": "PRIVATE",
  "madeForKids": false,
  "language": "ko",
  "thumbnail": {
    "relativePath": "assets/thumbnail.png"
  }
}
```

Run:

```powershell
npm run package:publish -- <project_id>
```

or:

```powershell
node scripts/package-publish-handoff.mjs <project_id> --metadata <metadata-json-path>
```

The command revalidates:

```
delivery_manifest.status = READY
technical_qc.status = PASS
final_output_qc.status = PASS
project IDs match
project SHAs match
final MP4 path/size/SHA match
Final Output QC output SHA matches delivery SHA
publish metadata is valid
thumbnail exists when specified
```

It then recreates the package directory and copies the approved artifacts.

## Physical output

```
out/<project_id>/
├─ final.mp4
├─ production_gate.json
├─ render_props.json
├─ render_manifest.json
├─ technical_qc.json
├─ delivery_manifest.json
├─ final_output_qc.json
├─ publish_metadata.json
└─ publish/
   ├─ final.mp4
   ├─ render_manifest.json
   ├─ technical_qc.json
   ├─ delivery_manifest.json
   ├─ final_output_qc.json
   ├─ publish_metadata.json
   ├─ <thumbnail>              optional
   └─ publish_handoff.json
```

Every copied package artifact is measured and SHA-256 hashed.

The physical handoff contains:

```json
{
  "schemaVersion": "1.0",
  "status": "READY",
  "projectId": "...",
  "projectSha256": "...",
  "packageSha256": "...",
  "packageDirectory": "out/<project_id>/publish",
  "recommendedFileName": "publish_handoff.json",
  "metadata": {},
  "files": [],
  "publishExecution": {
    "status": "NOT_STARTED"
  }
}
```

The explicit `NOT_STARTED` publish-execution state prevents WF-18 from being confused with an actual YouTube upload.

## Full single-DB integration

Framework integration test:

```
WF-07 Story
↓
WF-08 Visual Identity
↓
WF-09 Scene Asset
↓
WF-10 Pre-Link / Handoff
↓
WF-11 Final Clip / Provider
↓
WF-12 Clip QC / Fallback
↓
WF-13 Final Media Binding
↓
WF-14 Editor Timeline
↓
WF-15 Motion Execution contract
↓
WF-16 Audio / Subtitle / Graphic timeline
↓
WF-17 Final Render + Technical QC
↓
DELIVERY_READY
↓
WF-18 Final Output QC PASS
↓
PublishPackageManifest READY
↓
publish_handoff.json contract
↓
PUBLISH_HANDOFF_READY
```

The entire flow remains in the same `project.db`, and the narrative Scene revision is not mutated by render/publish orchestration.

## Validation

Framework validation runs on Node.js 22 and 24:

```
npm install
npm run build
npm run typecheck
npm test
```

WF-18 adds six direct package tests covering:

1. QC pins the current WF-17 delivery.
2. review-required PASS becomes HUMAN_APPROVED before packaging.
3. FIX_REQUIRED/BLOCKED prevents packaging.
4. identical publish package creation is idempotent.
5. delivery revision change stales an existing package.
6. non-READY WF-17 delivery blocks WF-18.

The existing SQLite integration suite now runs through WF-18 and verifies persisted:

```
final_output_qc_records
publish_package_manifests
```

The actual Generic Editor regression test verifies:

- final video SHA/size against WF-17 delivery,
- human Final Output QC sidecar,
- physical package file copying,
- package file hashes,
- publish metadata normalization,
- optional thumbnail copy,
- `publish_handoff.json`,
- mutation of final.mp4 blocks QC,
- FIX_REQUIRED blocks physical packaging.

## Result

```
WORK_ITEM:
WF-18

WF17_DELIVERY_GATE:
PASS

FINAL_OUTPUT_QC:
PASS

HUMAN_REVIEW_APPROVAL:
PASS

OUTPUT_SHA_PINNING:
PASS

PUBLISH_METADATA:
PASS

PACKAGE_MANIFEST:
PASS

PHYSICAL_PACKAGE_COPY:
PASS

PACKAGE_FILE_HASHING:
PASS

THUMBNAIL_HANDOFF:
PASS

STALE_PACKAGE_DETECTION:
PASS

PUBLISH_HANDOFF:
PASS

ACTUAL_PLATFORM_UPLOAD:
NOT_PART_OF_WF18

RESULT:
PASS
```
