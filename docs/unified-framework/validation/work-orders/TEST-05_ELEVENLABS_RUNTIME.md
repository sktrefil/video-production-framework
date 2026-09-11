# TEST-05 — ElevenLabs Runtime

Owner: MIG-05

## Goal
Validate the adapted ElevenLabs v3 runtime behind the unified contracts, including ingestion, persistence, chunking behavior, and secret isolation.

## Validate
- provider profile resolution,
- RuntimeJob creation/dispatch/result handling,
- mocked provider success/error paths,
- no API secret persisted in Git/DB/exported payloads,
- media artifact and TTS/alignment ingestion are correct,
- multi-chunk path works when script exceeds chunk ceiling,
- WF-16/approved placement boundary remains authoritative,
- relevant provider-orchestrator/storage/tts-generation tests pass.

## Real-provider note
CI may use mocks/fixtures. Real paid-provider evidence is collected in TEST-13.

## Repair rule
Implementation/regression defects may be repaired automatically. Secret policy or provider billing policy changes require review.

## PASS criteria
The TTS runtime is contract-compliant, ingestible, secret-safe, and regression-green.

## Next
PASS -> TEST-06.