# MIG-10 — Audio / Subtitle Runtime Integration Gaps

Status: **WORK ORDER / NOT YET EXECUTED**

## WORK ITEM

`MIG-10`

## GOAL

Fill only the missing upstream runtime/ingest bridges required for a real unified
project to reach WF-16 with valid TTS, Clip Audio, BGM, SFX and subtitle data.

## WHY

WF-16 already owns deterministic placement into A1/A2/A3/A4/T1/T2/G1. The old
repository contains a large audio/subtitle system, but migrating it wholesale
would duplicate orchestration and policy. This work item fills proven gaps only.

## SOURCE

Canonical target:
- `packages/editor-timeline/**`
- `packages/tts-generation/**`
- `packages/domain/**`
- MIG-05 ElevenLabs Runtime.

Review-only source candidates:
- `src/lived_sentences/subtitle_alignment.py`
- `src/lived_sentences/subtitles.py`
- `src/lived_sentences/whisper_local.py`
- `src/lived_sentences/history_mystery_bgm.py`
- audio/BGM/SFX import helpers and generic media utilities.

## TARGET

Potential targets:
```
packages/editor-timeline/
packages/provider-orchestrator/
packages/workspace/
runtimes/audio/             # only if a separate executor is truly needed
runtimes/whisper/           # optional fallback only
cli/vpf/
```

Do not create packages that are not needed simply to mirror the old repository.

## CLASSIFICATION

```
SELECTIVE ADAPT + NEW_BUILD
```

## DEPENDENCIES

- MIG-01 ... MIG-09 PASS.

## FILES TO READ FIRST

- `docs/WF-16_IMPLEMENTATION.md`
- `packages/editor-timeline/src/index.ts`
- `packages/tts-generation/src/index.ts`
- MIG-05 implementation/result format.
- relevant source helpers only after the missing capability is identified.

## IN SCOPE

### Required gap analysis first

Before coding, produce a small checklist of what a real project still lacks for:
- A1 TTS,
- A2 Clip Audio,
- A3 BGM,
- A4 SFX,
- T1 Subtitles,
- T2 Text,
- G1 Graphics.

If a layer already has a complete Framework path, do not create another one.

### TTS alignment → subtitles

Preferred source:
```
ElevenLabs character alignment
```

Build/ADAPT only the bridge needed to create validated subtitle cues from the
approved script + TTS timing.

Requirements:
- retain TTS provenance,
- timing inside A1 range,
- no overlap,
- display text integrity,
- support user/manual correction without modifying the narration artifact.

### Whisper fallback

Optional and only when needed for:
- imported/manual audio with no valid alignment,
- recovery of timing.

If ported:
- it is a fallback runtime,
- not the preferred History/Mystery TTS path,
- output still passes the same subtitle validation.

### BGM/SFX/Clip Audio ingestion

Provide simple unified ingestion:
- import local approved file, and/or
- provider runtime result where applicable,
- probe duration/MIME,
- hash,
- create AUDIO MediaArtifact,
- never auto-place directly on timeline without an approved EditorContentPlan.

### Text / Graphics

Do not add an old automatic design engine. Only provide missing validated input
contracts/UI/CLI bridges needed to feed the existing WF-16 content plan.

## OUT OF SCOPE

- old subtitle workflow wholesale,
- old admin audio workstations,
- old BGM creative-selection engine,
- automatic music composition policy,
- redesigning subtitle aesthetics,
- changing WF-16 track policy.

## PORT ITEMS

Only proven generic utilities with isolated tests.

## ADAPT ITEMS

Potential:
- character alignment mapping,
- local Whisper invocation,
- audio duration probe,
- audio file import/hash,
- subtitle timing validation helpers.

## NEW BUILD ITEMS

As required by gap analysis:
- TTS alignment → subtitle-cue application service,
- generic AUDIO MediaArtifact importer,
- BGM/SFX import CLI,
- optional fallback runtime adapter,
- content-plan input validation/commands.

## LEGACY / DO NOT PORT

Do not port as canonical orchestration:
- old subtitle pipeline state machine,
- old subtitle admin sequence,
- old BGM/SFX workflow state,
- history-specific editor workstations,
- old final mix orchestration.

## CONTRACTS THAT MUST NOT CHANGE

- WF-16 is placement authority.
- V1 visual duration is authoritative.
- only BGM may loop.
- non-loop audio cannot exceed source.
- subtitles must retain TTS provenance where non-manual.
- audio import/generation produces MediaArtifact, not editor placement.

## IMPLEMENTATION STEPS

1. Run gap analysis against a fresh unified fixture.
2. Write missing-capability list and explicitly mark NOT_NEEDED items.
3. Implement TTS alignment → subtitle cue bridge.
4. Implement generic local AUDIO import if missing.
5. Implement BGM/SFX/Clip Audio registration commands as needed.
6. Implement Whisper fallback only if a real path requires it.
7. Connect all outputs to EditorContentPlan inputs.
8. Run WF-16 assembly.
9. Verify A1/A2/A3/A4/T1/T2/G1 tracks.
10. Run Generic Editor preview fixture.
11. Run regression.

## TESTS

- TTS alignment cue generation.
- subtitle text matches approved display text.
- subtitle timing inside TTS range.
- manual correction creates revision, not hidden mutation.
- local audio import hash/duration.
- BGM loop allowed.
- SFX/non-loop source overrun rejected.
- MediaArtifact is required before placement.
- draft/unapproved content plan does not enter edit_project.json.
- optional Whisper fallback does not replace valid alignment.

## ACCEPTANCE CRITERIA

```
A1 TTS path                         PASS
T1 subtitle timing/provenance       PASS
A2/A3/A4 ingest path                PASS or explicitly NOT_REQUIRED
T2/G1 existing deterministic path   PASS
WF-16 remains placement authority   PASS
old subtitle orchestration port     ZERO
full regression                     PASS
```

## ROLLBACK

Revert only added gap bridges to MIG-09 accepted HEAD. Migrated ElevenLabs and
Editor code remain.

## BRANCH

```
migration/mig-10-audio-subtitle-gaps
```

## NEXT

```
MIG-11 — Legacy Isolation Hardening
```
