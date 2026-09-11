# TEST-01 — Repository Integration Foundation

Owner: MIG-01

## Goal
Validate the unified repository skeleton, workspace/package integration, migrations, build wiring, and absence of runtime dependence on the old repository.

## Validate
- required top-level packages/apps/runtimes/resources/workspace/docs/tests layout exists,
- package/workspace references resolve inside this repository,
- migration chain is discoverable and coherent,
- clean install/build/typecheck/test paths are CI-capable,
- no production command requires an old-repo working directory,
- Windows-relevant paths are not hard-coded to developer-specific locations,
- baseline regression remains green.

## Negative checks
Search operational source for old repository absolute paths, accidental monorepo escape, and undeclared cross-package dependencies.

## Repair rule
Repository/build wiring defects may be repaired automatically; architecture changes require review.

## PASS criteria
Repository foundation is self-contained, deterministic, CI-green, and suitable for later tests.

## Next
PASS -> TEST-02 `READY` and continue.