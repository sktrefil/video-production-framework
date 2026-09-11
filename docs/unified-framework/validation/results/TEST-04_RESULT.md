# TEST-04 — Project Bootstrap + Unified CLI Result

RESULT: **PASS**

Validated source/CI baseline: `748e6233fd1152bf8f20eb0d9cfe4de4f7a891ce`, CI `34547120304` (Node 22/24, E2E, pilot-readiness all PASS).

## Evidence
- SHORTFORM and LONGFORM bootstrap tests create native unified projects with `pipeline=VPF_UNIFIED_V1`, `legacyAllowed=false`, current migrations and canonical resource/hash pins.
- Fresh DB bootstrap applies the contiguous migration chain through `0014` and creates the standard project directory set.
- `project.json` is verified as an exchange snapshot matching authoritative `project.db` identity/version/resource pins.
- Bootstrap uses staging + atomic rename; migration application is transactional; failure before promotion is cleaned up rather than published as a valid project.
- Duplicate IDs, traversal IDs and unsupported formats fail safely.
- `doctor` verifies DB, migrations, exact resource hashes, directories, snapshot, unified pipeline and old-repository isolation.
- External workspace roots are supported without changing canonical project truth.

## Acceptance
SHORTFORM bootstrap: PASS
LONGFORM bootstrap: PASS
Atomic/staging-safe creation: PASS
Fresh migrations: PASS
Resource/hash pins: PASS
legacyAllowed=false: PASS
status/doctor DB truth: PASS
Unsafe/duplicate inputs fail closed: PASS
Old-repo dependency: ZERO

No source repair was required.
