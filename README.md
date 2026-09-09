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

## Validation

The repository is validated by GitHub Actions using Node.js 22:

```bash
npm install
npm run build
npm run typecheck
npm test
```

Runtime project media is stored outside this Git repository.
