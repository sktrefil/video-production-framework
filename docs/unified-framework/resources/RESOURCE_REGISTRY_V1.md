# Canonical Resource Registry v1

Status: **MIG-03 IMPLEMENTED**

## Ownership

Unified production resources are owned by this repository under `resources/`.

```
resources/
├─ visual-bibles/
├─ format-profiles/
├─ provider-profiles/
├─ channel-profiles/
└─ schemas/
```

Legacy visual configuration from the old production repository is review input
only and is not a resolution candidate.

## Resource document

Every canonical resource is versioned as:

```json
{
  "schemaVersion": 1,
  "resourceType": "FORMAT_PROFILE",
  "resourceId": "LONGFORM_16X9_V1",
  "version": "1.0.0",
  "payload": {}
}
```

The registry returns a `ResourceSnapshot` with a SHA-256 `contentHash` computed
from the exact resource file bytes.

A project/resource consumer pins:

- resource type,
- resource ID,
- version,
- content hash.

Resolving a newer version is never automatic.

## Canonical History/Mystery resources

Visual identity:

- `HISTORY_MYSTERY_VISUAL_BIBLE@1.0.0`

Formats:

- `LONGFORM_16X9_V1@1.0.0`
- `SHORTFORM_9X16_V1@1.0.0`

Providers:

- `ELEVENLABS_V3_HISTORY_V1@1.0.0`
- `IMAGE_PROVIDER_EXECUTION_V1@1.0.0`
- `GOOGLE_FLOW_MANUAL_EXTERNAL_V1@1.0.0`
- `REMOTION_FINAL_RENDER_V1@1.0.0`

Channel selection:

- `HISTORY_MYSTERY_V1@1.0.0`

Schema:

- `RESOURCE_DOCUMENT_V1@1.0.0`

LONGFORM and SHORTFORM intentionally share the same Channel Visual Bible.
Layout, dimensions, safe area, subtitle envelope, and delivery differences are
owned by their Format Profiles.

## Authority chain

```
Channel Visual Bible
        ↓
Project Style
        ↓
Identity Anchors
        ↓
Scene / Asset Design
        ↓
Format Profile
        ↓
Image Prompt
        ↓
Runtime
```

The runtime does not consume the Visual Bible directly and must not append old
style text.

## Hash/pin behavior

`FileSystemResourceRegistry.resolvePinned()` requires the exact version and
SHA-256 hash.

- missing version → `RESOURCE_PIN_MISSING`
- different bytes for a pinned version → `RESOURCE_HASH_MISMATCH`
- malformed resource → `RESOURCE_DOCUMENT_INVALID` or
  `RESOURCE_SCHEMA_INVALID`
- prohibited old style/master resource → `LEGACY_RESOURCE_FORBIDDEN`

`diagnosePin()` reports CURRENT, MISSING, STALE, or INVALID without silently
changing the project.

## Explicit upgrades

Use `planUpgrade(currentPin, targetVersion)` to resolve the requested target
and return its new version/hash plus stale-impact categories.

An upgrade is a planning operation only. The caller must persist the new project
pin/revision and run normal stale reconciliation.

Initial stale-impact ownership:

- Channel Visual Bible → Project Style / Identity Anchor / Scene Asset / Image Prompt
- Format Profile → Scene Asset / Editor Timeline / Render Output
- Provider Profile → Provider Job / Runtime Job
- Channel Profile → Project resource pins
- Rule Registry → Production Decision
- Schema → Resource validation

No historical resource file is overwritten by this process.

## Legacy isolation

The registry explicitly rejects the old visual-style/master identifiers,
including:

- `history_mystery_shorts_style`
- `HISTORY_MYSTERY_STYLIZED_V1`
- old scene-prompt style identifiers
- old master-candidate style identifiers

The canonical History/Mystery Visual Bible is newly authored from current
channel-wide principles. It does not encode a Sado Prince-specific identity,
a single project palette, an old master-image identity, or a fixed shorts-only
composition.

## Validation

Run:

```bash
npm run validate:resources
```

The validator scans every canonical resource, verifies path/document identity,
validates its type-specific schema constraints, computes its hash, and reports
diagnostics.

MIG-03 tests additionally cover:

- exact version resolution,
- hash mismatch rejection,
- missing version rejection,
- no automatic project-pin upgrade,
- stale/missing diagnostics,
- WF-08 Channel Visual Bible adapter,
- WF-09 Channel Visual Bible + Format Profile adapters,
- shared Visual Bible across LONGFORM/SHORTFORM,
- provider-profile creative/style field rejection,
- legacy style/master rejection.
