# ElevenLabs Runtime

MIG-05 adapts the proven ElevenLabs execution path into the unified VPF runtime contract.

- Input: one UTF-8 `RuntimeJob` JSON object on stdin (or `--job <file>`).
- Output: one UTF-8 `RuntimeResult` JSON object on stdout.
- Provider: `ELEVENLABS` / `TTS_GENERATION` / `AUTOMATED`.
- Canonical profile: `ELEVENLABS_V3_HISTORY_V1@1.0.0`, exact version+content-hash pinned upstream.
- Endpoint: `/v1/text-to-speech/{voice_id}/with-timestamps` with `model_id=eleven_v3`.
- Secrets: `ELEVENLABS_API_KEY` and resolved voice IDs exist only in the execution environment. They are never accepted in the durable RuntimeJob input or written to metadata.
- Outputs: `03_tts/narration.mp3`, `character_alignment.json`, `tts_metadata.json`, `resolved_voice_profile.json`, plus `03_tts/chunks/*` when chunked.
- LONGFORM chunks retain the 4,000-character hard ceiling. Multiple MP3 chunks are combined through ffmpeg.
- Provider `request-id` values, output sizes and SHA-256 hashes are retained in RuntimeResult.
- A successful runtime only yields Framework-ingested `AVAILABLE` media. It does not approve editorial placement; WF-16 remains the TTS/A1 placement authority.

Testing uses a local mocked HTTP provider and an injected deterministic ffmpeg command, so CI does not call ElevenLabs or require credentials.
