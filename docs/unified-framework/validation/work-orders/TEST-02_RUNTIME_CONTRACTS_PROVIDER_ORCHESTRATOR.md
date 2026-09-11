# TEST-02 — Runtime Contracts + Provider Orchestrator

Owner: MIG-02

## Goal
Validate the shared runtime envelope and provider orchestration boundary end to end.

## Validate
- ProviderJob/RuntimeJob/RuntimeResult/MediaArtifact contracts match Phase A,
- executor/provider registration and dispatch are deterministic,
- status/error/result normalization is consistent,
- provider runtime cannot make creative approval/QC decisions,
- runtime execution persists through the approved storage boundary,
- malformed or incompatible jobs fail closed,
- orchestrator tests plus storage integration tests pass.

## Negative checks
Reject unknown provider/runtime, incompatible capability, malformed job payload, creative-intent mutation, and QC bypass.

## Repair rule
Contract-preserving implementation defects may be repaired automatically. A contract schema change outside accepted Phase A is `NEEDS_REVIEW`.

## PASS criteria
Shared runtime/orchestration behavior is provider-neutral, persistence-safe, and regression-green.

## Next
PASS -> TEST-03.