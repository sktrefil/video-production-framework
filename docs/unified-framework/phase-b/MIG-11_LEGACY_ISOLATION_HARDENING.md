# MIG-11 — Legacy Isolation Hardening

Status: **WORK ORDER / NOT YET EXECUTED**

## WORK ITEM

`MIG-11`

## GOAL

Enforce in code that a unified project cannot consume old production decision
logic, style resources, master libraries or old runtime paths.

## WHY

Documentation is insufficient. The old repository contains many valid historical
files and powerful legacy runtimes. Accidental reuse must fail deterministically.

## SOURCE

Phase A legacy policy and all migrated code from MIG-01 ... MIG-10.

Old repository paths/names are test inputs only.

## TARGET

```
packages/legacy-guard/
packages/project-bootstrap/
packages/provider-orchestrator/
packages/resource-registry/
tests/legacy-isolation/
```

## CLASSIFICATION

```
NEW_BUILD
```

## DEPENDENCIES

- MIG-01 ... MIG-10 PASS.

## FILES TO READ FIRST

- `PHASE_A_ASSET_CLASSIFICATION_V1.md`
- `PHASE_A_DECISION_LOG_V1.md`
- all current runtime registry/resource registry code.
- integrated editor path resolution.
- unified project bootstrap config.

## IN SCOPE

### Unified-project identity

Require:
```
pipeline = VPF_UNIFIED_V1
legacyAllowed = false
```

A project missing these flags is not silently upgraded; doctor/status must report
the condition.

### Guard categories

Implement stable block categories:
```
LEGACY_VISUAL_STYLE
LEGACY_IMAGE_PROMPT_PLANNER
LEGACY_MASTER_LIBRARY
LEGACY_SCENE_INTERPRETER
LEGACY_PROJECT_RENDER_PATH
LEGACY_CONTROL_PLANE
LEGACY_RUNTIME_FORBIDDEN
```

### Runtime/import protection

For unified projects:
- runtime registry may resolve only registered unified runtimes,
- resource registry may resolve only resources under canonical `resources/`,
- editor materializer may source only unified workspace artifacts,
- CLI may not shell into the old repository,
- no absolute source-repository paths.

### Static scan

Add CI scan for known legacy identifiers in production runtime paths, including
at minimum:
- `HISTORY_MYSTERY_STYLIZED_V1`,
- `history_mystery_shorts_style`,
- old image prompt planner module names,
- old manager/repo absolute path patterns,
- `src/sado_prince` as a generic production dependency.

Allow appearances only in:
- migration docs,
- negative tests,
- explicit legacy fixture lists.

### Dynamic negative tests

Attempt to inject/resolve:
1. old style file,
2. old master library,
3. old image planner,
4. old project public path,
5. old CLI/runtime command.

Expected:
```
LEGACY_RUNTIME_FORBIDDEN
```
or more specific stable category.

## OUT OF SCOPE

- deleting legacy source repository,
- preventing legacy projects from running in their existing repository,
- changing old projects to unified projects.

## PORT ITEMS

None.

## ADAPT ITEMS

Existing path validators/scanners may be reused if provider-neutral.

## NEW BUILD ITEMS

- LegacyGuard API.
- prohibited-resource registry.
- static CI scanner.
- runtime guard hooks.
- resource guard hooks.
- editor materialization guard.
- doctor diagnostics.
- negative regression suite.

## LEGACY / DO NOT PORT

This work item explicitly prevents operational use of legacy components. It does
not copy them.

## CONTRACTS THAT MUST NOT CHANGE

- legacy fixtures may still exist for tests/migration.
- unified project code may mention legacy names only for detection/testing.
- source repository remains intact.
- no false approval/fallback state should be emitted merely because a legacy
  access was blocked.

## IMPLEMENTATION STEPS

1. Define guard error taxonomy.
2. Add project-context guard.
3. Add resource resolver guard.
4. Add runtime registry guard.
5. Add editor materializer source guard.
6. Add CLI prohibition on old repo shell execution.
7. Add static scan.
8. Add dynamic negative tests.
9. Add `vpf doctor` legacy diagnostics.
10. Run all prior MIG integration tests.
11. Run full regression.

## TESTS

Must intentionally fail:
- legacy Visual Bible/style path resolution,
- legacy master image auto-bind,
- legacy prompt planner invocation,
- source repo absolute runtime path,
- Sado project-specific renderer as default,
- old monolithic control plane call.

Must continue to pass:
- unified image runtime,
- ElevenLabs runtime,
- Flow manual runtime,
- Generic Editor,
- render/package.

## ACCEPTANCE CRITERIA

```
legacyAllowed=false enforced                PASS
static leak scan                            PASS
dynamic negative tests                      PASS
legacy style resolution                     ZERO
old repo runtime dependency                 ZERO
unified runtimes unaffected                 PASS
full regression                             PASS
```

## ROLLBACK

Revert guard package/hooks to MIG-10 accepted HEAD if the guard creates false
positives. Do not weaken the architecture by adding allowlists for production
legacy paths without Architecture Impact Review.

## BRANCH

```
migration/mig-11-legacy-isolation
```

## NEXT

```
MIG-12 — Single-Repository Fixture E2E
```
