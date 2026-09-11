# TEST-05 — ElevenLabs Runtime Result

RESULT: **PASS**

Validated source/CI baseline: `748e6233fd1152bf8f20eb0d9cfe4de4f7a891ce`, CI `34547120304` (Node 22/24, E2E, pilot-readiness all PASS).

## Evidence
- ElevenLabs is registered behind the shared provider/runtime contract and uses the canonical provider profile/secret-name boundary.
- Tests exercise the real process adapter against a deterministic local mock HTTP server using `/with-timestamps` and `eleven_v3`.
- LONGFORM multi-chunk generation executes multiple requests, concatenates narration, combines character alignment and preserves provider request IDs/attempt lineage.
- SHORTFORM uses the single-request path.
- Provider HTTP failure maps to stable FAILED RuntimeResult/ProviderJob state without media.
- API key and resolved voice ID values are not persisted in runtime jobs, metadata, voice profile output or receipts; resolved voice profile redacts the voice ID.
- Result audio/alignment/metadata become ingestible project artifacts, while downstream placement remains separate from provider execution.
- Old/arbitrary process entrypoints are rejected before spawn.

## Acceptance
Provider profile/runtime dispatch: PASS
Mock success/error paths: PASS
Secret isolation: PASS
Media/alignment ingestion: PASS
LONGFORM multi-chunk: PASS
SHORTFORM single path: PASS
Old runtime path rejection: PASS
Regression/CI: PASS

Real paid-provider evidence remains intentionally deferred to TEST-13.
No source repair was required.
