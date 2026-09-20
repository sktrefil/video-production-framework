# 작업지시서 — P2 Advanced / AI Editor

- 선행 조건: P0 PASS, P1 핵심 기능 PASS
- 목표: 일반 NLE의 고급 기능과 VPF Production/QC/AI 기능을 통합한다.

## 1. P2-01 Transition System
지원:
- Cut
- Cross Dissolve
- Fade
- Dip to Black

작업:
- transition data contract
- duration
- timeline representation
- preview/final 동일 renderer
- source handle validation

## 2. P2-02 Keyframe System
대상:
- x/y
- scale
- rotation
- opacity
- volume

기능:
- add/remove/move
- timeline dots
- easing
- deterministic interpolation
- copy/duplicate compatibility

## 3. P2-03 Motion Preset
- Push In
- Pull Out
- Pan Left/Right
- Tilt Up/Down
- Ken Burns

기존 `ImageMotionSpec`과 호환 또는 migration 제공.

## 4. P2-04 Marker System
종류:
- Scene
- Narration
- Beat
- QC
- Comment

기능:
- add/move/delete
- marker snap
- marker list
- next/previous
- QC 연계

## 5. P2-05 Media Bin
분류:
- Video
- Image
- TTS
- BGM
- SFX
- Graphic

기능:
- search/filter/sort
- thumbnail
- duration
- used/unused
- drag to timeline

## 6. P2-06 Proxy / Performance
- proxy media contract
- preview quality
- thumbnail cache
- waveform cache
- low-power mode
- final render는 original media

## 7. P2-07 Color Adjustment
최소:
- brightness/exposure
- contrast
- saturation
- temperature

선택:
- LUT

효과는 renderer data model에 저장한다.

## 8. P2-08 QC Panel
검사:
- missing media
- source overflow
- gap
- overlap
- subtitle overlap
- safe-area violation
- audio clipping/loudness warning
- stale draft
- assembly mismatch
- disabled critical track

UI:
- BLOCKER/WARNING/INFO
- row click → select + seek
- suggested fix

## 9. P2-09 Render Preset / Queue
Preset:
- Shorts 1080x1920
- Longform 1920x1080

기능:
- fps
- codec
- quality
- output path
- queue
- status
- history
- retry

기존 Production Gate와 충돌 금지.

## 10. P2-10 AI Assisted Editing
- TTS → Subtitle Re-sync suggestion
- TTS semantic unit → Scene Re-cut suggestion
- important word → emphasis suggestion
- BGM ducking suggestion
- QC issue → fix suggestion
- approved media → replacement suggestion

원칙:
- AI 결과는 suggestion/draft.
- QC/approval 자동 우회 금지.
- 적용 전/후 diff 또는 preview.
- 모든 적용 Undo 가능.

## 11. 테스트
- transition render parity
- deterministic keyframe
- marker persistence
- media bin drag/drop
- proxy-original parity
- QC regression
- render preset
- AI suggestion apply/undo

## 12. 완료 보고 형식
```text
P2 STATUS: PASS | PARTIAL | FAIL

Implemented:
- ...

Changed files:
- ...

Tests:
- ...

Runtime verification:
- Transition:
- Keyframe:
- Motion:
- Marker:
- Media Bin:
- Proxy:
- Color:
- QC:
- Render:
- AI Assist:

Known limitations:
- ...

Commit:
- <sha>
```
