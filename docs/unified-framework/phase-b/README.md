# PHASE B — Unified Framework Migration Work Orders

Status: **FINAL WORK-ORDER SET / READY FOR EXECUTION**

Base design:
- `docs/unified-framework/PHASE_A_FINAL_ARCHITECTURE_V1.md`
- `docs/unified-framework/PHASE_A_RUNTIME_RESOURCE_CONTRACTS_V1.md`
- `docs/unified-framework/PHASE_A_ASSET_CLASSIFICATION_V1.md`
- `docs/unified-framework/PHASE_A_MIGRATION_DEPENDENCY_MAP_V1.md`
- `docs/unified-framework/PHASE_A_DECISION_LOG_V1.md`
- `docs/unified-framework/PHASE_A_10_EXPERT_REVIEW_V1.md`

## Purpose

PHASE B does **not** perform the migration itself.

It converts the approved Phase A architecture into executable, reviewable,
gated work instructions for Codex/engineers.

Every work order explicitly states:
- what to PORT,
- what to ADAPT,
- what to NEW BUILD,
- what to keep LEGACY,
- what must not change,
- tests and acceptance criteria,
- rollback and completion report.

## Mandatory execution order

```
MIG-01 Repository Integration Foundation
  ↓
MIG-02 Runtime Contracts + Provider Orchestrator
  ↓
MIG-03 Resource Registry + Canonical Resources
  ↓
MIG-04 Project Bootstrap + Unified CLI Foundation
  ↓
MIG-05 ElevenLabs Runtime Migration
  ↓
MIG-06 New Image Runtime
  ↓
MIG-08 Generic Editor Port
  ↓
MIG-09 Editor Materialization + Render Runtime
  ↓
MIG-10 Audio / Subtitle Runtime Integration Gaps
  ↓
MIG-11 Legacy Isolation Hardening
  ↓
MIG-12 Single-Repository Fixture E2E
  ↓
MIG-13 Real Project Pilot Readiness
```

MIG-07 Google Flow Manual Runtime is retained as a DEFERRED work order outside
the active sequence. Reactivate it when automated or semi-automated Google Flow
management becomes necessary. MIG-08 depends on MIG-06 PASS.

Development may overlap only when dependencies are already satisfied. Acceptance
must still follow the order above.

## Work order files

- `MIG-01_REPOSITORY_INTEGRATION_FOUNDATION.md`
- `MIG-02_RUNTIME_CONTRACTS_PROVIDER_ORCHESTRATOR.md`
- `MIG-03_RESOURCE_REGISTRY_CANONICAL_RESOURCES.md`
- `MIG-04_PROJECT_BOOTSTRAP_UNIFIED_CLI.md`
- `MIG-05_ELEVENLABS_RUNTIME_MIGRATION.md`
- `MIG-06_NEW_IMAGE_RUNTIME.md`
- `MIG-07_GOOGLE_FLOW_MANUAL_RUNTIME.md`
- `MIG-08_GENERIC_EDITOR_PORT.md`
- `MIG-09_EDITOR_MATERIALIZATION_RENDER_RUNTIME.md`
- `MIG-10_AUDIO_SUBTITLE_RUNTIME_GAPS.md`
- `MIG-11_LEGACY_ISOLATION_HARDENING.md`
- `MIG-12_SINGLE_REPOSITORY_E2E.md`
- `MIG-13_REAL_PROJECT_PILOT_READINESS.md`
- `PHASE_B_EXECUTION_POLICY_V1.md`
- `PHASE_B_MASTER_CHECKLIST_V1.md`
- `PHASE_B_10_EXPERT_WORK_ORDER_REVIEW_V1.md`

## Program-level Definition of Done

PHASE B is complete when all work orders exist, are internally consistent with
Phase A, and can be handed to an implementation agent without requiring it to
invent architecture.

Migration execution starts only in the next phase.
