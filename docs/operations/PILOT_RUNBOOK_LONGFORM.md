# LONGFORM Real-Provider Pilot Runbook

Purpose: validate the architecture-priority LONGFORM production path entirely from `video-production-framework`. This pilot must prove that LONGFORM is native, not a stretched SHORTFORM or legacy path.

## 0. Release and environment gate

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
npm run vpf -- env check --format longform
```

Record exact HEAD and green CI. Use a clean working tree. `env check` must return `ready: true`; all automated Provider Profile secrets must be present and the workspace must satisfy the LONGFORM disk threshold.

## 1. Native LONGFORM project creation

```powershell
npm run vpf -- project create pilot_long_01 --title "Pilot Long 01" --format longform
npm run vpf -- project status pilot_long_01
npm run vpf -- project doctor pilot_long_01
npm run vpf -- pilot preflight pilot_long_01
```

Require `format=LONGFORM`, the pinned `LONGFORM_16X9_V1` Format Profile, `pipeline=VPF_UNIFIED_V1`, `legacyAllowed=false`, current migrations and exact resource hashes.

## 2. WF-07 story scale checkpoint

Use a real long-form script with enough chapters/sequences/scenes to exercise non-trivial graph scale. Approve the FINAL script, Structure, Sequences and Scenes in the same `project.db` before visual generation.

Record counts and revisions. If graph scale reveals a major framework limitation, stop and return it to the owning MIG/new approved work item; do not hide a new subsystem inside MIG-13.

## 3. ElevenLabs multi-chunk checkpoint

The current canonical ElevenLabs Provider Profile defines a 4000-character LONGFORM chunk ceiling. The LONGFORM pilot script must exceed that ceiling so the accepted multi-chunk TTS path is exercised.

Require:

- multiple provider chunks generated through RuntimeJob execution;
- deterministic concatenation into the current narration MediaArtifact;
- complete character alignment across chunk boundaries;
- no missing/duplicate text at joins;
- human audio QC PASS;
- TTS/audio provenance current to the FINAL script revision/hash.

Any chunk/alignment failure returns to the TTS owning stage.

## 4. WF-08 Visual Bible adaptation

Resolve the canonical Visual Bible and LONGFORM Format Profile pins. Generate/approve Project Style and all recurring Identity Anchors. Review whether the channel-wide visual rules adapt correctly to 16:9 composition without introducing a separate legacy LONGFORM style.

## 5. WF-09 scene/asset scale and IMAGE_QC

Generate enough Scene Assets to exercise realistic LONGFORM volume. Every image request must use the final approved IMAGE_PROMPT unchanged and exact LONGFORM image dimensions/reference hashes.

Track provider attempts and failures. Every candidate requires IMAGE_QC plus explicit approval before downstream use. Verify repeated characters/locations/props preserve approved Identity Anchors across the sample.

## 6. WF-10/WF-11 clip graph and manual batching

Build current links and handoff records from approved assets, then create Final Clip designs. Group manual video generation jobs into practical operator batches while preserving each job's identity, START/END media hashes, prompt, mode and result key.

The video execution path is the validated Google Flow `MANUAL_EXTERNAL` runtime backed by `GOOGLE_FLOW_MANUAL_EXTERNAL_V1@1.0.0`. Batch handling must use the unified TEST-07 job export/import surface and must not introduce a second control plane.

## 7. Manual Google Flow generation/import

For each current waiting job, export its verified execution package:

```powershell
npm run vpf -- job export <job_id> --project pilot_long_01
```

For each batch:

1. use only the exact exported prompt, START image and optional END image;
2. generate clips manually in Google Flow;
3. keep output filenames mapped to the exported job/result keys;
4. import each MP4 through the unified runtime:

```powershell
npm run vpf -- job import-result <job_id> <generated.mp4> --project pilot_long_01
```

5. require current ProviderJob/Clip revision and exported source/prompt/input hashes to match;
6. verify the runtime-probed dimensions, duration, media type and copied result hash;
7. keep each imported video as a candidate with Clip status `QC_PENDING` until WF-12 disposition;
8. reject stale result imports rather than relabeling output from another job.

No job may be silently substituted with output from another scene/link.

## 8. WF-12 / WF-13 QC and binding

Run Clip QC/fallback for all candidates. Record PASS/TRIM_PASS/REGENERATE/BLOCKED disposition. Bind only current approved MediaArtifacts and require editor handoff READY.

## 9. WF-14~16 LONGFORM editor assembly

Assemble the complete LONGFORM V1 timeline in `project.db` and verify:

- visual coverage across the full duration;
- A1 narration continuity;
- A2 Clip Audio placement;
- A3 BGM segmentation/levels;
- A4 SFX placement;
- T1 subtitle coverage and alignment;
- T2 text overlays;
- G1 graphics;
- no unintended black gaps;
- no stale source media.

Materialize from the canonical assembly only.

## 10. Editor performance and human preview QC

```powershell
npm run editor:materialize -- pilot_long_01 --project-root <project-root>
npm run editor:studio
```

Record startup/load responsiveness, timeline navigation, preview playback behavior and any memory/performance issue that materially blocks normal operator use. Perform human QC for subtitle safe areas, audio balance, visual continuity and preview/final-render parity.

Performance preference alone is not a correctness failure, but inability to operate the project is NO-GO and must return to the owning editor/render work item.

## 11. WF-17 full render

```powershell
npm run editor:render -- pilot_long_01 --project-root <project-root>
```

Require a complete non-empty `09_render/final.mp4`, Technical QC PASS and delivery READY. Record render duration, output size and final SHA-256 for the pilot report.

## 12. WF-18 package

Run final-output human QC and create the publish package. Require current package hashes and `publish_handoff.json` READY. Platform upload is outside MIG-13.

## 13. LONGFORM pilot closeout

Re-run:

```powershell
npm run vpf -- project doctor pilot_long_01
npm run vpf -- pilot preflight pilot_long_01
```

The pilot is PASS only if all workflow records and human checkpoints are current, no old production path was needed, multi-chunk TTS was genuinely exercised, full render/package succeeded and all required hashes are recorded.

Failures return according to `docs/operations/FAILURE_RETURN_MAP.md`; do not switch the same unified project to a previous production system.
