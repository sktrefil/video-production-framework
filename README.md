# video-production-framework

AI-assisted video production orchestration framework.

## Status

- PHASE 1 — FOUNDATION: FINAL / VALIDATED / FOUNDATION_LOCK
- PHASE 2 — PRODUCTION CORE
  - WF-07 — Research / Script / Story Pipeline: PASS
  - WF-08 — Visual Identity Pipeline: PASS
  - WF-09 — Scene Asset Pipeline: PASS
  - WF-10 — Pre-Link / Handoff Pipeline: PASS
  - WF-11 — Final Clip / Provider Job Pipeline: PASS
  - WF-12 — QC / Fallback Engine: PASS
  - WF-13 — Final Media Binding / Editor Handoff: PASS
  - WF-14 — Editor / Timeline Assembly: PASS
  - WF-15 — Generic Editor Motion Execution: PASS
  - WF-16 — Audio / TTS / Subtitle / BGM / SFX Timeline Assembly: PASS

## Architecture

- Framework: control/orchestration plane
- AI VIDEO PRODUCTION SYSTEM v2.0.0: decision plane
- Media providers: execution plane
- Editor Binding + Remotion: editorial plane

## Current production graph

```
Approved Script
↓
Chapter / Sequence / Scene
↓
Channel Visual Bible + Project Style
↓
Identity Anchors
↓
Approved Scene Assets
↓
Pre-Link
↓
Actual Asset Handoff QC
↓
HANDOFF_PASS
↓
Final Clip Design
↓
Provider Pre-QC
↓
Video Provider Job
↓
Candidate Video
↓
Clip QC / Fallback
↓
PASS / TRIM_PASS / Editorial or Regeneration Recovery
↓
Approved Clip Media / Editorial-ready Clip
↓
Final Media Binding
↓
media_binding.json
↓
Editor / Timeline Assembly
↓
Generic Editor edit_project.json
↓
Executable EDITORIAL_MOVE / REUSE_REFRAME motion
↓
Shared Preview / Final ProjectRenderer
↓
Approved Editor Content Plan
↓
A1 TTS / A2 Clip Audio / A3 BGM / A4 SFX
↓
T1 Subtitles / T2 Text / G1 Graphics
↓
Remotion-ready full editor timeline
```

## Final implementation policy

Provider execution is required for:

```
DIRECT_START_END_I2V
SINGLE_IMAGE_I2V
```

Provider execution is bypassed for:

```
EDITORIAL_MOVE
STATIC_HOLD
REUSE_REFRAME
CUT
```

Generated Provider media remains a Candidate until WF-12 QC and approval. TRIM_PASS preserves the approved usable range instead of discarding an otherwise usable clip.

WF-13 binds only current approved implementations. Provider video bindings require the durable selected-media approval and PASS/TRIM_PASS QC; editorial modes bind the approved START image; CUT is emitted as a media-free editor instruction. The editor handoff is exported as a `media_binding.json`-shaped manifest and becomes READY only when every current implementation is bound.

WF-14 converts that handoff into the existing Generic Editor schemaVersion 1 visual timeline and produces an `edit_project.json`-compatible project. VIDEO trim windows are converted to source frames, STATIC_HOLD becomes IMAGE, and CUT remains a zero-duration boundary.

WF-15 resolves the previous motion-renderer bottleneck. EDITORIAL_MOVE / REUSE_REFRAME are compiled once into deterministic IMAGE `motion.from / motion.to / easing` transforms, and the actual Generic Editor executes them with Remotion frame interpolation in the shared ProjectRenderer used by both Preview and GenericFinalRender. Invalid motion data is blocked by the production gate.

WF-16 adds revisioned approved editor-content assembly. Existing AUDIO MediaArtifacts are bound as TTS/Clip Audio/BGM/SFX on A1-A4, subtitle cues retain TTS provenance on T1, text overlays use T2, and graphics use G1. The V1 visual duration remains authoritative; audio/text/graphics cannot silently extend the composition. Only BGM may loop beyond its source window.

## Validation

The repository is validated by GitHub Actions using Node.js 22 and 24:

```bash
npm install
npm run build
npm run typecheck
npm test
```

Runtime project media is stored outside this Git repository.
