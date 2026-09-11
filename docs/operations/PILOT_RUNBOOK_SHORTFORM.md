# SHORTFORM Real-Provider Pilot Runbook

Purpose: execute the low-cost real-provider smoke entirely from `video-production-framework`. SHORTFORM success validates the operational path but does **not** by itself accept the migration program.

## 0. Release gate

From the unified repository only:

```powershell
cd <path-to>\video-production-framework
git status --short
git rev-parse HEAD
npm install
npm run build
npm run typecheck
npm test
npm run check:e2e
npm run check:pilot-readiness
```

Record the branch, exact HEAD and green CI run before spending provider credits. A dirty working tree is NO-GO for the controlled pilot.

## 1. Environment and provider preflight

Configure runtime secrets in the shell or secret manager. Do not write them to `project.json`, `project.db`, logs or Markdown.

Required automated-provider settings are resolved from the canonical Provider Profiles. For the current channel profile these include `ELEVENLABS_API_KEY`, `IMAGE_PROVIDER_API_KEY`, and the executable image adapter location `VPF_IMAGE_ADAPTER_MODULE`. Google Flow is intentionally `MANUAL_EXTERNAL` and has no runtime secret in the unified provider profile.

```powershell
npm run vpf -- env check --format shortform
```

Expected: JSON result with `ready: true`; all automated providers `READY`; Google Flow `MANUAL_READY`; storage PASS. Secret **names** may appear. Secret values must never appear.

## 2. Create and pin the pilot project

Use a unique project ID.

```powershell
npm run vpf -- project create pilot_short_01 --title "Pilot Short 01" --format shortform
npm run vpf -- project status pilot_short_01
npm run vpf -- project doctor pilot_short_01
npm run vpf -- pilot preflight pilot_short_01
```

Verify `format=SHORTFORM`, `pipeline=VPF_UNIFIED_V1`, `legacyAllowed=false`, migrations current and every Resource version/hash pin current. A resource mismatch is NO-GO.

## 3. WF-07 — script and story graph

Create/import the real pilot script through the unified WF-07 services. Approve the FINAL script before downstream work. Record the script revision/hash, Structure, Sequence and Scene approvals in the same `project.db`.

Do not create downstream media while the FINAL script or Scene graph is DRAFT/STALE.

## 4. TTS execution and human audio QC

Run the accepted ElevenLabs runtime through the unified RuntimeJob/RuntimeResult path. Confirm:

- Provider Profile pin is current.
- TTS result is an AVAILABLE AUDIO MediaArtifact.
- character alignment is present and passes provenance/hash validation.
- the narration sounds complete and contains no truncation, duplicate phrases or unexpected pronunciation defects.

If audio is rejected, return to TTS generation. Do not patch generated audio invisibly downstream.

## 5. WF-08 — Visual Bible, Project Style and Identity Anchors

Resolve only the pinned canonical Visual Bible. Generate and approve Project Style, then approve every required Identity Anchor before Scene image production.

No legacy master style, palette, old image planner or old scene interpreter may be used.

## 6. WF-09 — image jobs and IMAGE_QC

Create IMAGE_GENERATION RuntimeJobs from approved IMAGE_PROMPT records. The image runtime must receive the approved prompt unchanged and enforce the pinned SHORTFORM dimensions/reference hashes.

For each returned candidate:

1. confirm MediaArtifact checksum/dimensions/MIME;
2. run `IMAGE_QC`;
3. explicitly approve the selected candidate;
4. reject/regenerate failures through the owning WF-09 path.

A generated image is never considered approved merely because the provider returned success.

## 7. WF-10 / WF-11 — link and clip preparation

Run Pre-Link/Handoff QC and create Final Clip decisions only after required assets are approved. For provider-generated clips, Provider Pre-QC must PASS/approved before the manual provider job is exported.

The accepted manual video route is `MANUAL_EXTERNAL`. MIG-07 remains deferred, so this pilot uses the shared WF-11 manual job/result contract and does not claim provider-specific Google Flow runtime automation.

## 8. Manual Google Flow operation

Export/copy only the approved WF-11 job payload: START image, optional END image, exact video prompt, requested duration/mode and result key. Generate the clip manually in Google Flow.

On return, place the generated MP4 under the current project's `06_clips/` area and register it against the **current** waiting job. Verify SHA-256, media type, dimensions and duration. A result for a stale/failed prior job is rejected.

## 9. WF-12 QC / fallback and WF-13 binding

Run Clip QC for every candidate. Apply PASS/TRIM_PASS/REGENERATE/BLOCKED disposition through the unified QC/fallback state machine. Bind only current approved media.

Before editor assembly, editor handoff must be READY and contain no stale asset/clip binding.

## 10. WF-14~16 editor assembly

Assemble V1 editor content in the same `project.db`. Verify:

- complete visual coverage;
- A1 TTS placement;
- A2 Clip Audio where required;
- A3 BGM and A4 SFX policy/levels;
- T1 subtitle timing/provenance;
- T2 text overlays;
- G1 graphics;
- no unintended black gaps.

Materialize the editor project only from current AVAILABLE MediaArtifacts.

## 11. Generic Editor human preview QC

```powershell
npm run editor:materialize -- pilot_short_01 --project-root <project-root>
npm run editor:studio
```

Open the current materialized project in Generic Editor. Check timing, subtitle safe areas, audio balance, image/clip continuity, black frames and preview/final renderer parity assumptions. Any content defect returns to its owning stage; do not hand-edit the disposable public mirror as canonical state.

## 12. WF-17 final render / Technical QC

```powershell
npm run editor:render -- pilot_short_01 --project-root <project-root>
```

Require actual `09_render/final.mp4`, Technical QC PASS and delivery READY. Dimension/fps/duration/codec/audio-stream mismatches are NO-GO.

## 13. WF-18 final output QC and package

Run final-output human QC and the accepted publish-package command path. Require valid output/package hashes and `publish_handoff.json` READY under `10_publish/`.

Do not upload to YouTube as part of MIG-13 acceptance.

## 14. Pilot closeout

Record exact repository HEAD, project ID, provider request IDs, rejected/regenerated attempts, final MediaArtifact hashes, render delivery hash, package hash and all human approval checkpoints.

Run again before declaring the SHORTFORM pilot PASS:

```powershell
npm run vpf -- project doctor pilot_short_01
npm run vpf -- pilot preflight pilot_short_01
```

Any failure returns according to `docs/operations/FAILURE_RETURN_MAP.md`. Never fall back to a previous production repository for this unified project.
