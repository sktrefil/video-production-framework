# PHASE 1 — FOUNDATION FINAL v1.0

Status: **FINAL / VALIDATED / FOUNDATION_LOCK**

This is the repository-level canonical summary of WF-00 through WF-06.

## Boundary
- Framework = control/orchestration plane.
- AI VIDEO PRODUCTION SYSTEM v2.0.0 = production decision plane.
- Providers = media execution plane.
- Editor Binding + existing Remotion Generic Editor = editorial plane.
- Production rules are never duplicated in Framework code.

## Architecture
Modular monolith + ports/adapters + state-driven workflow. Workflow events are durable using SQLite event/outbox records.

## Data
Narrative: PROJECT -> CHAPTER -> SEQUENCE -> SCENE.
Production: SCENE -> ASSET; ASSET_A -> LINK -> ASSET_B; LINK -> CLIP / EDITORIAL / CUT.
Clip is not a Scene child. QC and Approval are separate. StateRef is structured. Canonical time is milliseconds.

## Workflow
STATE, GATE and CAPABILITY are distinct. Production-system gates use PSG_*; Framework operational gates use FWG_*.

## v2 adapter
Use project-pinned versions, deterministic metadata retrieval first, optional semantic expansion, on-demand Human Bible context, and structured decision validation. Actual asset handoff QC maps to QC + LINK scope.

Visual source = CHANNEL VISUAL BIBLE + APPROVED PROJECT STYLE.

## Storage
project.db = structured runtime source of truth.
filesystem = documents/media.
JSON = validated snapshot/exchange contract.
Git = source only.
Canonical media paths are project-relative.
Remotion handoff remains AUTO_SAFE until WF-15.

Any change to these foundations requires FOUNDATION IMPACT REVIEW.
