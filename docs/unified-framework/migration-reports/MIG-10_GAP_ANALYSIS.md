# MIG-10 — Audio / Subtitle Runtime Gap Analysis

Status: **IMPLEMENTATION INPUT**

Base accepted HEAD: `0e793bbef8b80cc69350d23951ae96a7d7ff7b0e` (MIG-09)

This audit was performed before MIG-10 coding. The rule is to fill only missing execution/ingest bridges and not duplicate WF-16 orchestration.

| Layer | Base state | MIG-10 decision |
|---|---|---|
| A1 TTS | COMPLETE | `MIG-05` ElevenLabs Runtime already produces one canonical AVAILABLE AUDIO MediaArtifact and WF-16 consumes it. **NOT_NEEDED** to rebuild. |
| A2 Clip Audio | Placement COMPLETE; ingest MISSING | Add generic approved local AUDIO import: real media probe, SHA-256, canonical workspace copy, MediaArtifact persistence. |
| A3 BGM | Placement/loop policy COMPLETE; ingest MISSING | Reuse the same generic local AUDIO import. WF-16 remains the only BGM placement/loop authority. |
| A4 SFX | Placement/source-overrun policy COMPLETE; ingest MISSING | Reuse the same generic local AUDIO import. No automatic SFX selection. |
| T1 Subtitles | Placement/validation COMPLETE; timing bridge MISSING | Add ElevenLabs character-alignment → `EditorSubtitleCue` bridge with exact script/result provenance and alignment checksum verification. |
| T2 Text | COMPLETE | Existing revisioned approved `EditorContentPlan` → WF-16 deterministic path. **NOT_NEEDED**. |
| G1 Graphics | COMPLETE | Existing revisioned approved `EditorContentPlan` → WF-16 deterministic path. **NOT_NEEDED**. |
| Whisper | No required main-path gap | ElevenLabs alignment is available and preferred. **NOT_NEEDED** for this migration. Future imported/manual audio without valid timing may add Whisper only as fallback behind the same subtitle validation. |

## Frozen boundaries

MIG-10 does not port the old subtitle state machine, admin workstation, BGM selection workflow, history-specific audio workstation, or final-mix orchestration.

The resulting flow remains:

```text
Runtime / approved local import
        ↓
MediaArtifact or verified TTS alignment
        ↓
EditorContentPlan (revisioned; approval required)
        ↓
WF-16 — sole placement authority
        ↓
A1 / A2 / A3 / A4 / T1 / T2 / G1
```

Manual subtitle correction must create a new DRAFT EditorContentPlan revision and therefore requires re-approval. It must never mutate narration audio or silently modify an approved content-plan revision.
