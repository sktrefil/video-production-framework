# MIG-10 — Audio / Subtitle Runtime Integration Gaps Completion Report

Status: **PASS**

## WORK ITEM

`MIG-10 — Audio / Subtitle Runtime Integration Gaps`

## CLASSIFICATION

`SELECTIVE ADAPT + NEW_BUILD`

## REPOSITORY / BRANCH

- Repository: `sktrefil/video-production-framework`
- Branch: `migration/mig-10-audio-subtitle-gaps`
- Base accepted HEAD: `0e793bbef8b80cc69350d23951ae96a7d7ff7b0e` (MIG-09)
- Final implementation HEAD: `ebc5db647a525fbb4771de54f84973642df7a700`
- Implementation CI: `34470062919`
- Source repository review: `sktrefil/video-production` (read-only)

## GAP AUDIT

MIG-10 began with an explicit A1/A2/A3/A4/T1/T2/G1 audit. The implementation filled only missing runtime/ingest bridges and did not rebuild already validated WF-16 behavior.

| Layer | Result |
|---|---|
| A1 TTS | PASS — MIG-05 ElevenLabs Runtime already creates the canonical narration AUDIO MediaArtifact and WF-16 consumes it. |
| A2 Clip Audio | PASS — approved local audio can be probed, hashed, copied into the unified workspace and persisted as AVAILABLE AUDIO. |
| A3 BGM | PASS — same generic ingest path; loop/placement policy remains WF-16-owned. |
| A4 SFX | PASS — same generic ingest path; no automatic SFX selection or placement was added. |
| T1 Subtitles | PASS — verified ElevenLabs character alignment is deterministically converted to provenance-carrying subtitle cues. |
| T2 Text | PASS — existing deterministic approved EditorContentPlan → WF-16 path reused unchanged. |
| G1 Graphics | PASS — existing deterministic approved EditorContentPlan → WF-16 path reused unchanged. |
| Whisper | NOT_NEEDED — valid ElevenLabs alignment is the preferred current path; no duplicate Whisper orchestration was introduced. |

The detailed pre-implementation audit is recorded in `MIG-10_GAP_ANALYSIS.md`.

## IMPLEMENTED — A2 / A3 / A4 AUDIO INGEST

Added a unified local-audio ingest boundary in `@vpf/provider-orchestrator/audio-import` plus SQLite persistence in `@vpf/storage/audio-import`.

The import path:

```text
approved local audio file
        ↓
Remotion media-parser probe
        ↓
audio-only + positive duration validation
        ↓
SHA-256
        ↓
canonical workspace copy
        ↓
destination checksum parity
        ↓
AVAILABLE AUDIO MediaArtifact
        ↓
project.db + durable workflow event
        ↓
approved EditorContentPlan
        ↓
WF-16 A2 / A3 / A4 placement
```

Canonical role folders are:

```text
07_audio/clip_audio/
07_audio/bgm/
07_audio/sfx/
```

The importer is content-addressed/idempotent for the same project, role/path and checksum. It rejects missing, empty, unsupported or video-containing input before MediaArtifact creation. It never creates or mutates timeline placement on its own.

No new SQL migration was required because the existing `media_artifacts` schema already supports `media_type = AUDIO` and the existing event/outbox tables support the durable import event.

## IMPLEMENTED — T1 SUBTITLE ALIGNMENT BRIDGE

Added `@vpf/tts-generation/subtitle-bridge`.

The bridge requires:

- the current approved FINAL script identity/revision,
- the exact source-script SHA recorded by the completed TTS result,
- the persisted ElevenLabs character-alignment artifact,
- exact alignment artifact SHA-256 parity,
- exact normalized spoken-text equality,
- finite ordered character timestamps,
- a known TTS audio placement and positive audio duration.

It produces deterministic `EditorSubtitleCue` records with:

```text
generationSource = SCRIPT_TTS_ALIGN
generatedFromAudioPlacementIds = [<TTS placement id>]
```

Cue timing is derived from character timing, bounded by narration duration and checked for non-overlap. Caption text is reconstructed and compared with the approved display/spoken text so timing generation cannot silently rewrite the script.

The old subtitle state machine, subtitle workstation and Whisper cache/orchestration were not ported.

## MANUAL SUBTITLE CORRECTION

Added `SubtitleCorrectionService` on the existing EditorContentPlan revision model.

A manual correction:

- edits only the targeted cue text/timing,
- marks the corrected cue `generationSource = MANUAL`,
- preserves its audio provenance reference,
- creates a new **DRAFT** EditorContentPlan revision,
- therefore requires the normal approval path before WF-16 can consume it,
- does not mutate narration audio or overwrite the approved prior revision.

## WF-16 AUTHORITY PRESERVED

MIG-10 deliberately does **not** auto-place imported audio or generated subtitles.

The authority remains:

```text
Runtime / approved local import
        ↓
MediaArtifact or verified timing data
        ↓
EditorContentPlan
        ↓
approval
        ↓
WF-16
        ↓
A1 / A2 / A3 / A4 / T1 / T2 / G1
```

Existing WF-16 duration, loop, source-window, subtitle provenance and overlap rules remain unchanged. In particular, only BGM may loop and non-loop audio may not exceed its source duration.

## SQLITE → WF-16 INTEGRATION PROOF

The final implementation adds a real integration test that generates an actual WAV fixture and executes:

```text
WAV
→ LocalAudioImportService
→ SqliteAudioImportRepository
→ project.db MediaArtifact
→ APPROVED EditorContentPlan
→ SqliteEditorTimelineRepository
→ EditorTimelineAssemblyPipeline
→ A2 CLIP_AUDIO + A3 BGM + A4 SFX
→ READY
```

This prevents the ingest layer and WF-16 placement layer from passing only as disconnected unit tests.

## TESTS / REGRESSION

Implementation CI `34470062919` at exact HEAD `ebc5db647a525fbb4771de54f84973642df7a700`:

- Node 22: install PASS, build PASS, typecheck PASS, test PASS
- Node 24: install PASS, build PASS, typecheck PASS, test PASS
- total automated tests: **172 / 172 PASS**
- Remotion browser smoke: PASS
- actual GenericFinalRender smoke: PASS
- WF-17 Technical QC / delivery path: PASS
- WF-18 package path: PASS
- repository boundary scan: PASS

Test groups:

- Runtime Contracts: 7 / 7
- Provider Orchestrator: 11 / 11
- Resource Registry: 7 / 7
- Project Bootstrap: 9 / 9
- Unified CLI: 4 / 4
- Production System: 6 / 6
- Story: 5 / 5
- Visual Identity: 6 / 6
- Scene Assets: 8 / 8
- Pre-Link/Handoff: 8 / 8
- Final Clip: 9 / 9
- QC/Fallback: 6 / 6
- Media Binding: 6 / 6
- Editor Timeline: 14 / 14
- Final Render: 7 / 7
- Final Output: 6 / 6
- TTS Generation: 14 / 14
- Editor Materializer: 5 / 5
- Storage: 12 / 12
- Workspace: 7 / 7
- Editor App: 15 / 15

## INITIAL FAILED CI AND FIX

Initial implementation CI:

```text
run: 34469587502
head: ab8e79392c5ce200b8f0eaf734be21dad0e7ba50
result: FAIL
```

Cause: TypeScript inferred the selected `parseMedia()` field result as `Record<never, never>`, so the selected probe properties were not type-visible at build time.

The fix introduced an explicit narrow structural type for the requested media-parser fields without weakening runtime validation. Corrected CI `34469704079` passed, and the additional SQLite→WF-16 integration proof was then added and validated by implementation CI `34470062919`.

## LEGACY / NOT PORTED

MIG-10 has zero operational dependency on:

- old subtitle orchestration/state machine,
- old subtitle admin workstation,
- old `whisper_local.py` cache bridge,
- old History-specific BGM/SFX selection workstation,
- old final-mix orchestration,
- the `video-production` repository at runtime.

The old repository was review input only.

## ACCEPTANCE

```text
A1 TTS path                                  PASS
T1 subtitle timing/provenance                PASS
T1 alignment artifact checksum               PASS
manual subtitle correction revision          PASS
A2 Clip Audio ingest                         PASS
A3 BGM ingest                                PASS
A4 SFX ingest                                PASS
actual SQLite MediaArtifact → WF-16           PASS
T2 existing deterministic path               PASS
G1 existing deterministic path               PASS
WF-16 sole placement authority               PASS
Whisper fallback                             NOT_NEEDED
old subtitle orchestration port              ZERO
old repository runtime dependency            ZERO
Remotion/WF-17/WF-18 regression               PASS
full framework regression                    PASS
```

## SEQUENCING NOTE

MIG-06 remains `NOT_STARTED` and MIG-07 remains `DEFERRED` while Google Flow is operated manually. MIG-10 does not claim either capability and does not weaken the global migration completion gate.

## ROLLBACK

Return to accepted MIG-09 HEAD:

`0e793bbef8b80cc69350d23951ae96a7d7ff7b0e`

Only MIG-10 code/tests/docs and generated local test artifacts are removed by rollback; no migration-source repository state is modified.

## NEXT

`MIG-11 — Legacy Isolation Hardening`

## RESULT

**PASS**
