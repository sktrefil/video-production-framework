# MIG-12 — Single-Repository Fixture E2E

Status: **WORK ORDER / NOT YET EXECUTED**

## WORK ITEM

`MIG-12`

## GOAL

Prove the integrated repository can complete the full production graph using one
project.db and no operational dependency on the old repository.

## WHY

Unit tests can all pass while real cross-package handoffs fail. This is the first
complete acceptance of the migrated architecture as one system.

## SOURCE

All accepted implementations MIG-01 ... MIG-11.

## TARGET

```
tests/e2e/unified-project/
workspace/projects/<fixture_project_id>/
```

## CLASSIFICATION

```
NEW_BUILD TEST HARNESS
```

## DEPENDENCIES

- MIG-01 ... MIG-11 PASS.

## FILES TO READ FIRST

- all Phase A documents,
- all MIG completion reports,
- WF-07 ... WF-18 implementation docs,
- root CI workflow,
- unified CLI help/commands.

## TEST PROFILE

Use deterministic fixtures and mocked paid providers where necessary.

Required formats:
- at least one SHORTFORM fixture,
- at least one LONGFORM fixture.

LONGFORM must not depend on a separate legacy bootstrap.

## CANONICAL E2E FLOW

```
vpf project create
        ↓
WF-07 research / facts / approved FINAL script / story
        ↓
MIG-05 mocked ElevenLabs runtime
        ↓
AUDIO MediaArtifact + alignment
        ↓
WF-08 Visual Identity
        ↓
WF-09 Scene Assets
        ↓
MIG-06 mocked image runtime
        ↓
IMAGE_QC + approvals
        ↓
WF-10 Pre-Link / Handoff
        ↓
WF-11 Final Clip / Provider Job
        ↓
MIG-07 mock/manual result import
        ↓
WF-12 Clip QC
        ↓
WF-13 Final Media Binding
        ↓
WF-14/15 visual timeline + motion
        ↓
MIG-10 content inputs
        ↓
WF-16 full timeline
        ↓
MIG-09 editor materialization
        ↓
Generic Editor / GenericFinalRender
        ↓
WF-17 technical QC
        ↓
WF-18 final output QC/package
        ↓
publish_handoff.json
```

## IN SCOPE

1. Full fixture seed helpers.
2. Unified CLI path where reasonable; internal service calls may be used only
   for setup that has no public command yet and must be documented.
3. Mock provider executors with real artifact files.
4. Actual editor materialization.
5. Actual Remotion fixture render where CI capacity allows.
6. Exact DB assertion after each gate.
7. Legacy access instrumentation.
8. final package verification.

## OUT OF SCOPE

- real paid provider calls,
- actual YouTube upload,
- performance optimization,
- visual aesthetic acceptance.

## NEW BUILD ITEMS

- E2E fixture harness,
- synthetic media fixtures,
- project lifecycle assertions,
- legacy access counter,
- one-command E2E test runner,
- CI job.

## CONTRACTS THAT MUST NOT CHANGE

- one project.db.
- candidate media before QC.
- approvals revision-bound.
- stale states respected.
- editor JSON generated from Framework state.
- render accepted only by WF-17.
- package accepted only by WF-18.
- no old repo runtime dependency.

## IMPLEMENTATION STEPS

1. Create SHORTFORM fixture via unified bootstrap.
2. Seed/execute WF-07 to approved story.
3. Execute mocked TTS runtime and alignment.
4. Execute WF-08/WF-09 with canonical resources.
5. Execute mocked image runtime/QC/approval.
6. Execute WF-10/WF-11.
7. Export/import a mock video result through manual runtime contract.
8. Execute WF-12/WF-13.
9. Execute WF-14~WF-16.
10. Materialize editor project.
11. Run production gate and render fixture.
12. Execute WF-17.
13. Execute WF-18.
14. Repeat a reduced/representative LONGFORM path.
15. Assert no old repository path/resource was accessed.
16. Add CI.

## REQUIRED FAILURE CASES

Also prove:
- stale resource pin blocks.
- stale manual Flow result blocks.
- invalid image hash blocks.
- unapproved image cannot bind.
- legacy resource access blocks.
- editor media hash mismatch blocks.
- technical QC failure prevents delivery.
- renewed timeline stales previous render/package.

## ACCEPTANCE CRITERIA

```
SHORTFORM unified fixture E2E        PASS
LONGFORM unified fixture E2E         PASS
one project.db per project           PASS
provider mocks behind RuntimeJob     PASS
editor materialization               PASS
WF-17 DELIVERY_READY                 PASS
WF-18 PUBLISH_HANDOFF_READY          PASS
old repo operational calls           ZERO
legacy resource accesses             ZERO
full CI                              PASS
```

## ROLLBACK

The E2E harness is additive. Revert only MIG-12 test code if necessary; failures
must be fixed in the owning earlier MIG rather than hidden in the harness.

## BRANCH

```
migration/mig-12-single-repo-e2e
```

## NEXT

```
MIG-13 — Real Project Pilot Readiness
```
