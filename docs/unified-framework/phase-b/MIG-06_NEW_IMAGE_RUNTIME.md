# MIG-06 — New Image Runtime

Status: **WORK ORDER / NOT YET EXECUTED**

## WORK ITEM

`MIG-06`

## GOAL

Build a clean image execution runtime that executes WF-09's final approved
provider payload without importing the old image decision stack.

## WHY

The old repository contains extensive image planners, master-style logic and
project-specific visual rules. Those are incompatible with the new authority
chain. The correct migration action is a new thin runtime.

## SOURCE

Canonical decisions already exist in:
- `packages/visual-identity/**`
- `packages/scene-assets/**`
- `packages/production-system/**`
- MIG-03 resources.

Old image/browser code is review-only for low-level transport primitives.

## TARGET

```
runtimes/image/
packages/provider-orchestrator/
packages/runtime-contracts/
```

## CLASSIFICATION

```
NEW_BUILD
```

## DEPENDENCIES

- MIG-01 ... MIG-05 PASS.
- canonical Visual Bible/format/provider profiles exist.
- RuntimeJob contract exists.

## FILES TO READ FIRST

Target:
- `packages/scene-assets/src/index.ts`
- `packages/production-system/src/index.ts`
- MIG-02 runtime contract.
- MIG-03 Visual Bible/format/provider profiles.

Source review only:
- `src/lived_sentences/browser_images.py`
- `src/lived_sentences/scene_image_generator.py`
- `src/lived_sentences/scene_image_prompt_composer.py`
- `src/lived_sentences/images.py`

Do not treat these source files as authoritative design logic.

## IN SCOPE

### Exact execution input

Support an image RuntimeJob carrying:
- final prompt,
- optional negative prompt,
- dimensions/aspect ratio,
- exact approved reference media,
- output relative path,
- provider/profile.

### Executor modes

Support at least:
- automated adapter interface,
- manual external fallback/import where a provider has no supported automation.

The first concrete provider may be whichever provider profile is approved for
the pilot. The runtime contract must not be provider-specific.

### Result

Create:
- generated image file,
- dimensions,
- MIME type,
- size,
- SHA-256,
- provider request ID when available,
- RuntimeResult.

Then use MIG-02 ingestion:
- MediaArtifact AVAILABLE,
- Asset candidate,
- IMAGE_QC required,
- no automatic approval.

## PROMPT IMMUTABILITY RULE

The runtime must not append/prepend:
- visual style,
- palette,
- old master prompt,
- history preset,
- character description,
- scene description.

Allowed transformations are transport-only:
- provider field mapping,
- escaping,
- reference upload,
- required API wrapper.

Add a test comparing the canonical semantic prompt string before and after
runtime mapping.

## REFERENCE MEDIA RULE

Every reference input must include:
- media ID,
- relative path,
- expected SHA-256,
- role.

Runtime verifies the file hash before submission.

No runtime may select a different reference image on its own.

## OUT OF SCOPE

- Project Style generation,
- Anchor planning,
- scene interpretation,
- image prompt design,
- Image QC decision,
- approval.

## PORT ITEMS

None from high-level old image system.

## ADAPT ITEMS

Low-level provider-neutral utilities may be extracted if proven clean:
- safe download,
- image dimension probing,
- atomic file move,
- hash computation.

Any adapted source must have tests proving it has no imports from legacy visual
planners/config/master libraries.

## NEW BUILD ITEMS

- image runtime entrypoint,
- provider adapter interface,
- exact payload mapper,
- reference media verifier,
- result downloader/importer,
- image metadata probe,
- RuntimeResult serializer,
- mock image provider,
- manual external image package only if needed.

## LEGACY / DO NOT PORT

Explicitly forbid imports/use of:
- `image_prompt_planner.py`,
- `history_mystery_visual_prompt_runtime.py`,
- `master_candidate_prompt_planner.py`,
- `master_visual_planner.py`,
- `visual_v2/**` high-level planning,
- `history_mystery_shorts_style.json`,
- `HISTORY_MYSTERY_STYLIZED_V1/**`,
- old scene prompt presets as style authority.

## CONTRACTS THAT MUST NOT CHANGE

- WF-09 owns ASSET_PLAN/IMAGE_ASSET_DESIGN/IMAGE_PROMPT/IMAGE_QC.
- Project Style/Anchors must already be approved.
- candidate is not approved media.
- failed generation enters retryable ProviderJob state.
- project-relative path only.

## IMPLEMENTATION STEPS

1. Define typed image RuntimeJob payload.
2. Implement mock executor first.
3. Implement reference hash validator.
4. Implement provider adapter boundary.
5. Implement output writer/probe/hash.
6. Connect RuntimeResult ingestion to WF-09 Asset candidate.
7. Add image-job failure/retry path.
8. Add prompt immutability test.
9. Add legacy dependency scan for image runtime.
10. Add format-profile dimension/aspect-ratio validation.
11. Add candidate → IMAGE_QC integration test.
12. Run full regression.

## TESTS

- exact prompt preserved,
- negative prompt preserved when present,
- no style injection,
- correct dimensions/aspect ratio,
- wrong reference hash blocked,
- provider failure → FAILED/REGENERATE_REQUIRED path,
- successful result → candidate MediaArtifact,
- IMAGE_QC still required,
- path traversal blocked,
- output checksum verified,
- legacy import scan zero.

## ACCEPTANCE CRITERIA

```
Framework prompt == submitted semantic prompt     PASS
legacy style injection                            ZERO
reference integrity                              PASS
MediaArtifact candidate                           PASS
IMAGE_QC route                                    PASS
retry                                             PASS
old image planner dependency                      ZERO
full regression                                   PASS
```

## ROLLBACK

Remove new image runtime/provider registration and return to MIG-05 accepted
HEAD. No old source files are modified.

## BRANCH

```
migration/mig-06-image-runtime
```

## NEXT

```
MIG-07 — Google Flow Manual Runtime
```
