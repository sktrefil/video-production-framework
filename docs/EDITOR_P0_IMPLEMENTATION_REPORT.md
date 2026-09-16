# Editor P0 Implementation Report

This report records the completed P0 implementation scope defined by `EDITOR_P0_P1_P2_MASTER_DESIGN.md`.

## Scope

| Item | Implemented behavior |
| --- | --- |
| P0-01 Audio Split UI | Timeline command and `S` shortcut split selected TTS/CLIP_AUDIO/BGM/SFX items at the playhead with continuous source windows. |
| P0-02 Audio Waveform | Cached Web Audio peak extraction, source-window-aware waveform sampling, zoom-density rendering, and non-fatal decode fallback. |
| P0-03 Subtitle Sync Editor | Subtitle split/merge, frame nudging, overlap warning, and safe-zone warning. |
| P0-04 Video Source In/Out Editor | Source In/Out, asset duration, used duration/ratio, timeline duration, playback rate and canonical approval-window inspection/editing. |
| P0-05 Source Usage Policy | QC_TRIM, DESIGNED_DURATION and FULL_SOURCE policies. Canonical approval windows cannot be expanded without re-approval. |
| P0-06 Video Razor / Split | Playhead razor for approved VIDEO items with playback-rate-aware source continuity and re-approval guard. |
| P0-07 Snap Engine | Project/playhead/item/subtitle edge snapping for move/trim/drop, configurable tolerance, global toggle, Shift bypass and snap guide. |
| P0-08 Track Controls | Track lock, hide/show, audio mute and solo. Track lock is enforced by reducers as well as UI drag/drop controls. |
| P0-09 Playback / Keyboard | Official Remotion Studio play/pause toggle and seek integration; Space, Left/Right, Shift+Left/Right, Home/End, S, Delete and Ctrl/Cmd+Z/Y shortcuts. |
| P0-10 Persistence Regression Gate | Regression coverage for autosave/manual save/reload, JSON edit-project fidelity, canonical fingerprint pinning, stale-draft quarantine, source windows, split pieces, subtitle timing and track controls. |

## Authority and safety invariants

- `project.db` remains the authoritative workflow database.
- Studio edits are derivative review drafts and do not directly mutate `project.db`.
- `TimelineAssemblyRecord.editProject` remains the canonical assembled edit project.
- Preview and final render continue to share `ProjectRenderer`.
- Provider/QC approval windows are not widened by Studio source-usage controls.
- Locked track/item state is enforced in reducer mutations, not only visually.
- Timeline edit fields remain frame-based integers after reducer normalization.

## Validation gate

The P0 regression gate is:

```text
npm run typecheck --workspace @vpf/editor-app
npm test --workspace @vpf/editor-app
```

GitHub CI runs the editor-specific gate on Node 22 and Node 24 before the repository-wide bundle/build stages. The repository-wide Remotion bundle may still encounter the separately documented optional native Rspack binding issue on hosted Linux runners; that infrastructure issue is not used to mask failures in the editor-specific P0 gate.
