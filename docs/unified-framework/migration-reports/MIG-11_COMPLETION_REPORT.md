# MIG-11 — Legacy Isolation Hardening

Status: **IMPLEMENTED / CI VERIFICATION PENDING**

## Source and scope

- Repository: `sktrefil/video-production-framework`
- Branch: `migration/mig-11-legacy-isolation`
- Accepted MIG-10 base: `248316a4cebb782ddbb52352e4fa7aef01202bf2`
- Implementation authorized directly by the operator.
- MIG-06 remains NOT_STARTED; MIG-07 remains DEFERRED. Their provider-specific
  execution cannot be tested on this base and is not claimed as PASS.

## Implemented boundaries

- `@vpf/legacy-guard` defines all seven stable legacy block categories and strict
  `pipeline=VPF_UNIFIED_V1`, `legacyAllowed=false` validation. Missing or malformed
  policy fails closed; no inferred policy or implicit project upgrade.
- SQLite runtime and editor repositories read the active project's actual policy.
  Bootstrap insertion, status and doctor validate it. Doctor identifies failed
  unified-pipeline and legacy-disabled checks on imported incompatible projects.
- Runtime registry rejects known old identifiers and resolves registered executors
  only. Policy, provider and operational job metadata are checked before starting;
  successful results recheck policy before media ingestion. Rejection cannot
  manufacture an approval, success receipt or fallback selection.
- ElevenLabs can launch only the integrated repository runtime entrypoint.
  Known old command paths and alternate script entrypoints are rejected before spawn.
- Bootstrap pins resource resolution to its repository's canonical `resources/`.
  Resource reads and enumeration reject legacy references, path escape and symlinks.
- Workspace paths, audio import paths, editor materialization and publish-source
  reads reject old repository references and symlink traversal. Materialization
  requires explicit unified project policy and sources media inside its project.
- CLI command arguments reject old control-plane/repository commands before dispatch.
  Project titles and approved narration/prompt prose remain data.
- CI's existing repository-boundary gate now scans package/runtime/editor/CLI/resource,
  script and workflow sources for all categories, in addition to old absolute paths.

## Preservation

Visual Bible, Project Style, Anchor and approved prompt resource bytes were not
rewritten. Detection inspects operational metadata and does not rewrite or plan
prompts. The original source repository remains untouched.

The scanner excludes negative-test directories and its central detection table.
Two exact existing detection/provenance strings are ignored: the immutable Visual
Bible's prohibition sentence and `PORT_SOURCE.json`'s source-repository field.
All other fields in those files remain scanned; no operational legacy path is
allowlisted. Existing WF-17/WF-18 logical output aliases still resolve to current
unified workspace paths and do not access the old repository.

Filesystem checks protect normal configured paths and existing symlinks; they are
not an OS sandbox against a hostile process concurrently replacing filesystem nodes.
Runtime registration remains a trusted code boundary, not isolation of arbitrary
third-party executor implementations.

## Verification

- Build and typecheck: PASS locally.
- Framework regression and negative tests: 168/168 PASS locally; editor tests:
  15/15 PASS locally (183 total).
- Static legacy leak scan and Git whitespace check: PASS locally.
- New coverage includes all seven categories, encoded/Windows paths, missing policy,
  unregistered executors, old style/master/planner/render/control-plane references,
  symlink media/resources, malformed imported project DBs, CLI dispatch and scanner leaks.
- Local Remotion browser/render smoke is blocked by Chrome Headless Shell download
  proxy timeout. It is not recorded as a pass. GitHub's unchanged Node 22/24 CI runs
  the full build/typecheck/test pipeline, including browser, real render, technical
  QC and package materialization; its result is required for completion.

## Rollback

Revert the MIG-11 implementation commit to the accepted MIG-10 base. Do not remove
historical source files or relax guard rules to make production legacy paths pass.
