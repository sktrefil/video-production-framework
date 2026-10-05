# 4단계: T060 재개 판단

대상: `neanderthal_oase1_longform_v13_001`. 이 문서는 실행 계획이며 실제 재개·승인·DB 변경은 수행하지 않았다.

## 결정

현재 T060 REVISION_REQUIRED, attempt=3, 최신 관리자 RETRY를 근거로 **현재 attempt 3의 T060 한 단계만 재개**하는 방식이 적합하다. T070은 관리자 승인과 현재 GENERATION_READY_GATE PASS 이전에 시작하지 않는다. 기존 clip/prompt revision 3은 수정 성공 전까지 보존한다. 새 revision 생성과 attempt 증가는 다른 개념이다.

## 차단 원문 검토

| 클립 | 필드 | 확인 및 수정 방향 |
|---|---|---|
| SC01-C02 | reveal | `Typeset any question text in editing.` 편집 지시지만 reveal이 provider 영상 프롬프트에 그대로 삽입된다. 생성 지시는 오른쪽 빈 질문 공간 공개까지만 둔다. |
| SC01-C02 | handoff | `next scene's place and date presentation`은 직접 생성 명령이 아니다. 검사기가 명사 place를 동사로 해석한 과탐 가능성이 있다. 장소·연대의 의미는 유지하면서 다음 동굴 공간으로 이어지는 화면 연결을 구체적으로 쓴다. |
| SC02-C02 | story | `Show the broad date range`는 연대 표기를 화면 생성 요구로 읽을 수 있다. 사실적 목적과 생성할 비문자 구도를 구분한다. |
| SC02-C02 | reveal | `Display ... date range through separate editorial typesetting`은 편집 조판 지시가 생성 프롬프트로 유입된다. 빈 편집 영역과 뼈의 비문자 시각 공개만 기술한다. |
| SC06-C01 | reveal | `typeset both case names separately`를 생성 지시에서 제외하고, 두 사례를 구별하는 비지도형 공간 및 동등한 화면 비중을 기술한다. |
| SC08-C02 | reveal | `separately typeset ... 40,000 years ago`를 생성 지시에서 제외하고, 화석 기록의 끝과 지속되는 유전 흔적의 구분을 비문자 시각 변화로 표현한다. |

정확한 차단 수는 **4개 클립, 6개 필드**다. 모두 직접적인 문자 생성 의도라고 단정하지 않는다. 특히 편집 지시를 허용하도록 검사만 완화하면 현재 compiler가 reveal을 그대로 영상 provider prompt로 전달하는 문제가 남는다.

명칭·질문·연대·수치의 편집 표기 요구는 삭제하지 않고 별도 편집 인계에 보존해야 한다. 별도 편집 인계의 실제 저장 및 T090 연결은 재개 결과 검토 때 확인한다. 여기서 새 필드나 자동 전달 기능이 이미 존재한다고 가정하지 않는다.

## 최신 RETRY와 보존 조건

최신 RETRY(2026-10-04T12:15:41.225Z)는 SC02/SC06 비지도형 구도, 생성 프롬프트에서 문자 조판 제거, 기존 공개 시한 및 State 연결 보존을 요구한다. 현재 코드가 같은 attempt의 RETRY를 전달한다. T050 과거 문구만으로 반려하지 않는 새 정책도 함께 적용된다.

승인된 사실·대본·측정 TTS·State ID/순서/연결·기존 리소스 pin을 유지한다. 채널 1.9.0 / Visual Bible 1.3.0 업그레이드는 이 재개에 포함하지 않는다. SC06 내레이션에는 '지도 위 두 지점'이라는 문장이 남아 있으므로 비지도형 화면과 의미가 맞는지 관리자 검토가 필요하다. 이를 이유로 대본이나 TTS를 자동 변경하지 않는다.

## 실행 명령

아래는 다음 실행 단계용이며 이 단계에서는 실행하지 않았다. 일반 PowerShell, 저장소 루트 기준이다. 코드가 바뀌었으면 빌드·필요 검증을 먼저 갱신한다.

```powershell
npm run vpf -- workflow status neanderthal_oase1_longform_v13_001
npm run vpf -- workflow revise neanderthal_oase1_longform_v13_001 T060
npm run vpf -- agent3 run neanderthal_oase1_longform_v13_001 --resume-current-attempt
npm run vpf -- workflow status neanderthal_oase1_longform_v13_001
npm run vpf -- codex status neanderthal_oase1_longform_v13_001
```

각 명령 결과를 확인하고 다음 명령으로 진행한다. status가 위 전제와 달라졌으면 다시 판단한다. `workflow revise`는 운영 표준에 따른 명시적 수정 요청이다. `agent3 run`은 현재 대상 T060 하나를 실행하며 `run-all`은 사용하지 않는다. resume 옵션 없이 실행하면 시도 한도 초과 처리가 발생할 수 있다.

## 실행 후 판정

- attempt=3 유지, 기존 이력 보존, 새 산출물 revision/hash 확인.
- 차단 필드 수정 및 모든 현재 생성 프롬프트의 문자/지도/마커 지시 재검토.
- 실제 reference 승인·파일·checksum, 한국어/영어 의미, 공개 시한, 카메라/State 연결 확인.
- 편집 표기 인계와 대본·화면 의미 일치, 비실사 스타일 잠금 확인.
- 최신 관리자 APPROVE 및 현재 생성 게이트 PASS 확인 후 별도로 T070 시작 판단. RETRY/BLOCK이면 자동 반복하거나 강제 PASS하지 않는다.
