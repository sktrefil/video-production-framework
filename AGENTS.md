# Video Production Framework — Codex operating rules

## Production authority
- `docs/LONGFORM_MULTI_AGENT_PRODUCTION_MASTER_DESIGN.md` is the architecture authority for LONGFORM production.
- The main Codex thread is Agent1, the Production Manager and final gate.
- For history/mystery LONGFORM script development, `skills/history-video-development-director/SKILL.md` is the required development-workflow authority. Agent1 may override or BLOCK it, but must not silently skip its Script Draft -> Directing Preflight -> Revision -> Lock sequence.
- Delegate story/audio work to `story_audio` and visual/clip work to `visual_image` when those tasks can proceed independently.
- Agent1 is the only agent allowed to advance canonical project approvals or mutate production gate state in `project.db`.
- Worker agents may create or revise source artifacts and reports, but they must not self-approve final stage gates.
- For LONGFORM, do not fan out TTS/Subtitle and Visual/Image production until the current FINAL script and Scene graph have passed the manager Story Gate; after that Agent2 and Agent3 may proceed concurrently.

## LONGFORM invariants
- **STYLE_START_NOTICE:** Before substantive work starts on every new HISTORY_MYSTERY video, the main thread must tell the user the active style: `NON_REALISTIC_STYLIZED`, strong fantasy/graphic direction, kinetic camera motion, and explicit prohibition of photoreal/live-action/documentary-reenactment output. This notice must be user-visible; an internal artifact alone is insufficient. A matching notice does not require a confirmation pause.
- **NON_REALISTIC_STYLE_LOCK:** HISTORY_MYSTERY LONGFORM final visuals must be explicitly non-photorealistic and stylized. Photorealistic, live-action, documentary-reenactment, hyperreal, or "realistic cinematic reconstruction" output is prohibited.
- Real photographs, scans, excavation images, or museum references may be used as FACT/SHAPE references only. They may not become final style targets; final frames must visibly transform them into the approved stylized visual language.
- Unknown faces, clothing, behavior, interiors, and daily-life details must not be "filled in" through faux-realistic reconstruction. Use stylization, silhouette, abstraction, symbolic space, or editorial treatment to express uncertainty.
- Viewer interest should come primarily from bold readable animation-space directing: rapid reveal, scale change, parallax, spatial traversal, orbit/arc, focus redirection, graphic match, and controlled speed contrast—not from photographic realism.
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
- During LONGFORM development, a draft script may be reviewed by the visual worker in `DIRECTING_PREFLIGHT` mode before FINAL TTS. This preflight is advisory and must not advance canonical production state.
- When the integrated history-video development skills are used, require a structurally valid `SCRIPT_DIRECTING_LOCK` candidate before requesting the manager Story Gate; the lock does not replace the manager Story Gate.
- Do not generate FINAL segmented TTS until the `SCRIPT_DIRECTING_LOCK` development conditions are satisfied **and** Agent1 has approved the FINAL script and Scene graph. Immediately before FINAL TTS, run `skills/history-video-development-director/scripts/validate_final_tts_gate.py` against current script/preflight/visual-skeleton/manager provenance. Any mismatch blocks TTS and invalidates stale downstream assumptions.
- If the approved script later changes in meaning, unit order, evidence mapping, or timing assumptions, invalidate the development lock and follow the existing downstream invalidation rules.
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
