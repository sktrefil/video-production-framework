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

각 Scene은 ENTRY 정확히 1개, TARGET 정확히 1개, 필요한 수만큼 ordered MID를 갖고 이전 Clip TARGET → 다음 Clip ENTRY handoff를 유지해야 한다.

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

### 4.4 T060 output authority

`clip_production_spec`와 `prompt_bundle_spec.video_prompts[]`는 동일한 provider/model/duration을 유지해야 한다.

T060 이후 T080은 임의로 provider/model/duration을 다시 선택하지 않는다. 변경이 필요하면 T060 revision으로 돌아가 새로운 Clip 계획과 prompt bundle을 승인한다.

## 5. T060 timing/directing contract

LONGFORM Clip은 measured TTS timeline start/end, editorial duration, generation provider/model/duration, provider source in/out, reveal deadline, narrative deadline, target state deadline, safe trim start, camera path, state image handoff, transition을 분리 기록한다.

핵심 공개는 used-range 시작 후 4초 이내를 목표로 하되, 사실·공간·행동의 자연스러움을 깨면서 맞추지 않는다. START/END는 전체 카메라 경로에서 추출한 상태이며 독립적인 장식 이미지가 아니다.

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
