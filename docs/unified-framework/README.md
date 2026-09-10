# Unified Video Production Framework — Design Set

Status: **PHASE A FINAL DESIGN / DESIGN FREEZE CANDIDATE**

This directory defines the target architecture for consolidating the current
`video-production-framework` control plane and the reusable execution/editor
assets currently living in `video-production`.

## Documents

1. `PHASE_A_FINAL_ARCHITECTURE_V1.md`
   - final target architecture
   - repository layout
   - dependency direction
   - source-of-truth rules
   - legacy isolation
   - project workspace model

2. `PHASE_A_RUNTIME_RESOURCE_CONTRACTS_V1.md`
   - unified Provider Job / Runtime Result contract
   - manual external provider contract
   - resource snapshot and version pinning
   - editor materialization and render handoff

3. `PHASE_A_ASSET_CLASSIFICATION_V1.md`
   - existing `video-production` assets classified as PORT / ADAPT / NEW_BUILD /
     LEGACY / DELETE_LATER

4. `PHASE_A_MIGRATION_DEPENDENCY_MAP_V1.md`
   - migration order
   - dependency graph
   - per-step gates
   - rollback policy
   - definition of done

5. `PHASE_A_DECISION_LOG_V1.md`
   - frozen architecture decisions and rejected alternatives

6. `PHASE_A_10_EXPERT_REVIEW_V1.md`
   - 10-domain architecture review
   - implementation risks carried into Phase B
   - PASS / conditions

## Core rule

For every new unified-framework project:

```
Framework decides.
Runtime executes.
Provider generates.
Framework ingests and QC's.
Editor renders.
project.db remains the structured source of truth.
```

The old `video-production` repository remains a migration source and legacy
reference until the single-repository E2E and first real project both pass.
It is not the production source of truth for a new unified project.
