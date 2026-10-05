# VPF Workflow 1.3 Production Standard

상태: **CANONICAL / 신규 프로젝트 bootstrap 기준**  
Workflow ID: `VPF_PRODUCTION_V1`  
Workflow Version: `1.3`  
적용: `SHORTS`, `LONGFORM`  
갱신: 2026-10-04

이 문서는 Workflow 1.3의 운영 기준을 고정한다. 코드의 `STANDARD_PRODUCTION_WORKFLOW`, production policy 참조, validator 및 회귀 테스트와 함께 적용한다. 문서와 코드가 충돌하면 생산을 계속하지 말고 같은 변경 단위에서 기준과 구현을 함께 수정한다.

## 1. Workflow 1.3 canonical lifecycle

```text
T010 Research / Fact Check
  ↓
T020 Story / Script
  ↓
T025 Pre-TTS Visual Development
  ↓ PRE_TTS_VISUAL_GATE
T030 TTS / Scene Timing / Subtitle
  ↓
T040 Visual Scene Planning
  ↓
T050 State Image Planning
  ↓
T060 Clip / Camera Planning
  ↓
T070 Image Generation / QC
  ↓
T080 Video Clip Generation / QC
  ↓
T090 Editorial Assembly
  ↓
T100 Final Cinematic QC
```

T025는 T020 이후, T030 이전에 실행한다. T030은 T025의 3개 산출물이 모두 활성 상태이고 PRE_TTS_VISUAL_GATE가 PASS인 경우에만 진행한다.

T025 필수 산출물:

- `pre_tts_visual_plan`
- `pre_tts_visual_beat_spec`
- `pre_tts_visual_direction_spec`

HISTORY_MYSTERY의 T025 `style_direction`은 정확한 literal `NON_REALISTIC_STYLIZED`를 포함해야 한다.

## 2. T030 measured timing authority

T030 이후 클립·카메라·이미지·편집 시간의 권위값은 추정 길이가 아니라 실제 TTS 측정값이다.

- Scene별 실제 TTS duration을 저장한다.
- T040/T050/T060은 measured timing을 사용한다.
- T050 state capacity는 실제 TTS 길이에 따라 충분히 확보한다.
- T060 Scene별 Clip editorial duration 합은 해당 Scene 실제 TTS duration과 일치해야 한다.
- TTS 변경 시 T040 이후 시간 의존 산출물을 재검토한다.

## 3. T050 state capacity

LONGFORM에서 영상 생성 Clip 하나의 편집 길이는 10초를 넘기지 않는다.

최소 State 수:

```text
minimum_state_count
= max(2, ceil(measured_tts_duration_sec / 10) + 1)
```

각 Scene은 경계 역할의 ENTRY 정확히 1개, TARGET 정확히 1개, 필요한 수만큼 ordered MID를 갖는다. LONGFORM v2의 CONTINUATION / PREVIOUS_END_FRAME은 이전 Clip TARGET → 다음 Clip ENTRY 동일 바인딩을 유지한다. 명시적 STORY_CUT / ANGLE_CHANGE / FRESH_START는 별도 START 상태를 허용하며, 그에 필요한 MID를 최소 State 수 이상 추가할 수 있다. 상세 규칙은 5절을 따른다.

## 4. T060 mixed video-generation capability policy

Workflow 1.3의 T060/T080은 `VIDEO_GENERATION_CAPABILITY_POLICY_V1`을 필수 production policy로 사용한다.

### 4.1 단일 전역 생성 길이 금지

LONGFORM에서는 프로젝트 전체 고정값을 T060의 권위값으로 사용하지 않는다.

```text
VPF_VIDEO_GENERATION_DURATION_SEC=10
```

각 Clip은 독립적으로 다음 3개를 기록한다.

```text
generation_provider
generation_model
generation_duration_sec
```

`editorial_duration_sec`은 최종 편집에서 사용하는 실제 구간이고 `generation_duration_sec`은 provider가 생성하는 원본 길이다. 생성 길이가 편집 사용 길이보다 짧으면 안 된다.

### 4.2 Workflow 1.3 canonical capability matrix

| Provider | Model | Supported duration | START_ONLY | START_END | PREVIOUS_END_FRAME |
|---|---|---:|---|---|---|
| GEMINI | GEMINI_I2V_10S | 10s | PASS | BLOCK | PASS |
| GOOGLE_FLOW | VEO_3_1_LITE | 4/6/8s | PASS | PASS | PASS |
| GOOGLE_FLOW | VEO_3_1_FAST | 4/6/8s | PASS | PASS | PASS |
| GOOGLE_FLOW | VEO_3_1_QUALITY | 4/6/8s | PASS | PASS | PASS |
| GOOGLE_FLOW | GEMINI_OMNI_FLASH | 4/6/8/10s | PASS | PASS | PASS |

`GEMINI / GEMINI_I2V_10S`은 이 프로젝트에서 사용하는 직접 Gemini I2V 10초 고정 운영 계약이다.

Google Flow의 모델/길이 지원은 외부 서비스 기능이므로 변경될 수 있다. provider UI 또는 공식 문서와 canonical matrix가 달라지면 임의로 새로운 값을 사용하지 않는다. `video-generation-capabilities.ts`와 관련 테스트를 먼저 갱신하고 PASS 후 생산을 재개한다.

### 4.3 T060 provider 선택 규칙

1. 승인된 `directing.image_mode`를 지원하는 provider/model만 후보로 둔다.
2. `directing.source_out_sec`를 포함할 수 있는 지원 길이만 후보로 둔다.
3. 조건을 만족하는 가장 짧은 generation duration을 우선한다.
4. 10초가 필요한 START_ONLY/continuation Clip은 direct Gemini 10초 또는 10초 지원 Flow model을 사용할 수 있다.
5. START_END가 필요하면 현재 프로젝트 계약상 direct Gemini 10초를 선택하지 않고 START_END 지원 Flow model을 사용한다.
6. provider/model/duration 조합이 canonical matrix에 없으면 CLIP_PLAN_GATE를 통과시키지 않는다.
7. 한 프로젝트 안에서 Gemini와 Google Flow를 혼합하는 것은 허용한다.

예:

```text
SC01_CLIP01
generation_provider     = GOOGLE_FLOW
generation_model        = VEO_3_1_FAST
generation_duration_sec = 6
editorial_duration_sec  = 5.4

SC01_CLIP02
generation_provider     = GEMINI
generation_model        = GEMINI_I2V_10S
generation_duration_sec = 10
editorial_duration_sec  = 7.2
```

### 4.4 Directing reference ID contract

`directing.reference_ids`는 T050의 State Image ID나 Scene/Beat/Clip ID를 의미하지 않는다. 프로젝트 DB에 이미 canonical REFERENCE 자산으로 등록되고 `APPROVED`, `ACTIVE`, `stale=0`인 실제 이미지 media ID만 허용한다.

T060 런타임은 승인 reference inventory를 `approved_directing_reference_ids`로 입력한다. 목록에 없는 ID를 모델이 생성하면 저장 전 제거하고, T060 JSON schema도 승인 목록 밖 ID를 허용하지 않는다. 승인 reference가 하나도 없으면 반드시 `reference_ids=[]`를 사용한다.

빈 `reference_ids`는 오류가 아니다. 승인된 지도·라벨·도식 자산이 없다는 이유만으로 T060을 BLOCK하지 않는다. 지리 정보가 필요하면 승인 사실을 유지하면서 동굴·지형·환경·공간 관계 같은 비지도형 단서로 재설계한다. 읽을 수 있는 생성 지도, 라벨, 비문 또는 근거 없는 지리 도식은 금지한다.

Codex1 Success QC는 T060 worker가 같은 upstream 사실·타이밍을 보존한 채 reference 의존성을 제거할 수 있으면 `RETRY`를 사용한다. 정확한 외부 자산이 upstream에서 명시적으로 필수이고 대체 설계가 승인 의미를 바꾸는 경우에만 `BLOCK`한다.

금지 예:

```text
reference_ids = ["SC01-S01"]       # State ID를 reference로 오인
reference_ids = ["SC01"]           # Scene ID
reference_ids = ["CLIP_01"]        # Clip ID
reference_ids = ["some-file.png"]  # media ID가 아닌 filename
```

이 규칙은 T070에서 생성할 State Image와 별개다. T050/T060의 State 연결은 `state_images.entry/mid/target` 필드로 관리하고, `reference_ids`는 이미 승인된 재사용 reference 자산만 고정한다.

### 4.4 T060 output authority

`clip_production_spec`와 `prompt_bundle_spec.video_prompts[]`는 동일한 provider/model/duration을 유지해야 한다.

T060 이후 T080은 임의로 provider/model/duration을 다시 선택하지 않는다. 변경이 필요하면 T060 revision으로 돌아가 새로운 Clip 계획과 prompt bundle을 승인한다.

## 5. T060 timing/directing contract

### 전환별 State binding — LONGFORM v2 (2026-10-05)

Workflow 1.3의 신규 LONGFORM v2 T060은 `directing.transition_in`을 필수로 선언한다. 같은 Scene의 인접 Clip이라고 해서 항상 `previous.target == next.entry`를 강제하지 않는다. `transition_in`은 현재 Clip으로 들어오는 연결이며, 기존 `transition_out`은 나가는 편집 전환이다.

| transition_in | 허용 image_mode | State 연결 | 입력 이미지 |
| --- | --- | --- | --- |
| CONTINUATION | PREVIOUS_END_FRAME | `previous.target == next.entry` 필수 | 바로 앞 같은 Scene의 채택 Clip에서 추출한 실제 used-range 종료 프레임 |
| STORY_CUT / ANGLE_CHANGE / FRESH_START | START_ONLY / START_END | `previous.target`와 `next.entry` 분리 허용 | 다음 Clip의 START 구도로 생성한 이미지 |

- CONTINUATION은 바로 앞 Clip의 `previous_clip_id`와 한·영 `continuation`을 요구한다. 첫 Clip이나 다른 Scene에서 이어받을 수 없다. 계획 TARGET 스틸로 실제 종료 프레임을 대체하지 않는다.
- 새 컷은 `previous_clip_id=null`, `continuation=null`이며 PREVIOUS_END_FRAME을 사용할 수 없다. START_END는 선택 provider/model의 endpoint 지원이 필요하다. END 설계 상태는 모든 모드에서 유지한다.
- T050의 ENTRY/MID/TARGET은 Scene 경계·중간 역할이고, T060의 START/END는 Clip 바인딩이다. Scene 내부 MID도 독립 Clip START가 될 수 있다. 예: C1은 S1(ENTRY)→S2(MID), ANGLE_CHANGE인 C2는 S3(MID)→S4(TARGET).
- T050은 새 컷에 필요한 별도 START 상태를 계획한다. minimum_state_count는 하한이며 별도 START를 위해 상태를 추가할 수 있다. 분리한 START는 이전 TARGET보다 뒤의 sequence_order를 갖고, 각 Clip의 entry < mid < target 순서와 같은 Scene 소속 검증을 유지한다.
- T060은 승인된 T050 State ID만 참조한다. 필요한 START가 없으면 T050 수정·승인 후 T060을 재작성하며, 임의 ID 생성이나 승인 상태의 자동 변경으로 해결하지 않는다.
- Compiler V2는 새 컷의 START 카드로 이미지 프롬프트를 만들고, 영상 프롬프트에 새 START 또는 실제 종료 프레임 상속을 구분한다. 전환 메타데이터는 기존 revision/hash에 포함한다. T070 이미지 범위와 T080 실제 프레임 provenance 검증도 유지한다.
- `transition_in`이 없는 기존 카드와 legacy/SHORTFORM은 기존 exact-chain 규칙을 유지한다. outgoing HARD_CUT/GRAPHIC_MATCH나 서술 문구만으로 연결 검사를 우회하지 않는다. 바인딩 변경은 새 revision 및 기존 downstream 무효화·관리자 게이트를 거친다.

세부 구현 계약은 [DIRECTING_V2_IMPLEMENTATION.md](DIRECTING_V2_IMPLEMENTATION.md)의 incoming Clip boundary 절을 따른다.

LONGFORM Clip은 measured TTS timeline start/end, editorial duration, generation provider/model/duration, provider source in/out, reveal deadline, narrative deadline, target state deadline, safe trim start, camera path, state image handoff, transition을 분리 기록한다.

핵심 공개는 used-range 시작 후 4초 이내를 목표로 하되, 사실·공간·행동의 자연스러움을 깨면서 맞추지 않는다. START/END는 전체 카메라 경로에서 추출한 상태이며 독립적인 장식 이미지가 아니다.

### 5.1 T050 provisional state / T060 production authority

LONGFORM v2에서 T050 State Image 문장은 **provisional design context**다. 실제 생성용 START/END/video prompt의 권위는 T060 `directing`과 `DIRECTING_PROMPT_COMPILER_V2` 결과다.

따라서 과거 T050 State에 지도·site marker 같은 요소가 남아 있더라도 T060이 이를 실제 directing/prompt에서 제거하고 State ID·순서·handoff 의미만 보존했다면 그 옛 문구만으로 T060을 RETRY/BLOCK하지 않는다.

반대로 현재 T060 directing/provider prompt가 다음을 실제 생성하라고 지시하면 deterministic validation에서 실패한다.

```text
readable place/person names
dates / years
labels / captions
maps
site markers / location markers
읽히는 지명·이름·날짜·연도·라벨·캡션
지도·사이트 마커·위치 마커
```

지리는 승인된 cartographic reference가 없으면 동굴·지형·환경·공간 관계 같은 비지도형 단서로 표현한다. 이 금지 규칙은 T050 신규 State 설계에도 동일하게 적용한다.

### 5.2 Camera rhythm normalization

Workflow 1.3은 동일한 `camera.movement`가 4개 이상 연속되는 T060 계획을 허용하지 않는다. T060 생성기는 모든 sliding 4-Clip window를 자체 점검해야 하며, 앞 3개와 동일한 movement가 네 번째에 반복되면 narrative purpose와 경로 의미를 보존하는 가까운 대체 movement로 교정한다.

현재 deterministic repair는 의미가 가까운 movement pair만 사용한다.

```text
LATERAL_TRACK <-> LATERAL_TRACK_WITH_SUBTLE_PUSH
SLOW_PUSH <-> SUBJECT_FOLLOW
SLOW_PULL_BACK <-> SUBTLE_CRANE
FOREGROUND_REVEAL -> LATERAL_TRACK_WITH_SUBTLE_PUSH
```

이 보정은 `CAMERA_RHYTHM_REPETITION` gate를 약화하지 않는다. 보정 후에도 validator가 동일 규칙으로 최종 검사한다. shot-size pattern과 transition repetition은 별도 gate를 그대로 유지한다.

## 6. Gate rules

`CLIP_PLAN_GATE`는 최소한 다음을 차단한다.

- Scene TTS를 완전히 덮지 못하는 Clip 합
- 10초 초과 editorial Clip
- provider/model 불일치
- provider가 지원하지 않는 generation duration
- generation duration보다 긴 editorial/source range
- provider가 지원하지 않는 image mode
- within-scene state handoff 불일치
- 필수 camera/directing field 누락
- factuality/continuity 위반

`T080 VIDEO_CLIP_GENERATION_QC`는 T060에서 승인된 provider/model/duration을 실행 계약으로 상속한다.

### 6.1 T070 ChatGPT Browser CDP auto-start

T070의 ChatGPT Browser 이미지 생성은 로컬 Chrome CDP가 꺼져 있다는 이유만으로 provider retry를 소비하지 않는다.

기본 CDP endpoint는 `http://127.0.0.1:9222`다. IMAGE provider adapter는 worker 실행 전에 endpoint를 probe하고, 연결되지 않으면 기본적으로 설치된 Chrome 또는 Chromium 기반 Edge를 찾아 VPF 전용 영속 프로필로 자동 실행한다.

```text
CDP unavailable
  → installed Chrome/Edge discovery
  → --remote-debugging-port=9222
  → persistent VPF ChromeCDP user-data-dir
  → wait for /json/version READY
  → start ChatGPT browser worker
  → continue T070
```

Windows 기본 프로필은 `%LOCALAPPDATA%\\VPF\\ChromeCDP`다. 이 프로필은 다음 실행에도 재사용하므로 최초 한 번 ChatGPT 로그인이 필요할 수 있다. 로그인, captcha, usage-limit은 우회하지 않고 기존 browser-worker gate로 명시적으로 실패한다.

운영 환경 변수:

```text
CHATGPT_CDP_URL                  # default http://127.0.0.1:9222
CHATGPT_AUTO_LAUNCH_BROWSER      # default true; 0/false/off이면 자동 실행 금지
CHATGPT_BROWSER_EXECUTABLE       # Chrome/Edge 실행 파일을 명시적으로 고정
VPF_CHROME_EXECUTABLE            # alternate explicit executable
CHATGPT_CDP_USER_DATA_DIR        # 영속 브라우저 프로필 경로
CHATGPT_CDP_START_TIMEOUT_MS     # 자동 실행 후 CDP READY 대기, default 20000ms
```

Chrome 프로세스가 없거나 9222 포트가 열려 있지 않은 것은 복구 가능한 런타임 조건이다. 브라우저 실행 파일 자체가 설치되어 있지 않으면 임의 설치하지 않고 명확한 configuration error로 실패한다.

## 7. 신규 프로젝트 bootstrap 요구사항

새 프로젝트는 Workflow 1.3 11-task bootstrap을 사용해야 한다.

```text
workflow_version = 1.3
tasks            = 11
T025 exists
T030 depends_on T025
T060 policy includes VIDEO_GENERATION_CAPABILITY_POLICY_V1
T080 policy includes VIDEO_GENERATION_CAPABILITY_POLICY_V1
```

Doctor 또는 회귀 테스트에서 하나라도 불일치하면 신규 생산을 시작하지 않는다.

## 7.1 Exhausted T060 resume policy

T060은 provider/reference/camera-rhythm 또는 Codex1 Success QC에서 수정이 반복될 수 있다. 최대 3 attempt를 모두 사용했더라도 `REVISION_REQUIRED` T060은 명시적 `--resume-current-attempt`으로 현재 attempt를 재사용할 수 있다. 이전 T060 산출물이 이미 저장되어 있어도, 운영자가 명시적으로 `workflow revise ... T060` 후 resume을 선택한 경우 새 결과가 성공적으로 저장될 때까지 이전 revision을 보존한 채 같은 attempt를 재실행한다.

이 방식은 attempt 4를 생성하지 않는다. 기존 attempt 번호와 runtime history를 보존하면서 수정된 코드·정책으로 같은 T060 attempt를 재실행한다.

운영 순서:

```text
workflow revise <project> T060
agent3 run <project> --resume-current-attempt
```

이 예외는 자동으로 attempt를 늘리거나 기존 revision을 삭제하지 않는다. 명시적 operator revision + resume 조합에서만 동작한다.

최신 manager review가 RETRY인 경우에만 revision directive를 전달한다. review.attempt가 currentAttempt 또는 currentAttempt - 1이면 유효하다. 따라서 attempt 3에서 받은 RETRY는 같은 attempt 3 resume에도 전달된다. 최신 BLOCK은 이전 RETRY로 대체하거나 자동 재사용하지 않는다.

### T060 deterministic text gate와 QC authority

`story`, `action`, `space`, `start`, `subject_motion`, `camera_path`, `reveal`, `end`, `handoff` 양언어 필드의 긍정 생성 지시를 `DIRECTING_READABLE_TEXT_OR_MAP_FORBIDDEN`으로 차단한다. `Do not display readable labels`, `No map or generated text`, `Avoid readable dates and captions`와 risk/fallback 금지 설명은 허용한다. 금지 설명 뒤 별도 절에 있는 실제 생성 지시는 여전히 차단한다. Compiler V2도 이 검사를 수행한다.

QC는 approved Story/Fact → measured TTS → T050 State identity/order/bindings/handoff를 보존하고, 실제 화면은 T060 directing 및 compiled provider prompt로 판단한다. T050의 과거 composition prose만으로 RETRY/BLOCK하지 않는다. 현재 출력의 지도·문자·마커·reference·카메라·공간 상세·provider/model/duration 문제를 worker가 수정할 수 있으면 RETRY다. 정확한 필수 upstream evidence/identity/reference/configuration이 없거나 Story/Fact/TTS의 권위 있는 변경이 필요할 때만 BLOCK한다.

State ID는 `state_images.entry/mid/target`, canonical media ID는 `directing.reference_ids`, 생성 설정은 `generation_provider/model/duration_sec`에만 사용한다. 이미지 prompt가 없는 PREVIOUS_END_FRAME 클립도 reference의 승인 상태, 파일 경로 및 checksum 검사를 통과해야 저장된다.

## 8. Regression requirements

`npm run check:workflow-v13`은 Workflow 1.3의 구조적 기준을 보호한다.

최소 회귀 항목:

- 11-task bootstrap
- T025 → PRE_TTS_VISUAL_GATE → T030 dependency
- T025 3-artifact persistence
- HISTORY_MYSTERY `NON_REALISTIC_STYLIZED` contract
- measured TTS handoff
- T050 state split capacity
- T060/T080 `VIDEO_GENERATION_CAPABILITY_POLICY_V1`
- Gemini direct 10s capability
- Flow 4/6/8 capability
- Flow Omni 4/6/8/10 capability
- unsupported provider/model/duration rejection
- START_END provider capability validation
- LONGFORM v2 incoming transition별 State binding, fresh START 이미지 및 legacy exact-chain 호환 검증
- runtime history/revision safety

## 9. Source-of-truth files

```text
packages/production-spec/src/workflow-orchestrator.ts
packages/production-spec/src/video-generation-capabilities.ts
packages/production-spec/src/clip-production-validator.ts
packages/production-spec/src/directing.ts
packages/production-spec/src/agent3-instructions.ts
cli/vpf/src/agent3-runtime-adapter-service.ts
cli/vpf/src/agent3-runtime-schemas.ts
tests/workflow-v13.test.mjs
```

이 문서를 변경하는 경우 위 구현 및 회귀 테스트도 같은 변경 단위에서 정합성을 유지해야 한다.
