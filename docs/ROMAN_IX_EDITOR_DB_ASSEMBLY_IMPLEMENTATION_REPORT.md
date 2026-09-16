# Roman IX Editor DB Assembly — Implementation Report

## Scope

Work order: `docs/작업지시서.md` EDB-01 through EDB-10.

Implementation branch: `feature/roman-ix-editor-db-assembly`
Base branch: `feature/roman-ix-reference-library`

## Status

| Work item | Status | Result |
|---|---|---|
| EDB-01 | IMPLEMENTED | `editor diagnose` reports project DB, media count, binding count, handoff blockers, content-plan and assembly state. |
| EDB-02 | IMPLEMENTED / GATED | canonical `MediaBindingPipeline.bindProject()` + `buildEditorHandoff()` is used. No filesystem/path bypass is allowed. Actual Roman IX binding repair proceeds only when existing WF-12 approval/QC state permits it. |
| EDB-03 | IMPLEMENTED | narration + subtitle cues + top title are saved through `EditorContentPlanService`; unchanged approved content is reused. |
| EDB-04 | IMPLEMENTED | timeline profile resolves from the project's pinned `FORMAT_PROFILE`; hard-coded 30/1080/1920/1500 production assembly was removed. |
| EDB-05 | IMPLEMENTED | `EditorTimelineAssemblyPipeline.assembleProject()` now owns production assembly and DB persistence. |
| EDB-06 | IMPLEMENTED | READY assembly serializes `TimelineAssemblyRecord.editProject` to `08_editor/edit_project.json`. Legacy `edit-project.json` builder is disabled. |
| EDB-07 | IMPLEMENTED | materializer already enforces ACTIVE/non-stale/READY; render wrapper additionally rejects assembly lineage mismatch. |
| EDB-08 | IMPLEMENTED | canonical wiring contract tests added; existing WF-13~16/storage/materializer tests remain authoritative. |
| EDB-09 | EXECUTION SCRIPT READY | `scripts/pilot/roman-ix/run-editor-db-migration.ps1` performs diagnose → import metadata refresh → canonical assemble → diagnose → materialize against the real local Roman IX workspace. Actual local DB is intentionally not fabricated or replaced by GitHub fixtures. |
| EDB-10 | EXECUTION SCRIPT READY | same script can run render with `-Render`; Studio command is printed for production verification. Actual Studio/render execution requires the local Roman IX workspace/media. |

## Canonical execution

```powershell
npm run build
npm run vpf -- editor diagnose pilot_short_roman_ix
npm run vpf -- editor media import pilot_short_roman_ix
npm run vpf -- editor assemble pilot_short_roman_ix --header "로마 제9군단의 미스터리"
npm run vpf -- editor diagnose pilot_short_roman_ix
npm run editor:materialize -- pilot_short_roman_ix
npm run studio-server --workspace @vpf/editor-app -- pilot_short_roman_ix
npm run editor:render -- pilot_short_roman_ix
```

Or:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/pilot/roman-ix/run-editor-db-migration.ps1 -Render
```

## Fail-closed rules

- Imported clip files alone never make WF-13 READY.
- Missing QC/approval/binding remains a blocker.
- No direct SQL INSERT is used for `final_media_bindings`, `editor_content_plans`, or `editor_timeline_assemblies` by the new assembly service.
- Non-READY handoff cannot produce a READY assembly.
- Non-READY assembly does not emit a canonical production JSON.
- Materializer rejects non-ACTIVE, stale, or non-READY assemblies.
- Render rejects a different assembly lineage from the one materialized.
- `tests/e2e/unified-project/fixtures` are not used to repair the Roman IX project.

## CI note

The TypeScript build reached and completed `@vpf/cli` successfully in GitHub Actions. The observed validation failure occurred afterward in `@vpf/editor-app` during `remotion bundle`, because the runner installation was missing the optional native Rspack package (`@rspack/binding-linux-x64-gnu`). This is an npm optional-dependency/native-binding environment failure, not an editor-assembly TypeScript compilation error.

## Production completion condition

EDB-09 and EDB-10 must only be marked runtime PASS after the real local `workspace/projects/pilot_short_roman_ix/project.db` and actual media have produced all of the following:

```text
WF13 handoff        READY
ContentPlan         APPROVED
TimelineAssembly    READY
assembly stale      false
materialize         PASS
Studio              production path, no UNASSEMBLED_REVIEW
render              PASS
Studio/render       same assembly id + revision
fixture source      none
```
