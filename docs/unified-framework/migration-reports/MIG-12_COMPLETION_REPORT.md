# MIG-12 — Single-Repository Fixture E2E Completion Report

Status: **PASS**

## Execution identity

- Repository: `sktrefil/video-production-framework`
- Execution branch: `migration/mig-12-single-repo-e2e`
- Cumulative base HEAD: `52e78f866e0431b179ec58df1b88bce88c928fce` (accepted MIG-11 documentation tip)
- Implementation HEAD: `54a85425ac015fe1a8620200e4bd27d03d6bfc31`
- Implementation CI: `34543628172`
- Node 22: install/build/typecheck/test PASS
- Node 24: install/build/typecheck/test PASS
- Dedicated E2E job: PASS

The documentation commit that contains this report is validated separately as the final branch-tip CI gate. The implementation CI above is the immutable code acceptance point used to author this report.

## Scope delivered

MIG-12 adds a deterministic single-repository E2E harness under:

```text
tests/e2e/unified-project/
├─ support.mjs
├─ upstream.mjs
├─ editor.mjs
├─ run.mjs
└─ fixtures/
   ├─ manifest.json
   ├─ silence-600ms.mp3
   └─ manual-clip-600ms.mp4
```

The root command is:

```text
npm run check:e2e
```

GitHub Actions now runs a dedicated `e2e` job in addition to the Node 22/24 validation matrix.

## Deterministic fixture media

The committed fixture manifest pins the synthetic media used by the harness:

```text
silence-600ms.mp3
- audio/mpeg
- 600 ms
- SHA-256 pinned in fixture manifest

manual-clip-600ms.mp4
- video/mp4
- 600 ms
- 64 x 64
- 30 fps
- h264 / yuv420p
- no audio stream
- SHA-256 pinned in fixture manifest
```

No paid provider call is required for MIG-12.

## Unified project coverage

The harness creates two independent projects through the unified bootstrap/CLI path:

```text
mig12_shortform  -> SHORTFORM
mig12_longform   -> LONGFORM
```

Each project owns exactly one canonical `project.db`. The final runner asserts that exactly two `project.db` files exist for the two fixture projects and that no second canonical database is introduced by downstream stages.

Both formats execute the same unified repository graph. LONGFORM does not use a separate legacy bootstrap.

## Upstream production graph

The fixture drives the accepted framework services through the canonical state graph:

```text
Unified project bootstrap / status
        ↓
WF-07 approved FINAL script + story graph
        ↓
WF-08 project style + identity anchor approval
        ↓
WF-09 Scene Asset design
        ↓
MIG-06 image RuntimeJob -> mocked ImageRuntimeExecutor
        ↓
candidate IMAGE MediaArtifact
        ↓
IMAGE_QC PASS + explicit asset approval
        ↓
WF-10 Pre-Link / Handoff PASS
        ↓
WF-11 Final Clip design + Provider Pre-QC
        ↓
MANUAL_EXTERNAL video job / result registration
        ↓
WF-12 Clip QC PASS
        ↓
WF-13 media binding / editor handoff
        ↓
MIG-05 mocked ElevenLabs RuntimeJob + alignment
        ↓
MIG-10 audio/subtitle content inputs
        ↓
WF-16 editor content plan + timeline assembly
```

The mocked image provider is behind the Runtime Executor Registry and Runtime Orchestrator. The mocked TTS executor is also exercised through the runtime job boundary. The final runner asserts the expected provider invocation counts for each project:

```text
image: 2
tts:   1
```

The manual video result uses the already accepted shared `MANUAL_EXTERNAL` / WF-11 path. MIG-07 remains **DEFERRED**; this E2E does not claim provider-specific Google Flow runtime migration as PASS.

## Editor, render and publish graph

The downstream fixture then proves the real unified editor/render path:

```text
READY TimelineAssemblyRecord
        ↓
MIG-09 editor materialization
        ↓
canonical 08_editor/edit_project.json
        ↓
disposable Generic Editor public mirror
        ↓
GenericFinalRender (actual Remotion MP4 render)
        ↓
WF-17 Technical QC PASS
        ↓
DELIVERY_READY
        ↓
WF-18 Final Output QC PASS
        ↓
publish package READY
        ↓
publish_handoff.json READY
```

The harness verifies the rendered `09_render/final.mp4` is a real, non-empty file and confirms final-output readiness from `project.db` after packaging.

Materialization assertions compare the materialization report against the actual media identities referenced by the execution project, so checksum+basename deduplication is treated as valid canonical behavior rather than as a fixed file-count assumption.

## Required failure gates

The SHORTFORM fixture intentionally verifies the following negative paths before completing the successful graph:

```text
stale resource content hash                 BLOCKED
legacy resource resolution                  BLOCKED before legacy I/O
invalid image reference hash                BLOCKED before provider call
unapproved image asset binding              BLOCKED
stale MANUAL_EXTERNAL video result           BLOCKED
editor source media hash drift              BLOCKED
WF-17 Technical QC dimension failure         DELIVERY BLOCKED
renewed timeline assembly                    previous render/package STALE
```

After each negative assertion the fixture restores or advances valid state and completes the normal pipeline. Failures are therefore proven without replacing the successful E2E with mocked final state.

## Legacy isolation instrumentation

The runner records and asserts:

```text
oldRepoOperationalCalls = 0
legacyResourceAccesses  = 0
```

It also executes the repository boundary scanner as part of the E2E and requires a PASS result.

No E2E step changes directory into, spawns, imports, or reads runtime state from the old production repository.

## CI evidence

Implementation CI `34543628172` executed exactly three jobs against implementation HEAD `54a85425ac015fe1a8620200e4bd27d03d6bfc31`:

```text
e2e             PASS
validate (22)   PASS
validate (24)   PASS
```

Both validation jobs completed:

```text
npm install     PASS
npm run build   PASS
npm run typecheck PASS
npm test        PASS
```

The dedicated E2E job completed:

```text
npm install       PASS
npm run check:e2e PASS
```

## Acceptance

```text
SHORTFORM unified fixture E2E        PASS
LONGFORM unified fixture E2E         PASS
one project.db per project           PASS
provider mocks behind RuntimeJob     PASS
editor materialization               PASS
actual GenericFinalRender            PASS
WF-17 DELIVERY_READY                 PASS
WF-18 PUBLISH_HANDOFF_READY          PASS
stale resource pin gate              PASS
stale manual result gate             PASS
invalid image hash gate              PASS
unapproved image bind gate           PASS
editor media hash mismatch gate      PASS
technical QC delivery block gate     PASS
renewed timeline stale gate          PASS
old repo operational calls           ZERO
legacy resource accesses             ZERO
repository boundary scan             PASS
Node 22 full CI                      PASS
Node 24 full CI                      PASS
dedicated E2E CI                     PASS
```

MIG-12 is complete. MIG-07 remains DEFERRED and is not represented as PASS. MIG-13 is the next work item and has not started.
