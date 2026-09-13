# WF-16 Editor Assemble Contract

`vpf editor assemble <project_id>` creates one standard `08_editor/edit-project.json`.

## Required inputs

- `06_clips/CLIP 01.mp4` through `CLIP 10.mp4`, in contiguous numeric order.
- `03_tts/narration.mp3`.
- `03_tts/subtitle-cues.json`, produced from verified ElevenLabs character alignment.
- Optional `--header <text>`; the default is `로마 제9군단의 미스터리`.

## Output

The generated EditProject is 1080x1920 at 30fps. It contains:

- V1: ten five-second video clips in numeric order;
- A1: narration audio using the source TTS duration;
- T1: provenance-carrying subtitle cues;
- T2: one persistent top header, constrained to the top safe area.

## Blocking validation

Assembly fails if a required input is absent, clip numbering is not contiguous,
the subtitle cue source/duration is invalid, a T1 cue is empty, outside TTS
duration, or overlaps another cue, or the T2 header escapes its safe area.

No media is approved by assembly. Operator preview QC remains required before
rendering.
