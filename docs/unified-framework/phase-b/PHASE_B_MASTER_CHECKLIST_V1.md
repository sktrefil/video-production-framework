# PHASE B — Master Migration Checklist v1

Use this checklist as the migration program control sheet.

| Work Item | Primary Type | Required Gate | Status |
|---|---|---|---|
| MIG-01 Repository Integration Foundation | NEW_BUILD | existing regression + skeleton | PASS |
| MIG-02 Runtime Contracts + Orchestrator | NEW_BUILD | shared runtime envelope | PASS |
| MIG-03 Resource Registry | NEW_BUILD + ADAPT | version/hash pinning | PASS |
| MIG-04 Bootstrap + Unified CLI | NEW_BUILD | SHORTFORM + LONGFORM create | PASS |
| MIG-05 ElevenLabs Runtime | ADAPT | v3 mock + WF16 ingestion | PASS |
| MIG-06 Image Runtime | NEW_BUILD | exact prompt/no legacy injection | NOT_STARTED |
| MIG-07 Google Flow Manual Runtime | NEW_BUILD | export/import + WF12 | DEFERRED |
| MIG-08 Generic Editor Port | PORT + ADAPT | editor checks + bundle + browser smoke | PASS |
| MIG-09 Materialization + Render | ADAPT + NEW_BUILD | WF17/WF18 output | NOT_STARTED |
| MIG-10 Audio/Subtitle Gaps | ADAPT + NEW_BUILD | A1-A4/T1-T2/G1 | NOT_STARTED |
| MIG-11 Legacy Isolation | NEW_BUILD | negative leak tests | NOT_STARTED |
| MIG-12 Single-Repo E2E | NEW_BUILD TEST | no old repo dependency | NOT_STARTED |
| MIG-13 Real Pilot Readiness | VALIDATION | SHORT + LONG runbook ready | NOT_STARTED |

## Sequencing note

MIG-08 was executed from the accepted MIG-05 head by explicit operator sequencing. Its editor-port acceptance gates do not require the image runtime or Google Flow runtime to execute. MIG-06 remains `NOT_STARTED`; MIG-07 is `DEFERRED` while Google Flow is operated manually. Neither is represented as PASS.

## Global preflight

Before MIG-01:
- Phase A branch/HEAD is recorded.
- Current framework full regression is green.
- Current source-repository branch/HEAD is recorded.
- Migration source is not deleted or rewritten.
- Runtime workspace location and free disk space are known.

## Global final gate

Before declaring migration complete:
- all MIG-01 ... MIG-13 = PASS,
- one unified-repo fixture E2E = PASS,
- one real SHORTFORM pilot = PASS,
- one real LONGFORM pilot = PASS,
- REAL PROJECT 01 reaches WF-18,
- no operational command requires changing directory into the old repo,
- no legacy visual decision is used by a unified project.
