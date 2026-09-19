# VPF Generic Editor — P0/P1/P2 통합 설계서

- 문서 버전: 1.0
- 작성 기준일: 2026-09-16
- 대상 저장소: `sktrefil/video-production-framework`
- 대상 브랜치: `feature/roman-ix-editor-db-assembly`
- 기준 HEAD: `00b537b572937927996d9080857adf29a2e56779`
- 기준 편집기: `apps/editor`
- 목표: Remotion 기반 Generic Editor를 “AI가 기본 Assembly를 만들고 사람이 최종 수정하는 Production Finishing Editor”로 완성한다.

## 1. 설계 목적

현재 Generic Editor는 Timeline Item(`VIDEO`, `IMAGE`, `TTS`, `CLIP_AUDIO`, `BGM`, `SFX`, `SUBTITLE`, `TEXT`, `GRAPHIC`), VIDEO/AUDIO/TEXT/GRAPHIC Track, Move/Trim, BGM/SFX Drag & Drop, Undo/Redo, Save/Reload/Autosave, Remotion Studio Playhead 연동, 자막 스타일 일부, Transform 일부, Audio Split Action/Reducer, Playback Rate/Audio Fade/Loop/Video Fit/Snap/Transform용 내부 로직을 이미 가진다.

다만 일부 기능은 내부 로직만 있고 UI가 없고, 일부 기능은 실제 편집 워크플로가 완성되지 않았다. 따라서 다음 3단계로 개발한다.

- **P0 — Professional Timeline Core**: 실제 편집기로 사용하기 위해 반드시 필요한 기능
- **P1 — Finishing Controls**: 영상/오디오/자막/그래픽의 직접 편집 기능
- **P2 — Advanced / AI Editor**: Transition, Keyframe, QC, AI Assist, Proxy, Render 확장

## 2. 절대 유지해야 할 아키텍처 원칙

### 2.1 편집 데이터 권위
1. `project.db`는 Production Workflow의 권위 데이터다.
2. `TimelineAssemblyRecord.editProject`는 정식 Assembly의 canonical edit project다.
3. `08_editor/edit_project.json`은 materialized derivative다.
4. Studio 편집은 review/draft 계층에서 수행한다.
5. Studio 기능 추가 때문에 `project.db`를 직접 SQL 수정하지 않는다.
6. Studio draft를 정식 Render Authority로 승격하려면 기존 Assembly/승인 경로를 통과한다.
7. Preview와 Final Render는 동일 `ProjectRenderer` 계열을 사용한다.

### 2.2 Media/QC 원칙
- Provider video의 승인/QC invariant를 우회하지 않는다.
- `TRIM_PASS` 승인 window 의미를 보존한다.
- `FULL_SOURCE` 기능을 추가하더라도 승인 범위를 넘는 직접 바인딩은 금지한다.
- Editorial media 정책은 명시적 binding 정책으로 구현한다.

### 2.3 편집 안정성
- 모든 사용자 편집은 Undo/Redo 가능해야 한다.
- Drag 중 History 폭증을 막기 위해 transaction을 사용한다.
- Frame 값은 정수 프레임으로 정규화한다.
- source window는 asset duration을 초과하지 않는다.
- item duration은 최소 1 frame이다.
- Locked track/item은 수정할 수 없어야 한다.
- Save/Reload 후 동일 결과가 재현되어야 한다.

## 3. 기능 상태 기준

- `DONE`: UI + 상태변경 + 저장 + 테스트까지 연결
- `PARTIAL`: Action/Reducer 또는 일부 UI만 존재
- `MISSING`: 실사용 기능 없음
- `VERIFY`: 구현은 있으나 runtime 검증 필요

현재 핵심 상태:
- Timeline Move: DONE
- Timeline Trim: DONE
- Audio Split: PARTIAL — Action/Reducer 존재, UI 없음
- Playback Rate: PARTIAL — Reducer 존재, UI 없음
- Audio Fade/Loop: PARTIAL
- Video Fit: PARTIAL
- Snap: PARTIAL
- Subtitle Style: PARTIAL
- Canvas Direct Edit: MISSING
- Waveform: MISSING
- Video Razor: MISSING
- Source In/Out Editor: MISSING

# 4. P0 — Professional Timeline Core

## 목표
P0 완료 시 사용자는 TTS/BGM/SFX를 파형을 보며 자르고, 영상/오디오/자막을 이동·Trim·Split하며, TTS와 자막을 프레임 단위로 맞추고, 원본 영상의 실제 사용구간을 확인·조절하며, Snap/Track Control/기본 재생 단축키를 사용할 수 있어야 한다.

## P0 기능
1. **Audio Split UI**
   - TTS/CLIP_AUDIO/BGM/SFX
   - Playhead Split 버튼 + `S` 단축키
   - 기존 `splitAudioItem()` 사용
   - split 후 오른쪽 item 선택
   - Undo 1회 복구
   - Save/Reload 유지

2. **Audio Waveform**
   - Audio item 내부 waveform
   - sourceStart/sourceDuration 반영
   - zoom에 따른 peak density
   - peak cache
   - decode 실패 non-fatal

3. **Subtitle Sync Editor**
   - Drag/Trim
   - Split/Merge
   - ±1/±5 frame nudge
   - TTS waveform과 동일 시간축
   - overlap/safe-zone warning

4. **Video Source In/Out Editor**
   - Asset Duration
   - Source In/Out
   - Used Duration
   - Timeline Duration
   - Playback Rate
   - 승인 provenance 표시

5. **Source Usage Policy**
   - `QC_TRIM`
   - `DESIGNED_DURATION`
   - `FULL_SOURCE`
   - 승인 범위를 넘는 Full Source는 재승인 필요 상태로 처리

6. **Video Razor / Split**
   - playhead에서 VIDEO split
   - playbackRate 반영
   - source window 연속성 보장
   - Undo/Redo/Persistence

7. **Snap Engine**
   - playhead
   - item start/end
   - subtitle start/end
   - project start/end
   - Shift temporary bypass
   - snap guide

8. **Track Controls**
   - Lock
   - Enable/Hide
   - Mute
   - Solo

9. **Playback / Keyboard**
   - Space
   - Left/Right
   - Shift+Left/Right
   - Home/End
   - S
   - Delete
   - Ctrl+Z/Y
   - 가능하면 J/K/L

10. **Persistence Regression Gate**
   - autosave/manual save/reload/browser refresh/Studio restart
   - draft fingerprint
   - stale draft quarantine
   - source window/split/subtitle timing 보존

# 5. P1 — Finishing Controls

1. Audio Fade UI
2. Audio Crossfade
3. BGM Auto Ducking
4. Playback Rate UI
5. Video Fit / Crop
6. Transform Full Controls(X/Y/Scale/Rotation/Opacity)
7. Canvas Direct Editing
8. Subtitle Style Full Editor
9. Text / Title Editor
10. Graphic / Blur Editor
11. Multi-select / Group Move
12. Copy / Paste / Duplicate

Shorts preset은 Generic 기능 위의 preset으로만 제공한다.
- Top 0–18%
- Story 18–72%
- Bottom 72–100%

# 6. P2 — Advanced / AI Editor

1. Transition System
2. Keyframe System
3. Motion Preset
4. Marker System
5. Media Bin
6. Proxy / Preview Performance
7. Color Adjustment
8. QC Panel
9. Render Preset / Queue
10. AI Assisted Editing

AI Assist는 suggestion/draft로만 동작하며 QC/approval를 자동 우회하지 않는다.

# 7. 권장 개발 순서

1. P0-01 Audio Split UI
2. P0-02 Waveform
3. P0-03 Subtitle Sync
4. P0-04 Video Source In/Out
5. P0-05 Source Usage Policy
6. P0-06 Video Razor
7. P0-07 Snap
8. P0-08 Track Controls
9. P0-09 Playback/Keyboard
10. P0-10 Persistence Regression
11. P1 전체
12. P2 전체

# 8. 테스트 전략

## Unit
- reducer action correctness
- source window math
- split/trim/snap
- track lock
- fade
- keyframe interpolation

## Component
- Timeline pointer events
- Toolbar commands
- Inspector changes
- Canvas handles
- Keyboard routing

## Persistence
- save/reload equality
- draft fingerprint
- stale draft quarantine

## Runtime
- Remotion Studio actual playhead
- Preview/Final parity
- Roman IX 1452-frame regression fixture

## Production invariant
- Provider approval/QC bypass 금지

# 9. Definition of Done

각 기능은 다음을 모두 충족해야 `DONE`이다.
- 사용자 UI에서 실행 가능
- Reducer/state 반영
- Undo/Redo 가능
- Save/Reload 유지
- Preview 반영
- Final Renderer contract와 충돌 없음
- Typecheck PASS
- Editor tests PASS
- Regression test 추가
- DB/Assembly/QC invariant 훼손 없음
- 사용법/설계 문서 업데이트

# 10. 금지사항

- UI mock만 만들고 state 연결 안 하는 것 금지
- reducer만 있고 UI 없는 상태를 완료 처리 금지
- 직접 SQL로 workflow state 수정 금지
- Provider QC/approval 무시 금지
- source duration 초과 금지
- Preview 전용 hack과 Final Render 분리 금지
- Roman IX 전용 하드코딩 금지
- Legacy Sado/old editor 의존성 재도입 금지
