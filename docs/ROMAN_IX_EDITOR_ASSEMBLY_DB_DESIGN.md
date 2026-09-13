# Roman IX — Canonical Editor Assembly DB Integration Design

## 1. Purpose

This document defines the repair required to make the Roman IX pilot load and render through the canonical editor pipeline.

Current media preparation is largely complete, but the project is not canonically assembled because `project.db` has no active `TimelineAssemblyRecord`. The current temporary `editor assemble` command writes only `08_editor/edit-project.json`, so materialization cannot locate an assembly and returns `ASSEMBLY_NOT_FOUND`. Studio therefore falls back to `UNASSEMBLED_REVIEW`, which is review-only and must not be treated as the production timeline.

The target state is:

```text
WF-13 Media Binding READY
        ↓
WF-14~16 EditorContentPlan APPROVED
        ↓
EditorTimelineAssemblyPipeline.assembleProject(...)
        ↓
project.db TimelineAssemblyRecord READY
        ↓
08_editor/edit_project.json derived from DB assembly
        ↓
materialize
        ↓
Studio
        ↓
render
```

The DB assembly is the canonical source of truth. JSON is a serialized output of that assembly, not an independent timeline authority.

---

## 2. Problem Statement

### Current behavior

`cli/vpf/src/editor-assemble.ts` currently:

- reads `03_tts/subtitle-cues.json`
- checks `03_tts/narration.mp3`
- assumes exactly 10 clip files
- assumes 30 fps
- assumes 1080×1920
- assumes 150 frames per clip / 1500 total frames
- writes `08_editor/edit-project.json`
- does not call `MediaBindingPipeline.buildEditorHandoff(projectId)`
- does not save an `EditorContentPlan`
- does not call `EditorTimelineAssemblyPipeline.assembleProject(...)`
- does not create a `TimelineAssemblyRecord`
- does not create the canonical workflow event/outbox records

As a result, the local JSON can exist while the production editor pipeline still considers the project unassembled.

### Required behavior

`editor assemble` must become a canonical orchestration command over the existing WF-13~16 services.

It must not directly insert assembly rows with ad-hoc SQL.

---

## 3. Existing Canonical Components To Reuse

The implementation must reuse the existing framework components rather than duplicating them.

### WF-13

- `MediaBindingPipeline`
- `buildEditorHandoff(projectId)`
- approved/active media binding state
- source binding revisions
- stale binding detection

### WF-14~16

- `EditorContentPlanService`
- `EditorTimelineAssemblyPipeline`
- `SqliteEditorTimelineRepository`
- `TimelineAssemblyRecord`
- `EditorContentPlan`
- `EDITOR_CONTENT_PLAN_SAVED`
- `EDITOR_TIMELINE_ASSEMBLED`
- durable outbox behavior

### Runtime consumers

- `packages/editor-materializer`
- `apps/editor/scripts/materialize-editor-project.mjs`
- `apps/editor/scripts/editor-studio-server.mjs`
- `apps/editor/scripts/render-editor-project.mjs`

No production consumer should prefer the temporary JSON over the canonical DB assembly.

---

## 4. Canonical Source-of-Truth Rules

1. `project.db` is authoritative for timeline assembly state.
2. `TimelineAssemblyRecord.editProject` is authoritative for the assembled timeline.
3. `08_editor/edit_project.json` is generated from `TimelineAssemblyRecord.editProject`.
4. `08_editor/edit-project.json` is legacy/temporary and must not remain the production filename.
5. Studio production mode must materialize the same assembly revision that render uses.
6. `UNASSEMBLED_REVIEW` is allowed only when there is no canonical assembly and must remain visibly non-production.
7. Direct SQL insertion of timeline assembly rows from CLI code is prohibited.

---

## 5. Required Execution Order

### Step A — Resolve project and profile

Load the project bootstrap/resource configuration and resolve the pinned format profile, expected for the Roman IX pilot to be `SHORTFORM_9X16_V1`.

Read timeline values from the resolved resource rather than hardcoding:

- fps
- width
- height
- snap settings
- master volume
- video volume

The command must fail clearly if the project profile cannot be resolved.

### Step B — Build WF-13 editor handoff

Construct the canonical repository/pipeline and call:

```ts
const handoff = await mediaBindingPipeline.buildEditorHandoff(projectId);
```

Gate behavior:

```text
handoff.status === READY
  → continue

handoff.status !== READY
  → print all blockers
  → do not claim canonical assembly READY
```

Every visual implementation must be represented by an active binding to an approved media artifact or a valid non-media implementation such as CUT according to the existing WF-13 contract.

For Roman IX, the imported clip files must not merely exist; their media artifacts must be bound to the intended implementations with valid source windows and durations.

### Step C — Build/save EditorContentPlan

Convert project TTS/subtitle/editorial inputs into the canonical content plan.

Minimum Roman IX content:

```text
A1  TTS narration.mp3
T1  subtitle cues generated from character alignment / subtitle-cues
T2  persistent/top title
```

Optional layers are added only when project data exists:

```text
A2  clip audio
A3  BGM
A4  SFX
G1  graphics / editorial overlays
```

Save through:

```ts
EditorContentPlanService.savePlan(...)
```

The plan used for production assembly must have:

```text
planStatus = APPROVED
```

Do not bypass the content plan by constructing subtitle/audio timeline items directly inside the CLI after this migration.

### Step D — Assemble through canonical pipeline

Construct:

```ts
const repo = new SqliteEditorTimelineRepository(projectDbPath);

const mediaBindingPipeline = new MediaBindingPipeline(
  repo,
  repo,
  clock,
  ids
);

const assemblyPipeline = new EditorTimelineAssemblyPipeline(
  repo,
  mediaBindingPipeline,
  clock,
  ids,
  repo
);
```

Then call:

```ts
const result = await assemblyPipeline.assembleProject({
  projectId,
  projectName,
  profile
});
```

The existing pipeline owns:

- assembly status calculation
- revision creation
- source binding refs
- source content plan ref
- idempotency for unchanged inputs
- `EDITOR_TIMELINE_ASSEMBLED`
- workflow event
- outbox record
- superseding/replacing the previous active revision according to repository behavior

The CLI must not reimplement these semantics.

---

## 6. CLI Status Contract

The CLI should emit a machine-readable summary and use the following gate.

### READY

```text
assemblyStatus = READY
exit code = 0
materialize allowed
Studio production mode allowed
render allowed
```

### PARTIAL

```text
assemblyStatus = PARTIAL
exit code = 1
print blockers
materialize/render production gate remains closed
```

### BLOCKED

```text
assemblyStatus = BLOCKED
exit code = 1
print blockers
materialize/render forbidden
```

### Idempotent rerun

When bindings, content-plan revision, project name, and resolved profile are unchanged:

```text
created = false
same assembly revision reused
no duplicate assembly revision
```

When a binding revision, approved content-plan revision, or effective profile changes:

```text
created = true
new assembly revision
```

---

## 7. Canonical JSON Output

After a READY assembly has been committed, serialize:

```ts
result.assembly.editProject
```

to:

```text
08_editor/edit_project.json
```

Rules:

- Never independently rebuild the timeline for this file.
- Media paths must be project-relative/canonical paths accepted by the materializer.
- Do not emit the current incorrect `../../06_clips/...` paths.
- Do not use `08_editor/edit-project.json` as a production source after migration.
- If a compatibility copy is temporarily required, mark it explicitly deprecated and ensure no production runtime consumes it.

---

## 8. Roman IX Migration / Repair

The code repair alone is not sufficient. The existing Roman IX project DB must be brought to a canonical state.

Required repair order:

```text
1. Inspect current Roman IX MediaArtifact records
2. Inspect current implementation records and QC results
3. Create/fix WF-13 MediaBinding records for the 10 intended visual clips
4. Verify editor handoff = READY
5. Resolve narration MediaArtifact
6. Build APPROVED EditorContentPlan from narration + subtitles + title
7. Run canonical editor assemble
8. Verify active TimelineAssemblyRecord exists in project.db
9. Verify assemblyStatus = READY
10. Generate 08_editor/edit_project.json from DB assembly
11. materialize
12. launch Studio production mode
13. render
```

No test fixture media may be substituted into the Roman IX production project.

---

## 9. Studio Behavior After Repair

`apps/editor/scripts/editor-studio-server.mjs` currently has a review fallback when materialization throws `ASSEMBLY_NOT_FOUND`.

After this repair:

```text
Roman IX normal path
project.db READY assembly
      ↓
materializeProjectCommand
      ↓
production executionProject
      ↓
Studio
```

`UNASSEMBLED_REVIEW` must no longer occur for the correctly assembled Roman IX project.

The fallback may remain for diagnostic/review use, but it must not hide a broken production assembly.

---

## 10. Required Tests

At minimum add/extend tests covering:

1. READY WF-13 handoff + APPROVED content plan → READY assembly.
2. A `TimelineAssemblyRecord` is persisted in SQLite.
3. Assembly commit and workflow event/outbox are atomic according to repository contract.
4. Same inputs rerun → `created: false`, no duplicate revision.
5. Binding revision change → new assembly revision.
6. Content plan revision change → new assembly revision.
7. Missing/stale media binding → PARTIAL/BLOCKED with explicit blocker.
8. Non-APPROVED content plan → READY is impossible.
9. Profile values are loaded from the project-pinned canonical resource, not hardcoded.
10. Generated JSON filename is `08_editor/edit_project.json`.
11. Generated JSON equals the DB assembly `editProject` semantically.
12. Materializer copies the real Roman IX visual media, TTS, and any other bound content media.
13. No `tests/e2e/.../fixtures/*` media appears in the Roman IX materialized project.
14. Studio normal production load succeeds without `UNASSEMBLED_REVIEW`.
15. Render consumes the same assembly revision that Studio/materialize consumed.

---

## 11. Production Verification Commands

After implementation and Roman IX DB repair, validate in this order:

```powershell
npm run vpf -- editor assemble pilot_short_roman_ix
npm run editor:materialize -- pilot_short_roman_ix
npm run studio-server --workspace @vpf/editor-app -- pilot_short_roman_ix
npm run editor:render -- pilot_short_roman_ix
```

If actual package scripts differ, use the repository's canonical equivalents but preserve this execution order.

Before Studio/render, query or expose diagnostics confirming:

```text
WF13 handoff        READY
ContentPlan         APPROVED
TimelineAssembly    READY
assembly stale      false
assembly revision   <n>
```

---

## 12. Definition of Done

This work is complete only when all of the following are true:

- Roman IX has canonical active media bindings.
- WF-13 editor handoff is READY.
- Roman IX has an APPROVED `EditorContentPlan`.
- `project.db` contains an active non-stale `TimelineAssemblyRecord`.
- assembly status is READY.
- `editor assemble` no longer creates an independent hand-built production timeline.
- `08_editor/edit_project.json` is derived from the DB assembly.
- `materialize` succeeds without `ASSEMBLY_NOT_FOUND`.
- Studio opens Roman IX without `UNASSEMBLED_REVIEW`.
- Studio and render consume the same canonical assembly lineage.
- Production render completes using Roman IX real media.
- relevant unit/integration/E2E tests pass.

---

## 13. Non-Goals

Do not use this task to redesign unrelated Studio UI, visual identity, reference library, image generation, or final-output publishing behavior.

The scope is specifically the missing canonical bridge:

```text
Roman IX real media
→ WF-13 bindings
→ WF-14~16 content + timeline assembly
→ project.db
→ materialize
→ Studio
→ render
```
