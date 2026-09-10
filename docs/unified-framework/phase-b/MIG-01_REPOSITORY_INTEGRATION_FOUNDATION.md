# MIG-01 — Repository Integration Foundation

Status: **WORK ORDER / NOT YET EXECUTED**

## WORK ITEM

`MIG-01`

## GOAL

Prepare `video-production-framework` to become the single integrated production
repository without moving provider/editor production code yet.

## WHY

The current root workspace includes only `packages/*`. Later migration steps
need stable locations for runtimes, apps, resources, CLI and runtime workspaces.
This foundation must be created before code is ported.

## SOURCE

Target repository current root plus Phase A design.

Migration source is read-only for this step.

## TARGET

```
video-production-framework/
├─ packages/
├─ runtimes/
├─ apps/
├─ cli/
├─ resources/
├─ workspace/
└─ tests/
```

## CLASSIFICATION

```
NEW_BUILD
```

## DEPENDENCIES

- PHASE A complete.
- Current framework regression green.

## FILES TO READ FIRST

Target:
- `package.json`
- `.github/workflows/ci.yml`
- `.gitignore`
- `docs/PHASE_1_FOUNDATION_FINAL_v1.0.md`
- `docs/unified-framework/PHASE_A_FINAL_ARCHITECTURE_V1.md`
- `docs/unified-framework/PHASE_A_RUNTIME_RESOURCE_CONTRACTS_V1.md`

Source for path expectations only:
- `video-production/Youtubu_projects/package.json`
- `video-production/config/machine.example.toml`

## IN SCOPE

1. Create integration directory skeleton.
2. Extend root workspace/build strategy so future `apps/*` and runtime packages
   can be integrated without breaking existing packages.
3. Add unified workspace-root configuration contract.
4. Add safe project-relative path resolver foundation.
5. Ensure runtime workspace/media are gitignored.
6. Add repository-level architecture guard tests for forbidden absolute
   source-repository references.
7. Add root commands/placeholders for future unified checks without pretending
   unimplemented runtimes exist.

## OUT OF SCOPE

- ElevenLabs migration.
- Image runtime.
- Flow runtime.
- Editor source move.
- Visual Bible content authoring.
- Project creation CLI.
- Any old repository deletion.

## PORT ITEMS

None required.

## ADAPT ITEMS

Only root build/CI wiring may be adapted from existing conventions.

## NEW BUILD ITEMS

Create foundations equivalent to:

```
runtimes/.gitkeep
apps/.gitkeep
cli/.gitkeep
resources/.gitkeep
workspace/.gitkeep
packages/workspace/
```

The exact package file layout may be refined during implementation, but the
Phase A boundaries must remain.

### Workspace contract

Implement a single resolver with:

```
default root = <repo>/workspace
override     = VPF_WORKSPACE_ROOT
project root = <workspace>/projects/<project_id>
```

Requirements:
- validate project ID,
- reject traversal,
- normalize Windows/POSIX separators,
- persist project-relative paths only,
- expose deterministic folder resolution.

### Git ignore

At minimum ignore:
- `workspace/projects/**`,
- runtime result media,
- editor materialized media if generated inside the repository,
- local secret/env files.

Keep placeholder files only when required.

### Root dependency strategy

Do not force Python runtime code into npm workspaces.

The root may contain:
- npm workspace packages/apps where appropriate,
- executable Python runtime folders invoked behind runtime contracts later.

Do not select a monorepo tool merely for aesthetics.

## LEGACY / DO NOT PORT

Do not import:
- `main.py`,
- old Python monolithic CLI,
- old project folders,
- old visual configs,
- old editor code.

## CONTRACTS THAT MUST NOT CHANGE

- Current WF-07 ... WF-18 package contracts.
- Existing `ProjectFormat = LONGFORM | SHORTFORM`.
- Current migrations 0001 ... 0012.
- `project.db` source-of-truth rule.

## IMPLEMENTATION STEPS

1. Record target branch/base HEAD and full test result.
2. Add integration skeleton.
3. Implement workspace resolver package and tests.
4. Update root package/workspace configuration only as needed.
5. Update CI to include new foundation checks.
6. Add a repository scan test blocking hardcoded operational paths to the old
   repository.
7. Run build/typecheck/test.
8. Confirm no files were moved from source repository.
9. Commit implementation and docs separately where practical.

## TESTS

Required:
- existing full framework build,
- full typecheck,
- existing full tests,
- workspace default-root test,
- `VPF_WORKSPACE_ROOT` override test,
- project ID traversal rejection,
- Windows separator normalization,
- source-repo absolute path scan.

## ACCEPTANCE CRITERIA

- Existing framework regression: PASS.
- Root supports future integrated directories: PASS.
- Workspace resolver: PASS.
- No runtime project media is tracked by Git: PASS.
- No hardcoded old-repository operational dependency: PASS.
- No provider/editor behavior has been prematurely moved: PASS.

## ROLLBACK

Rollback to MIG-01 base HEAD. Since this step is additive, rollback must not
affect existing WF data migrations or package behavior.

## BRANCH / COMMIT POLICY

Suggested branch:

```
migration/mig-01-repository-foundation
```

## COMPLETION REPORT

Use `PHASE_B_EXECUTION_POLICY_V1.md` completion-report template.

Expected next item:

```
MIG-02 — Runtime Contracts + Provider Orchestrator
```
