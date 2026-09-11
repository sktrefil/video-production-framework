# TEST EXECUTION POLICY

Status: **MANDATORY FOR TEST-00 ... TEST-15**

## 1. Execution model

Normal Chat is the validation orchestrator. Use the connected GitHub repository directly for source/document inspection and text-source changes. Use GitHub Actions as the authoritative automated runtime for build, typecheck, unit, integration, E2E, render-smoke and other CI-capable gates.

Validation runs on one continuing branch:

`validation/full-system-v1`

Do not create a fresh branch per TEST unless a review-only exception is explicitly approved. Fixes discovered by earlier tests must remain present for later tests.

## 2. Main loop

`TEST_TASKS.md` is the queue and state ledger.

Required loop:

READY -> IN_PROGRESS -> execute work order -> PASS or recovery.

On PASS:
1. record evidence/HEAD/CI,
2. set current task `PASS`,
3. unblock the next dependency-complete task to `READY`,
4. continue automatically without asking for another user instruction.

On failure:
1. follow `FAILURE_RECOVERY_GUIDE.md`,
2. repair only the owning defect,
3. add regression coverage when feasible,
4. rerun required validation,
5. remain on the same TEST until PASS or a stop condition is reached.

## 3. Status values

- `BLOCKED`: dependency not complete.
- `READY`: may start now.
- `IN_PROGRESS`: current validation running.
- `FIXING`: implementation/test defect is being repaired.
- `REVERIFYING`: repair completed; validation is rerunning.
- `WAITING_EXTERNAL`: unavoidable manual/provider evidence is required.
- `NEEDS_REVIEW`: user decision is required.
- `PASS`: all acceptance criteria executed and passed.
- `FAIL`: terminal failure only when recovery has been exhausted or explicitly rejected.

## 4. Source of truth

Preserve Phase B rules:
- `project.db` = structured runtime truth,
- workspace filesystem = media/documents,
- JSON = exchange/materialization snapshot,
- Git = code/resources/docs.

No validation fix may introduce a parallel JSON state machine, legacy production dependency, or provider runtime creative decision.

## 5. Required evidence

Each TEST completion record must include:
- TEST ID,
- base HEAD and final HEAD,
- files inspected/changed,
- commands/checks represented by CI jobs,
- GitHub Actions run/job identifiers when available,
- failures found,
- fixes made,
- regression tests added,
- acceptance criteria results,
- known issues/deferred/manual items.

## 6. CI rule

A locally assumed result is not enough for automated gates. If the required command is CI-capable but not currently represented in GitHub Actions, add or extend a narrow validation harness/workflow as part of the owning TEST, without weakening existing CI.

Do not mark PASS when:
- a required CI job did not run,
- a test was skipped to obtain green status,
- an assertion was weakened without proving the test was wrong,
- a browser/render/provider gate required by the work order remains unexecuted.

## 7. Manual/external rule

Some gates cannot be fully executed by normal Chat alone, such as manual Google Flow generation, subjective preview QC, or real paid-provider actions not available through connected tools.

For these:
- complete every automatable precondition first,
- prepare exact operator instructions and expected evidence,
- set `WAITING_EXTERNAL`, not PASS,
- when evidence/result is supplied or imported, resume the same TEST automatically,
- do not advance dependent tasks until the gate passes.

## 8. Automatic repair boundary

Normal Chat may automatically repair ordinary implementation defects, regression defects, test defects proven against contracts, and CI harness gaps.

Stop with `NEEDS_REVIEW` before:
- changing Phase A architecture/contracts,
- changing an immutable canonical resource version/hash,
- destructive DB migration or data deletion,
- weakening security/legacy isolation,
- adding/changing secrets or paid-provider policy,
- changing approved creative/product requirements,
- replacing the unified path with the legacy repository.

## 9. Final rule

TEST-15 may PASS only if every mandatory predecessor is PASS and real-production requirements are evidenced. A readiness document is not a substitute for production execution.