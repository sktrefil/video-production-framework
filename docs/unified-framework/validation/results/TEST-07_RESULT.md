# TEST-07 — Google Flow Manual Runtime Result

RESULT: **PASS**

## Scope repaired during validation

TEST-00 confirmed that MIG-07 was genuinely `DEFERRED`: `runtimes/google-flow/` did not exist and unified CLI `job` commands were still reserved/NOT_IMPLEMENTED. TEST-07 therefore treated this as an implementation defect rather than inheriting PASS from generic `MANUAL_EXTERNAL` fixture coverage.

Implemented on the continuing validation branch:

- `packages/storage/src/google-flow-manual.ts`
- `packages/storage/test/google-flow-manual.test.ts`
- `cli/vpf` Flow export/import dispatch and tests
- `runtimes/google-flow/runtime.mjs`
- `runtimes/google-flow/README.md`
- storage/CLI dependency wiring and root build-order correction

## Contract behavior

The new Google Flow path reuses the existing WF-11 `ProviderJob` / `VideoJobPack` / `FinalClipPipeline.registerVideoResult` authority instead of inventing a parallel state machine.

Export:

- accepts only current `GOOGLE_FLOW` + `VIDEO_GENERATION` + `MANUAL_EXTERNAL` + `WAITING_EXTERNAL` jobs;
- accepts only `DIRECT_START_END_I2V` or `SINGLE_IMAGE_I2V` provider-required clips;
- resolves canonical `GOOGLE_FLOW_MANUAL_EXTERNAL_V1@<job version>` profile;
- verifies current clip revision and exact START/END MediaArtifact identity/path/checksum;
- materializes the standard RuntimeJob and records its input hash;
- writes exact prompt text without semantic rewriting;
- copies exact source bytes and records source SHA-256 values;
- writes `runtime_job.json`, `manifest.json`, `prompt.txt`, source media and instructions into `jobs/<job_id>/` atomically;
- exports no provider secrets, cookies or browser/session state.

Import:

- verifies current ProviderJob/clip revision and RuntimeJob input hash;
- re-verifies exported source hashes and prompt hash/exact text;
- rejects missing, stale, duplicate or wrong-state jobs;
- requires a readable `.mp4`, probes duration and dimensions and computes SHA-256;
- copies the result to a canonical project-relative clip path;
- creates/validates a COMPLETE RuntimeResult and runtime receipt;
- registers the video through the existing Final Clip result boundary;
- leaves the clip `QC_PENDING`, with no `approvedMediaId`;
- therefore preserves WF-12 CLIP_QC as the sole disposition/approval authority.

The runtime contains no Google login, browser automation, cookies, session persistence or provider-network automation.

## Failure Recovery Guide execution

### First re-verification failure

Initial branch-tip CI run `34547961450` failed in the E2E build before tests ran.

Root cause classification: **CI_HARNESS_GAP / dependency build-order defect**.

Cause:

- `@vpf/cli` gained an explicit dependency on `@vpf/storage/google-flow-manual`;
- the root build graph still compiled `@vpf/cli` before `@vpf/storage`;
- TypeScript therefore could not resolve the emitted storage subpath declaration.

Repair:

- did not weaken tests or bypass the dependency;
- moved CLI build/typecheck after storage in root dependency order;
- retained the direct workspace dependency declaration.

Re-verification confirmed the repair.

## Regression coverage

New tests cover:

- direct START+END package exactness;
- single-image package exactness;
- prompt preservation;
- exact source hash/byte preservation;
- canonical Flow provider profile pin;
- absence of secret/session material in package text;
- source tampering rejection;
- MP4 probe/import/hash/canonical-copy path;
- candidate VIDEO result and `QC_PENDING` routing;
- no auto-approval;
- duplicate result rejection;
- stale clip revision rejection;
- missing package rejection;
- non-MP4 rejection;
- CLI export/import dispatch and missing-argument failure.

## Final CI

Latest branch-tip tested: `9a6ad8a680bbf415354c44062ec0ffeb786a1330`
CI run: `34548048378`

- validate Node 22 build/typecheck/full test: PASS
- validate Node 24 build/typecheck/full test: PASS
- dedicated single-repository E2E: PASS
- pilot-readiness: PASS

## Acceptance

Canonical Google Flow manual provider profile: PASS
Provider-specific export runtime: PASS
Provider-specific import runtime: PASS
Exact prompt/source identity and hashes: PASS
RuntimeJob/RuntimeResult linkage: PASS
Deterministic current job/clip revision checks: PASS
Candidate-only video result: PASS
WF-12 QC cannot be bypassed: PASS
No secrets/browser/session material: PASS
Editorial non-provider modes cannot be exported as Flow jobs: PASS
Duplicate/stale/missing/invalid result failure: PASS
Shared MANUAL_EXTERNAL architecture remains provider-neutral: PASS
Full regression/CI: PASS

MIG-07's previous `DEFERRED` implementation gap is closed by TEST-07 validation work. Historical Phase B documents are not rewritten; this validation result is the new evidence of closure.

## Next

`TEST-08 — Generic Editor Port` may proceed automatically.
