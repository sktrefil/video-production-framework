# TEST-04 — Project Bootstrap + Unified CLI

Owner: MIG-04

## Goal
Prove that a new SHORTFORM and LONGFORM project can be created natively in the unified repository with correct DB/workspace/resource pins and policy.

## Validate
- `vpf project create` for both formats,
- atomic/staging-safe creation behavior,
- migrations applied to a fresh project DB,
- required workspace folders/files exist,
- project record/version pins/hash pins are correct,
- `legacyAllowed=false`,
- `project status` and `project doctor` behave correctly,
- duplicate/invalid project ids fail safely,
- no old repository dependency.

## Negative checks
Interrupted/invalid bootstrap must not leave a falsely valid project.

## Repair rule
CLI/bootstrap defects may be repaired automatically with regression coverage.

## PASS criteria
Both native formats bootstrap cleanly and doctor/status reflect DB truth.

## Next
PASS -> TEST-05.