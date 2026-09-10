# MIG-09 — Editor Materialization + Render Runtime

Status: **WORK ORDER / NOT YET EXECUTED**

## WORK ITEM

`MIG-09`

## GOAL

Connect Framework editor state to the integrated Generic Editor and port/adapt
the validated WF-17/WF-18 execution scripts into the unified repository.

## WHY

After MIG-08, the editor code exists in one repository, but real projects still
need deterministic media materialization, render execution, technical QC and
publish packaging without relying on the old repository's public directory.

## SOURCE

Old editor scripts:
- `Youtubu_projects/scripts/editor-production-gate.mjs`
- `Youtubu_projects/scripts/render-editor-project.mjs`
- `Youtubu_projects/scripts/final-render-technical-qc.mjs`
- `Youtubu_projects/scripts/final-output-qc.mjs`
- `Youtubu_projects/scripts/package-publish-handoff.mjs`
- `Youtubu_projects/scripts/subtitle-production-qc.mjs`

Target Framework:
- `packages/editor-timeline/**`
- `packages/final-render/**`
- `packages/final-output/**`

## TARGET

```
apps/editor/scripts/
packages/workspace/ or dedicated editor-materializer package
packages/provider-orchestrator/ render bridge as needed
workspace/projects/<id>/08_editor/
workspace/projects/<id>/09_render/
workspace/projects/<id>/10_publish/
```

## CLASSIFICATION

```
ADAPT + NEW_BUILD
```

## DEPENDENCIES

- MIG-01 ... MIG-08 PASS.

## FILES TO READ FIRST

- source render/gate/QC/package scripts listed above,
- `docs/WF-17_IMPLEMENTATION.md`,
- `docs/WF-18_IMPLEMENTATION.md`,
- `packages/final-render/src/index.ts`,
- `packages/final-output/src/index.ts`,
- integrated `apps/editor` paths.

## IN SCOPE

### Editor materializer — NEW BUILD

Input:
- current READY TimelineAssemblyRecord,
- exact edit project JSON,
- referenced AVAILABLE MediaArtifacts.

Canonical snapshot:
```
workspace/projects/<id>/08_editor/edit_project.json
```

Generated execution mirror:
```
apps/editor/public/projects/<id>/
```

Materializer must:
- create/clean deterministic mirror,
- copy/link only current approved referenced media,
- rewrite editor `src` paths deterministically,
- verify every source hash,
- verify destination hash,
- write materialization report,
- never update project.db by reading arbitrary editor changes.

### Render execution — ADAPT

Port/adapt:
- production gate,
- GenericFinalRender invocation,
- H264/AAC/yuv420p/CRF18 profile,
- render manifest,
- media probe,
- technical QC,
- delivery manifest.

Output should live in unified workspace:
```
09_render/final.mp4
09_render/production_gate.json
09_render/render_props.json
09_render/render_manifest.json
09_render/technical_qc.json
09_render/delivery_manifest.json
```

If existing Framework path contracts require `out/<id>`, add a deliberate
path-adapter/backward-compatibility layer rather than silently changing durable
contract semantics.

### WF-18 packaging — ADAPT

Create package under:
```
10_publish/
```
or the exact canonical path chosen by the implementation while preserving
Framework final-output state and hashes.

## OUT OF SCOPE

- adding new editor features,
- actual YouTube upload,
- changing final codec profile,
- changing WF-17/18 state semantics.

## PORT ITEMS

Validated logic that can move with minimal change:
- media probe using Remotion media-parser,
- technical QC checks,
- editor production gate checks,
- package hashing.

## ADAPT ITEMS

- root/path resolution,
- project media path,
- canonical workspace outputs,
- CLI invocation,
- Framework render request/result bridge.

## NEW BUILD ITEMS

- editor materializer,
- materialization report,
- checksum parity gate,
- workspace↔editor path mapper,
- cleanup of stale mirror files,
- render executor wrapper if needed.

## LEGACY / DO NOT PORT

- old `public/projects/sado_prince` as runtime source,
- old active_project state as canonical,
- old `.local` project data,
- legacy final_short.mp4 paths.

## CONTRACTS THAT MUST NOT CHANGE

- WF-17 owns render attempt state.
- exact editor project SHA is pinned.
- Technical QC PASS is required for DELIVERY_READY.
- WF-18 owns Final Output QC and Publish Handoff state.
- actual upload remains outside WF-18.
- editor mirror is disposable.

## IMPLEMENTATION STEPS

1. Implement editor materialization report/schema.
2. Materialize a target fixture project.
3. Verify all media hashes.
4. Port/adapt production gate.
5. Port/adapt final render script.
6. Port/adapt technical QC.
7. Connect render result import to WF-17.
8. Port/adapt final output QC/package handoff.
9. Connect package result to WF-18.
10. Add stale mirror cleanup.
11. Add timeline revision/hash stale detection.
12. Run actual Remotion bundle/render on fixture.
13. Confirm old repository is not accessed.

## TESTS

- deterministic materialization,
- source/destination hash equality,
- missing media blocks,
- stale media blocks,
- old files removed from regenerated mirror,
- edit-project SHA matches render request,
- H264/AAC/yuv420p/CRF18 declared profile,
- technical QC PASS fixture,
- technical QC failure fixture,
- delivery READY only on PASS,
- rerender stales old delivery,
- WF-18 package hashes match,
- old repo path scan zero.

## ACCEPTANCE CRITERIA

```
workspace → editor materialization            PASS
media hash parity                            PASS
GenericFinalRender                           PASS
Technical QC                                 PASS
delivery manifest READY                      PASS
WF-18 package/publish_handoff                PASS
editor mirror source-of-truth                NO
old repository runtime dependency            ZERO
Framework regression                         PASS
```

## ROLLBACK

Revert materializer and adapted scripts to MIG-08 accepted HEAD. Delete generated
editor mirrors and fixture render outputs only.

## BRANCH

```
migration/mig-09-editor-render-runtime
```

## NEXT

```
MIG-10 — Audio / Subtitle Runtime Integration Gaps
```
