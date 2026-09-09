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
Editor / Remotion Handoff READY
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

## Validation

The repository is validated by GitHub Actions using Node.js 22 and 24:

```bash
npm install
npm run build
npm run typecheck
npm test
```

Runtime project media is stored outside this Git repository.
