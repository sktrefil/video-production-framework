# WF-07 — Research / Script / Story Pipeline

Status: **IN_PROGRESS**

## Implemented in the first code slice

- Research source registration.
- FACT / PLAUSIBLE / INTERPRETATION fact registry.
- FACT requires a supporting source reference.
- Draft/final script records.
- Chapter -> Sequence -> Scene persistence contract.
- Canonical Scene STATE_IN / STATE_CURRENT / STATE_OUT.
- Structural validation before persistence.
- StoryRepository port plus SQLite adapter.
- Durable event/outbox storage foundation.

## Remaining before WF-07 can PASS

- Script revision/supersede and explicit final-script approval command.
- ProductionSystemAdapter contract for STRUCTURE_DESIGN / SEQUENCE_DESIGN / SCENE_DESIGN.
- Scene-generation result validation and commit.
- script-change impact/stale analysis.
- workflow events for approval/structure transitions.
- integration tests against SQLite.
- UI/application command facade and user-facing recovery messages.
