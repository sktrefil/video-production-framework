# WF-15 — Generic Editor Motion Execution

Status: **PASS**

## Purpose

WF-15 removes the renderer bottleneck identified at WF-14.

Before WF-15:

```
EDITORIAL_MOVE / REUSE_REFRAME
        ↓
IMAGE timeline item
        ↓
motion intent preserved only as sidecar directive
        ↓
Remotion handoff blocked
```

After WF-15:

```
EDITORIAL_MOVE / REUSE_REFRAME
        ↓
deterministic motion compilation
        ↓
IMAGE.motion { from, to, easing }
        ↓
Generic Editor shared ProjectRenderer
        ↓
Remotion frame interpolation
        ↓
Preview + Final Render
```

This work spans two repositories.

Framework:

```
sktrefil/video-production-framework
branch: feature/wf15-generic-editor-motion-execution
```

Actual Generic Editor / Remotion runtime:

```
sktrefil/video-production
branch: feature/wf15-generic-editor-motion-execution
```

## Executable editor motion contract

Generic Editor IMAGE items now optionally contain:

```json
{
  "motion": {
    "kind": "TRANSFORM",
    "from": {
      "x": 0,
      "y": 0,
      "scale": 1,
      "rotation": 0,
      "opacity": 1
    },
    "to": {
      "x": 0,
      "y": 0,
      "scale": 1.05,
      "rotation": 0,
      "opacity": 1
    },
    "easing": "EASE_IN_OUT"
  }
}
```

Supported easing:

```
LINEAR
EASE_IN_OUT
```

The motion applies to the whole approved still image. It does not invent subject animation, body motion, prop movement, or environment events.

## Motion compilation

WF-15 converts the existing approved editorial camera instruction into numeric transform values once, during timeline assembly.

The renderer does not parse natural language at render time.

Supported camera language includes restrained forms such as:

```
push in
push-out
zoom in
zoom out
dolly in
dolly out

pan left
pan right
pan up
pan down

move / shift / reframe left|right|up|down
```

Strength extraction supports:

```
5%
5 percent
```

Strength is clamped to:

```
2% .. 12%
```

Defaults:

```
EDITORIAL_MOVE = 5%
REUSE_REFRAME  = 7%
```

If an editorial instruction does not contain a recognized direction or zoom token, WF-15 uses a restrained center push-in instead of dropping the approved move entirely.

## Safe directional reframe

A pure directional pan at scale 1 could expose the image edge.

Therefore directional-only motion uses a small crop reserve:

```
scale = 1 + motionStrength
```

Example at 1080px width:

```
cameraMove = "slow 6 percent pan left"

from
x     = 0
scale = 1.06

to
x     = -65px
scale = 1.06
```

This keeps the movement editorial rather than revealing empty canvas.

## Framework behavior

WF-14/WF-15 timeline assembly now emits the compiled motion directly on the IMAGE item.

```
GenericEditorImageItem.motion
```

The corresponding `EditorMotionDirective` remains available for traceability and contains:

```
itemId
bindingId
clipMode
cameraMove
subjectMotion
environmentMotion
supportedByCurrentRenderer = true
compiledMotion
```

Because the current renderer now supports the compiled transform:

```
EDITORIAL_MOVE
REUSE_REFRAME
```

no longer add:

```
CURRENT_RENDERER_MOTION_UNSUPPORTED
```

and a fully bound visual project can reach:

```
assemblyStatus       = READY
remotionHandoffReady = true
```

## Generic Editor runtime

Actual renderer changes are in:

```
Youtubu_projects/src/studio/editor/editorTypes.ts
Youtubu_projects/src/studio/editor/editorReducer.ts
Youtubu_projects/src/editor/ProjectRenderer.tsx
```

The editor type now has the same `ImageMotionSpec` contract as the framework output.

The reducer normalizes loaded motion data:

- finite x/y/rotation,
- scale floor > 0,
- opacity clamped to 0..1,
- supported easing normalization.

This preserves compatibility with hand-authored or persisted JSON.

## Remotion execution

`ImageItemRenderer` uses:

```
useCurrentFrame()
interpolate()
Easing
```

For each frame it interpolates:

```
x
y
scale
rotation
opacity
```

The interpolation window is:

```
0 .. durationInFrames - 1
```

and both sides are clamped.

Therefore an IMAGE motion begins at its exact `from` transform and finishes at its exact `to` transform without overshoot outside the Sequence window.

## Preview / Final Render parity

Both paths use the same shared renderer:

```
GenericVideoEditor
        ↓
ProjectRenderer

GenericFinalRender
        ↓
ProjectRenderer
```

WF-15 also restored the missing `GenericFinalRender` Composition registration in `Root.tsx`.

This is important: motion is not a Studio-only preview effect. The exact same IMAGE motion code is used during final Remotion rendering.

## Production gate

The production gate validates any IMAGE motion before Final Render.

Rejected conditions include:

- unknown motion kind,
- unknown easing,
- non-finite transform values,
- scale <= 0,
- opacity outside 0..1.

Blocking code:

```
IMAGE_MOTION_INVALID
```

Older IMAGE items without a `motion` field remain valid and render statically.

## Regression cleanup

The Generic Editor base branch contained stale CI checks that still assumed:

- inline `<Inspector />`,
- old Generic Final Render fixture naming,
- missing/older final composition structure.

WF-15 aligned those regression checks with the current floating Inspector portal and the current Sado Prince Generic Editor fixture.

The functional editor behavior was preserved.

## Framework validation

GitHub Actions:

```
run: 34353168764
head: abf9cb57e9a341176796886e0c2117a7ad12a6da
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
WF-14 / WF-15 Editor Timeline      8 / 8 PASS
SQLite integration                 5 / 5 PASS

TOTAL                             65 / 65 PASS
```

New validated cases include:

- EDITORIAL_MOVE compiles to executable 5% push-in,
- compiled motion is stored directly on IMAGE timeline item,
- motion directive reports current renderer support,
- Remotion handoff becomes READY,
- REUSE_REFRAME directional pan creates crop reserve,
- 6% left reframe on 1080px canvas compiles to -65px travel.

## Actual Generic Editor validation

Repository:

```
sktrefil/video-production
```

GitHub Actions:

```
run: 34353615854
head: 5ef07db795bcf180aadb44e3bb5354a713960de4
```

Result:

```
npm ci                         PASS
editor-state                   PASS
editor-renderer                PASS
editor-timeline                PASS
editor-video                   PASS
editor-audio                   PASS
editor-subtitles               PASS
editor-overlays                PASS
editor-bgm-sfx                 PASS
editor-persistence             PASS
editor-production              PASS
TypeScript / ESLint via check  PASS
Remotion bundle                PASS
```

Specific motion validation:

```
image motion reducer normalization   PASS
useCurrentFrame wiring               PASS
interpolate wiring                   PASS
from/to transform wiring             PASS
EASE_IN_OUT wiring                   PASS
production IMAGE_MOTION_INVALID gate PASS
Preview / Final shared renderer      PASS
GenericFinalRender registration      PASS
```

## Result

```
WORK_ITEM:
WF-15

EDITORIAL_MOVE_EXECUTION:
PASS

REUSE_REFRAME_EXECUTION:
PASS

NUMERIC_MOTION_COMPILATION:
PASS

EDGE_SAFE_REFRAME:
PASS

IMAGE_MOTION_SCHEMA:
PASS

EDITOR_STATE_NORMALIZATION:
PASS

REMOTION_FRAME_INTERPOLATION:
PASS

PREVIEW_FINAL_RENDER_PARITY:
PASS

GENERIC_FINAL_RENDER_REGISTRATION:
PASS

PRODUCTION_MOTION_GATE:
PASS

FRAMEWORK_TESTS:
65 / 65 PASS

GENERIC_EDITOR_CHECK:
PASS

REMOTION_BUNDLE:
PASS

RESULT:
PASS
```
