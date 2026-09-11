# MIG-13 — Real Project Pilot Readiness Completion Report

Status: **PASS (READINESS)**

## Execution identity

- Repository: `sktrefil/video-production-framework`
- Branch: `migration/mig-13-pilot-readiness`
- Base HEAD: `f2e5c134d881dba816c8c612727cbb7d4cd1e104` (accepted MIG-12 final documentation tip)
- Implementation HEAD: `de7e532771975209ac16c67b5f50227e8cfc1e07`
- Implementation CI: `34545306095`
- `pilot-readiness`: PASS
- `e2e`: PASS
- Node 22 install/build/typecheck/test: PASS
- Node 24 install/build/typecheck/test: PASS
- Unit/integration regression: `204 / 204 PASS`

The documentation commit containing this report is validated separately as the final branch-tip gate.

## Scope and acceptance meaning

MIG-13 prepares the unified repository for controlled real-provider pilots and REAL PROJECT 01. It does **not** claim that the real SHORTFORM pilot, real LONGFORM pilot, or REAL PROJECT 01 have already been executed.

The migration-program global final gate therefore remains open after MIG-13 readiness PASS until the real execution evidence exists and the MIG-07 governance state is resolved as required by the master gate.

MIG-07 remains **DEFERRED** by explicit operator decision. MIG-13 uses and documents the already accepted shared `MANUAL_EXTERNAL` WF-11 job/result path for manual Google Flow operation. It does not represent provider-specific MIG-07 implementation as PASS.

## Operator tooling delivered

The unified CLI now exposes two pre-spend/readiness commands:

```text
vpf env check --format <longform|shortform> [--min-free-gb <number>]
vpf pilot preflight <project_id> [--min-free-gb <number>]
```

`env check` validates the release environment before project/provider spend. `pilot preflight` validates an existing unified project's project.db, policy and resource pins before the controlled run.

The checks are machine-readable and return a non-zero process code for blocking NO-GO conditions.

## Environment preflight contract

The readiness service checks:

- Node major version >= 22;
- repository identity is `video-production-framework`;
- workspace storage capacity;
- unified ElevenLabs, image and Generic Editor entrypoints are present;
- default canonical Channel Profile resolves;
- selected SHORTFORM/LONGFORM Format Profile resolves;
- all selected Provider Profiles resolve from the canonical Resource Registry;
- required automated-provider secret **names** are present in runtime environment;
- secret values are never serialized into readiness output;
- Google Flow is recognized as `MANUAL_EXTERNAL` and requires no runtime secret;
- `VPF_IMAGE_ADAPTER_MODULE` is present, readable and not a legacy path when the automated image provider is selected.

Default storage safety thresholds are:

```text
SHORTFORM  5 GiB
LONGFORM  20 GiB
```

They may be deliberately overridden with `--min-free-gb` for a controlled environment/test. The normal operator runbook uses the defaults.

## Project preflight contract

For an existing project, `pilot preflight` checks:

- unified project doctor PASS;
- `pipeline=VPF_UNIFIED_V1`;
- `legacyAllowed=false`;
- database migrations current;
- every stored Resource version/hash pin diagnoses as CURRENT;
- workspace storage capacity;
- selected Provider Profiles still resolve;
- required runtime secret names are available;
- image adapter path remains readable/non-legacy.

The preflight reads canonical project/resource state and does not auto-upgrade stale resource pins.

## Operations package delivered

MIG-13 adds:

```text
docs/operations/
├─ README.md
├─ PILOT_RUNBOOK_SHORTFORM.md
├─ PILOT_RUNBOOK_LONGFORM.md
├─ REAL_PROJECT_01_RUNBOOK.md
├─ PILOT_OPERATOR_CHECKLIST.md
└─ FAILURE_RETURN_MAP.md
```

### SHORTFORM pilot runbook

Defines the low-cost real-provider smoke from exact repository HEAD through environment preflight, project bootstrap, WF-07 story, TTS/audio human QC, WF-08 visual identity, WF-09 image generation + IMAGE_QC, WF-10/11 link/clip work, manual Google Flow result registration, WF-12/13 QC/binding, WF-14~16 editor assembly, Generic Editor human preview QC, WF-17 actual final render/Technical QC and WF-18 package/handoff.

### LONGFORM pilot runbook

Defines the native LONGFORM path and adds explicit scale checkpoints. The pilot script must exceed the current 4000-character ElevenLabs chunk ceiling so real multi-chunk TTS concatenation/alignment is exercised. It also requires realistic scene/asset volume, batched manual clip operation, editor load/performance observation, complete render and WF-18 packaging.

### REAL PROJECT 01 runbook

Defines entry criteria only after both real pilots pass, requires a genuinely new topic, and records the evidence required to reach WF-18 without a previous production repository.

### Operator checklist and failure-return map

The checklist covers repository/release identity, providers/secrets, project/resource pins, Script/TTS, Visual, Clips, Editor and Final gates. The failure map routes blocking errors back to their owning unified stage instead of creating hidden fallback logic or returning to the old repository.

## CI readiness gate

Root command:

```text
npm run check:pilot-readiness
```

A dedicated GitHub Actions `pilot-readiness` job executes this gate independently of the Node 22/24 validation matrix and the MIG-12 fixture E2E job.

The readiness test verifies:

- all required runbooks/checklists exist;
- operational docs identify `video-production-framework` as the working repository;
- no runbook instructs the operator to `cd` into the old `video-production` repository;
- required WF/QC/manual-provider checkpoints are present;
- compiled `vpf env check` returns GO in a deterministic configured environment;
- secret values do not appear in stdout;
- a real unified project can be created in a temporary workspace;
- compiled `vpf pilot preflight` returns GO for that project;
- all generated project Resource pins are CURRENT.

## Negative readiness tests

The CLI/unit suite proves:

```text
missing ELEVENLABS_API_KEY        -> NO-GO
legacy image adapter path         -> NO-GO
current provider/resource setup   -> GO
healthy unified project           -> GO
secret values in readiness JSON   -> ZERO
```

Existing Legacy Guard, Resource Registry, Image Runtime, TTS, Generic Editor, actual Remotion render, WF-17 and WF-18 regression tests continue to pass.

## Implementation CI history

Initial implementation HEAD `ba38e63bd304f517dec2e00057e7973962d875c8` triggered CI `34545206832`. Production TypeScript build succeeded, but the new pilot-readiness documentation checker stopped with a JavaScript `SyntaxError` because the dynamically constructed Unicode regular expression escaped `-` as `\-`.

This was fixed in `de7e532771975209ac16c67b5f50227e8cfc1e07` by replacing that dynamic regex construction with literal string inclusion checks. No runtime, provider, security, QC or acceptance rule was weakened.

Implementation CI `34545306095` then passed all four jobs:

```text
pilot-readiness  PASS
e2e              PASS
validate (22)    PASS
validate (24)    PASS
```

Node 22 and Node 24 both passed install, build, typecheck and the complete test command. The Node 24 log also confirms Generic Editor browser smoke, actual GenericFinalRender MP4 + Technical QC + WF-18 package, and repository-boundary PASS.

## Acceptance

```text
SHORTFORM pilot runbook                         PASS
LONGFORM pilot runbook                          PASS
REAL PROJECT 01 runbook                         PASS
operator checklist                              PASS
failure-return map                              PASS
environment/provider preflight                  PASS
project/resource-pin preflight                  PASS
secret values remain runtime-only               PASS
legacy image adapter preflight rejection        PASS
manual Google Flow route documented             PASS (shared MANUAL_EXTERNAL)
MIG-07 provider-specific implementation         DEFERRED
pilot-readiness CI                              PASS
MIG-12 E2E regression                           PASS
Node 22 full regression                         PASS
Node 24 full regression                         PASS
unit/integration regression                     204 / 204 PASS
```

## Post-MIG-13 state

MIG-13 readiness is complete. The next actions are operational acceptance runs, not an automatic new migration work item:

```text
real SHORTFORM pilot    NOT_RUN
real LONGFORM pilot     NOT_RUN
REAL PROJECT 01         NOT_RUN
global migration gate   NOT_COMPLETE
```

Do not declare the overall migration complete until the master global final gate is actually satisfied.
