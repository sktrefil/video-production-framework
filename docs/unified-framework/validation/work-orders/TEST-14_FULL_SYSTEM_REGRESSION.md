# TEST-14 — Full System Regression

## Goal
After all targeted validation and real pilots, prove the cumulative repaired validation branch remains green as one system.

## Validate
- clean repository build,
- typecheck,
- all unit/contract tests,
- all integration tests,
- legacy/security negative tests,
- SHORTFORM + LONGFORM fixture E2E,
- editor/browser/render smoke required by current CI,
- pilot-readiness/preflight checks,
- resource hash/version invariants,
- no old repository path/runtime dependency,
- no unresolved Critical/High defects from TEST-00...13.

## CI requirement
Run from the exact candidate final HEAD. If any fix is made after the run, rerun the complete regression on the new HEAD.

## Failure handling
Return to the owning defect, fix with regression coverage, then rerun TEST-14 from the beginning.

## PASS criteria
One exact candidate HEAD has a fully green required validation set with no hidden skip/deferred mandatory gate.

## Next
PASS -> TEST-15.