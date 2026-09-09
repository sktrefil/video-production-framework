# WF-08 — Visual Identity Pipeline

Status: **PASS**

## Canonical flow

```
Approved FINAL Script
        +
Active Scene Design
        +
Pinned Channel Visual Bible
        ↓
v2 PROJECT_STYLE
        ↓
Project Style
        ↓
Human Approval (V1)
        ↓
v2 ANCHOR_PLAN
        ↓
Character / Location / Prop Identity Anchors
        ↓
Human Approval (V2)
```

Story approval and Visual Identity approval remain independent tracks. Anchor planning does not require Scene approval; both tracks merge later at the Foundation merge gate.

## Implemented

- Project Style domain entity with stable ID + revision history.
- Identity Anchor domain entity with stable ID + revision history.
- Allowed Anchor types only:
  - CHARACTER
  - LOCATION
  - PROP
- Anchor continuity reasons:
  - RECURRING
  - CRITICAL_CONTINUITY
- Asset/identity importance uses:
  - CRITICAL
  - IMPORTANT
  - SUPPORTING
- Identity specification namespaces:
  - locked
  - contextual
  - temporary
- Project Style contains:
  - era/region
  - visual approach
  - realism level
  - color language
  - lighting language
  - material language
  - environment language
  - character rendering principle
  - camera/composition tendency
  - mood range
  - factual constraints
  - avoidances
- Project Style records exact Channel Visual Bible version and source Script revision.
- Channel Visual Bible is provided through a versioned resource port; Framework does not reinterpret or duplicate it.
- ProductionSystemAdapter canonical tasks:
  - PROJECT_STYLE
  - ANCHOR_PLAN
- Project Style requires approved FINAL Script and generated active Scenes.
- Project Style requires explicit human approval before Anchor Plan.
- Anchor Plan validates that identities are actually recurring or continuity-critical.
- RECURRING anchors require at least two Scenes.
- CRITICAL_CONTINUITY anchors require at least one Scene.
- Anchor locked identity specification must not be empty.
- Duplicate logical identities are rejected.
- Unknown Scene references are rejected.
- Anchor plans may legitimately contain zero anchors when continuity anchors are unnecessary.
- Anchor approval remains separate Approval data.
- Project Style revision invalidates previous Project Style approval automatically because approvals are revision-bound.
- Anchor revision invalidates previous Anchor approval automatically.
- Project Style changes mark active Anchors stale instead of deleting them.
- A new approved Script revision can mark Project Style and Anchors stale.
- Story changes can mark only affected Anchors stale when required Scenes disappear.
- Anchor reference media is not silently reused after Project Style revision changes.
- Existing media/history is not deleted.
- Identity readiness reports:
  - Project Style approval
  - required Anchor IDs
  - approved Anchor IDs
  - missing Anchor approvals
  - stale Anchors
  - V1/V2 ready state
- User-facing command facade maps technical failures to recommended actions.

## Story / Visual Identity parallelism correction

During implementation, an early version required Scene approval before Anchor planning. This was rejected because it would unnecessarily serialize the Story and Visual Identity tracks.

Final behavior:

```
Scene Design ----------------------→ S2 Scene Approval
     \ 
      → Anchor Planning → V2 Anchor Approval

Project Style → V1 Style Approval
```

S2, V1, and V2 remain independent prerequisites for the later merge gate.

## Scene ↔ Anchor requirements

Anchor requirements are stored in:

```
scene_identity_anchor_requirements
```

This relation lets the Framework project `requiredIdentityAnchorIds` onto Scene data without creating a new narrative Scene revision merely because an Anchor was planned.

Therefore Anchor planning does not invalidate Scene narrative approval by implementation detail alone.

## Storage

Migration:

```
migrations/0002_visual_identity.sql
```

Tables:

```
project_styles
identity_anchors
scene_identity_anchor_requirements
```

Existing shared tables:

```
approval_records
workflow_events
event_outbox
```

All state/approval/event changes use SQLite transactions and preserve historical revisions.

## Validation

GitHub Actions run:

```
34321535252
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
Production-system contract tests    2 / 2 PASS
WF-07 regression tests              5 / 5 PASS
WF-08 visual identity tests         5 / 5 PASS
SQLite integration tests            3 / 3 PASS

TOTAL                              15 / 15 PASS
```

Important validated cases:

- PROJECT_STYLE and ANCHOR_PLAN canonical task mapping.
- Pinned Channel Visual Bible usage.
- Project Style approval required before Anchor Plan.
- Recurring anchor validation.
- V1/V2 readiness.
- Style revision invalidates Anchor approval/reference-media reuse.
- New approved Script makes Visual Identity stale without deleting history.
- WF-07 + WF-08 share a single project.db.
- Scene↔Anchor relation does not create Scene narrative revision churn.
- Approval records and durable Outbox are preserved.

## Result

```
WORK_ITEM:
WF-08

PROJECT_STYLE:
PASS

CHANNEL_VISUAL_BIBLE_PIN:
PASS

PROJECT_STYLE_APPROVAL:
PASS

IDENTITY_ANCHOR_TYPES:
PASS

ANCHOR_PLAN:
PASS

CONTINUITY_VALIDATION:
PASS

STYLE_REVISION:
PASS

ANCHOR_REVISION:
PASS

STALE_IMPACT:
PASS

REFERENCE_MEDIA_INVALIDATION:
PASS

SCENE_ANCHOR_BINDING:
PASS

V1_V2_READINESS:
PASS

DURABLE_EVENT_OUTBOX:
PASS

SQLITE_INTEGRATION:
PASS

WF07_REGRESSION:
PASS

AUTOMATED_TESTS:
15 / 15 PASS

RESULT:
PASS
```

Next: **WF-09 — Scene Asset Pipeline**
