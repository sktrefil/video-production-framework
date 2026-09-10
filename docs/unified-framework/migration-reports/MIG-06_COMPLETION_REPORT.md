# MIG-06 — New Image Runtime Completion Report

Status: **PASS**

## Execution identity

- Repository: `sktrefil/video-production-framework`
- Execution branch: `migration/mig-06-image-runtime-v2`
- Cumulative base HEAD: `248316a4cebb782ddbb52352e4fa7aef01202bf2`
- Implementation HEAD: `43a6caa54aab27b09526d9ca83de70ddba8d4357`
- Implementation CI: `34472484397`
- Node 22: install/build/typecheck/test PASS
- Node 24: install/build/typecheck/test PASS
- Full regression: `185 / 185 PASS`

## Sequencing variance

The Phase B work order originally placed MIG-06 directly after MIG-05 and named the branch `migration/mig-06-image-runtime`. Operator sequencing had already completed MIG-08, MIG-09 and MIG-10 on the cumulative line before MIG-06 was backfilled.

The pre-existing `migration/mig-06-image-runtime` branch was also already diverged from the current cumulative accepted history. It was preserved rather than force-rewritten. MIG-06 therefore executed on `migration/mig-06-image-runtime-v2` from the accepted MIG-10 branch tip so that accepted MIG-08 through MIG-10 work was not discarded.

This variance changes neither the MIG-06 functional contract nor MIG-07 status. MIG-07 remains DEFERRED.

## Implemented runtime contract

The unified image runtime now uses a typed `ImageRuntimeInput` containing only the already-approved execution payload:

- exact final prompt,
- optional exact negative prompt,
- required width and height,
- required aspect ratio,
- exact approved reference media IDs, roles, project-relative paths and SHA-256 hashes,
- deterministic project-relative output path.

`runtimes/image/runtime.mjs` is a provider-neutral process entrypoint. Automated providers plug in behind `ImageProviderAdapter`; provider credentials remain process-environment concerns. A concrete vendor HTTP schema was deliberately not invented in Framework code.

Manual/external providers use the same typed RuntimeJob contract and `buildManualImageRuntimeResult()` after placing the result at the approved output path.

## Prompt immutability

The runtime forwards `prompt` and `negativePrompt` without semantic transformation. It does not append or prepend:

- channel style language,
- palette language,
- old master prompts,
- history presets,
- character descriptions,
- scene interpretation.

A process-level regression test loads an external mock provider adapter and fails if the exact approved prompt changes before the adapter boundary.

## Reference integrity

Before provider execution each reference is resolved only inside the unified project workspace and its bytes are SHA-256 verified against the pinned reference hash. Missing files or mismatched hashes block execution before the provider adapter is called. The runtime does not select substitute references.

## Output integrity

Generated output is:

1. checked as non-empty,
2. probed as PNG/JPEG/WebP,
3. checked for MIME/extension agreement,
4. checked for exact approved dimensions,
5. written atomically to the approved project-relative path,
6. SHA-256 hashed and returned in `RuntimeResult`.

Wrong dimensions are rejected rather than silently resized.

## WF-09 integration

`UnifiedImageRuntimeJobService` connects the existing WF-09 design/prompt authority to the MIG-02 runtime boundary without moving creative decisions into runtime code.

The durable ProviderJob targets the newly-created `GENERATING` Asset revision, keeping MIG-02 stale-target protection valid. A completed runtime MediaArtifact is attached only as an Asset candidate. It is not approved by runtime execution.

The existing `SceneAssetPipeline.runImageQc()` remains the IMAGE_QC authority. Regression coverage proves that a runtime candidate reaches `CANDIDATE_AVAILABLE`, then IMAGE_QC, and remains `NEEDS_REVIEW` when policy does not auto-approve.

Transient provider failures can create a new retry job. Retry preserves prompt, negative prompt, dimensions, aspect ratio and exact references; only the attempt/output path changes. Reference/config/path/media integrity failures are blocked rather than blindly retried.

## Legacy isolation

Production MIG-06 runtime files have an explicit negative scan proving zero dependency on the old image decision stack, including old History Mystery style identifiers, old image/master planners and `visual_v2` high-level planning.

## Acceptance

```text
Framework prompt == provider semantic prompt     PASS
legacy style injection                           ZERO
reference integrity                              PASS
format dimensions/aspect ratio                   PASS
provider-neutral automated adapter boundary      PASS
manual external fallback/import                  PASS
MediaArtifact candidate path                     PASS
IMAGE_QC route                                   PASS
retry semantic preservation                      PASS
old image planner dependency                     ZERO
old repository runtime dependency                ZERO
full regression                                  185 / 185 PASS
```

MIG-06 is complete. MIG-07 remains DEFERRED and is not represented as PASS.
