# PHASE A — Existing Asset Classification v1

Status: **FINAL DESIGN INPUT**

Source repository:

```
sktrefil/video-production
```

Target repository:

```
sktrefil/video-production-framework
```

## 1. Classification vocabulary

### PORT

Move with minimal behavior change. Update imports/paths/build integration only.

### ADAPT

Reuse proven implementation but refit it to the new Framework contract.

### NEW_BUILD

Create a new implementation because the capability does not exist in the target
shape or the old implementation is too coupled to legacy rules.

### LEGACY

Do not use for new unified projects. Preserve only as migration/reference
material in the old repository until decommission.

### DELETE_LATER

Eligible for removal from the old repository only after single-repo E2E and REAL
PROJECT acceptance.

---

## 2. Framework assets already canonical

These remain where they are and are not migrated from the old repository.

```
packages/domain
packages/workflow
packages/storage
packages/production-system
packages/story
packages/visual-identity
packages/scene-assets
packages/prelink-handoff
packages/final-clip
packages/qc-fallback
packages/media-binding
packages/editor-timeline
packages/final-render
packages/final-output
packages/tts-generation
migrations/0001 ... 0012
```

Classification:

```
KEEP / CANONICAL
```

---

## 3. Generic Editor

Source:

```
Youtubu_projects/src/editor/**
Youtubu_projects/src/studio/editor/**
Youtubu_projects/src/Root.tsx
Youtubu_projects/src/index.ts
Youtubu_projects/remotion.config.ts
```

Classification:

```
PORT + ADAPT
```

Preserve:

- Generic Editor item schema,
- ProjectRenderer,
- GenericFinalRender,
- VIDEO / IMAGE / audio / text / graphic renderer behavior,
- Image motion execution,
- Preview/final shared renderer principle.

Adapt:

- project path resolution,
- runtime workspace materialization,
- imports/package workspace location,
- production scripts to unified paths,
- removal of project-specific Sado runtime from the generic production path.

Do not port as canonical:

```
src/sado_prince/**
```

Sado files remain migration fixtures/reference only.

---

## 4. Editor production/render scripts

Source:

```
Youtubu_projects/scripts/editor-production-gate.mjs
Youtubu_projects/scripts/render-editor-project.mjs
Youtubu_projects/scripts/final-render-technical-qc.mjs
Youtubu_projects/scripts/final-output-qc.mjs
Youtubu_projects/scripts/package-publish-handoff.mjs
Youtubu_projects/scripts/subtitle-production-qc.mjs
Youtubu_projects/scripts/check-editor-*.mjs
```

Classification:

```
PORT + ADAPT
```

Adapt to:

- `apps/editor`,
- unified workspace resolver,
- Framework render request/result envelope,
- generated editor-public mirror,
- unified CI.

Do not change the already validated WF-17/WF-18 result semantics without a
separate contract revision.

---

## 5. ElevenLabs runtime

Source candidates:

```
src/lived_sentences/tts.py
relevant TTS-only helpers from src/lived_sentences/cli.py
config/voice_presets.json
tests/test_elevenlabs_v3_tts.py
tests/test_tts_speed_preservation.py
```

Classification:

```
ADAPT
```

Reuse:

- `/with-timestamps`,
- chunk splitting and MP3 combination,
- request ID handling,
- alignment parsing,
- output hashing,
- v3 setting filtering,
- provider-native cadence policy,
- Windows-safe file replacement only if still needed.

Do not migrate the monolithic old CLI as the public execution layer.

The new runtime receives a Framework RuntimeJob and returns RuntimeResult.

History/Mystery default remains:

```
model_id = eleven_v3
LONGFORM max chunk = 4000 chars
```

---

## 6. Image generation

Legacy source areas include:

```
src/lived_sentences/image_prompt_planner.py
src/lived_sentences/history_mystery_visual_prompt_runtime.py
src/lived_sentences/master_candidate_prompt_planner.py
src/lived_sentences/master_visual_planner.py
src/lived_sentences/visual_v2/**
config/history_mystery_shorts_style.json
master_library/HISTORY_MYSTERY_STYLIZED_V1/**
config/scene_prompts/**
```

Classification:

```
LEGACY
```

Reason:

These areas contain or are strongly coupled to historical style/planning
decisions that must not override WF-08/WF-09.

New execution capability:

```
runtimes/image/
```

Classification:

```
NEW_BUILD
```

The new runtime executes the exact approved Framework image job and returns media
metadata only.

### Selective browser transport reuse

If old browser automation contains robust provider-neutral primitives for:

- opening a provider surface,
- attaching exact reference files,
- submitting exact text,
- waiting for result,
- downloading the result,

those primitives may be **ADAPT** candidates only after tests prove that no old
prompt/style/scene mutation remains.

The legacy high-level image workflow itself is not portable.

---

## 7. Visual production standards and old resource files

Examples:

```
production_standard/**
config/media_profiles/**
config/history_mystery_shorts_style.json
master_library/**
dev_doc/history_mystery_stylized_visual_v1/**
docs/v2_history/**
```

Classification:

```
LEGACY / REVIEW SOURCE
```

Do not copy wholesale into the new resource registry.

Provider-neutral factuality, source-rights, readability, or safety rules may be
manually reviewed and rewritten into a new versioned Framework resource.

Any migrated rule must have:

- new resource ID/version,
- explicit owner,
- explicit scope,
- tests,
- no dependency on old visual style/master assets.

Old palette/master-style language is not migrated into the new Visual Bible
unless deliberately re-authored and approved as a new channel decision.

---

## 8. Google Flow / video provider execution

Current Framework already owns clip design and ProviderJob state.

A stable generic automated Flow runtime is not canonical in the source
repository.

Classification:

```
NEW_BUILD
```

Phase-1 runtime mode:

```
MANUAL_EXTERNAL
```

New capability:

- export exact START/END images,
- export exact Flow execution prompt,
- produce job package,
- import returned MP4,
- hash/probe/register as candidate MediaArtifact,
- enter WF-12 QC.

Any later browser automation is an adapter enhancement, not a new workflow.

---

## 9. Filesystem/hash/media utilities

Reusable candidates from:

- current TTS file hashing/atomic writes,
- editor render hashing,
- media probing and path safety.

Classification:

```
ADAPT
```

New target:

```
runtimes/filesystem/
packages/workspace/
```

Do not import old root/path globals.

All paths must be resolved through the unified workspace contract.

---

## 10. Research/script/story logic in old repo

Examples:

```
research_*.py
script_*.py
story_design.py
scenes.py
topic_*.py
```

Classification for new unified projects:

```
LEGACY
```

Reason:

WF-07 already owns the canonical research/script/story model and state in the
Framework. Porting old orchestration would create duplicate decision/state
engines.

Specific provider-neutral helpers may be reconsidered later only as isolated
utilities with independent tests.

---

## 11. Old subtitle planning/generation system

The old repository contains a large subtitle pipeline and many admin runtimes.

Classification:

```
LEGACY by default
SELECTIVE ADAPT only when a missing capability is proven
```

WF-16 already owns deterministic subtitle placement and Generic Editor binding.

The ElevenLabs alignment path already supplies the preferred TTS timing source.

Possible later ADAPT candidates:

- local Whisper transcription fallback,
- narrowly scoped timing validation helpers.

Do not migrate the old subtitle orchestration wholesale.

---

## 12. BGM / SFX assets and tools

Generic Editor BGM/SFX rendering:

```
PORT with the Editor
```

Legacy selection/generation policies and admin workstations:

```
LEGACY / REVIEW SOURCE
```

New unified requirement:

```
NEW_BUILD or selective ADAPT
```

only for the missing upstream asset-ingest/provider layer needed by real
projects.

WF-16 remains the placement authority.

---

## 13. Project bootstrap / old project CLI

Old project creation and monolithic CLI:

```
main.py
src/lived_sentences/cli.py
history_project_command.py
```

Classification:

```
LEGACY as public control plane
```

Useful narrow helpers may be ADAPTed.

New target:

```
packages/project-bootstrap/
packages/workspace/
cli/vpf/
```

Classification:

```
NEW_BUILD
```

The new CLI creates both SHORTFORM and LONGFORM projects using the same
ProjectRecord/VersionPins contract.

---

## 14. Legacy project assets

Examples:

```
projects/**
Youtubu_projects/public/projects/sado_prince/**
Youtubu_projects/src/sado_prince/**
```

Classification:

```
LEGACY FIXTURE / MIGRATION TEST INPUT
```

They are not templates for new projects.

Do not copy their visual style/palette into the new Visual Bible.

---

## 15. New-build inventory

The following capabilities are explicitly required even though they cannot be
obtained by simple migration:

```
packages/runtime-contracts
packages/provider-orchestrator
packages/resource-registry
packages/project-bootstrap
packages/workspace
packages/legacy-guard

runtimes/image
runtimes/google-flow
unified runtime registry
artifact ingestor
editor materializer

cli/vpf

resources/visual-bibles
resources/format-profiles
resources/provider-profiles

single-repository E2E harness
new-project fixtures
legacy-leak regression tests
```

These are part of the migration program's scope.

---

## 16. Decommission rule

Nothing in the source repository is deleted merely because it has been copied.

A source component becomes DELETE_LATER only when:

1. target implementation exists,
2. target unit/contract tests PASS,
3. target single-repo E2E PASS,
4. REAL PROJECT uses the target path,
5. no active legacy project requires the source,
6. a decommission checklist explicitly approves removal.
