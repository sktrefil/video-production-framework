# Pilot Operator Checklist

Use this checklist for both real-provider pilots and REAL PROJECT 01. A blocking item that is not PASS means NO-GO.

## Repository

- [ ] Working from `video-production-framework` only.
- [ ] Correct release branch and exact HEAD recorded.
- [ ] `git status --short` is clean for the controlled run.
- [ ] GitHub CI is green for the exact HEAD.
- [ ] `npm install`, `npm run build`, `npm run typecheck`, `npm test` PASS.
- [ ] `npm run check:e2e` PASS.
- [ ] `npm run check:pilot-readiness` PASS.

## Environment / providers

- [ ] `npm run vpf -- env check --format <format>` returns `ready: true`.
- [ ] Workspace free-space check PASS.
- [ ] ElevenLabs Provider Profile resolves and required secret name is present.
- [ ] Image Provider Profile resolves, required secret name is present and `VPF_IMAGE_ADAPTER_MODULE` is readable/non-legacy.
- [ ] Google Flow Provider Profile resolves as `MANUAL_EXTERNAL`.
- [ ] Remotion Provider Profile resolves.
- [ ] No secret values appear in logs or project files.

## Project

- [ ] Project ID is unique.
- [ ] Project format is correct.
- [ ] `pipeline=VPF_UNIFIED_V1`.
- [ ] `legacyAllowed=false`.
- [ ] All Resource version/hash pins are recorded and CURRENT.
- [ ] Database migrations are current.
- [ ] `npm run vpf -- project doctor <project_id>` PASS.
- [ ] `npm run vpf -- pilot preflight <project_id>` returns `ready: true`.

## Script / TTS

- [ ] FINAL script is approved and current.
- [ ] Structure/Sequence/Scene graph approvals are current.
- [ ] TTS RuntimeJob/RuntimeResult is current to the approved script.
- [ ] Narration AUDIO MediaArtifact is AVAILABLE.
- [ ] character alignment integrity/provenance PASS.
- [ ] Human audio QC PASS.
- [ ] LONGFORM pilot exceeds the current 4000-character chunk ceiling and proves multi-chunk joins.

## Visual

- [ ] Canonical Visual Bible pin is current.
- [ ] Correct Format Profile pin is current.
- [ ] Project Style approved.
- [ ] Required Identity Anchors approved.
- [ ] No legacy style/master/palette/planner path used.
- [ ] Every IMAGE_GENERATION request preserves approved prompt/reference hashes/dimensions.
- [ ] Every selected image candidate has IMAGE_QC PASS and explicit approval.

## Clips

- [ ] WF-10 handoff PASS.
- [ ] START/END asset/media identity correct for each link.
- [ ] Final Clip design current.
- [ ] Provider Pre-QC current.
- [ ] Manual video jobs use the current `MANUAL_EXTERNAL` job identity.
- [ ] Google Flow prompt copied exactly from the current job payload.
- [ ] Imported MP4 hash/dimensions/duration/current-job association verified.
- [ ] WF-12 disposition recorded for every candidate.
- [ ] Only current approved clip media is bound for editor use.

## Editor

- [ ] WF-14~16 editor assembly is current and READY.
- [ ] V1 visual coverage is complete.
- [ ] A1 narration correct.
- [ ] A2 Clip Audio correct.
- [ ] A3 BGM correct.
- [ ] A4 SFX correct.
- [ ] T1 subtitles current/aligned.
- [ ] T2 text overlays correct.
- [ ] G1 graphics correct.
- [ ] No unintended black gaps.
- [ ] Materialization hash verification PASS.
- [ ] Generic Editor human preview QC PASS.
- [ ] Preview/final renderer parity reviewed.

## Final

- [ ] WF-17 actual final MP4 rendered.
- [ ] Technical QC PASS.
- [ ] Delivery status READY.
- [ ] Final output human QC complete.
- [ ] WF-18 package status READY.
- [ ] Package file hashes/size verified.
- [ ] `publish_handoff.json` READY.
- [ ] Final render SHA-256 recorded.
- [ ] Final package SHA-256 recorded.
- [ ] Final project doctor PASS.
- [ ] Final project pilot preflight PASS.

## Closeout

- [ ] Rejected/retry attempts documented.
- [ ] Any failure returned to the owning unified stage using `FAILURE_RETURN_MAP.md`.
- [ ] No step required a previous production repository.
- [ ] Pilot result marked PASS only after all blocking checks above are complete.
