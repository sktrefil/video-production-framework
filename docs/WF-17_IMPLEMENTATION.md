# WF-17 — Final Render / Technical QC / Delivery Manifest

Status: **PASS**

## Purpose

WF-17 turns the current WF-16 full editor timeline into a delivery-qualified final render.

```
WF-16 edit_project.json READY
        ↓
Production Gate
        ↓
GenericFinalRender
        ↓
final.mp4
        ↓
Technical QC
        ↓
delivery_manifest.json
        ↓
DELIVERY_READY
```

A non-empty MP4 is not sufficient for PASS. The render must still match the current timeline assembly and pass technical output checks.

## Repository boundary

Framework / orchestration state:

```
sktrefil/video-production-framework
branch: feature/wf17-final-render-technical-qc
```

Actual Generic Editor / Remotion execution:

```
sktrefil/video-production
branch: feature/wf17-final-render-technical-qc
```

The Framework does not spawn Remotion directly. It prepares and tracks render attempts, then imports a render result produced by the actual editor runtime. This keeps the control plane independent from the local rendering process.

## Render preparation

`FinalRenderPipeline.prepareRender()` requires:

```
current TimelineAssemblyRecord exists
assemblyStatus = READY
stale = false
```

The render request pins:

- assembly ID/revision,
- SHA-256 of the exact Generic Editor project JSON,
- fps,
- width/height,
- durationInFrames,
- expected audible audio state,
- final render profile,
- canonical output/report paths.

Default profile:

```
composition = GenericFinalRender
video codec = h264
audio codec = aac
pixel format = yuv420p
CRF = 18
```

Default paths:

```
out/<project_id>/
├─ final.mp4
├─ production_gate.json
├─ render_props.json
├─ render_manifest.json
├─ technical_qc.json
└─ delivery_manifest.json
```

## Project hash

The render request stores:

```
SHA256(JSON.stringify(edit_project))
```

The actual Generic Editor render manifest carries the same project SHA.

WF-17 rejects a render result when the current assembly ID/revision/hash no longer matches the prepared request.

This prevents an older MP4 from being attached to a newer timeline.

## Render state machine

```
READY
  ↓
RUNNING
  ↓
  ├─ render/process failure
  │      ↓
  │    FAILED
  │
  └─ result import
         ↓
     Technical QC
         ↓
      ┌───────────────┐
      │               │
     PASS            FAIL
      │               │
DELIVERY_READY   TECHNICAL_QC_FAILED
```

If a failed attempt is retried:

```
attempt 1
TECHNICAL_QC_FAILED
        ↓
new render ID
attempt 2
retryOfRenderAttemptId = attempt 1 ID
```

A retry is never written over the previous attempt.

## Actual media probing

The actual Generic Editor probes the rendered local MP4 using the already-installed Remotion package:

```
@remotion/media-parser
@remotion/media-parser/node
```

with:

```
parseMedia()
nodeReader
```

No external system `ffprobe` installation is required.

The local MP4 parser reads:

- container,
- video codec,
- audio codec,
- dimensions,
- guaranteed fps,
- guaranteed duration.

This works through the project's existing Node/Remotion dependencies on Windows and CI.

## Pixel-format verification boundary

`@remotion/media-parser` does not expose decoded pixel format metadata.

Therefore WF-17 does **not** pretend that `yuv420p` was independently probed.

Instead the probe records:

```
pixelFormat = yuv420p
pixelFormatVerification = RENDER_PROFILE
```

and Technical QC verifies that the controlled render contract and render manifest were produced with:

```
--pixel-format=yuv420p
```

If a future probe implementation can inspect actual pixel format, it may return:

```
pixelFormatVerification = PROBED
```

and the Framework will enforce the actual probed value.

## Technical QC

Technical QC compares the prepared render request, render manifest, and actual media probe.

Blocking checks include:

### Render identity

```
PROJECT_ID_MISMATCH
PROJECT_SHA_MISMATCH
COMPOSITION_MISMATCH
RENDER_METADATA_MISMATCH
OUTPUT_PATH_MISMATCH
```

### Output integrity

```
OUTPUT_EMPTY
OUTPUT_SHA_INVALID
```

### Declared render profile

```
DECLARED_VIDEO_CODEC_MISMATCH
DECLARED_AUDIO_CODEC_MISMATCH
DECLARED_PIXEL_FORMAT_MISMATCH
DECLARED_CRF_MISMATCH
```

### Actual media structure

```
CONTAINER_NOT_MP4
VIDEO_CODEC_NOT_H264
PIXEL_FORMAT_NOT_YUV420P
DIMENSIONS_MISMATCH
FPS_MISMATCH
DURATION_MISMATCH
AUDIO_STREAM_MISSING
AUDIO_CODEC_NOT_AAC
UNEXPECTED_AUDIO_STREAM
```

`PIXEL_FORMAT_NOT_YUV420P` is applied when the probe explicitly reports that pixel format was actually probed.

## Duration tolerance

Expected duration is derived from the exact timeline:

```
durationMs =
durationInFrames / fps * 1000
```

Probe tolerance is:

```
max(100ms, 2 frames)
```

This allows ordinary container timestamp rounding without accepting a materially shorter or longer video.

## Audio expectation

The final render expects an audio stream only when the current editor project has at least one audible enabled:

```
TTS
CLIP_AUDIO
BGM
SFX
```

and:

```
track enabled
item enabled
muted != true
volume > 0
masterVolume > 0
```

If audio is expected but missing:

```
AUDIO_STREAM_MISSING
```

If an audio stream exists in a project that should be silent:

```
UNEXPECTED_AUDIO_STREAM
```

## Delivery manifest

Technical QC PASS produces a current:

```
FinalDeliveryManifest
status = READY
```

containing:

- render attempt ID/revision,
- technical QC ID/revision,
- assembly ID/revision,
- project SHA,
- output path,
- output byte size,
- output SHA-256,
- codec/audio codec/pixel format,
- fps,
- dimensions,
- duration,
- render-manifest path,
- technical-QC path.

The actual editor also writes:

```
out/<project_id>/delivery_manifest.json
```

with:

```
status = READY
```

only after Technical QC PASS.

If Technical QC fails, the rendered MP4 may remain for inspection, but:

```
delivery_manifest.status = BLOCKED
```

and the render process exits with a non-success delivery result.

## Studio behavior

The Generic Editor Studio no longer treats “Remotion produced an MP4” as success.

Previous state:

```
RENDERED
```

WF-17 success state:

```
DELIVERY_READY
```

Studio reports:

```
DELIVERY READY · Technical QC PASS · Subtitle QC PASS
```

Technical QC errors are surfaced as:

```
TECHNICAL_QC_<ISSUE_CODE>
```

and Final Render is shown as BLOCKED.

## Stale render behavior

A current render becomes stale when:

- Timeline Assembly disappears,
- assembly becomes PARTIAL/BLOCKED/stale,
- assembly ID/revision changes,
- exact edit-project SHA changes.

Then:

```
FinalRenderAttempt.status = STALE
FinalDeliveryManifest.status = STALE
```

An old MP4 can therefore never remain delivery-ready after an editor change.

## Storage

Migration:

```
migrations/0010_final_render.sql
```

Tables:

```
final_render_attempts
final_render_technical_qc
final_delivery_manifests
```

Every state transition is revisioned and committed with the existing workflow event/outbox mechanism.

## Full single-DB integration

Validated in one `project.db`:

```
WF-07 Story
↓
WF-08 Visual Identity
↓
WF-09 Scene Assets
↓
WF-10 Handoff
↓
WF-11 Provider Clip
↓
WF-12 Clip QC / TRIM_PASS
↓
WF-13 Final Media Binding
↓
WF-14 Timeline Assembly
↓
WF-15 Motion Execution Contract
↓
WF-16 Full Editor Content Timeline
↓
WF-17 Render Prepared
↓
RUNNING
↓
Imported render_manifest + media probe
↓
Technical QC PASS
↓
FinalDeliveryManifest READY
↓
DELIVERY_READY
```

The integration verifies persisted render state/QC/delivery state and confirms Scene narrative revision remains unchanged.

## Framework validation

Pre-document GitHub Actions:

```
run: 34359193073
head: 85f392488a89b17405d1bb714aabd912c27387d6
```

Node 22 and Node 24:

```
npm install   PASS
build         PASS
typecheck     PASS
test          PASS
```

Test groups:

```
Production-system contracts        6 / 6 PASS
WF-07 Story                        5 / 5 PASS
WF-08 Visual Identity              5 / 5 PASS
WF-09 Scene Asset                  7 / 7 PASS
WF-10 Pre-Link / Handoff           8 / 8 PASS
WF-11 Final Clip / Provider        9 / 9 PASS
WF-12 QC / Fallback                6 / 6 PASS
WF-13 Final Media Binding          6 / 6 PASS
WF-14/15/16 Editor Timeline       13 / 13 PASS
WF-17 Final Render                 7 / 7 PASS
SQLite integration                 5 / 5 PASS

TOTAL                             77 / 77 PASS
```

WF-17 tests validate:

- render preparation idempotency,
- actual H264/AAC-shaped result → DELIVERY_READY,
- codec/duration mismatch → Technical QC FAIL,
- failed Technical QC → new retry attempt,
- unexpected audio stream rejection,
- delivered render stale after timeline revision change,
- non-READY WF-16 timeline blocks render,
- WF-07 → WF-17 completes in one project DB.

## Actual Generic Editor validation

Repository:

```
sktrefil/video-production
branch: feature/wf17-final-render-technical-qc
```

Pre-document CI:

```
run: 34359355401
head: f1a824b879aaa97b64e930edeeb2e7ab8bbe6058
```

Result:

```
npm ci                    PASS
editor-state              PASS
editor-renderer           PASS
editor-timeline           PASS
editor-video              PASS
editor-audio              PASS
editor-subtitles          PASS
editor-overlays           PASS
editor-bgm-sfx            PASS
editor-persistence        PASS
editor-production         PASS
editor-wf16               PASS
editor-wf17               PASS
TypeScript / ESLint       PASS
Remotion bundle           PASS
```

Dedicated WF-17 validation covers:

- Remotion media-parser metadata normalization,
- MP4/H264/AAC/dimensions/fps/duration QC,
- Technical QC failure codes,
- audible-audio expectation,
- delivery gating,
- sidecar Technical-QC/Delivery response,
- Studio DELIVERY_READY contract.

## Result

```
WORK_ITEM:
WF-17

RENDER_ATTEMPT_STATE:
PASS

TIMELINE_HASH_PINNING:
PASS

GENERIC_FINAL_RENDER:
PASS

H264_PROFILE:
PASS

AAC_PROFILE:
PASS

YUV420P_RENDER_PROFILE:
PASS

CROSS_PLATFORM_MEDIA_PROBE:
PASS

TECHNICAL_QC:
PASS

DURATION_QC:
PASS

AUDIO_STREAM_QC:
PASS

RENDER_RETRY:
PASS

STALE_RENDER_DETECTION:
PASS

DELIVERY_MANIFEST:
PASS

DELIVERY_READY_GATE:
PASS

SQLITE_PERSISTENCE:
PASS

WF07_TO_WF17_SINGLE_DB:
PASS

FRAMEWORK_TESTS:
77 / 77 PASS

GENERIC_EDITOR_CHECK:
PASS

REMOTION_BUNDLE:
PASS

RESULT:
PASS
```
