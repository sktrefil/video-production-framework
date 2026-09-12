# Shared Reference Library + WF-09 Three-Tier Runbook

## Canonical layout

WF-09 now uses one repository-shared reference library plus an optional project-local tier:

```text
workspace/
├─ reference_library/
│  ├─ global_visual/          # mandatory shared visual baseline
│  └─ knf_layout/             # shared KNF/layout references
└─ projects/
   └─ <project_id>/
      └─ 05_images/
         └─ reference_library/
            ├─ project/       # optional project-specific references
            └─ _shared/       # generated automatically; do not maintain by hand
```

`global_visual` and `knf_layout` are authored once. A user does not copy them into every new project. WF-09 automatically materializes the selected shared bytes into the active project's `_shared` cache because the image runtime intentionally forbids reading outside the project workspace.

## Tier policy

### GLOBAL_VISUAL

- source: `workspace/reference_library/global_visual`
- mandatory for WF-09 reference-aware generation;
- SHA-256 manifest is verified before selection;
- baseline references are always attached;
- missing/empty/unindexed global library hard-blocks with `B010`.

### KNF_LAYOUT

- source: `workspace/reference_library/knf_layout`
- shared across projects;
- used only when a KNF Beat is supplied;
- Scene + Beat scoring chooses the required layout reference;
- the six canonical files are:
  - `01_hook_title.png`
  - `02_persistent_header.png`
  - `03_normal_caption.png`
  - `04_emphasis_caption.png`
  - `05_two_line_caption_blur.png`
  - `06_info_label_object.png`

These six PNG files are committed on `feature/roman-ix-reference-library`.

### PROJECT

- source: `workspace/projects/<project_id>/05_images/reference_library/project`
- optional;
- Scene-selected when `manifest.json` exists;
- never replaces the mandatory global baseline.

## Build SHA-256 manifests

The tier indexer computes hashes from the real approved bytes; caller-supplied hashes are not accepted.

```powershell
npm run reference:index-tier -- `
  --tier global_visual `
  --dir "workspace\reference_library\global_visual" `
  --library-id GLOBAL_VISUAL_V1

npm run reference:index-tier -- `
  --tier knf_layout `
  --dir "workspace\reference_library\knf_layout" `
  --library-id KNF_LAYOUT_V1

npm run reference:index-tier -- `
  --tier project `
  --dir "workspace\projects\pilot_short_roman_ix\05_images\reference_library\project" `
  --library-id ROMAN_IX_PROJECT_V1
```

Verification:

```powershell
npm run reference:index-tier -- --dir "workspace\reference_library\global_visual" --verify-only
npm run reference:index-tier -- --dir "workspace\reference_library\knf_layout" --verify-only
```

Any byte drift returns `REFERENCE_HASH_MISMATCH` and blocks generation.

## WF-09 standard composition

Use the standard factory:

```text
@vpf/scene-assets/standard-reference-aware-image-runtime
```

`createStandardReferenceAwareImageRuntimeJobService(...)` installs `RepositoryThreeTierReferenceSelectionPort` automatically. Callers do not construct a per-project selector or manually copy shared reference files.

For each WF-09 image job the flow is:

```text
Scene + KNF Beat
      ↓
GLOBAL_VISUAL manifest verify ── mandatory
      ↓
GLOBAL_VISUAL baseline select
      ↓
KNF_LAYOUT Scene/Beat select ─── only when Beat exists
      ↓
PROJECT Scene select ─────────── optional
      ↓
materialize shared bytes into
05_images/reference_library/_shared/
      ↓
merge Identity Anchor references
      ↓
ImageRuntimeInput.references
      ↓
normal ImageRuntimeExecutor SHA-256 verification
      ↓
provider / Browser reference upload
```

The resulting provider job records exact reference media ids and SHA-256 values. Browser transport remains transport-only and must preserve the selected references unchanged.

## Isolation rule

Do not pass `workspace/reference_library/...` directly to `ImageRuntimeInput`. The image runtime resolves references under a project's workspace and MIG-11 isolation blocks external paths. The three-tier selector therefore copies only the selected approved shared bytes into:

```text
05_images/reference_library/_shared/global_visual/
05_images/reference_library/_shared/knf_layout/
```

The source manifest is verified before copy, and the normal runtime verifies the materialized bytes again against the same SHA-256.

## Current readiness

The three-tier code path, automatic project materialization, tier indexing command, KNF six-frame assets, and WF-09 standard composition are implemented on the feature branch.

The remaining data prerequisite is the exact approved `global_visual` image set. Those binary files have not been identified in the connected repository/context and must not be fabricated or replaced with unrelated Roman IX/project-specific frames. Once the approved files are placed in `workspace/reference_library/global_visual`, run `reference:index-tier` to create the real SHA-256 manifest before WF-09 generation.
