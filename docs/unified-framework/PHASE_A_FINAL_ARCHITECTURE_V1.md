# PHASE A — Unified Framework Final Architecture v1

Status: **FINAL DESIGN / READY FOR WORK-INSTRUCTION PHASE**

## 1. Objective

Consolidate the production system into one repository:

```
sktrefil/video-production-framework
```

The consolidated repository must contain:

- WF-07 through WF-18 orchestration and state,
- versioned production resources,
- provider runtime adapters,
- the Generic Editor / Remotion application,
- project bootstrap and unified CLI,
- single-project runtime workspace,
- deterministic QC and publish handoff.

The existing repository:

```
sktrefil/video-production
```

is treated as:

```
MIGRATION SOURCE
+ LEGACY REFERENCE
```

until migration acceptance is complete.

It must not remain a second source of production rules.

---

## 2. Architectural principle

The unified system is a modular monolith with explicit internal planes.

```
┌───────────────────────────────────────────────────────────────┐
│                    UNIFIED FRAMEWORK REPOSITORY               │
│                                                               │
│  CONTROL / STATE                                              │
│  WF-07 ... WF-18 · project.db · approval · revision · QC      │
│                         │                                     │
│                         ▼                                     │
│  DECISION / RESOURCE                                          │
│  Production System · Visual Bible · Project Style · Profiles  │
│                         │                                     │
│                         ▼                                     │
│  EXECUTION CONTRACT                                           │
│  ProviderJob · RuntimeJob · RuntimeResult · MediaArtifact      │
│                         │                                     │
│             ┌───────────┼───────────┐                         │
│             ▼           ▼           ▼                         │
│        ElevenLabs      Image     Google Flow                   │
│          Runtime       Runtime      Runtime                    │
│             └───────────┼───────────┘                         │
│                         ▼                                     │
│                    MediaArtifact                              │
│                         │                                     │
│                         ▼                                     │
│  EDITORIAL / RENDER                                            │
│  Generic Editor · ProjectRenderer · GenericFinalRender        │
│                         │                                     │
│                         ▼                                     │
│  DELIVERY                                                     │
│  final.mp4 · technical_qc · delivery · publish_handoff        │
└───────────────────────────────────────────────────────────────┘
```

### Governing sentence

> Framework decides. Runtime executes. Provider generates. Framework ingests
> and QC's. Editor renders.

No runtime is allowed to invent or override creative policy.

---

## 3. Source of truth

### 3.1 Structured runtime truth

```
workspace/projects/<project_id>/project.db
```

is the canonical structured runtime source of truth for:

- project record and version pins,
- research/facts,
- script revisions and approvals,
- story structure and scenes,
- project style,
- identity anchors,
- assets,
- provider jobs,
- QC results,
- approvals,
- clips and fallback decisions,
- final media bindings,
- editor timeline assembly,
- content plan,
- render attempts,
- technical QC,
- delivery state,
- final output QC,
- publish package state.

### 3.2 Filesystem truth

The filesystem stores large or document-like artifacts:

- source documents,
- prompt exchange snapshots,
- image/audio/video media,
- alignment files,
- editor project snapshots,
- render sidecars,
- publish package files.

Media is referenced from DB by project-relative path and checksum.

### 3.3 Git truth

Git stores:

- code,
- migrations,
- versioned resources,
- schemas,
- tests,
- documentation.

Runtime media and real project DBs are not committed.

---

## 4. Target repository layout

```
video-production-framework/
│
├─ packages/
│  ├─ domain/                    # existing
│  ├─ workflow/                  # existing
│  ├─ storage/                   # existing
│  ├─ production-system/         # existing
│  ├─ story/                     # existing WF-07
│  ├─ visual-identity/           # existing WF-08
│  ├─ scene-assets/              # existing WF-09
│  ├─ prelink-handoff/           # existing WF-10
│  ├─ final-clip/                # existing WF-11
│  ├─ qc-fallback/               # existing WF-12
│  ├─ media-binding/             # existing WF-13
│  ├─ editor-timeline/           # existing WF-14~16
│  ├─ final-render/              # existing WF-17
│  ├─ final-output/              # existing WF-18
│  ├─ tts-generation/            # existing provider orchestration contract
│  │
│  ├─ runtime-contracts/         # NEW BUILD
│  ├─ provider-orchestrator/     # NEW BUILD
│  ├─ resource-registry/         # NEW BUILD
│  ├─ project-bootstrap/         # NEW BUILD
│  ├─ workspace/                 # NEW BUILD
│  └─ legacy-guard/              # NEW BUILD
│
├─ runtimes/
│  ├─ elevenlabs/                # ADAPT from existing Python runtime
│  ├─ image/                     # NEW BUILD
│  ├─ google-flow/               # NEW BUILD / manual-external first
│  └─ filesystem/                # ADAPT reusable file/hash utilities
│
├─ apps/
│  └─ editor/                    # PORT + ADAPT Generic Editor/Remotion
│
├─ cli/
│  └─ vpf/                       # NEW BUILD single entry point
│
├─ resources/
│  ├─ visual-bibles/             # NEW canonical resource location
│  ├─ format-profiles/           # NEW canonical resource location
│  ├─ provider-profiles/         # NEW canonical resource location
│  ├─ channel-profiles/          # NEW canonical resource location
│  └─ schemas/
│
├─ workspace/                    # gitignored runtime root
│  └─ projects/
│     └─ <project_id>/
│
├─ migrations/
├─ docs/
├─ tests/
└─ package.json
```

The exact physical names may be adjusted only if the same boundaries are
preserved. A naming change is not permission to merge responsibilities.

---

## 5. Dependency direction

Dependencies are one-way.

```
CLI / Apps
   ↓
Application packages / orchestration
   ↓
Domain + Workflow contracts
   ↓
Runtime contracts
   ↓
Runtime adapters
```

Forbidden dependency directions:

```
runtime  ─X→ visual-identity decision logic
runtime  ─X→ scene planning logic
editor   ─X→ provider-specific creative logic
domain   ─X→ app/editor implementation
domain   ─X→ legacy manager code
```

Provider-specific execution libraries may depend on runtime-contract types but
must not become a dependency of the production domain.

---

## 6. Project format policy

The canonical domain values remain:

```
LONGFORM
SHORTFORM
```

The unified framework is designed long-form first.

Typical format resource profiles:

```
LONGFORM  → 16:9
SHORTFORM → 9:16
```

The visual style engine is not duplicated by format.

Instead:

```
Channel Visual Bible
        +
Project Style
        +
Format Profile
        ↓
provider-ready asset design / prompt
```

This means SHORTFORM is a format adaptation of the same channel visual system,
not a separate legacy style engine.

---

## 7. Visual authority

For a new unified project, visual authority is:

```
1. pinned Channel Visual Bible
2. approved Project Style
3. approved Identity Anchors
4. approved Scene and StateRef
5. Image Asset Design
6. pinned Format Profile
7. compiled provider prompt
8. Image QC + approval
```

The runtime does not read old visual presets to decorate the prompt.

### Explicitly forbidden for new projects

- old HISTORY_MYSTERY master-style injection,
- old palette injection,
- old master-library automatic binding,
- old visual prompt planner overriding the Framework prompt,
- sample Markdown style/palette/master-style reuse,
- automatic scene reinterpretation inside the image executor.

Sample production Markdown may be used only for structural patterns such as:

- cut grouping,
- EXTRA START structure,
- Scene handoff,
- START → END organization.

It is not a style source.

---

## 8. Runtime model

All provider execution follows one pattern:

```
Framework Plan
      ↓
ProviderJob
      ↓
RuntimeJob
      ↓
Runtime Adapter
      ↓
External Provider / Local Renderer
      ↓
RuntimeResult
      ↓
Artifact Ingestion
      ↓
MediaArtifact
      ↓
QC
      ↓
Approval / retry / fallback
```

### Runtime responsibilities

Allowed:

- authenticate,
- submit exact approved payload,
- upload/reference approved source media,
- download result,
- normalize container/file naming,
- compute file metadata and SHA-256,
- return provider request ID,
- return execution error.

Forbidden:

- change story meaning,
- add style policy,
- add characters/props,
- rewrite prompt for aesthetics,
- choose a different source asset,
- silently change aspect ratio,
- mark media approved,
- bypass QC.

---

## 9. Manual external providers are first-class

The architecture must support both:

```
AUTOMATED
MANUAL_EXTERNAL
```

without special-case workflow logic.

Google Flow is initially treated as a `MANUAL_EXTERNAL` runtime unless a stable
approved automation surface exists.

The runtime exports a job package containing exact source media and exact prompt.
The user performs the external generation and imports the resulting media.
The Framework then performs normal MediaArtifact registration and QC.

Manual execution is therefore not a bypass.

---

## 10. Generic Editor position

The Generic Editor becomes an application inside the unified repository:

```
apps/editor/
```

It remains an independent editorial/render application with the existing
schemaVersion 1 contract unless a separately approved schema migration is made.

Preserve:

- `GenericEditorComposition`,
- `ProjectRenderer`,
- `GenericFinalRender`,
- VIDEO / IMAGE / TTS / CLIP_AUDIO / BGM / SFX / SUBTITLE / TEXT / GRAPHIC,
- executable IMAGE motion contract,
- production gate,
- render manifest,
- technical QC,
- final output QC,
- publish packaging.

The Editor does not become a second database.

---

## 11. Editor project materialization

The canonical structured timeline remains in `project.db`.

The canonical exchange snapshot is written to:

```
workspace/projects/<project_id>/08_editor/edit_project.json
```

For Remotion/static-media execution, an editor materializer creates a disposable
runtime mirror under:

```
apps/editor/public/projects/<project_id>/
```

The mirror may contain:

- `edit_project.json`,
- linked/copied approved media needed by the editor.

Rules:

- the public mirror is generated,
- it is not a second source of truth,
- rebuilding the mirror must be deterministic,
- hashes must match the source workspace artifacts,
- render input must be pinned to the exact editor project hash.

---

## 12. Runtime workspace

Default runtime root:

```
workspace/projects/<project_id>/
```

Recommended layout:

```
<project_id>/
├─ project.json
├─ project.db
├─ 01_research/
├─ 02_script/
├─ 03_tts/
├─ 04_visual_identity/
├─ 05_images/
├─ 06_clips/
├─ 07_audio/
├─ 08_editor/
│  └─ edit_project.json
├─ 09_render/
├─ 10_publish/
├─ jobs/
└─ logs/
```

The root can be overridden by environment/config for large-media disks:

```
VPF_WORKSPACE_ROOT
```

All DB/media paths remain project-relative even when the physical root moves.

---

## 13. Project bootstrap contract

A new project must be creatable without opening a second repository.

Target UX:

```powershell
vpf project create <project_id> --title "..." --format longform
```

Bootstrap creates:

- project directory,
- project.db with all current migrations,
- ProjectRecord,
- pinned framework/data/resource/provider versions,
- project.json exchange/config snapshot,
- standard folders,
- job/log folders,
- legacy isolation marker.

Minimum project configuration:

```json
{
  "schemaVersion": 1,
  "projectId": "history_001",
  "title": "Example",
  "format": "LONGFORM",
  "pipeline": "VPF_UNIFIED_V1",
  "legacyAllowed": false,
  "versions": {
    "frameworkVersion": "...",
    "dataModelVersion": "...",
    "channelVisualBibleVersion": "...",
    "productionSystemVersion": "...",
    "ruleRegistryVersion": "...",
    "formatProfileVersion": "...",
    "providerProfileVersions": {}
  }
}
```

The DB remains authoritative; `project.json` is a validated exchange/config
snapshot.

---

## 14. Unified CLI

The user-facing entry point is owned by the unified repository.

Target commands:

```powershell
vpf project create ...
vpf project status <project_id>

vpf run <project_id> --to script
vpf run <project_id> --to tts
vpf run <project_id> --to images
vpf run <project_id> --to clips
vpf run <project_id> --to editor
vpf run <project_id> --to render
vpf run <project_id> --to publish-handoff

vpf job list <project_id>
vpf job export <job_id>
vpf job import-result <job_id> <file>

vpf qc <project_id>
vpf doctor <project_id>
```

Phase C implementation may initially expose a smaller subset, but there must be
one public CLI contract. Internal package-specific test commands remain allowed.

---

## 15. Secrets

Secrets are never stored in Git, project.json, ProviderJob payloads, or DB result
metadata.

Use environment references:

```
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID        # fallback when applicable
...
```

ProviderJob stores only the logical provider/profile and non-secret inputs.

Runtime profiles may declare secret names but never secret values.

---

## 16. Legacy isolation

Every unified project has:

```
pipeline = VPF_UNIFIED_V1
legacyAllowed = false
```

A new `legacy-guard` package must block accidental use of legacy production
decision paths.

Required block categories:

```
LEGACY_VISUAL_STYLE
LEGACY_IMAGE_PROMPT_PLANNER
LEGACY_MASTER_LIBRARY
LEGACY_SCENE_INTERPRETER
LEGACY_PROJECT_RENDER_PATH
```

Past projects remain runnable through the old repository during migration.
Compatibility does not grant permission for a new project to consume old rules.

---

## 17. Migration safety

Migration is additive until acceptance.

Rules:

1. Do not delete source assets during PORT/ADAPT.
2. Every migrated slice gets contract tests before the next slice.
3. Old repo remains untouched except for optional freeze/documentation changes.
4. New unified code must not import files by absolute path from the old repo.
5. A migrated runtime is accepted only when executed from the unified repo.
6. A migrated editor is accepted only when Preview and Final Render use the same
   shared renderer contract.
7. Legacy cleanup starts only after:
   - single-repo fixture E2E PASS,
   - REAL PROJECT 01 PASS.

---

## 18. Observability and audit

Every runtime execution must be traceable by:

- project ID,
- provider job ID,
- job revision,
- attempt,
- provider/profile version,
- source target ID/revision,
- input payload hash,
- output checksum,
- provider request ID when available,
- started/completed timestamps,
- error code/detail,
- resulting MediaArtifact IDs.

Provider logs are execution evidence, not approval evidence.

---

## 19. Test strategy

Four layers are required.

### L1 — Unit / contract

- domain and runtime-contract validation,
- resource resolution,
- path safety,
- legacy guard,
- prompt payload immutability.

### L2 — adapter tests

- ElevenLabs mocked request/response,
- image executor mocked provider,
- Flow export/import package,
- editor materialization,
- media hash verification.

### L3 — single-repository fixture E2E

```
project create
→ WF-07
→ WF-08
→ WF-09
→ WF-10
→ WF-11
→ WF-12
→ WF-13
→ WF-14~16
→ editor materialize
→ WF-17
→ WF-18
```

External paid providers may be mocked here.

### L4 — real project pilot

At least:

- one SHORTFORM pilot,
- one LONGFORM pilot.

LONGFORM is the final architecture acceptance priority.

---

## 20. Phase A Definition of Done

Phase A is complete when the team has a frozen answer for:

- repository topology,
- module boundaries,
- source-of-truth model,
- runtime contract,
- resource/version model,
- project workspace,
- editor placement,
- legacy isolation,
- migration classification,
- migration dependency order,
- migration acceptance gates.

This document and the companion Phase A documents provide those answers.

**No production migration is considered started by this design document.**
