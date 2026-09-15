# 작업지시서 — P1 Finishing Controls

- 선행 조건: P0 Professional Timeline Core PASS
- 목표: 영상/오디오/자막/그래픽 finishing 작업을 외부 편집기 없이 수행한다.

## 1. 작업 원칙
1. P0 Timeline/History/Persistence contract를 깨지 않는다.
2. 기존 reducer 기능부터 UI화한다.
3. Canvas와 Inspector는 같은 state를 사용한다.
4. Drag는 transaction으로 묶는다.
5. Shorts 기능은 Generic preset으로 구현한다.

## 2. P1-01 Audio Fade UI
- `fadeInFrames`, `fadeOutFrames`
- Inspector input
- Timeline fade handle
- fade region overlay
- clamp
- undo/redo/persistence

## 3. P1-02 Audio Crossfade
- compatible audio overlap 시 crossfade
- linear/equal-power 정책 고정
- duration 조절
- renderer/mixer 반영

## 4. P1-03 BGM Auto Ducking
설정:
- BGM target
- TTS trigger
- duck level
- attack
- release
- minimum gap merge

자동 결과는 사용자가 수정 가능해야 한다.

## 5. P1-04 Playback Rate UI
- preset selector
- numeric input
- reset 1x
- source overflow guard
- duration policy 표시

## 6. P1-05 Video Fit / Crop
- cover
- contain
- crop position
- reset
- vertical preset

## 7. P1-06 Transform Full Controls
- X/Y
- Scale
- Rotation
- Opacity
- Reset

VIDEO/IMAGE 공통.

## 8. P1-07 Canvas Direct Editing
대상:
- VIDEO
- IMAGE
- SUBTITLE
- TEXT
- GRAPHIC

기능:
- drag move
- resize
- rotate
- bounding box
- safe-area guide
- center/guide snap
- aspect ratio lock option

## 9. P1-08 Subtitle Style Full Editor
- fontFamily
- fontSize
- fontWeight
- fill
- stroke/strokeWidth
- alignment
- lineHeight
- width
- maxLines
- background
- position
- preset

## 10. P1-09 Text / Title Editor
TextRole:
- TOP_TITLE
- LOWER_THIRD
- SOURCE
- LABEL
- FREE_TEXT

기능:
- add
- direct canvas edit
- inspector
- duplicate/delete
- preset

## 11. P1-10 Graphic / Blur Editor
GraphicType:
- BLUR_PANEL
- GRADIENT
- SOLID_PANEL
- DIM_LAYER

UI:
- x/y
- width/height
- opacity
- blurPx
- color
- borderRadius
- gradient colors/angle

Shorts preset:
- top 0–18%
- story 18–72%
- bottom 72–100%

## 12. P1-11 Multi-select / Group Move
- Ctrl/Shift select
- marquee select
- group drag
- group nudge
- group delete
- undo 1 transaction

## 13. P1-12 Copy / Paste / Duplicate
- Ctrl+C
- Ctrl+V
- Ctrl+D
- media ref reuse
- item ID regenerate
- target track validation
- paste at playhead/defined offset

## 14. 테스트
- TypeScript typecheck
- reducer tests
- canvas interaction
- timeline
- renderer parity
- save/reload
- Roman IX regression

## 15. 완료 보고 형식
```text
P1 STATUS: PASS | PARTIAL | FAIL

Implemented:
- ...

Changed files:
- ...

Tests:
- ...

Runtime verification:
- Audio fade/crossfade:
- Ducking:
- Playback rate:
- Canvas transform:
- Subtitle/Text:
- Graphics/Blur:
- Multi-select:
- Copy/Paste:

Known limitations:
- ...

Commit:
- <sha>
```
