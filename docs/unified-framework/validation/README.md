# PHASE D — Full System Validation

This directory controls post-MIG-13 validation of the unified video-production framework.

Base migration tip: `7ed83f55c9fd468357ace7968db380555a2bb293`
Validation branch: `validation/full-system-v1`

Execution target: normal Chat with the connected GitHub repository. GitHub Actions is the authoritative executable environment for automated build/typecheck/test/E2E gates. Manual provider or human-QC steps are recorded explicitly and resume from the same validation branch after evidence is available.

Read in this order:
1. `TEST_EXECUTION_POLICY.md`
2. `FAILURE_RECOVERY_GUIDE.md`
3. `TEST_TASKS.md`
4. the current `work-orders/TEST-XX_*.md`

Rules:
- Run the lowest numbered `READY` task.
- Do not skip a failed task.
- Implementation defects are repaired on the same validation branch, followed by regression coverage and revalidation.
- After PASS, update `TEST_TASKS.md` and continue automatically to the next unblocked task.
- Stop only on `NEEDS_REVIEW`, destructive/architecture-changing decisions, secret/security policy changes, or unavoidable external/manual gates.
- Never convert an unexecuted check into PASS.

Final acceptance requires the requirements in `TEST-15_PRODUCTION_READINESS_GATE.md`, including real SHORTFORM, real LONGFORM, and REAL PROJECT 01 evidence.