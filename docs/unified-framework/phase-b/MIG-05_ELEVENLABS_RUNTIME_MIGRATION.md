# MIG-05 — ElevenLabs Runtime Migration

Status: **WORK ORDER / NOT YET EXECUTED**

## WORK ITEM

`MIG-05`

## GOAL

Move the proven ElevenLabs v3 execution capability into the unified Framework as
an execution runtime behind MIG-02 contracts.

## WHY

The existing TTS implementation already performs valuable provider work, but it
currently lives inside the old Python production application. Reuse the proven
provider execution without importing the old control plane.

## SOURCE

Repository:
```
sktrefil/video-production
```

Primary source candidates:
- `src/lived_sentences/tts.py`
- TTS-only helper logic from `src/lived_sentences/cli.py`
- `config/voice_presets.json`
- TTS-related tests under `tests/`

Canonical target orchestration:
- `packages/tts-generation/**`

## TARGET

```
runtimes/elevenlabs/
packages/provider-orchestrator/
packages/tts-generation/
```

## CLASSIFICATION

```
ADAPT
```

## DEPENDENCIES

- MIG-01 ... MIG-04 PASS.
- RuntimeJob/RuntimeResult contract available.
- project bootstrap can create both formats.

## FILES TO READ FIRST

Target:
- `packages/tts-generation/src/index.ts`
- `packages/storage/src/tts-generation.ts`
- `packages/domain/src/index.ts`

Source:
- `src/lived_sentences/tts.py`
- relevant TTS sections in `src/lived_sentences/cli.py`
- `config/voice_presets.json`
- TTS test files.

## IN SCOPE

Reuse the current verified behavior:
- ElevenLabs `/with-timestamps` endpoint,
- `model_id = eleven_v3` for History/Mystery presets,
- approved FINAL script gate remains upstream,
- LONGFORM split ceiling of 4,000 characters as project operational policy,
- chunk request execution,
- chunk MP3 combination,
- character alignment aggregation,
- request ID retention,
- input/output hashes,
- metadata,
- voice preset resolution,
- API key from environment,
- voice ID redaction in durable metadata,
- provider-native cadence policy.

### Runtime interface

Input:
```
RuntimeJob<TTS_GENERATION>
+ Framework TtsGenerationPlan
```

Output:
```
03_tts/narration.mp3
03_tts/character_alignment.json
03_tts/tts_metadata.json
03_tts/resolved_voice_profile.json
03_tts/chunks/... when chunked
RuntimeResult
```

The Framework artifact ingestor creates the AUDIO MediaArtifact.

### Language boundary

The old implementation may remain Python in v1.

Do not rewrite it into TypeScript solely for language uniformity.

Use a deterministic process/JSON bridge:
- stdin/file RuntimeJob in,
- RuntimeResult out,
- stable exit codes,
- UTF-8,
- no parsing of human-oriented console prose.

## OUT OF SCOPE

- old `main.py`,
- old monolithic CLI,
- old project_state.json workflow,
- subtitle orchestration,
- image/visual logic,
- changing voice creatively inside runtime.

## PORT ITEMS

Reusable pure helpers may be moved nearly unchanged:
- text sanitation where provider-specific,
- chunk splitting,
- MP3 combining,
- alignment aggregation,
- checksum/metadata helper if runtime-local.

## ADAPT ITEMS

- endpoint invocation,
- voice profile resolution,
- file locations,
- execution metadata,
- errors,
- retries,
- provider request IDs,
- Windows file handling.

All must use unified workspace and RuntimeJob.

## NEW BUILD ITEMS

- Python runtime entrypoint that reads RuntimeJob.
- RuntimeJob → provider request mapper.
- RuntimeResult serializer.
- unified workspace output writer.
- provider error → stable runtime error mapper.
- process bridge tests from TypeScript orchestrator.
- provider profile resolver integration.

## LEGACY / DO NOT PORT

- topic/script project creation,
- old approval UI/control flow,
- old CLI parser,
- old history-specific stage state,
- any code that changes Framework approval state directly.

## CONTRACTS THAT MUST NOT CHANGE

- TTS cannot execute without an approved current FINAL script/plan.
- successful execution creates candidate/available AUDIO media, not editorial
  placement by itself.
- WF-16 remains placement authority.
- secrets never persist.
- explicit non-empty provider model override policy must be deliberate and
  validated; History default must resolve to v3.

## IMPLEMENTATION STEPS

1. Freeze source files/behavior with migration tests.
2. Extract provider-specific pure functions.
3. Create runtime Python entrypoint.
4. Map RuntimeJob to current request behavior.
5. Resolve `ELEVENLABS_API_KEY` at runtime only.
6. Write outputs under unified project `03_tts/`.
7. Emit RuntimeResult with request IDs/hashes.
8. Use MIG-02 artifact ingestion to register AUDIO media.
9. Connect generated MediaArtifact to existing TTS generation result contract.
10. Add process-level mocked HTTP tests.
11. Add LONGFORM multi-chunk fixture.
12. Verify WF-16 consumes resulting A1 media.
13. Run full framework regression.

## TESTS

Required no-credit tests:
- endpoint path,
- `model_id=eleven_v3`,
- response `audio_base64` decode,
- alignment lengths/order/text identity,
- one-chunk SHORTFORM,
- 2+ chunk LONGFORM,
- MP3 combination,
- request ID retention,
- API key absent from result/job export,
- voice ID redacted in durable metadata,
- process failure mapped to stable error,
- retry attempt preserved,
- output checksum verified,
- WF-16 A1 integration.

Optional local smoke after CI:
- one short real request only after explicit operator decision.

## ACCEPTANCE CRITERIA

- old repo not required at execution: PASS.
- Python runtime invoked from unified repo: PASS.
- v3 mock contract: PASS.
- LONGFORM chunking: PASS.
- alignment integrity: PASS.
- AUDIO MediaArtifact: PASS.
- WF-16 A1 route: PASS.
- secrets absent: PASS.
- old CLI dependency: ZERO.
- full regression: PASS.

## ROLLBACK

Revert runtime adapter and provider registry entry to MIG-04 accepted HEAD. Keep
old source repository intact.

## BRANCH

```
migration/mig-05-elevenlabs-runtime
```

## NEXT

```
MIG-06 — New Image Runtime
```
