# WF-07 — Research / Script / Story Pipeline

Status: **PASS**

## Implemented

- Research source registration.
- FACT / PLAUSIBLE / INTERPRETATION fact registry.
- FACT requires at least one supporting source.
- Fact approval creates a new revision using the same stable entity ID.
- Draft/final script creation.
- Script revision/supersede using stable ID + incremented revision.
- Explicit HUMAN approval for FINAL scripts.
- Story generation is blocked until a FINAL script is human-approved.
- ProductionSystemAdapter story contract using the canonical tasks:
  - STRUCTURE_DESIGN
  - SEQUENCE_DESIGN
  - SCENE_DESIGN
- No invented HANDOFF_QC registry task.
- Structured Chapter -> Sequence -> Scene decision validation.
- Scene script segments must occur verbatim and in order in the approved script.
- Canonical STATE_IN / STATE_CURRENT / STATE_OUT.
- Story graph is committed atomically.
- Existing matching story entities can retain stable IDs with incremented revisions.
- Script change impact analysis.
- Parent Chapter/Sequence structure becomes stale after approved script changes.
- Scene candidates are preserved when their exact sentence span remains unchanged.
- Changed scene segments are marked stale without deleting history.
- Explicit story-structure approval.
- Batch Scene design approval.
- Approval records remain separate from content entities.
- Durable workflow_events + event_outbox written in the same SQLite transaction as state changes.
- StoryCommandFacade provides user-facing recovery messages and recommended actions.
- SQLite WAL persistence adapter.
- Composite (id, revision) keys preserve revision history.
- Runtime schema and migrations/0001_foundation.sql are synchronized.

## Validation

GitHub Actions validation:

- npm install: PASS
- build: PASS
- typecheck: PASS
- production-system contract tests: 1/1 PASS
- story unit/workflow tests: 5/5 PASS
- SQLite integration tests: 2/2 PASS
- total automated tests: 8/8 PASS

A real failure was found during validation: the initial script impact analyzer treated a sentence substring as an unchanged scene. The implementation was corrected to compare exact sentence spans, and the full CI run then passed.

## WF-07 Result

```
WORK_ITEM:
WF-07

RESEARCH_SOURCE:
PASS

FACT_REGISTRY:
PASS

FACT_GROUNDING:
PASS

SCRIPT_REVISION:
PASS

FINAL_SCRIPT_APPROVAL:
PASS

V2_STORY_TASK_MAPPING:
PASS

STORY_DECISION_VALIDATION:
PASS

CHAPTER_SEQUENCE_SCENE:
PASS

SCENE_STATE_MODEL:
PASS

SCRIPT_IMPACT_ANALYSIS:
PASS

STALE_HANDLING:
PASS

STABLE_ID_REVISION_HISTORY:
PASS

DURABLE_EVENT_OUTBOX:
PASS

SQLITE_INTEGRATION:
PASS

USER_RECOVERY_MESSAGES:
PASS

AUTOMATED_TESTS:
8 / 8 PASS

RESULT:
PASS
```

WF-07 is complete. The next Production Core work item is WF-08 — Visual Identity Pipeline.
