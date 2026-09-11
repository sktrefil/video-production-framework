# TEST-03 — Resource Registry + Canonical Resources Result

RESULT: **PASS**

Validated source/CI baseline: `748e6233fd1152bf8f20eb0d9cfe4de4f7a891ce`, CI `34547120304` (Node 22/24, E2E, pilot-readiness all PASS).

## Evidence
- FileSystemResourceRegistry resolves explicit id/version and verifies optional pinned hash.
- Missing versions do not auto-upgrade pinned projects; diagnosePin distinguishes CURRENT/STALE and planUpgrade is explicit.
- Canonical repository resources are validated by integration tests, including Visual Bible, LONGFORM/SHORTFORM format profiles and execution-only provider profiles.
- Existing `HISTORY_MYSTERY_V1@1.0.0` bytes are frozen by an exact SHA-256 regression; new projects explicitly select 1.1.0 instead of mutating 1.0.0.
- Legacy visual/master resources and symlink/nested operational escapes are rejected fail-closed.

## Acceptance
Deterministic exact-version resolution: PASS
Canonical schema/profile validation: PASS
Version+hash reproducibility: PASS
Immutable prior-version guard: PASS
No silent project upgrade: PASS
Missing/hash mismatch failure: PASS
Legacy resource isolation: PASS

No source repair was required.
