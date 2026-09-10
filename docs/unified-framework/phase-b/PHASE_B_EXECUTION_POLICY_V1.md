# PHASE B — Execution Policy v1

Status: **MANDATORY FOR MIG-01 ... MIG-13**

## 1. Execution model

Each work order is executed on its own feature branch unless explicitly merged
into a continuing migration integration branch.

Required pattern:

```
read Phase A
→ read current MIG instruction
→ inspect exact source/target files
→ record pre-change HEAD/status
→ implement only current MIG scope
→ run required tests
→ run full framework regression where specified
→ report branch/HEAD/tests/CI
→ stop
```

Do not automatically continue to the next MIG after a failure.

## 2. Repository policy

Target:
```
sktrefil/video-production-framework
```

Migration source:
```
sktrefil/video-production
```

The source repository is read-only for migration unless a work order explicitly
requests documentation/freeze changes. Do not delete source code during Phase C
migration execution.

## 3. Classification policy

Every copied or newly created capability must be classified:

- `PORT`: behavior preserved; paths/imports/build wiring may change.
- `ADAPT`: proven implementation reused behind new contracts.
- `NEW_BUILD`: new capability required by unified architecture.
- `LEGACY`: not used by unified projects.
- `DELETE_LATER`: removal candidate only after final acceptance.

A file may contain mixed classifications. Split code instead of copying legacy
decision logic by accident.

## 4. No architecture invention during migration

If implementation discovers a conflict with Phase A:
1. stop the affected work item,
2. document the conflict,
3. propose a narrow Architecture Impact Review,
4. do not silently redesign contracts.

## 5. Source-of-truth rule

For unified projects:
- `project.db` = structured runtime truth,
- workspace filesystem = media/documents,
- JSON = exchange/materialization snapshot,
- Git = code/resources/docs.

No new JSON state machine may be introduced beside `project.db`.

## 6. Legacy isolation rule

Unified projects must never consume old production decisions, including:
- legacy visual styles,
- old master libraries,
- old image prompt planners,
- old project-specific render paths,
- old monolithic CLI state.

Temporary source-code reuse is allowed only when the reused unit is isolated,
provider-neutral, tested, and no longer imports legacy decision state.

## 7. Runtime rule

All provider execution must obey:

```
Framework decision
→ ProviderJob
→ RuntimeJob
→ executor
→ RuntimeResult
→ MediaArtifact
→ QC
→ approval/fallback
```

A runtime may not:
- modify creative intent,
- approve media,
- bypass QC,
- silently substitute source media,
- add legacy style text.

## 8. Secrets

Never commit or persist secret values.

Forbidden in:
- Git,
- project DB payloads,
- exported manual job packages,
- completion reports,
- test fixtures.

Use environment variable names only.

## 9. Test policy

Minimum per work item:
- unit/contract tests for changed package,
- integration test for its boundary,
- existing framework regression,
- no old-repo absolute path dependency,
- Windows-compatible path handling where relevant.

Provider-paid calls are not required in CI. Use mocks/fixtures.

## 10. Commit policy

Prefer small commits grouped by purpose:
- contract/schema,
- implementation,
- tests,
- docs.

Do not mix unrelated refactors into a migration work item.

## 11. Completion report

Every work item must finish with:

```
WORK_ITEM:
BRANCH:
BASE_HEAD:
FINAL_HEAD:

CLASSIFICATION:
PORT:
ADAPT:
NEW_BUILD:
LEGACY_NOT_PORTED:

FILES_CHANGED:

TESTS:
build:
typecheck:
unit:
integration:
regression:
CI_RUN:

ACCEPTANCE:
<criterion>: PASS/FAIL

KNOWN_ISSUES:
ROLLBACK_POINT:
NEXT_WORK_ITEM:
RESULT:
```

## 12. Stop conditions

Stop and report FAIL/BLOCKED when:
- an existing WF regression fails,
- a runtime begins making creative decisions,
- a unified project reads a legacy style/master resource,
- secrets leak,
- project paths escape workspace,
- manual provider import bypasses QC,
- editor mirror becomes canonical state,
- old repository is required at runtime.
