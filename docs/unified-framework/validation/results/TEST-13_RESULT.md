# TEST-13 Result — Real Production Pilots

Status: **WAITING_EXTERNAL**

Branch: `validation/full-system-v1`
Current validated repository HEAD before external pilot execution: `453104645a59c162a18b35a1e931ee9af656db9b`
CI run: `34551053798`

## Completed automatically in Normal Chat / GitHub

- TEST-00 through TEST-12 are PASS.
- Current branch-tip CI is green on Node 22 and Node 24.
- Current branch-tip dedicated E2E is PASS.
- Current branch-tip `pilot-readiness` is PASS.
- SHORTFORM, LONGFORM and REAL PROJECT 01 runbooks are aligned to the validated TEST-07 Google Flow `MANUAL_EXTERNAL` export/import surface.
- No old-repository runtime path is allowed by the runbooks.

## Important limitation of the current pilot-readiness CI

`tests/pilot-readiness/check.mjs` intentionally uses CI-only fake provider secret values and a dummy image adapter. It validates:

- runbook/checklist/failure-map structure,
- environment-preflight logic,
- project creation/doctor/preflight logic,
- resource-pin currency,
- secret-value non-disclosure.

It does **not** perform a paid/real ElevenLabs call, a real image-provider call, Google Flow UI generation, human audio QC, human Generic Editor preview QC, or a real production topic through WF-18.

Therefore readiness PASS is not TEST-13 PASS.

## External gates still required

### Gate A — real SHORTFORM

Execute `docs/operations/PILOT_RUNBOOK_SHORTFORM.md` using real approved runtime environment values.

Required evidence includes:

- real `env check --format shortform` ready=true,
- real `pilot_short_01` project creation/doctor/preflight,
- real approved FINAL script/story records,
- real ElevenLabs RuntimeJob/RuntimeResult and human narration QC,
- real image-provider RuntimeJob/RuntimeResult + IMAGE_QC/approval,
- current Google Flow job export package(s), manual Flow generation and validated MP4 import,
- WF-12 clip QC and WF-13 bindings,
- WF-14~16 editor timeline,
- human Generic Editor preview QC,
- WF-17 actual render + Technical QC PASS,
- WF-18 final-output QC/package + publish_handoff READY,
- final doctor/preflight PASS.

### Gate B — real LONGFORM

After Gate A PASS, execute `PILOT_RUNBOOK_LONGFORM.md` with a script exceeding the 4000-character ElevenLabs chunk ceiling so the real multi-chunk path is genuinely exercised. Record real provider evidence, Flow batch/manual results, editor performance/human QC, full render and WF-18 package.

### Gate C — REAL PROJECT 01

After both pilots PASS, execute `REAL_PROJECT_01_RUNBOOK.md` on a new production topic and reach WF-18 using only `video-production-framework`.

## Resume rule

When external evidence/results are available, resume TEST-13 from the same validation branch. Any discovered product defect is repaired on this branch according to `FAILURE_RECOVERY_GUIDE.md`, related regression coverage is added, and the affected pilot gate is rerun.

TEST-14 and TEST-15 remain blocked until all three TEST-13 gates PASS.
