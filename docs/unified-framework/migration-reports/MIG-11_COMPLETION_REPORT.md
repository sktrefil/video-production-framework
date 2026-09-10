# MIG-11 — Legacy Isolation Hardening Completion Report

Status: **PASS**

## Execution identity

- Repository: `sktrefil/video-production-framework`
- Execution branch: `migration/mig-11-legacy-isolation-v2`
- Cumulative base HEAD: `12cba1393edb45bc429dc67828118d9c1ec64429` (accepted MIG-06 backfill tip containing accepted MIG-08 through MIG-10 work)
- Implementation HEAD: `c70aa2c2d0c2c9a6f405250ea6692e61b14e95cf`
- Implementation CI: `34476730948`
- Node 22: install/build/typecheck/test PASS
- Node 24: install/build/typecheck/test PASS
- Full regression: `199 / 199 PASS`

## Branch and sequencing variance

A pre-existing `migration/mig-11-legacy-isolation` branch already contained an earlier Legacy Guard implementation, but it was based on the MIG-10 accepted head before the MIG-06 image-runtime backfill. Reusing or force-rewriting that branch would have discarded or rewritten accepted cumulative history.

The earlier branch was preserved. The accepted implementation therefore uses `migration/mig-11-legacy-isolation-v2`, created from the exact accepted MIG-06 cumulative head. The earlier MIG-11 code was treated as an audited implementation candidate and was merged with the current image-runtime line rather than replacing it.

MIG-07 remains **DEFERRED** by operator decision. MIG-11 does not represent provider-specific Google Flow migration as PASS. The already-existing shared `MANUAL_EXTERNAL` / WF-11 manual video result path remains covered by regression tests and continues to work under Legacy Guard enforcement.

## Legacy Guard contract

`packages/legacy-guard` is now a first-class unified package with stable block categories:

```text
LEGACY_VISUAL_STYLE
LEGACY_IMAGE_PROMPT_PLANNER
LEGACY_MASTER_LIBRARY
LEGACY_SCENE_INTERPRETER
LEGACY_PROJECT_RENDER_PATH
LEGACY_CONTROL_PLANE
LEGACY_RUNTIME_FORBIDDEN
```

Unified project policy fails closed. Runtime/editor/resource paths require:

```text
pipeline = VPF_UNIFIED_V1
legacyAllowed = false
```

Missing or malformed policy is rejected rather than silently upgraded.

## Runtime isolation

Provider execution now validates unified project policy before state transition and before result ingestion. Runtime executors are resolved only through the registered runtime registry. Old repository/process entrypoints and legacy execution metadata are rejected before spawn or execution.

Operational artifact paths are workspace-confined and symlink-aware. A path that lexically appears to be inside a project but traverses a symlink outside the trusted workspace is blocked.

### MIG-06 image-runtime hardening

The cumulative MIG-06 image runtime remains intact and is now guarded explicitly:

- exact prompt and negative-prompt bytes remain unchanged,
- legacy strings in semantic prompt prose are not treated as execution metadata,
- reference paths are checked for workspace isolation and symlink escape before provider invocation,
- legacy provider execution identifiers are rejected before provider invocation,
- `VPF_IMAGE_ADAPTER_MODULE` pointing at a known old repository/legacy runtime is rejected before module import side effects,
- output paths are checked before atomic write,
- existing reference SHA, dimensions, MIME and candidate-only IMAGE_QC gates remain unchanged.

## Resource and bootstrap isolation

Resource Registry resolves only canonical unified resources and rejects legacy operational references or symlink escapes. Project Bootstrap / doctor validates exact unified policy and reports invalid or missing flags without mutating the project into compliance.

## Editor/materializer isolation

Editor Materializer accepts only unified workspace artifacts and rejects legacy project renderer references, old project-public paths and symlinked media escapes. Generic Editor remains the production renderer; Sado-specific production paths are not a default or fallback.

## CLI and control-plane isolation

Unified CLI rejects legacy control-plane/repository command references before dispatch. No operational command is permitted to shell into or depend on the old production repository.

## Static leak gate

`scripts/check-no-legacy-paths.mjs` now scans production code/config/resource surfaces for Legacy Guard categories and old absolute repository paths. Negative tests and immutable migration/prohibition data are narrowly exempted; production references are not.

The final repository-boundary scan passed.

## Dynamic negative gates

CI proves intentional rejection of:

- missing/incorrect unified project policy,
- legacy visual style/master/planner identifiers,
- old repository runtime/process entrypoints,
- legacy provider execution identifiers,
- legacy image adapter module paths before import,
- resource/media symlink escapes,
- old renderer/project paths,
- legacy CLI/control-plane commands.

The same CI proves normal unified runtime behavior is unaffected:

- MIG-06 Image Runtime exact prompt/reference path,
- ElevenLabs runtime and TTS alignment,
- shared MANUAL_EXTERNAL result path,
- WF-16 audio/subtitle placement,
- Generic Editor browser launch,
- actual GenericFinalRender MP4 render,
- WF-17 Technical QC,
- WF-18 package handoff.

## Acceptance

```text
legacyAllowed=false enforced                    PASS
missing policy fails closed                     PASS
static leak scan                                PASS
dynamic negative tests                         PASS
legacy style resolution                         ZERO
old image/master/scene planner execution        ZERO
old repository runtime dependency               ZERO
MIG-06 image runtime unaffected                 PASS
ElevenLabs runtime unaffected                   PASS
shared MANUAL_EXTERNAL path unaffected          PASS
Generic Editor browser                          PASS
actual render + WF-17/WF-18                     PASS
full regression                                 199 / 199 PASS
```

MIG-11 is complete. MIG-07 remains DEFERRED and is not represented as PASS. MIG-12 has not started.
