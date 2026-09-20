# LONGFORM Multi-Agent Production Master Design

> Status: **FINAL / Architecture Freeze Candidate v1.0**  
> Scope: `video-production-framework` LONGFORM production path  
> Implementation baseline: `e149df6e8665093a546d9af79ac0ba838f71f63b`  
> Format authority: `LONGFORM_16X9_V1@1.0.0`  
> Channel profile baseline: `HISTORY_MYSTERY_V1@1.5.0`

---

## 1. 목적

이 문서는 신규 LONGFORM 프로젝트를 Codex 중심 Multi-Agent 방식으로 계획, 제작, 검증, 편집, 렌더하는 전체 기준을 정의한다.

이 문서는 다음 항목의 최상위 기준이다.

- Agent1 / Agent2 / Agent3 역할과 권한
- LONGFORM 16:9 제작 규격
- Script → Story → Scene → TTS → Subtitle → Image → Clip → Editor → Render 흐름
- GPT 이미지 생성용 Prompt / Reference handoff
- Section TTS 비병합 구조
- QC / Retry / Regenerate / Redesign 규칙
- canonical state와 revision/stale 처리
- 실제 Pilot 진입 조건

이 문서와 코드가 충돌할 경우 Pilot을 진행하지 않고 차이를 먼저 해결한다.

---

## 2. 비협상 원칙

### 2.1 LONGFORM은 16:9이다

LONGFORM은 세로 9:16 제작 규칙을 사용하지 않는다.

- Editor / Final Render: **1920 × 1080**
- Aspect Ratio: **16:9**
- Image generation runtime: **1536 × 864**
- FPS: Format Profile 기준
- Safe Area / Subtitle envelope / Delivery 규격: `LONGFORM_16X9_V1` 기준

LONGFORM 경로에서는 다음 SHORTFORM 전용 규칙을 사용하지 않는다.

- 9:16 central 60~70% composition rule
- vertical top/bottom crop continuity
- Shorts persistent header 정책
- Shorts subtitle sizing
- Shorts safe-area percentage hardcoding

### 2.2 이미지는 API 생성 설계를 사용하지 않는다

이미지 제작의 canonical 방식은 다음과 같다.

```text
Agent3
  → Scene 분석
  → Visual Bible 확인
  → Reference 선택
  → 완성된 GPT Image Prompt Package 작성

GPT
  → Prompt + Reference를 받아 이미지 생성

Agent1
  → 결과 QC 및 승인/재작업 판정
```

Browser automation은 **전송 계층**이다.

Browser adapter는 다음을 해서는 안 된다.

- Agent3 Prompt에 스타일 문구 임의 추가
- Safe Area 문구 임의 추가
- Roman / 특정 Pilot 테마 삽입
- Prompt 의미 변경
- Reference 의미 재해석

### 2.3 project.db가 유일한 canonical production state다

`project.db`가 프로젝트 상태의 진실의 원본이다.

다음 파일은 canonical state가 아니다.

- `jobs/*.json`
- `logs/*`
- Agent 작업 메모
- Prompt 초안
- 임시 STATUS 파일

이들은 Work Order, 실행 증빙, 결과 보고, 디버깅 로그로만 사용한다.

### 2.4 Worker는 자기 작업을 최종 승인하지 않는다

- Agent2: self-QC 가능, 최종 Gate 승인 불가
- Agent3: self-QC 가능, 최종 Asset/Stage 승인 불가
- Agent1: 통합 QC와 Stage Gate 최종 권한 보유

---

## 3. Agent Architecture

### 3.1 Agent1 — Production Manager / Director / Final Gate

Agent1은 메인 Codex thread다.

책임:

- 프로젝트 생성 및 생산 계획 수립
- Agent2 / Agent3 작업 분배
- dependency와 실행 순서 관리
- canonical project state 변경
- cross-artifact QC
- revision / stale 영향 판단
- 재작업 지시
- Stage Gate 승인
- Editor / Render / Final output 진입 승인

Agent1만 canonical approval/gate state를 전진시킨다.

판정값의 기본 의미:

- `PASS`: 다음 단계 진입 가능
- `REVISION_REQUIRED`: 같은 단계 Worker 수정
- `REGENERATE`: Prompt revision 후 이미지 재생성
- `REDESIGN`: Scene/Visual 설계 단계까지 복귀
- `BLOCKED`: 자동 진행 중지, Manager 재판단

### 3.2 Agent2 — Story / Audio Worker

소유 범위:

- `01_research`
- `02_script`
- `03_tts`

책임:

- 조사 및 사실/해석/추정 구분
- Script 작성
- Chapter / Sequence / Scene 설계
- LONGFORM TTS Section 설계
- ElevenLabs TTS
- Section Alignment
- Subtitle 생성
- Story / Audio self-QC

최종 프로젝트 Gate는 승인하지 않는다.

### 3.3 Agent3 — Visual / Prompt / Clip Worker

소유 범위:

- `04_visual_identity`
- `05_images`
- `06_clips`의 시각 설계와 Prompt

책임:

- Visual Identity
- Scene visual intent
- Reference selection
- GPT Image Prompt Package
- Image continuity self-QC
- Clip design
- I2V / Video Prompt
- Visual regeneration/redesign 작업

최종 Asset/Project Gate는 승인하지 않는다.

### 3.4 병렬 실행 조건

Research / Story 승인 전에는 Worker 병렬화를 최소화한다.

정식 병렬 시작점:

```text
Agent1 STORY GATE PASS
        ↓
 ┌───────────────┬───────────────┐
 │               │
Agent2          Agent3
TTS/Subtitle    Visual/Image
```

Agent2와 Agent3가 동시에 `project.db`를 승인 상태로 변경하는 구조는 사용하지 않는다.

---

## 4. Project Bootstrap

신규 LONGFORM 프로젝트는 다음 기준을 사용한다.

```text
format          = LONGFORM
format profile  = LONGFORM_16X9_V1@1.0.0
channel profile = HISTORY_MYSTERY_V1@1.5.0
```

기본 디렉터리:

```text
01_research/
02_script/
03_tts/
04_visual_identity/
05_images/
06_clips/
07_audio/
08_editor/
09_render/
10_publish/
jobs/
logs/
```

프로젝트 생성 후 pinned resources가 예상 버전과 일치하지 않으면 생산을 시작하지 않는다.

---

## 5. 전체 Production Lifecycle

```text
TITLE
  ↓
Agent1 Project Setup
  ↓
Agent2 Research
  ↓
Agent2 Script
  ↓
Agent1 SCRIPT GATE
  ↓
Agent2 Chapter / Sequence / Scene
  ↓
Agent1 STORY GATE
  ↓
 ┌──────────────────────────────┐
 │                              │
Agent2                         Agent3
TTS Section Plan              Visual Identity
Section TTS                   Reference Set
Alignment                     GPT Image Prompt
Subtitle                      GPT Image Generation
 │                              │
 └──────────────┬───────────────┘
                ↓
              Agent1
          INTEGRATION QC
                ↓
     PASS / REWORK / BLOCK
                ↓
Agent3 Clip Design / Video Prompt
                ↓
External Video Generation / Import
                ↓
Agent1 Clip QC
                ↓
Editor Assembly
                ↓
Final Render
                ↓
Final Output QC
                ↓
Publish Handoff
```

---

## 6. Story / Scene Gate

TTS와 최종 이미지 Prompt는 승인된 Scene graph를 기준으로 한다.

순서:

```text
FINAL Script
→ Chapter
→ Sequence
→ Scene
→ Agent1 Story Gate
→ TTS / Visual fan-out
```

Scene에는 최소한 다음이 추적 가능해야 한다.

- Scene ID
- Sequence ID
- Script revision
- Script segment
- primary visual idea
- must-be-seen 요소
- required identity anchor
- Scene revision
- approval state

Script 변경으로 Scene provenance가 달라진 경우 기존 downstream artifact를 무조건 전부 폐기하지 않는다. 영향받는 dependency만 stale 처리한다.

---

## 7. LONGFORM TTS V2

### 7.1 원칙

LONGFORM Narration은 **SEGMENTED** 모드다.

전체 Section을 하나의 최종 `narration.mp3`로 합치지 않는다.

기본 Section 단위는 Sequence다.

```text
Sequence 01
  Scene 01
  Scene 02
  Scene 03
      ↓
section_001.mp3

Sequence 02
  Scene 04
  Scene 05
      ↓
section_002.mp3
```

### 7.2 4,000자 제한

ElevenLabs 요청 한도는 현재 profile 기준 4,000자다.

Sequence가 4,000자를 넘으면 **Scene 경계에서만** 추가 Section으로 나눈다.

한 Scene 자체가 4,000자를 넘으면 TTS 내부에서 임의 절단하지 않는다.

```text
Scene > 4000 chars
→ STORY GATE로 복귀
→ Scene 분할
```

### 7.3 출력 구조

```text
03_tts/
  sections/
    section_001.mp3
    section_002.mp3
    section_003.mp3
  alignment/
    section_001.json
    section_002.json
    section_003.json
  narration_manifest.json
  subtitle-cues.json
  subtitles.srt
  tts_metadata.json
  resolved_voice_profile.json
```

### 7.4 Narration Manifest

각 Section은 최소 다음 provenance를 가진다.

- section ID
- index
- sequence ID
- scene IDs
- text SHA256
- audio path
- audio SHA256
- duration
- alignment path
- alignment SHA256
- provider request IDs

Architecture v1에서는 현재 FINAL Script revision 또는 승인된 Scene 집합이 바뀌면 기존 SEGMENTED TTS Plan 전체를 current 상태로 재사용하지 않는다. 새 Plan을 준비하고 Section 음성을 다시 생성한다. 기존 Section 파일/Result는 revision provenance를 위해 보존되지만, **변경되지 않은 Section 음성을 새 Plan에 자동 재사용하는 기능은 v1 Freeze 범위가 아니다.** 이 기능을 추가하려면 Architecture Change 절차를 거친다.

---

## 8. Subtitle / Global Timeline

Subtitle은 Section별 Alignment에서 생성한다.

각 Section 내부에서는 local time을 사용한다.

```text
Section 1 local 0~18s
Section 2 local 0~19s
Section 3 local 0~17s
```

Editor handoff 전에 cumulative offset을 적용한다.

```text
Section 1 → global 00~18
Section 2 → global 18~37
Section 3 → global 37~54
```

각 Subtitle cue는 생성 원본 TTS Section placement ID를 유지한다.

```text
generatedFromAudioPlacementIds = [tts-section-002]
```

완료된 SEGMENTED Result 내부에서는 Section duration을 기준으로 이후 Section의 global timeline offset을 결정한다. 새로운 TTS Result가 들어오면 Subtitle/Editor offset은 다시 계산한다. 단, Architecture v1은 Script/Scene provenance가 바뀐 Plan 사이에서 unchanged Section audio를 자동 재사용한다고 보장하지 않는다.

---

## 9. Editor A1 자동배치

LONGFORM Editor의 A1은 여러 TTS Item을 순차적으로 받는다.

```text
A1
├─ tts-section-001
├─ tts-section-002
├─ tts-section-003
└─ ...
```

각 Item:

- type = `TTS`
- track = `A1`
- sourceIn = 0
- duration = Section duration
- timelineStart = 이전 Section 누적 duration

Subtitle은 T1에 global timestamp로 배치한다.

Video source audio는 narration과 섞지 않고 A2에서 별도 관리한다.

- A1 = Narration
- A2 = Clip / source audio
- A3 = BGM
- A4 = SFX

---

## 10. Visual Bible / Reference System

Reference 선택 우선순위:

```text
Approved Scene
→ Visual Bible
→ GLOBAL_VISUAL
→ KNF layout metadata
→ Project continuity references
→ final reference package
```

### 10.1 GLOBAL_VISUAL

GLOBAL_VISUAL은 의미 기반 역할을 가진다.

예:

- `COMPOSITION_GRAMMAR`
- `ATMOSPHERE_GRAMMAR`
- `NARRATIVE_GRAMMAR`
- `MYSTERY_CLOSURE_GRAMMAR`

파일명 자체로 역할을 하드코딩하지 않는다.

### 10.2 KNF

KNF는 편집/레이아웃 기능 metadata다.

다음과 같은 일반 서사 beat 기준으로 사용한다.

- HOOK
- CONTEXT
- EVIDENCE
- REVEAL
- OBJECT
- MAP
- CLOSE

특정 Roman / Legion / Britain 키워드를 공통 LONGFORM 선택 규칙으로 사용하지 않는다.

### 10.3 Project Reference 승격

생성 이미지라고 모두 Reference가 되는 것은 아니다.

Agent1 승인 후 다음과 같은 continuity-critical asset만 Project Reference로 승격한다.

- recurring character
- recurring location
- critical prop
- canonical costume / appearance anchor

---

## 11. GPT Image Prompt Package

Agent3는 GPT로 보내기 전에 완성된 Package를 만든다.

권장 구성:

```text
1. GLOBAL VISUAL BIBLE
2. Reference Usage Contract
3. Scene Purpose
4. Essential Visible Elements
5. Composition
6. Historical / factual constraints
7. Continuity requirements
8. Negative constraints
9. LONGFORM horizontal 16:9 requirement
10. Exact reference inventory and roles
```

Browser automation은 이 Package를 그대로 전달한다.

---

## 12. Image Revision / Failure Model

세 가지 실패를 분리한다.

### RETRY

기술 실패다.

예:

- browser timeout
- upload failure
- transient execution error

행동:

- 동일 Prompt
- 동일 Reference
- 동일 creative revision

### REGENERATE

이미지 품질 실패다.

예:

- 필수 요소 누락
- 인물 오류
- 잘못된 구도
- style/reference mismatch

행동:

```text
Agent1 correction
→ Agent3 prompt revision
→ GPT regeneration
```

동일 Prompt를 그대로 다시 보내는 것은 Creative Regenerate가 아니다.

### REDESIGN

장면 설계 자체가 잘못된 경우다.

행동:

```text
Image
→ Scene/Visual Intent
→ redesign
→ new prompt
→ generation
```

Creative attempt는 기본적으로 v1/v2/v3까지 수행하고, 반복 실패 시 Agent1이 BLOCKED로 전환해 원인을 다시 판단한다.

---

## 13. Image Aspect Ratio Policy

LONGFORM 이미지는 Prompt 단계부터 horizontal 16:9를 요구한다.

생성 결과:

- 16:9 정상 → resize 가능
- 근소한 차이 → 최소 보정 가능
- 큰 비율 차이 → **강제 center crop 금지**, REGENERATE

파일 규격만 맞고 의도한 composition이 파괴되는 결과를 정상 Asset으로 승인하지 않는다.

---

## 14. Image QC

### 14.1 Scene QC

Agent1은 최소 다음을 검증한다.

- Scene purpose 충족
- must-be-seen 충족
- factual constraints
- Reference adherence
- identity consistency
- 구조적 오류 / artifact
- unwanted text
- LONGFORM composition
- aspect ratio

### 14.2 Sequence Continuity QC

개별 Scene PASS 이후 Sequence 단위 검사를 수행한다.

검증:

- character identity
- wardrobe
- geography
- architecture
- lighting flow
- weather/time continuity
- palette
- framing variation
- repeated composition
- adjacent-scene visual continuity

개별 이미지가 좋아도 Sequence 전체의 continuity를 깨면 PASS하지 않는다.

---

## 15. Clip / Video Production

이미지 승인 이후 Agent3가 Clip / Video Prompt를 설계한다.

Agent3 책임:

- start/end visual intent
- transition method
- camera motion
- subject/environment motion
- continuity constraints
- I2V prompt
- negative prompt

실제 외부 영상 생성 방식은 현재 provider profile의 `MANUAL_EXTERNAL` 계약을 따른다.

생성 결과는 Framework로 다시 import한 뒤 Agent1 Clip QC를 통과해야 Editor로 이동한다.

---

## 16. LONGFORM Header / Subtitle Design

### 16.1 Header

LONGFORM의 **persistent header 기본값은 OFF**다.

Header를 명시하지 않아도 LONGFORM Editor Assembly가 가능해야 한다.

명시적인 LONGFORM title이 있을 경우:

- opening title로만 사용
- 기본 최대 3초
- 영상 전체에 지속하지 않음

Chapter / Info label은 필요한 지점에서만 별도 overlay로 사용한다.

SHORTFORM persistent header 정책은 별도 유지한다.

### 16.2 Subtitle

LONGFORM은 전용 subtitle preset을 사용한다.

SHORTFORM subtitle preset을 LONGFORM에 재사용하지 않는다.

Subtitle safe area는 Format Profile과 LONGFORM preset을 기준으로 한다.

---

## 17. Stale / Dependency Policy

수정 시 전체 프로젝트를 무조건 재생성하지 않는다.

예:

```text
Scene 07 script changed
↓
Story impact 분석
↓
영향받는 Scene/Image/Clip dependency stale
↓
현재 SEGMENTED TTS Plan/Result는 FINAL Script 또는 승인 Scene provenance mismatch로 Editor 진입 차단
↓
새 TTS Plan 생성 및 Section TTS/Alignment/Subtitle 재생성
↓
영향받지 않은 Image/Clip은 dependency가 유지되면 보존
```

영향이 없는 Scene / Image / Clip은 dependency가 유지되면 보존한다.

TTS는 Architecture v1에서 Plan 단위 currentness를 사용한다. FINAL Script revision 또는 승인 Scene 집합이 변경되면 Editor Assembly는 기존 TTS를 거부하고 새 SEGMENTED Plan/Result를 요구한다. Section별 파일과 hash provenance는 유지되지만, cross-plan selective audio reuse는 v1의 필수 기능이 아니다.

---

## 18. Revision / Provenance

삭제·덮어쓰기보다 revision을 우선한다.

최소 추적 대상:

- Script revision/hash
- Scene revision
- TTS Plan revision
- TTS Section text hash
- Audio hash
- Alignment hash
- GPT Prompt revision/hash
- Reference hash
- generated image Asset revision
- Media Artifact ID/hash
- Clip revision
- Editor content plan revision
- Timeline assembly revision
- Final render hash

Creative regeneration에서 이전 Prompt / Image attempt를 잃지 않는다.

---

## 19. Editor / Render

Editor Assembly는 DB-derived canonical project를 사용한다.

LONGFORM 기준:

- Canvas: 1920×1080
- A1: segmented narration
- A2: clip/source audio
- A3: BGM
- A4: SFX
- T1: subtitle
- additional text/graphics: content plan 기준

Final Render:

- approved canonical assembly lineage 확인
- H.264 / AAC / yuv420p 기준
- Format Profile delivery 규칙 확인
- output technical QC 통과 후 Delivery Ready

---

## 20. SHORTFORM Compatibility

LONGFORM 변경으로 기존 SHORTFORM을 깨뜨리지 않는다.

SHORTFORM은 다음을 유지할 수 있다.

- SINGLE narration
- `03_tts/narration.mp3`
- SHORTFORM header preset
- 9:16 Format Profile
- SHORTFORM subtitle preset

공통 Domain이 확장되더라도 기존 SINGLE reader/writer는 backward compatible해야 한다.

---

## 21. CI / Test Gate

실제 LONGFORM Pilot은 다음 조건을 모두 만족해야 한다.

```text
validate Node 22    PASS
validate Node 24    PASS
E2E                 PASS
pilot-readiness     PASS
```

LONGFORM E2E가 검증해야 하는 최소 계약:

- LONGFORM project bootstrap
- approved Scene graph
- SEGMENTED TTS plan
- multiple Section MP3
- Section Alignment
- narration_manifest
- global Subtitle timeline
- multiple A1 TTS placements
- T1 subtitle provenance
- clip/source audio A2
- 16:9 Editor project
- Render
- Final output / publish handoff

현재 Architecture Freeze baseline `e149df6e8665093a546d9af79ac0ba838f71f63b`에서 위 CI는 모두 PASS했다.

---

## 22. Pilot 진입 조건

실제 신규 콘텐츠 Pilot 전에 Agent1은 다음을 확인한다.

1. 현재 branch가 Architecture Freeze 기준 이상인가
2. working tree / migration 상태가 정상인가
3. resource pins가 canonical profile인가
4. Node / ffmpeg / provider environment readiness가 정상인가
5. GPT browser image transport가 사용 가능한가
6. TTS credentials/runtime가 정상인가
7. CI가 Green인가

하나라도 BLOCK이면 Pilot을 시작하지 않는다.

---

## 23. Architecture Freeze / 변경 관리

이 문서가 승인된 이후 구조 변경은 다음 절차를 따른다.

```text
Change proposal
→ 영향 분석
→ Design revision
→ code implementation
→ unit/integration/E2E
→ Agent1 architecture review
→ new freeze baseline
```

다음 항목은 단순 구현 편의로 변경할 수 없다.

- LONGFORM 16:9
- segmented narration non-merge
- GPT prompt-driven image generation
- Agent1 final gate
- project.db canonical state
- Worker self-approval 금지
- provenance / revision preservation
- CI Green before Pilot

---

## 24. 현재 구현 매핑

주요 구현 위치:

- Agent rules: `AGENTS.md`, `.codex/agents/*`
- Project bootstrap: `packages/project-bootstrap`
- Story: `packages/story`
- TTS domain/runtime: `packages/tts-generation`
- ElevenLabs runtime: `runtimes/elevenlabs`
- Visual / Scene Asset: `packages/scene-assets`
- Reference selector: `packages/reference-library`
- GPT browser transport: `runtimes/image/adapters`
- Media binding: `packages/media-binding`
- Editor timeline: `packages/editor-timeline`
- Canonical Editor Assembly: `cli/vpf/src/editor-assembly-service.ts`
- Final render: `packages/final-render`
- Final output / publish: `packages/final-output`
- Unified LONGFORM/SHORTFORM E2E: `tests/e2e/unified-project`
- Architecture conformance checks: `cli/vpf/test/architecture-freeze.test.ts`

---

## 25. 최종 기준

신규 LONGFORM의 production contract는 다음 한 줄로 요약한다.

> **승인된 Story를 기준으로 Agent2가 분할 음성/자막을 만들고 Agent3가 Reference-aware GPT 이미지/영상 Prompt를 만들며, Agent1이 모든 결과의 provenance와 cross-artifact 품질을 검증한 뒤 16:9 Editor/Render 단계로 전진시킨다.**

이 문서는 LONGFORM Multi-Agent Production Architecture v1.0의 최종 기준으로 사용한다.
