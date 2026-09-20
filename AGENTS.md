# Video Production Framework — Codex operating rules

## Production authority
- `docs/LONGFORM_MULTI_AGENT_PRODUCTION_MASTER_DESIGN.md` is the architecture authority for LONGFORM production.
- The main Codex thread is Agent1, the Production Manager and final gate.
- Delegate story/audio work to `story_audio` and visual/clip work to `visual_image` when those tasks can proceed independently.
- Agent1 is the only agent allowed to advance canonical project approvals or mutate production gate state in `project.db`.
- Worker agents may create or revise source artifacts and reports, but they must not self-approve final stage gates.
- For LONGFORM, do not fan out TTS/Subtitle and Visual/Image production until the current FINAL script and Scene graph have passed the manager Story Gate; after that Agent2 and Agent3 may proceed concurrently.

## LONGFORM invariants
- LONGFORM is horizontal 16:9 only.
- Canonical editor/render delivery is 1920x1080. Canonical image-generation dimensions come from `LONGFORM_16X9_V1` (currently 1536x864).
- Do not apply SHORTFORM 9:16 central-band, persistent-header, subtitle, or crop assumptions to LONGFORM.
- LONGFORM narration remains segmented. Do not merge all section narration into one final `narration.mp3`.
- Image creation is prompt-driven in GPT. The visual worker prepares an approved prompt/reference package; browser automation may only transport that package and return the generated image.

## State and provenance
- `project.db` is the single canonical production state. Files under `jobs/` and `logs/` are work orders, evidence, or reports only.
- Preserve revision/hash provenance for scripts, scenes, prompts, references, generated media, TTS sections, alignments, and final outputs.
- Technical retry reuses the exact prompt/reference package. Creative regeneration requires a new prompt revision. Redesign returns to the owning scene/visual stage.

## Quality gates
- Workers perform self-QC; Agent1 independently performs cross-artifact QC before a stage advances.
- Image review must cover scene requirements and sequence continuity.
- Creative image regeneration is limited to prompt revisions v1/v2/v3 by default; after three failed creative attempts Agent1 must BLOCK and reassess instead of looping.
- Only Agent1-approved recurring characters, recurring locations, critical props, or canonical appearance anchors may be promoted into the project reference library.
- A changed approved script/scene invalidates dependent downstream artifacts; do not regenerate unrelated image/clip work. In Architecture v1, a changed FINAL script revision or approved Scene set invalidates the current SEGMENTED TTS plan as a whole, so automatic cross-plan reuse of unchanged section audio is not assumed.
- Do not start a real LONGFORM pilot unless typecheck, build, tests, LONGFORM E2E, and pilot-readiness are green.

## Repository hygiene
- Do not use destructive Git operations or force-push.
- Keep SHORTFORM behavior compatible unless a change explicitly migrates both formats.
- Prefer focused migrations and backward-compatible readers when production state already exists.
