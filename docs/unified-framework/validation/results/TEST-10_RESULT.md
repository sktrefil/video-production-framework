# TEST-10 Result — Audio + Subtitle Runtime Gaps

Status: PASS

Branch: `validation/full-system-v1`
Code validation HEAD: `e1f3aee5002f58eed2a05eb2fe94a8155511bcb9`
GitHub Actions run: `34550382779`

## Defect found during validation

Manual local audio import validated/probed/hashed the selected source file before proving that the target project was an explicit unified project. A missing or legacy project policy could therefore cause source-file inspection before the fail-closed project-policy gate.

Classification: IMPLEMENTATION_DEFECT / LEGACY-ISOLATION ORDERING GAP.

## Repair

- `AudioImportPersistencePort` now exposes `getProjectPolicy(projectId)`.
- `LocalAudioImportService.importFile()` calls `assertUnifiedProject(...)` before source stat/probe/hash/copy.
- `SqliteAudioImportRepository` reads policy from the canonical `projects` table through `readProjectPolicy()`.
- Regression test proves missing/legacy policy returns `LEGACY_RUNTIME_FORBIDDEN` even when the selected source path does not exist, demonstrating that project identity is checked before source access.
- A2/A3/A4 → WF-16 integration fixture now seeds an explicit unified project policy before import.

## Audio/subtitle/timeline evidence

- WF-16 tests assemble TTS (A1), clip audio (A2), BGM (A3), SFX (A4), subtitles, text overlays and graphics into one canonical editor timeline.
- SCRIPT_TTS_ALIGN subtitle cues retain TTS placement provenance.
- Invalid subtitle timing relative to TTS is covered by negative validation.
- Manual subtitle correction creates a new DRAFT content-plan revision, marks the cue source MANUAL, preserves TTS provenance and does not create a second canonical timing authority.
- Renderer/editor parity remains covered by the full root test suite and editor render checks.

## CI evidence

Run `34550382779` on `e1f3aee5002f58eed2a05eb2fe94a8155511bcb9`:
- validate (22): PASS — build, typecheck, full `npm test`
- validate (24): PASS — build, typecheck, full `npm test`
- e2e: PASS
- pilot-readiness: PASS

## Acceptance

Audio/subtitle/graphics integration is deterministic, policy-safe and renderer-consistent with WF-16 as the accepted placement/timing authority.

Result: PASS
