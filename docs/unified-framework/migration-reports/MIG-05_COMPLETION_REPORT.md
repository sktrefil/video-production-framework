# MIG-05 — Completion Report

Status: **PASS**

## WORK_ITEM

MIG-05 — ElevenLabs Runtime Migration

## BRANCH

migration/mig-05-elevenlabs-runtime

## BASE_HEAD

cfa493168ab57aac98b548d188698e2c41ba0077

## FINAL_IMPLEMENTATION_HEAD

0ce226eaf457395ef3fc8c27f62f54c36454909c

## VALIDATED_IMPLEMENTATION_CI_RUN

34441999063

## CLASSIFICATION

ADAPT

## SOURCE_REVIEW

The migration reviewed the proven ElevenLabs behavior from the migration-source repository, especially:

- `src/lived_sentences/tts.py`,
- the TTS-related control flow in `src/lived_sentences/cli.py`,
- `config/voice_presets.json`.

Only reusable provider-execution behavior was adapted. The old monolithic CLI, project-state orchestration, image flow, subtitle orchestration, and approval mutation were not ported.

## IMPLEMENTED

### Unified Python runtime

Added:

```text
runtimes/elevenlabs/runtime.py
runtimes/elevenlabs/README.md
```

The runtime executes behind the MIG-02 `RuntimeJob` / `RuntimeResult` contract and is no longer an operational dependency on the old repository.

It supports:

- ElevenLabs `/with-timestamps`,
- `model_id = eleven_v3`,
- `mp3_44100_128`,
- LONGFORM 4,000-character maximum chunks,
- one-request SHORTFORM execution,
- multi-request LONGFORM execution,
- base64 audio decoding,
- character-alignment validation,
- multi-chunk alignment aggregation,
- MP3 concatenation through ffmpeg,
- provider request-id retention,
- SHA-256 output hashes,
- stable RuntimeResult failures.

### Provider Orchestrator process bridge

Added:

```text
packages/provider-orchestrator/src/elevenlabs-runtime.ts
```

The bridge:

- registers `ELEVENLABS + TTS_GENERATION` with the Runtime Executor Registry,
- sends one RuntimeJob JSON object through stdin,
- requires one RuntimeResult JSON object on stdout,
- uses the unified project workspace,
- injects runtime environment only at execution time,
- validates the returned RuntimeResult through MIG-02 contracts,
- applies process timeout and bounded stdout/stderr handling.

The first implementation CI found TypeScript nullability on child-process stdio despite `stdio: ["pipe", "pipe", "pipe"]`. MIG-05 was not accepted at that point. The bridge now validates and captures `stdin`, `stdout`, and `stderr` immediately after spawn before using the streams. The corrected implementation is the `FINAL_IMPLEMENTATION_HEAD` above.

### TTS runtime adapter

Added:

```text
packages/tts-generation/src/runtime-adapter.ts
```

The adapter connects the existing approved FINAL-script TTS plan to the shared runtime system:

```text
Human-approved FINAL Script
        ↓
TtsGenerationPlan
        ↓
exact ELEVENLABS_V3_HISTORY_V1 version + hash pin
        ↓
ProviderJob
        ↓
MIG-02 RuntimeOrchestrator
        ↓
ElevenLabsProcessRuntimeExecutor
        ↓
Python ElevenLabs Runtime
        ↓
RuntimeResult
        ↓
MIG-02 Artifact Ingestor
        ↓
AUDIO MediaArtifact + supporting documents
        ↓
TtsGenerationResult
        ↓
WF-16 A1 TTS
```

The selected canonical Provider Profile remains:

```text
ELEVENLABS_V3_HISTORY_V1@1.0.0
```

The adapter resolves the exact pinned version and SHA-256 content hash. There is no automatic Provider Profile upgrade.

### Storage/runtime bridge

Added:

```text
packages/storage/src/tts-runtime.ts
```

`SqliteTtsRuntimeRepository` connects current TTS plan revisions to `RuntimeTargetRevisionPort` and persists the TTS ProviderJob in the existing `provider_jobs` table.

No new SQL migration was required for MIG-05 because the existing provider-job schema already supports `target_type = AUDIO` without a conflicting CHECK constraint.

## SINGLE CANONICAL AUDIO IDENTITY

A scope audit found an important integration risk before acceptance:

```text
MIG-02 Artifact Ingestor
→ creates AUDIO MediaArtifact

old TTS complete() behavior
→ would also create AUDIO MediaArtifact
```

That would produce two media identities for one generated narration.

MIG-05 resolves this by making the integrated completion path adopt the already ingested narration MediaArtifact. The TTS result stores that same media ID rather than inserting a second AUDIO row.

Therefore:

```text
one provider narration
→ one canonical AUDIO MediaArtifact
→ one TtsGenerationResult reference
→ one WF-16 A1 source
```

## PROVIDER OUTPUTS

The unified runtime materializes the required artifacts under the project workspace:

```text
03_tts/narration.mp3
03_tts/character_alignment.json
03_tts/tts_metadata.json
03_tts/resolved_voice_profile.json
03_tts/chunks/...        # when chunked
```

The shared artifact-ingestion path verifies output existence, relative paths, expected media/MIME contracts, and SHA-256 before creating MediaArtifacts.

## ALIGNMENT CONTRACT

Each `/with-timestamps` response must satisfy:

- characters array exists,
- start-times array exists,
- end-times array exists,
- all three arrays have equal length,
- timestamps are finite and ordered,
- joined characters exactly equal the requested chunk text.

For LONGFORM, chunk alignments are offset and aggregated in source order. The final aggregated alignment is checked again against the exact joined TTS text so subtitle timing cannot silently drift away from narration text.

## VOICE / CADENCE POLICY

MIG-05 preserves the already approved History/Mystery TTS policy:

- LONGFORM uses `HISTORY_MYSTERY_LONGFORM`,
- SHORTFORM uses `HISTORY_MYSTERY_SHORTS`,
- both use `eleven_v3`,
- provider-native v3 cadence is preserved,
- unsupported legacy controls are not sent to v3.

Runtime execution may resolve a real voice ID from an environment variable, but durable metadata records only:

```text
voiceId = REDACTED
```

and the logical environment-variable source. The actual voice ID is not stored in RuntimeJob input, RuntimeResult, receipts, or TTS metadata.

## SECRET BOUNDARY

The only required Provider Profile runtime secret is:

```text
ELEVENLABS_API_KEY
```

The API key is read from the runtime environment at the execution boundary. It is never placed in:

- ProviderJob input payload,
- RuntimeJob input,
- RuntimeResult,
- runtime receipts,
- output metadata,
- resolved voice profile,
- project.db durable payloads.

Process-level tests prove the provider mock receives the header while durable framework artifacts do not contain the secret value.

## WF-16 INTEGRATION

MIG-05 does not place narration on the editor timeline itself.

WF-16 remains the sole placement authority.

The runtime-generated narration MediaArtifact is consumed through the existing Editor Content Plan and compiles to:

```text
track: A1
type: TTS
src: 03_tts/narration.mp3
```

This preserves the architecture rule:

```text
Runtime generates.
Framework ingests.
WF-16 places.
```

## LEGACY_NOT_PORTED

MIG-05 does not port or depend on:

- old `main.py`,
- old public TTS CLI,
- old `project_state.json`,
- old source-repository project-directory conventions,
- old subtitle orchestration,
- old image generation logic,
- old approval mutation,
- provider-driven creative voice-policy changes.

The migration-source repository is review input only and is not needed at runtime.

## TESTS ADDED

### Provider Orchestrator

Process-level local provider mocks verify:

- `eleven_v3`,
- `/with-timestamps`,
- base64 decoding,
- one-request SHORTFORM,
- 2+ request LONGFORM,
- multi-chunk MP3 combine path,
- character alignment identity/order,
- request IDs,
- attempt preservation,
- output hashes,
- no API key leakage,
- no actual voice-ID leakage,
- stable provider failure mapping.

### TTS Generation

Integration tests verify:

- exact Provider Profile version/hash resolution,
- secret-free AUTOMATED ProviderJob persistence,
- reuse of the Framework-ingested narration AUDIO identity,
- WF-16 A1 consumption.

### Storage

SQLite tests verify:

- AUDIO-target ProviderJob persistence,
- current TTS target-revision resolution,
- adoption of an already ingested narration MediaArtifact without duplicate insert.

## VALIDATION

Validated GitHub Actions:

```text
run: 34441999063
head: 0ce226eaf457395ef3fc8c27f62f54c36454909c
```

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
- Provider Orchestrator: 8 / 8 PASS
- Resource Registry: 7 / 7 PASS
- Project Bootstrap: 9 / 9 PASS
- Unified CLI: 4 / 4 PASS
- Production System: 6 / 6 PASS
- Story: 5 / 5 PASS
- Visual Identity: 6 / 6 PASS
- Scene Assets: 8 / 8 PASS
- Pre-Link/Handoff: 8 / 8 PASS
- Final Clip: 9 / 9 PASS
- QC/Fallback: 6 / 6 PASS
- Media Binding: 6 / 6 PASS
- Editor Timeline: 13 / 13 PASS
- Final Render: 7 / 7 PASS
- Final Output: 6 / 6 PASS
- TTS Generation: 10 / 10 PASS
- Storage: 10 / 10 PASS
- Workspace: 7 / 7 PASS

TOTAL:

- 142 / 142 PASS

Repository boundary:

- no hardcoded legacy operational repository path: PASS

## INITIAL_FAILED_CI_AND_FIX

Initial implementation CI:

```text
run: 34441592760
head: 42f184547e3ecc4d0f042a74010c393ed9fc3dd1
result: FAIL
```

Cause:

```text
TS18047: child.stdin/stdout/stderr is possibly null
```

This was fixed by explicitly validating the piped process streams before use.
The corrected implementation CI `34441999063` passes both Node 22 and Node 24 completely.

## ACCEPTANCE

- Python ElevenLabs runtime lives in the unified repository: PASS
- old repository required for execution: NO
- exact Provider Profile version/hash pin: PASS
- ElevenLabs v3 request contract: PASS
- `/with-timestamps`: PASS
- SHORTFORM one-chunk execution: PASS
- LONGFORM 4,000-character chunk ceiling: PASS
- multi-chunk request execution: PASS
- MP3 combination path: PASS
- alignment validation/aggregation: PASS
- request-id retention: PASS
- runtime attempt retention: PASS
- narration SHA-256 verification: PASS
- alignment/metadata artifacts: PASS
- API key environment-only boundary: PASS
- actual voice ID redacted from durable state: PASS
- stable provider error mapping: PASS
- one canonical AUDIO MediaArtifact: PASS
- TTS result references ingested AUDIO: PASS
- WF-16 A1 integration: PASS
- provider runtime does not approve content: PASS
- old CLI control flow ported: ZERO
- repository boundary regression: PASS
- full framework regression: PASS

## LIVE_PROVIDER_SMOKE

No paid/live ElevenLabs request was required for MIG-05 acceptance. Provider behavior is exercised with deterministic local HTTP/process mocks, including success, multi-chunk, and provider-failure paths.

A real credentialed smoke run remains an explicit operator action and is not silently performed by CI.

## ROLLBACK_POINT

cfa493168ab57aac98b548d188698e2c41ba0077

## NEXT_WORK_ITEM

MIG-06 — New Image Runtime

## RESULT

PASS
