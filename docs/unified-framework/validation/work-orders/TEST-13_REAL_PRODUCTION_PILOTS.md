# TEST-13 — Real Production Pilots

Owner: MIG-13 / Phase D

## Goal
Execute the production validation that MIG-13 intentionally did not execute: real SHORTFORM, real LONGFORM, then REAL PROJECT 01 through WF-18.

## Preconditions
TEST-00...12 PASS, CI green, project doctor/preflight green, secrets available through approved environment only, provider profiles current, no legacy leak, sufficient workspace capacity.

## Gate A — real SHORTFORM
Follow `docs/operations/PILOT_RUNBOOK_SHORTFORM.md` with real provider evidence. Validate image generation, TTS as applicable, Flow manual package/result import, QC, Generic Editor/render and WF-18 package.

## Gate B — real LONGFORM
Follow `PILOT_RUNBOOK_LONGFORM.md`. This is architecture priority. Validate native LONGFORM bootstrap/profile, Visual Bible adaptation, multi-chunk ElevenLabs path, scaled scenes/assets, Flow batch/manual operation, editor performance, full render and package.

## Gate C — REAL PROJECT 01
Follow `REAL_PROJECT_01_RUNBOOK.md` using a new production topic. It must run only from `video-production-framework` and reach WF-18 without old-repo runtime use.

## Manual/external handling
Normal Chat performs all repository/CI/state analysis it can. Google Flow UI generation, paid-provider execution not available through connected tools, and human preview/audio QC are explicit operator gates. Set `WAITING_EXTERNAL`, provide exact next action/evidence, then resume automatically when the result is supplied/imported.

## Failure handling
Do not fall back to the old system. Use the failure-return map to identify the owning stage/MIG, repair the unified path on this branch, rerun affected validation, then resume the pilot.

## PASS criteria
All three gates pass with recorded evidence. A runbook or readiness check alone is not PASS.

## Next
PASS -> TEST-14.