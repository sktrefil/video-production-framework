# MIG-02 — Completion Report

Status: **PASS**

## WORK_ITEM

MIG-02 — Runtime Contracts + Provider Orchestrator

## BRANCH

migration/mig-02-runtime-contracts

## BASE_HEAD

f49c0806fdf57aaa85145cfbedd680dac40c8fa8

## VALIDATED_IMPLEMENTATION_HEAD

cee111d0d8faca0a92b7309529fa1208cf48c529

## CLASSIFICATION

NEW_BUILD

## PORT

None.

## ADAPT

- existing ProviderJob / MediaArtifact / ProviderExecutionMode / ProviderJobStatus
  domain contracts reused directly,
- existing workflow event/outbox mechanism reused,
- existing provider_jobs / media_artifacts tables reused,
- existing workspace path resolver reused.

## NEW_BUILD

- packages/runtime-contracts
- RuntimeJob schemaVersion 1
- RuntimeResult schemaVersion 1
- RuntimeOutputArtifact / RuntimeExpectedOutput
- RuntimeExecutor / resolver contract
- deterministic canonical JSON + SHA-256 input hash
- secret-input rejection and env-name-only secret requirements
- ProviderJob → RuntimeJob materializer
- READY → RUNNING → COMPLETE/FAILED/BLOCKED transition helpers
- retry lineage helper
- packages/provider-orchestrator
- RuntimeExecutorRegistry
- RuntimeOrchestrator
- target-revision freshness port
- actual output-file/hash/MIME verifier
- candidate MediaArtifact ingestor
- MANUAL_EXTERNAL prepare/import path
- stable runtime error mapping
- runtime execution receipts
- migrations/0013_runtime_execution.sql
- SqliteRuntimeExecutionRepository
- durable runtime receipt + workflow event/outbox persistence

## LEGACY_NOT_PORTED

No old provider runtime implementation was copied.

MIG-02 does not contain:
- ElevenLabs network execution,
- image provider execution,
- Google Flow browser/manual adapter,
- old manager-v2 CLI/state,
- old visual styles/planners,
- Generic Editor runtime.

Those remain owned by later migration work items.

## EXECUTION CONTRACT

Canonical path:

    ProviderJob
      ↓
    RuntimeJob
      ↓
    RuntimeExecutor
      ↓
    RuntimeResult
      ↓
    verified output artifact
      ↓
    MediaArtifact AVAILABLE candidate
      ↓
    downstream QC / approval

Runtime completion never creates approval.

## PROVIDER JOB STATE

AUTOMATED:

    READY
      ↓
    RUNNING
      ↓
    COMPLETE / FAILED / BLOCKED

MANUAL_EXTERNAL:

    WAITING_EXTERNAL
      ↓
    RuntimeJob PREPARED
      ↓
    imported RuntimeResult
      ↓
    COMPLETE / FAILED / BLOCKED

## IDEMPOTENCY / TRACEABILITY

Runtime execution is pinned by:
- provider job ID,
- provider job revision,
- attempt,
- target ID/revision,
- provider/profile version,
- canonical input SHA-256.

Durable runtime receipts record:
- stage,
- input hash,
- RuntimeJob snapshot,
- RuntimeResult snapshot when available,
- provider request IDs,
- timestamps.

## SECURITY

Durable runtime input rejects secret-like fields such as:
- api key,
- authorization/bearer,
- access/refresh token,
- cookies,
- passwords,
- client secret,
- private key,
- session token/id.

Runtime secret requirements store environment variable names only.

## ARTIFACT INGESTION

Before MediaArtifact creation:
- target revision must still be current,
- path must resolve inside unified project workspace,
- output file must exist and be non-empty,
- actual byte size must match RuntimeResult,
- actual SHA-256 must match RuntimeResult,
- MIME must match expected MediaType/profile constraint.

Invalid COMPLETE output is converted to BLOCKED/FAILED execution state and does
not create candidate media.

## TESTS

Validated GitHub Actions:

    run: 34431420933
    head: cee111d0d8faca0a92b7309529fa1208cf48c529

Node 22:
- npm install: PASS
- build: PASS
- typecheck: PASS
- test: PASS

Node 24:
- npm install: PASS
- build: PASS
- typecheck: PASS
- test: PASS

Test groups:
- Runtime Contracts: 7 / 7 PASS
- Provider Orchestrator: 5 / 5 PASS
- Production System: 6 / 6 PASS
- Story: 5 / 5 PASS
- Visual Identity: 5 / 5 PASS
- Scene Assets: 7 / 7 PASS
- Pre-Link/Handoff: 8 / 8 PASS
- Final Clip: 9 / 9 PASS
- QC/Fallback: 6 / 6 PASS
- Media Binding: 6 / 6 PASS
- Editor Timeline: 13 / 13 PASS
- Final Render: 7 / 7 PASS
- Final Output: 6 / 6 PASS
- TTS Generation: 7 / 7 PASS
- Storage: 8 / 8 PASS
- Workspace: 6 / 6 PASS

TOTAL:
- 111 / 111 PASS

Repository boundary:
- no hardcoded legacy operational repository path: PASS

## ACCEPTANCE

- Shared RuntimeJob/RuntimeResult contract: PASS
- IMAGE/VIDEO/TTS fixture envelopes: PASS
- Artifact ingestion candidate-only: PASS
- Deterministic input hash: PASS
- Target revision drift blocking: PASS
- Path/hash/MIME validation: PASS
- Invalid COMPLETE result blocking: PASS
- Retry lineage/attempt contract: PASS
- Secret boundary: PASS
- MANUAL_EXTERNAL without RUNNING network execution: PASS
- Durable SQLite receipt/event/outbox persistence: PASS
- SQLite orchestrator integration: PASS
- Existing WF regression: PASS

## KNOWN_ISSUES

None blocking MIG-03.

Target-specific candidate-list updates remain owned by the existing WF
pipelines/adapters. MIG-05/MIG-06/MIG-07 will connect their concrete runtime
results to those target-specific workflows behind this contract.

## ROLLBACK_POINT

f49c0806fdf57aaa85145cfbedd680dac40c8fa8

## NEXT_WORK_ITEM

MIG-03 — Resource Registry + Canonical Resources

## RESULT

PASS
