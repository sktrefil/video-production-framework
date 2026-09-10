# MIG-13 — Real Project Pilot Readiness

Status: **WORK ORDER / NOT YET EXECUTED**

## WORK ITEM

`MIG-13`

## GOAL

Prepare the integrated Framework for controlled real-provider production and
define the exact GO/NO-GO process for the first real projects.

## WHY

A mocked E2E proves contracts, not production usability. Before REAL PROJECT 01,
operators need one runbook, one checklist, provider preflight and rollback
procedures.

## SOURCE

All accepted MIG-01 ... MIG-12 results.

## TARGET

```
docs/operations/
cli/vpf/                    # only missing operator commands
tests/pilot-readiness/
workspace/projects/         # real projects at execution time
```

## CLASSIFICATION

```
VALIDATION + OPERATIONS + SMALL NEW_BUILD WHERE REQUIRED
```

## DEPENDENCIES

- MIG-01 ... MIG-12 PASS.
- single-repository fixture E2E PASS.

## IN SCOPE

### Pilot 1 — SHORTFORM

Purpose:
- low-cost real-provider smoke,
- validate environment/secrets,
- validate image generation,
- validate Flow manual package/import,
- validate Generic Editor/render/package.

Do not treat SHORTFORM success alone as final framework acceptance.

### Pilot 2 — LONGFORM

This is the architecture-priority pilot.

Must validate:
- native LONGFORM bootstrap,
- LONGFORM format profile,
- Visual Bible adaptation,
- ElevenLabs multi-chunk path when script exceeds current chunk ceiling,
- scene/asset scale,
- Flow job batching/manual operation,
- editor performance,
- full render,
- WF-18 package.

### REAL PROJECT 01

After both pilots pass, create a normal production project with a new topic.

It must be run only from:
```
video-production-framework
```

No operator step may require changing directory into the old repository.

## OPERATOR RUNBOOK REQUIRED

Create a detailed runbook covering:

1. checkout/update unified repo,
2. install/build/test preflight,
3. environment/secret check,
4. workspace disk check,
5. project create,
6. project status/doctor,
7. WF-07 approval checkpoints,
8. TTS execution and audio QC,
9. WF-08 Visual Bible/Project Style/Anchor approvals,
10. WF-09 image jobs and Image QC,
11. WF-10/11 link/clip jobs,
12. Flow job export,
13. manual Flow generation,
14. result import,
15. WF-12 QC/fallback,
16. WF-13 binding,
17. WF-14~16 editor assembly,
18. editor preview human QC,
19. WF-17 final render/technical QC,
20. WF-18 final output QC/package,
21. failure recovery/return-to-stage map.

## CHECKLIST REQUIRED

### Repository
- correct branch/HEAD,
- clean working tree for release run,
- CI green.

### Project
- project ID unique,
- format correct,
- resource/version pins recorded,
- `legacyAllowed=false`,
- doctor PASS.

### Script/TTS
- FINAL script approved,
- TTS current,
- alignment integrity,
- human audio QC.

### Visual
- canonical Visual Bible pin,
- Project Style approved,
- required Anchors approved,
- no legacy style/master leak,
- image candidates QC/approved.

### Clips
- START/END identity correct,
- Flow prompt exact,
- imported clips current,
- WF-12 disposition recorded.

### Editor
- V1 complete coverage,
- A1/A2/A3/A4 correct,
- T1/T2/G1 correct,
- no unintended black gaps,
- preview/final renderer parity.

### Final
- technical QC PASS,
- delivery READY,
- final output QC complete,
- package hashes valid,
- publish handoff READY.

## NEW BUILD ALLOWED

Only small capabilities discovered by the pilot-readiness review, such as:
- `vpf env check`,
- provider availability summary,
- disk-space warning,
- job waiting summary,
- project resume/status summary.

Any major missing production subsystem must be sent back to its owning MIG or an
approved new work item; do not hide it in MIG-13.

## OUT OF SCOPE

- actual YouTube platform upload,
- source repository deletion,
- optimization based on subjective pilot preference before correctness.

## GO / NO-GO

### GO for real provider pilot

All:
- MIG-01 ... MIG-12 PASS,
- CI green,
- doctor PASS,
- secret checks PASS,
- no legacy leak,
- workspace has sufficient storage,
- current provider profiles resolved.

### NO-GO

Any:
- old repo runtime required,
- unresolved legacy resource access,
- resource hash mismatch,
- TTS/image/video runtime cannot produce ingestible artifact,
- editor materialization hash mismatch,
- render/package gate failure.

## ACCEPTANCE CRITERIA

MIG-13 itself is PASS when:
- short pilot runbook exists,
- long pilot runbook exists,
- REAL PROJECT runbook exists,
- operator checklist exists,
- provider/environment preflight exists,
- failure-return map exists,
- all steps reference only unified repo commands.

The **migration program** is finally accepted only after execution of:
- real SHORTFORM pilot PASS,
- real LONGFORM pilot PASS,
- REAL PROJECT 01 reaches WF-18.

## ROLLBACK

Operational docs/tools may be reverted independently. A pilot failure does not
justify falling back to the old production system for the same unified project;
return to the owning MIG and repair the unified path.

## BRANCH

```
migration/mig-13-pilot-readiness
```

## NEXT AFTER MIG-13

```
PHASE D — REAL PRODUCTION VALIDATION
1. SHORTFORM pilot
2. LONGFORM pilot
3. REAL PROJECT 01
4. Unified Framework v1 freeze
5. Legacy decommission review
```
