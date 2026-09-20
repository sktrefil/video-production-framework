# 작업지시서 — P0 Professional Timeline Core

- 대상: `apps/editor`
- 기준 브랜치: `feature/roman-ix-editor-db-assembly`
- 기준 HEAD: `00b537b572937927996d9080857adf29a2e56779`
- 목표: Generic Editor를 실제 편집에 사용할 수 있는 최소 전문 편집기 수준으로 완성한다.
- 중요: P0가 모두 완료되기 전에는 P1/P2 고급 기능을 우선하지 않는다.

## 1. 작업 원칙
1. 기존 `EditProject` / `EditorAction` / `editorReducer` 구조를 재사용한다.
2. 내부 Action/Reducer만 있는 기능은 실제 UI까지 연결한다.
3. 모든 작업은 Undo/Redo + Save/Reload를 통과한다.
4. Drag/Trim/Split은 frame-accurate여야 한다.
5. Provider QC/approval과 canonical Assembly 권한을 우회하지 않는다.
6. Roman IX 전용 하드코딩 금지.
7. Preview/Final 데이터 계약을 분리하지 않는다.

## 2. P0-01 Audio Split UI — 최우선
현재:
- `SPLIT_AUDIO_ITEM`
- `editorActions.splitAudioItem()`
- reducer split 로직 존재
- UI/단축키 없음

작업:
1. 선택된 `TTS|CLIP_AUDIO|BGM|SFX`를 playhead에서 Split.
2. Timeline Toolbar `Split` 버튼.
3. 단축키 `S`.
4. 시작/끝/외부 playhead는 disabled/no-op.
5. collision-free new item ID.
6. split 후 오른쪽 item 선택.
7. History 1 operation.
8. sourceStart/sourceDuration 연속성 검증.
9. Save/Reload 유지.

테스트:
- TTS/BGM/SFX split
- invalid split
- undo/redo
- persistence

## 3. P0-02 Audio Waveform
1. Audio Timeline Item에 waveform 렌더.
2. source window slice 반영.
3. zoom에 따른 peak density.
4. peak cache.
5. load 실패 non-fatal.
6. TTS/CLIP_AUDIO/BGM/SFX 공통.

성능:
- 매 frame 전체 decode 금지.
- 동일 media cache 재사용.

## 4. P0-03 Subtitle Sync Editor
1. 기존 Drag/Trim 유지.
2. Subtitle playhead Split.
3. Adjacent subtitle Merge.
4. ±1/±5 frame nudge.
5. waveform과 동일 timeline 위 timing 비교.
6. overlap warning.
7. safe-zone warning.
8. History/Persistence 연결.

## 5. P0-04 Video Source In/Out Editor
Inspector:
- asset duration
- source in/out
- source used duration
- timeline start/duration
- playback rate
- binding/provenance

작업:
1. source in/out 수정 UI.
2. source bounds clamp.
3. timeline trim과 source trim 관계 명확화.
4. `TRIM_PASS` 승인 window 표시.
5. 원본 대비 현재 사용 비율 표시.

주의:
- 승인 범위를 임의로 확대하지 않는다.
- 승인 범위 밖 변경은 재승인 필요 상태로 처리할 contract부터 정의한다.

## 6. P0-05 Source Usage Policy
정의:
- `QC_TRIM`
- `DESIGNED_DURATION`
- `FULL_SOURCE`

작업:
1. 현재 정책 표시.
2. 정책 변경 UI.
3. 적용 가능/불가능 조건 표시.
4. Provider는 QC guard 통과.
5. 승인 범위 밖 Full Source 자동 적용 금지.
6. Editorial policy 별도 구분.

Acceptance:
- Roman IX에서 “왜 일부만 사용되는가”를 Inspector에서 설명 가능해야 한다.

## 7. P0-06 Video Razor
1. VIDEO split action 추가.
2. audio split helper와 공통화 검토.
3. playbackRate 반영 source 계산.
4. 두 item source window 연속.
5. 오른쪽 item 선택.
6. Undo/Redo/Persistence.

## 8. P0-07 Snap Engine
1. `snapEnabled`, `snapToleranceFrames` 실제 적용.
2. snap resolver 작성.
3. targets: playhead, item edge, subtitle edge, project edge.
4. Shift bypass.
5. snap guide.
6. self-edge 오동작 방지.

## 9. P0-08 Track Controls
Track Header:
- Lock
- Enable/Hide
- Mute
- Solo

작업:
1. track action.
2. reducer.
3. renderer.
4. lock 시 child edit 차단.
5. mute/solo semantics.
6. persistence.

## 10. P0-09 Playback / Keyboard
- Space: Play/Pause
- Left/Right: ±1 frame
- Shift+Left/Right: ±5 frame
- Home/End
- S: Split
- Delete/Backspace
- Ctrl+Z / Ctrl+Y
- input/textarea focus 중 shortcut suppression
- 가능하면 J/K/L

## 11. P0-10 Persistence Regression Gate
자동 검증:
1. Studio load
2. item edit
3. autosave
4. reload
5. draft equality
6. stale canonical fingerprint → quarantine
7. preview/final input contract

## 12. 주요 수정 후보
- `apps/editor/src/studio/editor/StudioEditor.tsx`
- `apps/editor/src/studio/editor/timeline/Timeline.tsx`
- `apps/editor/src/studio/editor/inspector/Inspector.tsx`
- `apps/editor/src/studio/editor/audio/*`
- `apps/editor/src/studio/editor/subtitles/*`
- `apps/editor/src/studio/editor/editorActions.ts`
- `apps/editor/src/studio/editor/editorReducer.ts`
- `apps/editor/src/studio/editor/editorTypes.ts`
- `apps/editor/src/studio/editor/StudioEditorContext.tsx`
- `apps/editor/test/editor-port.test.mjs`

## 13. 완료 보고 형식
```text
P0 STATUS: PASS | PARTIAL | FAIL

Implemented:
- ...

Changed files:
- ...

Tests:
- npm ...
- result ...

Runtime verification:
- Audio Split:
- Waveform:
- Subtitle sync:
- Video source in/out:
- Video split:
- Snap:
- Track control:
- Persistence:

Known limitations:
- ...

Commit:
- <sha>
```

`PARTIAL`을 `PASS`로 보고하지 않는다.
