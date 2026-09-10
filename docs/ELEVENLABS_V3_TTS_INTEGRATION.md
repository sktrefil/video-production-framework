# ElevenLabs v3 TTS Provider Integration

Status: **PASS**

This integration fills the TTS provider gap between the approved script and WF-16 Audio / Subtitle Timeline Assembly. It does not introduce a new workflow number.

## Reused production standard

The implementation intentionally reuses the existing production behavior from the historical `video-production` TTS pipeline instead of defining a new TTS process.

Preserved behavior:

```
Human-approved FINAL script
        ↓
TTS text sanitation / pronunciation-ready script
        ↓
ElevenLabs /with-timestamps
        ↓
LONGFORM: split at <= 4,000 characters
        ↓
chunk_001.mp3 ...
        ↓
narration.mp3
+
character_alignment.json
+
tts_metadata.json
+
resolved_voice_profile.json
        ↓
AUDIO MediaArtifact
        ↓
WF-16 A1 TTS
```

The old production contract also remains the source for:

- API-key loading from environment/.env,
- voice preset selection,
- request-id recording,
- chunk metadata,
- script/audio/alignment hashes,
- redacted voice ID in metadata,
- one-request audio + character timestamps,
- post-generation TTS approval flow.

## Current ElevenLabs model

History/Mystery presets now default to:

```
model_id = eleven_v3
```

for both:

```
HISTORY_MYSTERY_SHORTS
HISTORY_MYSTERY_LONGFORM
```

Other existing presets remain unchanged.

An explicit non-empty `ELEVENLABS_MODEL_ID` environment setting is still treated as an intentional override. An empty override no longer falls back to the global v2 default; it falls back to the selected preset.

## Request endpoint

The runtime retains the existing endpoint:

```
POST /v1/text-to-speech/{voice_id}/with-timestamps
```

with:

```
output_format = mp3_44100_128
model_id      = eleven_v3
```

Audio and character alignment are obtained from the same provider response so subtitle timing cannot drift from a separately generated audio request.

## Voice ID resolution

The historical runtime resolves voice identity in this order:

```
selected voice preset
        ↓
ELEVENLABS_VOICE_ID fallback
```

The Framework mirrors this as:

```
voiceIdResolution = VOICE_PRESET_THEN_ENV
voiceIdFallbackEnv = ELEVENLABS_VOICE_ID
```

The actual voice ID is not written into Framework TTS result metadata.

```
voiceId = REDACTED
```

## v3 voice-setting compatibility

The legacy History/Mystery preset values are retained for provenance.

Configured LONGFORM example:

```
stability        0.62
similarity       0.80
style            0.04
speed            1.00
speaker boost    true
```

For an Eleven v3 request, the runtime sends only the model-compatible subset:

```
stability
style
```

and records the legacy settings omitted from the request:

```
similarity_boost
speed
use_speaker_boost
```

Metadata records both:

```
configured_voice_settings
voice_settings
voice_settings_dropped_for_model
```

This preserves the old preset as historical/configuration evidence without sending unsupported legacy controls to v3.

## Native cadence

For History/Mystery v3 narration, automatic FFmpeg `atempo` duration correction is skipped.

```
preserveProviderCadence = true
```

This prevents a generated v3 performance from being silently sped up or slowed down after synthesis.

Duration is still measured and reported.

## Long-form chunking

The existing production limit remains:

```
maxChunkCharacters = 4000
```

The splitter prefers paragraph/sentence boundaries and only performs hard slicing when an individual sentence itself exceeds the limit.

This keeps the established long-form behavior and remains below the current Eleven v3 per-request limit.

## Framework package

New package:

```
packages/tts-generation/
```

Core class:

```
TtsGenerationPipeline
```

Primary methods:

```
prepare()
complete()
```

### prepare()

Requires the current:

```
FINAL script
+
HUMAN_APPROVED
```

and creates a revisioned `TtsGenerationPlan`.

The plan contains no API-key value. It contains only:

```
apiKeyEnv = ELEVENLABS_API_KEY
```

and the preset/fallback voice-resolution contract.

The generated runtime handoff contains:

```
provider      = ELEVENLABS
modelId       = eleven_v3
outputFormat  = mp3_44100_128
voicePreset
effectiveVoiceSettings
chunks[]
outputPaths
```

### complete()

Provider results are accepted only when:

- output SHA-256 values are valid,
- duration is positive,
- character timestamp arrays have equal lengths,
- timestamps are finite and ordered,
- the joined alignment characters exactly equal the requested chunk text.

Successful completion creates:

```
MediaArtifact
mediaType    = AUDIO
mediaStatus  = AVAILABLE
relativePath = 03_tts/narration.mp3
mimeType     = audio/mpeg
durationMs
checksum
```

This is the same media contract consumed by WF-16.

## SQLite

Migration:

```
migrations/0012_tts_generation.sql
```

Tables:

```
tts_generation_plans
tts_generation_results
```

The generated narration is registered in the existing:

```
media_artifacts
```

table.

No API-key value or unredacted result voice ID is persisted by the Framework.

## Single project.db integration

The integration path now uses generated TTS rather than manually injecting a narration media row:

```
Approved FINAL Script
        ↓
TtsGenerationPipeline.prepare
        ↓
Eleven v3 runtime contract
        ↓
TtsGenerationPipeline.complete
        ↓
03_tts/narration.mp3 MediaArtifact
        ↓
EditorContentPlan
        ↓
A1 TTS
        ↓
WF-16 → WF-18
```

BGM and SFX remain independent audio assets.

## Actual production runtime

Repository:

```
sktrefil/video-production
```

Relevant files:

```
src/lived_sentences/tts.py
src/lived_sentences/cli.py
config/voice_presets.json
```

History/Mystery generation commands remain compatible with the old operational standard.

LONGFORM:

```powershell
python main.py --generate-tts "<PROJECT_ID>" --voice-preset HISTORY_MYSTERY_LONGFORM
```

SHORTFORM:

```powershell
python main.py --generate-tts "<PROJECT_ID>" --voice-preset HISTORY_MYSTERY_SHORTS
```

Generated files remain:

```
03_tts/
├─ narration.mp3
├─ character_alignment.json
├─ tts_metadata.json
├─ resolved_voice_profile.json
└─ chunks/
   ├─ chunk_001.mp3
   └─ ...
```

## Environment behavior

Required:

```
ELEVENLABS_API_KEY
```

Optional fallback/override:

```
ELEVENLABS_VOICE_ID
ELEVENLABS_MODEL_ID
ELEVENLABS_OUTPUT_FORMAT
```

For History/Mystery projects, leaving `ELEVENLABS_MODEL_ID` unset uses the v3 model stored in the selected preset.

To explicitly force v3:

```
ELEVENLABS_MODEL_ID=eleven_v3
```

Do not put API keys in project JSON, Git commits, TTS metadata, or Framework database rows.

## Regression validation

Framework:

- approved-script gate,
- LONGFORM/SHORTFORM preset resolution,
- `eleven_v3` model pin,
- 4,000-character splitting,
- idempotent TTS plan,
- exact alignment validation,
- AUDIO MediaArtifact creation,
- same-DB routing into WF-16 A1.

Actual Python runtime:

- History/Mystery presets resolve to v3,
- blank model override does not downgrade to v2,
- v3 unsupported legacy voice settings are filtered,
- v2 settings remain backward compatible,
- `/with-timestamps` request contains `model_id=eleven_v3`,
- request uses filtered v3 settings,
- 4,000-character splitter remains intact,
- v3 provider-native cadence is preserved.

The Python contract tests mock the HTTP response. They intentionally do not consume ElevenLabs quota or require a real API key.
