# PHASE A — Migration Dependency Map v1

Status: **FINAL DESIGN / INPUT TO PHASE B WORK ORDERS**

## 1. Rule

Migration is not one large code move.

Each work item is a gated vertical slice.

```
MIG-N
  ↓
build
typecheck
unit / contract test
integration test
legacy-leak check
  ↓
PASS
  ↓
MIG-(N+1)
```

A failed gate stops the sequence.

---

## 2. Dependency graph

```
MIG-01 Repository Integration Foundation
        ↓
MIG-02 Runtime Contracts + Provider Orchestrator
        ↓
 ┌──────┼───────────────┐
 ↓      ↓               ↓
MIG-03  MIG-05          MIG-06
Resources ElevenLabs    Image Runtime
 ↓      ↓               ↓
MIG-04  └──────┬────────┘
Bootstrap/CLI  │
 ↓             ↓
 └──────────→ MIG-07 Google Flow Manual Runtime
                ↓
             MIG-08 Generic Editor Port
                ↓
             MIG-09 Editor Materialization + Render Runtime
                ↓
             MIG-10 Audio/Subtitle Runtime Integration Gaps
                ↓
             MIG-11 Legacy Isolation Hardening
                ↓
             MIG-12 Single-Repository Fixture E2E
                ↓
             MIG-13 Real Project Pilot Readiness
```

MIG-07 is retained as a DEFERRED work item and is not an acceptance dependency
for MIG-08. The active path proceeds from MIG-06 PASS to MIG-08. Reactivate
MIG-07 when automated or semi-automated Google Flow management is required.

Some work can be developed in parallel after MIG-02, but acceptance remains in
the active dependency order above.

---

## 3. MIG-01 — Repository Integration Foundation

Type:

```
NEW_BUILD
```

Create target folders and root build conventions:

- `runtimes/`,
- `apps/`,
- `cli/`,
- `resources/`,
- gitignored `workspace/`,
- cross-platform path policy,
- root scripts for build/test/check.

Do not move provider/editor code yet.

Acceptance:

- existing 90 tests remain green,
- empty target skeleton builds,
- workspace root is safely gitignored,
- no legacy repo path is hardcoded.

---

## 4. MIG-02 — Runtime Contracts + Provider Orchestrator

Type:

```
NEW_BUILD
```

Create:

- RuntimeJob,
- RuntimeResult,
- artifact result types,
- executor interface,
- runtime registry,
- job state bridge,
- artifact ingestion service,
- error taxonomy,
- input hash/idempotency contract.

Acceptance:

- image/video/TTS fixture jobs share one envelope,
- no secret values enter durable payload,
- output cannot become approved without downstream QC/approval,
- retry history preserved.

---

## 5. MIG-03 — Resource Registry + Canonical Resources

Type:

```
NEW_BUILD + SELECTIVE ADAPT
```

Create canonical versioned resources:

- Channel Visual Bible,
- LONGFORM/SHORTFORM format profiles,
- provider profiles,
- channel profile,
- schemas.

Migrate only approved provider-neutral old rules after explicit review.

Acceptance:

- project pins version + hash,
- resource update does not silently mutate project,
- Visual Bible is resolvable by WF-08/WF-09,
- legacy master/style files are not resolution candidates.

---

## 6. MIG-04 — Project Bootstrap + Unified CLI Foundation

Type:

```
NEW_BUILD
```

Create:

- workspace manager,
- project bootstrap,
- full DB migration runner,
- project.json snapshot,
- version pin resolver,
- `vpf project create`,
- `vpf project status`,
- basic `vpf doctor`.

Acceptance:

- SHORTFORM project creates successfully,
- LONGFORM project creates successfully,
- one project.db contains all current migrations,
- `legacyAllowed=false`,
- no second repository required.

---

## 7. MIG-05 — ElevenLabs Runtime Migration

Type:

```
ADAPT
```

Move only the proven TTS execution capability.

Input:

```
Framework TtsGenerationPlan / RuntimeJob
```

Output:

```
narration.mp3
character_alignment.json
tts_metadata.json
RuntimeResult
MediaArtifact
```

Acceptance:

- mocked API contract PASS,
- model `eleven_v3`,
- LONGFORM 4,000-char chunking,
- no old monolithic CLI dependency,
- secret values not persisted,
- WF-16 can consume generated AUDIO media.

---

## 8. MIG-06 — New Image Runtime

Type:

```
NEW_BUILD
```

Do not port legacy high-level image planning.

Implement:

- exact prompt submission,
- reference image attachment contract,
- result download/import,
- image metadata/hash,
- RuntimeResult,
- MediaArtifact ingestion.

Acceptance:

- runtime prompt equals Framework prompt payload,
- no legacy style/palette/master injection,
- candidate only until IMAGE_QC,
- failed generation produces retryable job state.

---

## 9. MIG-07 — Google Flow Manual Runtime

Type:

```
NEW_BUILD
```

Implement first-class `MANUAL_EXTERNAL` job export/import.

Acceptance:

- DIRECT_START_END_I2V export includes correct START/END,
- SINGLE_IMAGE_I2V export includes correct source,
- exact prompt preserved,
- imported MP4 remains candidate,
- WF-12 receives it normally,
- stale job result is rejected.

---

## 10. MIG-08 — Generic Editor Port

Type:

```
PORT + ADAPT
```

Move generic editor source into:

```
apps/editor/
```

Preserve schemaVersion 1 and renderer behavior.

Exclude project-specific legacy editors from production path.

Acceptance:

- editor state tests PASS,
- renderer tests PASS,
- timeline/video/audio/subtitle/overlay tests PASS,
- Image motion PASS,
- Remotion bundle PASS.

---

## 11. MIG-09 — Editor Materialization + Render Runtime

Type:

```
ADAPT + NEW_BUILD
```

Port/adapt production gate/render/QC/package scripts.

Create deterministic workspace → editor-public materializer.

Acceptance:

- exact edit project hash pinned,
- media hashes match after materialization,
- GenericFinalRender succeeds,
- Technical QC PASS,
- delivery manifest READY,
- final output package produced,
- no dependency on old repository paths.

---

## 12. MIG-10 — Audio / Subtitle Runtime Integration Gaps

Type:

```
SELECTIVE ADAPT + NEW_BUILD
```

Only fill gaps required by the unified real-project path.

Scope may include:

- TTS alignment → subtitle plan bridge,
- local Whisper fallback if required,
- BGM/SFX import/provider ingestion,
- media registration helpers.

Do not port old audio/subtitle orchestration wholesale.

Acceptance:

- WF-16 remains placement authority,
- A1/A2/A3/A4 and T1/T2/G1 remain deterministic,
- generated/imported media is represented as MediaArtifact.

---

## 13. MIG-11 — Legacy Isolation Hardening

Type:

```
NEW_BUILD
```

Implement hard guard for unified projects.

Acceptance tests must intentionally attempt to call:

- old image prompt planner,
- old master library,
- old style profile,
- old render project path.

Expected result:

```
LEGACY_RUNTIME_FORBIDDEN
```

Also scan target repository for prohibited source-repo absolute imports.

---

## 14. MIG-12 — Single-Repository Fixture E2E

Type:

```
NEW_BUILD TEST HARNESS
```

Run from the unified repo only:

```
project create
→ approved script fixture
→ TTS mocked runtime
→ Visual Identity
→ Scene Assets
→ image mocked runtime
→ Pre-Link
→ video manual/mock result
→ Clip QC
→ Binding
→ Editor Timeline
→ Editor Materialization
→ Render
→ Technical QC
→ Final Output QC
→ Publish Handoff
```

Acceptance:

- no command runs in old repo,
- one project.db,
- all file paths under unified workspace/editor materialization,
- final publish handoff READY,
- zero legacy resource access.

---

## 15. MIG-13 — Real Project Pilot Readiness

Type:

```
VALIDATION / OPERATIONS
```

Prepare operational checklist and runbook for:

1. real SHORTFORM project,
2. real LONGFORM project.

Use actual providers where required.

The LONGFORM pilot is the final architecture acceptance priority.

---

## 16. Work-order template required in Phase B

Every migration work order must contain:

```
WORK ITEM
GOAL
WHY
SOURCE
TARGET
CLASSIFICATION
DEPENDENCIES
IN SCOPE
OUT OF SCOPE
FILES TO READ FIRST
PORT ITEMS
ADAPT ITEMS
NEW BUILD ITEMS
LEGACY / DO NOT PORT
CONTRACTS THAT MUST NOT CHANGE
IMPLEMENTATION STEPS
TESTS
ACCEPTANCE CRITERIA
ROLLBACK
COMMIT / BRANCH POLICY
COMPLETION REPORT FORMAT
```

No work order may say only "migrate X".

It must explicitly include any required NEW_BUILD work.

---

## 17. Global stop conditions

Stop migration and repair the current work item when:

- existing WF regression fails,
- a runtime gains creative decision authority,
- a new project reads legacy style/master resources,
- a secret enters Git/DB/job export,
- project path escapes workspace,
- editor materialization changes media hashes,
- manual provider result bypasses QC,
- old repository becomes required at runtime.

---

## 18. Program acceptance

The migration program is not complete when files are merely moved.

It is complete only when:

```
video-production-framework
        ↓
new project
        ↓
WF-07 ... WF-18
        ↓
real provider/runtime execution
        ↓
Generic Editor
        ↓
final.mp4
        ↓
publish_handoff.json
```

works without entering `video-production` as an operational dependency.
