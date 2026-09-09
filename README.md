# video-production-framework

AI-assisted video production orchestration framework.

## Status

- PHASE 1 — FOUNDATION: FINAL / VALIDATED / FOUNDATION_LOCK
- PHASE 2 — PRODUCTION CORE
  - WF-07 — Research / Script / Story Pipeline: PASS
  - WF-08 — Visual Identity Pipeline: PASS
  - WF-09 — Scene Asset Pipeline: PASS
  - WF-10 — Pre-Link / Handoff Pipeline: PASS
  - WF-11 — Final Clip / Provider Job Pipeline: NEXT

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
Final Clip / Provider Job (WF-11)
```

## Link model

```
SCENE_A.STATE_OUT
↓
LINK
↓
SCENE_B.STATE_IN
```

Actual Handoff QC uses the canonical Production System contract:

```
task = QC
target = LINK
qcType = HANDOFF_QC
```

## Validation

The repository is validated by GitHub Actions using Node.js 22:

```bash
npm install
npm run build
npm run typecheck
npm test
```

Runtime project media is stored outside this Git repository.
