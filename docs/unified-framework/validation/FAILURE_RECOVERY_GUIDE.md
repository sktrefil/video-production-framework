# FAILURE RECOVERY GUIDE

Use this guide whenever TEST-00 ... TEST-15 produces a failed criterion, CI failure, mismatch, or missing implementation.

## 1. Capture evidence first

Record:
- TEST ID,
- current branch and HEAD,
- failing job/test/command,
- exact error or mismatch,
- expected result,
- actual result,
- affected files/package/runtime,
- whether the failure reproduces.

For GitHub Actions failures, inspect the failed job and step logs before editing source.

## 2. Classify the failure

### IMPLEMENTATION_DEFECT
Production source violates the accepted contract. Repair source.

### REGRESSION
A previously accepted behavior is broken by later integration. Repair the regression while preserving both old and new accepted behavior.

### TEST_DEFECT
The test contradicts the accepted contract, uses an invalid fixture, or makes an incorrect assumption. Correct the test only after proving the contract; never relax assertions merely to get green.

### CI_HARNESS_GAP
The required validation is not wired into CI. Add the smallest deterministic CI-capable harness/workflow needed.

### ENVIRONMENT_FAILURE
Runner/network/registry/transient environment failure. Do not change product code. Rerun the same commit. Repeated failures become `BLOCKED` or `NEEDS_REVIEW` depending on cause.

### EXTERNAL_PROVIDER_FAILURE
A real/manual provider fails or cannot produce an ingestible artifact. Separate provider availability from framework defects. Repair framework-owned defects automatically; otherwise use `WAITING_EXTERNAL`/`NEEDS_REVIEW`.

### CONTRACT_CONFLICT
Passing the test requires changing Phase A/Phase B architecture, immutable canonical resource bytes/hash, security policy, or accepted semantics. Stop as `NEEDS_REVIEW`.

## 3. Repair procedure

For `IMPLEMENTATION_DEFECT`, `REGRESSION`, `TEST_DEFECT`, or `CI_HARNESS_GAP`:
1. set task to `FIXING`,
2. identify the owning MIG/package and root cause,
3. inspect the original MIG work order and completion report,
4. make the minimum source/test/harness change needed,
5. add a regression test when feasible,
6. commit the repair on `validation/full-system-v1`,
7. set task to `REVERIFYING`,
8. rerun the original failed gate,
9. rerun the affected package/integration checks,
10. rerun build/typecheck/full regression when required,
11. inspect GitHub Actions result.

If it fails again, repeat this procedure. Do not advance to the next TEST.

## 4. Prohibited shortcuts

Never:
- delete a failing test to obtain PASS,
- weaken a correct assertion,
- skip a failing execution path,
- catch-and-ignore a real error,
- hard-code fixture-specific success,
- reactivate legacy code/resources,
- change canonical version bytes in place,
- bypass QC/approval,
- make the editor mirror canonical state,
- introduce an old-repository runtime dependency,
- commit secrets.

## 5. Revalidation order

After a repair, prefer this order:
1. exact failing test,
2. owning package/runtime tests,
3. boundary integration tests,
4. negative/security/legacy tests relevant to the fix,
5. build,
6. typecheck,
7. full repository test suite,
8. E2E/render/browser/pilot gate when applicable.

## 6. PASS and automatic continuation

Only after every criterion for the current work order passes:
- change current task to `PASS`,
- record final HEAD/CI/evidence,
- change the next dependency-complete task to `READY`,
- immediately continue to that next task without waiting for a separate user message.

## 7. Stop conditions

Stop and report `NEEDS_REVIEW` for architecture/contract changes, destructive operations, immutable resource mutations, security/secret policy changes, paid-provider policy decisions, or contradictory requirements.

Use `WAITING_EXTERNAL` when the framework is ready but an unavoidable manual/provider/human-QC action is the only remaining gate. Resume automatically from that point when evidence becomes available.