# TEST TASKS — Full System Validation Queue

Base: MIG-13 readiness tip `7ed83f55c9fd468357ace7968db380555a2bb293`
Branch: `validation/full-system-v1`

| ID | Validation Work Item | Dependency | Status |
|---|---|---|---|
| TEST-00 | Migration Contract Audit | MIG-13 readiness | PASS |
| TEST-01 | Repository Integration Foundation | TEST-00 | PASS |
| TEST-02 | Runtime Contracts + Provider Orchestrator | TEST-01 | PASS |
| TEST-03 | Resource Registry + Canonical Resources | TEST-02 | PASS |
| TEST-04 | Project Bootstrap + Unified CLI | TEST-03 | PASS |
| TEST-05 | ElevenLabs Runtime | TEST-04 | PASS |
| TEST-06 | New Image Runtime | TEST-05 | PASS |
| TEST-07 | Google Flow Manual Runtime | TEST-06 | PASS |
| TEST-08 | Generic Editor Port | TEST-07 | IN_PROGRESS |
| TEST-09 | Editor Materialization + Render Runtime | TEST-08 | BLOCKED |
| TEST-10 | Audio + Subtitle Runtime Gaps | TEST-09 | BLOCKED |
| TEST-11 | Legacy Isolation Hardening | TEST-10 | BLOCKED |
| TEST-12 | Single-Repository Fixture E2E | TEST-11 | BLOCKED |
| TEST-13 | Real Production Pilots | TEST-12 | BLOCKED |
| TEST-14 | Full System Regression | TEST-13 | BLOCKED |
| TEST-15 | Production Readiness Gate | TEST-14 | BLOCKED |

## Queue rules

1. Execute only the lowest numbered `READY` task.
2. Set it `IN_PROGRESS` before work.
3. On failure, use `FAILURE_RECOVERY_GUIDE.md`; remain on the same TEST while fixing/reverifying.
4. On PASS, record evidence, set the next dependency-complete task `READY`, and continue automatically.
5. `WAITING_EXTERNAL` and `NEEDS_REVIEW` pause dependent work without pretending PASS.
6. Do not rewrite historical MIG completion reports to hide newly discovered defects. Record validation fixes in this branch and the current TEST record.
7. TEST-07 must resolve the existing MIG-07 `DEFERRED` status honestly; it cannot inherit PASS from shared MANUAL_EXTERNAL fixture coverage alone.
8. TEST-13 must execute, not merely document, the real SHORTFORM pilot, real LONGFORM pilot, and REAL PROJECT 01 through WF-18.
9. TEST-15 is the only final program acceptance gate.