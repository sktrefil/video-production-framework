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
  - WF-17 — Final Render / Technical QC / Delivery Manifest: PASS
  - WF-18 — Final Output QC / Packaging / Publish Handoff: PASS
- ElevenLabs v3 TTS Provider Integration: PASS
- PHASE A — Unified Framework Final Design: COMPLETE
  - Target: single integrated repository
  - Migration method: PORT / ADAPT / NEW_BUILD / LEGACY
- PHASE B — Unified Framework Migration Work Orders: COMPLETE
  - MIG-01 ... MIG-13 detailed work orders
  - Execution policy / master checklist / 10-expert review
- PHASE C — Unified Framework Migration Execution
  - MIG-01 Repository Integration Foundation: PASS
  - Next: MIG-02 Runtime Contracts + Provider Orchestrator

## Architecture

- Framework: control/orchestration plane
- AI VIDEO PRODUCTION SYSTEM v2.0.0: decision plane
- Media providers: execution plane
- Editor Binding + Remotion: editorial plane

## Current production graph

```
Approved Script
├─ ElevenLabs v3 TTS /with-timestamps
│  ├─ 03_tts/narration.mp3
│  └─ character_alignment.json
│
└─ Chapter / Sequence / Scene
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
Generated Eleven v3 AUDIO MediaArtifact
↓
A1 TTS / A2 Clip Audio / A3 BGM / A4 SFX
↓
T1 Subtitles / T2 Text / G1 Graphics
↓
Remotion-ready full editor timeline
↓
Production Gate
↓
GenericFinalRender
↓
final.mp4
↓
Technical QC
↓
delivery_manifest.json
↓
DELIVERY_READY
↓
Final Output QC
↓
PASS / NEEDS_REVIEW / FIX_REQUIRED / BLOCKED
↓
Publish Package
↓
publish_handoff.json
↓
PUBLISH_HANDOFF_READY
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

The ElevenLabs v3 TTS Provider Integration reuses the prior production TTS standard: only a human-approved FINAL script is eligible; History/Mystery LONGFORM is split at 4,000 characters; each request uses the /with-timestamps endpoint; narration, character alignment, request IDs and hashes are retained; and the completed narration is registered as an AUDIO MediaArtifact for WF-16. HISTORY_MYSTERY_SHORTS and HISTORY_MYSTERY_LONGFORM now default to model_id eleven_v3 while preserving the legacy voice presets. Unsupported legacy v3 controls are not sent to the provider.

WF-16 adds revisioned approved editor-content assembly. Existing AUDIO MediaArtifacts are bound as TTS/Clip Audio/BGM/SFX on A1-A4, subtitle cues retain TTS provenance on T1, text overlays use T2, and graphics use G1. The V1 visual duration remains authoritative; audio/text/graphics cannot silently extend the composition. Only BGM may loop beyond its source window.

WF-17 pins the READY editor timeline by assembly revision and project SHA, tracks render attempts/retries, and accepts a final render only after Technical QC. The actual Generic Editor probes the local MP4 with the bundled @remotion/media-parser, verifies container/video/audio codec, dimensions, fps, duration and audio-stream expectations, and validates the controlled H264/AAC/yuv420p render profile. Only a Technical-QC PASS produces a current delivery manifest with status READY; editor changes stale any previous render/delivery.

WF-18 requires that current WF-17 delivery, pins Final Output QC to its exact output SHA, supports explicit human review approval, normalizes YouTube publish metadata, and creates a revisioned publish-package handoff. The actual editor runtime re-hashes the final MP4, physically copies the approved video/manifests/metadata/optional thumbnail into `out/<project_id>/publish`, hashes the package artifacts, and writes `publish_handoff.json`. Rerender or renewed Final Output QC makes the previous package stale. WF-18 stops before actual platform upload.

## Validation

The repository is validated by GitHub Actions using Node.js 22 and 24:

```bash
npm install
npm run build
npm run typecheck
npm test
```

Runtime project media is stored outside this Git repository.
