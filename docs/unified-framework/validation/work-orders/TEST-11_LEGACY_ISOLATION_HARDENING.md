# TEST-11 — Legacy Isolation Hardening

Owner: MIG-11

## Goal
Prove unified projects fail closed against legacy runtime/resource/path leakage across all execution boundaries.

## Validate
- project policy guard,
- runtime registry/execution guard,
- Resource Registry guard,
- workspace/file/symlink boundary checks,
- editor materialization guard,
- CLI control-plane checks,
- image runtime and manual audio import checks,
- static no-legacy scan,
- negative dynamic tests.

## Required attacks
Try direct legacy path, encoded/relative path, symlink escape, missing project policy, legacy resource id, and known old repository path references. Validation must occur before reading/copying unsafe files where required.

## Repair rule
Hardening defects may be repaired automatically and should gain regression tests. Weakening the isolation policy requires `NEEDS_REVIEW` and must not be done merely to make another test pass.

## PASS criteria
No tested unified path can consume legacy decision state or escape its approved workspace/resource boundaries.

## Next
PASS -> TEST-12.