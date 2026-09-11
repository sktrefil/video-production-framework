# TEST-12 — Single-Repository Fixture E2E

Owner: MIG-12

## Goal
Run deterministic SHORTFORM and LONGFORM fixture E2E through the unified repository and prove no old-repo operational dependency.

## Validate
- one-command E2E for both formats,
- one `project.db` per project,
- mocked RuntimeJob-backed image/TTS providers,
- shared MANUAL_EXTERNAL video result ingestion,
- actual editor materialization and GenericFinalRender,
- WF-17 delivery,
- WF-18 publish handoff,
- negative gates and no-legacy checks,
- deterministic cleanup/re-run behavior.

## CI requirement
This must be represented in GitHub Actions and run from the current validation HEAD. Historical MIG-12 success alone is insufficient.

## Repair rule
E2E-discovered product defects return to the owning package/MIG, are fixed on the same validation branch, gain regression coverage, and the full E2E is rerun.

## PASS criteria
Both fixture formats complete the entire mocked/manual unified chain with green CI and zero legacy operational access.

## Next
PASS -> TEST-13.