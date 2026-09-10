# MIG-02 — Runtime Contracts + Provider Orchestrator

Status: **WORK ORDER / NOT YET EXECUTED**

## WORK ITEM

`MIG-02`

## GOAL

Create the provider-neutral execution contract that every migrated or new runtime
must use.

## WHY

Without one execution envelope, ElevenLabs, image generation, Flow and future
providers will reintroduce custom state machines. This step prevents that before
any runtime is migrated.

## SOURCE

Canonical Framework domain:
- `packages/domain/src/index.ts`
- `packages/workflow/src/index.ts`
- `packages/storage/**`
- `packages/tts-generation/**`
- `packages/scene-assets/**`
- `packages/final-clip/**`

## TARGET

New:
```
packages/runtime-contracts/
packages/provider-orchestrator/
packages/storage/       # only required persistence additions
migrations/             # only if new durable tables are required
```

## CLASSIFICATION

```
NEW_BUILD
```

## DEPENDENCIES

- MIG-01 PASS.

## FILES TO READ FIRST

- `packages/domain/src/index.ts`
- `packages/scene-assets/src/index.ts`
- `packages/final-clip/src/index.ts`
- `packages/tts-generation/src/index.ts`
- `packages/storage/src/tts-generation.ts`
- `docs/unified-framework/PHASE_A_RUNTIME_RESOURCE_CONTRACTS_V1.md`

## IN SCOPE

1. RuntimeJob contract.
2. RuntimeResult contract.
3. RuntimeOutputArtifact.
4. Runtime executor interface.
5. Executor registry interface.
6. ProviderJob → RuntimeJob materializer.
7. RuntimeResult → candidate MediaArtifact ingestor.
8. Stable runtime error taxonomy.
9. Input hashing and idempotency.
10. Retry/attempt contract.
11. Secret-reference boundary.
12. Manual-external compatibility.

## OUT OF SCOPE

- actual ElevenLabs network call,
- actual image provider,
- actual Flow execution,
- editor runtime,
- visual creative logic.

## PORT ITEMS

None.

## ADAPT ITEMS

Reuse existing Domain identifiers/statuses where possible:
- ProviderJob,
- ProviderExecutionMode,
- ProviderJobStatus,
- MediaArtifact,
- MediaStatus.

Do not duplicate these enums with subtly different values.

## NEW BUILD ITEMS

### RuntimeJob

Implement schemaVersion 1 with:
- job ID/project ID,
- target type/id/revision,
- job type,
- provider/profile version,
- execution mode,
- attempt,
- input hash,
- typed/validated input payload,
- expected outputs.

### RuntimeResult

Implement:
- job/project/attempt identity,
- COMPLETE/FAILED/BLOCKED,
- provider request IDs,
- output artifact facts,
- timestamps,
- stable error object.

### Artifact ingestor

Requirements:
- project/job identity match,
- current target revision match,
- output file inside workspace,
- checksum verification,
- MIME/media-type compatibility,
- create MediaArtifact as AVAILABLE candidate,
- write sourceJobId,
- do not create approval.

### State mapping

Expected basic state flow:

```
ProviderJob READY/WAITING_EXTERNAL
→ RUNNING or external wait
→ RuntimeResult
→ ProviderJob COMPLETE/FAILED/BLOCKED
→ candidate MediaArtifact(s)
→ downstream QC
```

### Secret rule

RuntimeJob may include:
- logical secret names/requirements.

RuntimeJob must not include:
- API-key values,
- cookie values,
- browser tokens.

## LEGACY / DO NOT PORT

Do not reuse:
- old CLI state files as execution truth,
- provider-specific status strings as workflow states,
- direct provider result → approved media shortcuts.

## CONTRACTS THAT MUST NOT CHANGE

- Asset/Clip approval remains separate from ProviderJob.
- MediaArtifact remains a separate entity.
- Retry does not overwrite previous attempt history.
- Manual external execution remains a supported ProviderExecutionMode.
- Stable domain revisions remain authoritative.

## IMPLEMENTATION STEPS

1. Define package APIs and validation.
2. Add input canonicalization + SHA-256 utility.
3. Implement ProviderJob-to-RuntimeJob mapping.
4. Implement executor registry interface with fake executors.
5. Implement result validation.
6. Implement candidate artifact ingestion.
7. Add persistence only if the current ProviderJob records cannot safely retain
   required execution receipts; prefer existing tables when sufficient.
8. Add workflow events/outbox for durable state transitions.
9. Add mock image/video/TTS executors.
10. Run cross-WF regression.

## TESTS

Must prove:
- IMAGE, VIDEO and TTS use the same envelope.
- Runtime cannot mark approval.
- inputHash is deterministic.
- target revision drift blocks ingestion.
- path escape blocks ingestion.
- checksum mismatch blocks ingestion.
- COMPLETE with invalid artifact becomes blocked/failure.
- retry increments attempt and references prior attempt.
- secrets are rejected/redacted from durable input.
- MANUAL_EXTERNAL job can be materialized without RUNNING network execution.

## ACCEPTANCE CRITERIA

- Shared runtime contract: PASS.
- Three fixture job types: PASS.
- Artifact ingestion candidate-only: PASS.
- Idempotency/retry: PASS.
- Secret boundary: PASS.
- Durable events/persistence: PASS.
- Full existing regression: PASS.

## ROLLBACK

Remove new runtime packages/migration introduced only by MIG-02 and return to
MIG-01 accepted HEAD. Existing ProviderJob data model must remain valid.

## BRANCH

```
migration/mig-02-runtime-contracts
```

## NEXT

```
MIG-03 — Resource Registry + Canonical Resources
```
