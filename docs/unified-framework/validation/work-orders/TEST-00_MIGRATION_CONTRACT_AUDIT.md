# TEST-00 — Migration Contract Audit

## Goal
Prove that the implemented cumulative repository matches the approved Phase A architecture and MIG-01...MIG-13 work orders before deeper validation begins.

## Read first
- Phase A architecture/contracts/dependency map.
- `phase-b/PHASE_B_EXECUTION_POLICY_V1.md`.
- all MIG-01...MIG-13 work orders.
- all migration completion reports that exist.
- current `PHASE_B_MASTER_CHECKLIST_V1.md`.

## Procedure
1. Record branch/base HEAD and current tree.
2. Build a MIG-01...13 matrix: `IMPLEMENTED`, `PARTIAL`, `MISSING`, `CONTRACT_DRIFT`, `UNVERIFIED`, or `DEFERRED`.
3. Compare each work order acceptance criterion against actual source/tests/CI, not only its historical report.
4. Identify cumulative-branch sequencing gaps and confirm accepted backfills are present.
5. Explicitly inspect MIG-07, because the master checklist currently records it `DEFERRED`.
6. Confirm MIG-13 is readiness only and that real pilots are not mislabeled complete.
7. Confirm no immutable resource version was silently changed in place.
8. Confirm existing CI covers build/typecheck/tests/E2E/pilot-readiness as claimed.

## Failure handling
Ordinary missing tests or implementation defects follow `FAILURE_RECOVERY_GUIDE.md`. Architecture conflict becomes `NEEDS_REVIEW`.

## PASS criteria
- Every MIG has an evidence-backed classification.
- No hidden `MISSING`/`CONTRACT_DRIFT` remains unresolved.
- MIG-07 and real-pilot status are represented honestly.
- Validation baseline HEAD is recorded.
- The repository is safe to begin TEST-01.

## Next
PASS -> TEST-01 `READY` and continue automatically.