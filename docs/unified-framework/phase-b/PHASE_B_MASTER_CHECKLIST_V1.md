# PHASE B — Master Migration Checklist v1

Use this checklist as the migration program control sheet.

| Work Item | Primary Type | Required Gate | Status |
|---|---|---|---|
| MIG-01 Repository Integration Foundation | NEW_BUILD | existing regression + skeleton | PASS |
| MIG-02 Runtime Contracts + Orchestrator | NEW_BUILD | shared runtime envelope | PASS |
| MIG-03 Resource Registry | NEW_BUILD + ADAPT | version/hash pinning | PASS |
| MIG-04 Bootstrap + Unified CLI | NEW_BUILD | SHORTFORM + LONGFORM create | PASS |
| MIG-05 ElevenLabs Runtime | ADAPT | v3 mock + WF16 ingestion | PASS |
| MIG-06 Image Runtime | NEW_BUILD | exact prompt/no legacy injection | PASS |
| MIG-07 Google Flow Manual Runtime | NEW_BUILD | export/import + WF12 | DEFERRED |
| MIG-08 Generic Editor Port | PORT + ADAPT | editor checks + bundle + browser smoke | PASS |
| MIG-09 Materialization + Render | ADAPT + NEW_BUILD | WF17/WF18 output | PASS |
| MIG-10 Audio/Subtitle Gaps | ADAPT + NEW_BUILD | A1-A4/T1-T2/G1 | PASS |
| MIG-11 Legacy Isolation | NEW_BUILD | negative leak tests | PASS |
| MIG-12 Single-Repo E2E | NEW_BUILD TEST | no old repo dependency | PASS |
| MIG-13 Real Pilot Readiness | VALIDATION | SHORT + LONG runbook ready | PASS (READINESS) |

## Sequencing note

MIG-08 was executed from the accepted MIG-05 head by explicit operator sequencing. Its editor-port acceptance gates do not require the image runtime or Google Flow runtime to execute. MIG-09 was then executed from the accepted MIG-08 branch tip and validated editor materialization, actual GenericFinalRender execution, WF-17 Technical QC/delivery and WF-18 package handoff without claiming MIG-06 or MIG-07 capability. MIG-10 was executed from the accepted MIG-09 head and closed the audio/subtitle integration gaps while preserving WF-16 as the sole placement authority.

MIG-06 was subsequently backfilled from the accepted MIG-10 branch tip so the cumulative MIG-08 through MIG-10 implementation remained intact. The pre-existing `migration/mig-06-image-runtime` branch had already diverged and was preserved rather than force-rewritten; the accepted backfill uses `migration/mig-06-image-runtime-v2`. MIG-06 now validates exact IMAGE_PROMPT transport, exact reference hashes, Format Profile dimensions, provider-neutral automated/manual execution boundaries, candidate-only MediaArtifact handoff and the existing IMAGE_QC authority.

MIG-11 was then implemented from the accepted cumulative MIG-06 backfill head. A pre-existing `migration/mig-11-legacy-isolation` branch was based before that backfill and was preserved rather than rewritten; the cumulative implementation uses `migration/mig-11-legacy-isolation-v2`. It applies fail-closed Legacy Guard checks to project policy, runtime registry/execution, Resource Registry, workspace paths, editor materialization, CLI control-plane boundaries and the MIG-06 image runtime. Static and dynamic leak tests pass without mutating semantic prompt text.

MIG-12 was executed from the accepted MIG-11 documentation tip on `migration/mig-12-single-repo-e2e`. It adds one-command deterministic SHORTFORM and LONGFORM fixture E2E coverage using one `project.db` per project, RuntimeJob-backed mocked image/TTS providers, shared MANUAL_EXTERNAL video result ingestion, actual editor materialization and GenericFinalRender, WF-17 delivery, WF-18 publish handoff, required negative gates, and zero old-repository/legacy operational accesses.

MIG-13 was executed from the accepted MIG-12 final documentation tip on `migration/mig-13-pilot-readiness`. It adds controlled real-provider pilot runbooks, REAL PROJECT 01 runbook, operator checklist, failure-return map, `vpf env check`, `vpf pilot preflight`, and an independent pilot-readiness CI gate. MIG-13 is PASS for **readiness only**; the real SHORTFORM pilot, real LONGFORM pilot and REAL PROJECT 01 have not yet been executed.

MIG-07 remains `DEFERRED` while Google Flow is operated manually. It is not represented as PASS. MIG-11 validates the shared MANUAL_EXTERNAL / WF-11 path, MIG-12 exercises it in fixture E2E, and MIG-13 documents it for controlled real pilots, but none of these claims provider-specific MIG-07 completion.

## Global preflight

Before MIG-01:
- Phase A branch/HEAD is recorded.
- Current framework full regression is green.
- Current source-repository branch/HEAD is recorded.
- Migration source is not deleted or rewritten.
- Runtime workspace location and free disk space are known.

## Global final gate

**NOT COMPLETE.** Before declaring migration complete:
- all MIG-01 ... MIG-13 = PASS,
- one unified-repo fixture E2E = PASS,
- one real SHORTFORM pilot = PASS,
- one real LONGFORM pilot = PASS,
- REAL PROJECT 01 reaches WF-18,
- no operational command requires changing directory into the old repo,
- no legacy visual decision is used by a unified project.

Current blockers to the global final gate:
- MIG-07 is `DEFERRED`, not PASS;
- real SHORTFORM pilot is NOT_RUN;
- real LONGFORM pilot is NOT_RUN;
- REAL PROJECT 01 is NOT_RUN.
