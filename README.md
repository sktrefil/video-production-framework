# video-production-framework

AI-assisted video production orchestration framework.

## Status

- PHASE 1 — FOUNDATION: FINAL / VALIDATED / FOUNDATION_LOCK
- PHASE 2 — PRODUCTION CORE
  - WF-07 — Research / Script / Story Pipeline: PASS
  - WF-08 — Visual Identity Pipeline: NEXT

## Architecture

- Framework: control/orchestration plane
- AI VIDEO PRODUCTION SYSTEM v2.0.0: decision plane
- Media providers: execution plane
- Editor Binding + Remotion: editorial plane

## Validation

The repository is validated by GitHub Actions using Node.js 22:

```bash
npm install
npm run build
npm run typecheck
npm test
```

Runtime project media is stored outside this Git repository.
