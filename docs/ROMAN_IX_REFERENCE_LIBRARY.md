# Roman IX Reference Library + WF-09 Regeneration Runbook

## Status

This branch adds the canonical machinery required to register the six approved Golden Reference frames, hash-pin them, auto-select references from Scene/KNF Beat context, inject them into WF-09 image runtime jobs, and upload the exact approved set through a browser transport.

The six source image bytes themselves are **not stored in this repository yet**. Do not fabricate them and do not substitute newly generated lookalikes. The approved source is the Golden Reference set extracted from the stable Moonmu preview.

## Approved six-frame source contract

The source directory must contain exactly these approved frame names:

1. `01_hook_title.png`
2. `02_persistent_header.png`
3. `03_normal_caption.png`
4. `04_emphasis_caption.png`
5. `05_two_line_caption_blur.png`
6. `06_info_label_object.png`

Missing files hard-block registration with `B010`.

## Register into a project

Build and register from the approved source directory into the project workspace:

```powershell
npm run reference:register -- `
  --source "D:\path\to\approved\reference_frames" `
  --target "workspace\projects\roman-ix\05_images\reference_library\ROMAN_IX_KNF_V2\1.0.0"
```

Registration does all of the following atomically at the library level:

- confirms all six expected files exist and are non-empty;
- copies the exact approved bytes;
- computes SHA-256 from the source bytes;
- writes `manifest.json` with role, Scene tags, KNF Beat tags, priority and SHA-256;
- never accepts a caller-provided fake hash.

Verify again before generation:

```powershell
npm run reference:register -- `
  --target "workspace\projects\roman-ix\05_images\reference_library\ROMAN_IX_KNF_V2\1.0.0" `
  --verify-only
```

Any byte drift returns `REFERENCE_HASH_MISMATCH` and must block generation.

## Scene / KNF Beat automatic selection

`@vpf/reference-library` scores the verified manifest using both:

- Scene text / `primaryVisualIdea` / `mustBeSeen` terms;
- optional normalized KNF Beat;
- deterministic role priority as a tie-breaker.

Default selection count is 2 and is capped at 6. The output is converted to the existing `ImageRuntimeReference` contract, so each selected reference carries:

- deterministic library media id;
- semantic role;
- project-relative path;
- SHA-256.

## WF-09 integration

Use `ReferenceAwareUnifiedImageRuntimeJobService` from:

```text
@vpf/scene-assets/reference-aware-image-runtime
```

It preserves the existing WF-09 gates for approved Scene, approved Project Style, approved required Identity Anchors and pinned Format Profile. It then:

1. compiles the approved image prompt;
2. resolves approved Identity Anchor references;
3. asks the Reference Library selector for Scene/KNF Beat references;
4. merges both reference sets deterministically;
5. validates the full `ImageRuntimeInput`;
6. persists the exact merged references inside the normal `IMAGE_GENERATION` ProviderJob.

The event payload also records reference ids, reference SHA-256 values, KNF Beat and library-reference count for auditability.

Existing result synchronization/retry semantics remain compatible because the new job uses the same ProviderJob and ImageRuntimeInput contracts.

## Browser reference upload

`@vpf/provider-orchestrator/browser-reference-upload` is transport-only.

Browser automation receives only references that the image runtime already verified from disk. Upload order, media id and SHA-256 are preserved. The Browser layer must not:

- choose a different reference;
- add or remove a reference;
- crop or rewrite an approved reference;
- reinterpret Scene/KNF Beat selection.

A receipt mismatch against approved runtime references is rejected.

## Roman IX regeneration gate

Roman IX is considered **reference-ready** only when all of these are true:

- six approved source frames have been registered;
- generated `manifest.json` contains six real SHA-256 values;
- `--verify-only` passes;
- Scene/KNF Beat selection produces references for every target Scene;
- WF-09 job `inputPayload.references` contains those exact hashes;
- Browser upload receipt matches those references;
- Image QC failure returns the asset to the existing WF-09 regeneration path instead of advancing.

Until the original six approved image bytes are supplied to the registration command, the code path is implemented but the project-specific `manifest.json` is intentionally not fabricated.
