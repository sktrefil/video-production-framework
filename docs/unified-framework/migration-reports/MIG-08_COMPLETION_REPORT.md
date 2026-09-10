# MIG-08 — Generic Editor Port: implementation and pending acceptance

## Latest verification after user-provided node_modules copy

The editor-local installation now contains Remotion/CLI/media/media-parser
4.0.518, React 19.2.3 and ESLint 9.19.0 with no nested node_modules directory.
The missing-package blocker described below is resolved for this local copy.

- All 13 editor checks PASS, including WF-17 and the port isolation check.
- Typecheck PASS after making the Preview wrapper's project prop required,
  matching the shared metadata function's contract.
- ESLint PASS.
- `npm run editor:bundle` PASS. The build script now uses the public
  @remotion/bundler API with Rspack and absolute app paths. This avoids the
  CLI config-transpiler child process that returned spawn EPERM here.
- Framework editor-timeline regression: 13/13 PASS using an in-process
  TypeScript transpilation/resolution hook.
- Full Framework regression is NOT PASS: the same in-process runner reached
  the tests, but failures include child process/symlink permissions,
  ElevenLabs runtime configuration results and a pinned resource hash mismatch
  in resource-versioning.test.ts. These need investigation; do not label all
  of them as environment-only failures without evidence.
- Studio browser verification is still outstanding; bundle success alone is
  not a claim that Studio was opened and exercised.

MIG-08 remains unaccepted pending the outstanding regression and Studio checks.
The remaining sections preserve the original pre-copy verification history.

WORK_ITEM: MIG-08
RESULT: IN_PROGRESS / VALIDATION BLOCKED (not PASS)
BRANCH: migration/mig-06-image-runtime
REQUESTED_BRANCH: migration/mig-08-generic-editor
BASE_HEAD: 1bbf8e544a3d7d9a30ce88398751a8b04019cf4b
FINAL_HEAD: unchanged; uncommitted working-tree implementation
SOURCE_HEAD: bf8b5c727e522924c8c89c1e72a910e2b60b8855
SOURCE_BRANCH: feature/wf18-final-output-publish-handoff

## Classification and changes

PORT: `apps/editor/src/editor`, `src/studio/editor`, shared StudioToolbar,
audio/SFX client contracts, generic sample, editor regression scripts,
production/subtitle gate validators and WF-17 technical QC module.

ADAPT: Root registers only GenericVideoEditor and GenericFinalRender with the
shared ProjectRenderer; package dependencies remain pinned to source versions;
workspace scripts/CI include the editor; server-specific test assertions are
explicitly deferred; client endpoints require explicit unified API configuration;
VITRO font-face is only emitted for projects requesting that font.

NEW_BUILD: self-contained schemaVersion 1 image-motion/title fixture, explicit
API configuration boundary, port isolation check and sequential check runner.

LEGACY_NOT_PORTED: Sado compositions/manifests, HistoryMystery composition,
old SFX/audio workbenches, monolithic sfx-server, source public media/fonts,
old .local state and source package lock.

FILES_CHANGED: `apps/editor/**`, `apps/README.md`, root `package.json`,
`.github/workflows/ci.yml`, MIG-08 work order and master checklist.
Earlier MIG-07 DEFERRED policy edits are preserved. The pre-existing untracked
root package-lock.json was not edited intentionally or replaced with the source
lock. Dependency installation failed before a usable editor lock was produced.

## Verification

Node: 24.19.0; npm: 12.0.2.

- Unit/contract: 12 editor checks PASS: port, state (16 scenarios), renderer,
  timeline, video, audio, subtitles, overlays, BGM/SFX, persistence client,
  production validator and WF-16 renderer contract.
- WF-17: BLOCKED at import of missing @remotion/media-parser.
- Build/Remotion bundle: BLOCKED, remotion executable unavailable.
- Typecheck: FAIL, missing React/Remotion/web declarations; cannot establish
  type safety until dependencies are installed.
- ESLint: BLOCKED, executable unavailable.
- Framework regression: BLOCKED by process creation EPERM. The Node/tsx runner
  could not spawn test workers. Retrying editor-timeline with test-isolation=none
  reached esbuild, whose child process was also denied. No regression PASS claim.
- Repository boundary scan: PASS.
- CI_RUN: not started.

`npm install --ignore-scripts --fetch-retries=0 --fetch-timeout=15000` failed
with ENOTCACHED: this environment enforces only-if-cached registry access and
does not contain the required @remotion/cli cache entry.

Branch creation failed with permission denied writing the new ref under .git.
Source repository was read only and remains unchanged.

## Acceptance and deferred runtime tests

schemaVersion 1, image-motion normalization, shared renderer routing, generic
composition registration and absence of Sado production references: checked.
Studio opening, Remotion bundle, full type/lint and Framework regression:
NOT VERIFIED. Therefore MIG-08 is not accepted.

MIG-09 owns DB materialization, save/load server, asset import services,
production render runner and WF-18 packaging. Their old server assertions were
removed from the ported checks with explicit MIG-09 markers. WF-18 test script
was not retained without its packaging implementation. These checks must be
re-established against the unified runtime during MIG-09. No no-op server or
JSON authority was introduced to make those tests appear to pass.

The default fixture is fully embedded and needs no external assets. The original
generic sample remains for source-compatible contract checks only. Projects
requesting VITRO must materialize their licensed font resource before rendering.

## Resume

In an environment with dependency download and local process execution enabled:

```sh
git switch -c migration/mig-08-generic-editor
npm install
npm run editor:check
npm run editor:bundle
npm run build
npm run typecheck
npm test
npm run editor:dev
```

Resolve any type/lint or runtime failures, inspect Studio, then record acceptance
and commit/CI evidence. MIG-07 remains DEFERRED. Do not advance to MIG-09 until
MIG-08 acceptance is established.

ROLLBACK_POINT: MIG-06 base HEAD above; remove only MIG-08 app/wiring changes
while preserving pre-existing policy edits and package-lock.json.
NEXT_WORK_ITEM: finish MIG-08 validation; then MIG-09.
