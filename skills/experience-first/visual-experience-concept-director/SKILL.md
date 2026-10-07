---
name: visual-experience-concept-director
description: Design an EXPERIENCE-FIRST audiovisual concept before selecting a topic or writing narration. Use for step 1 Visual Experience Concept Director, 시청각 경험 우선 기획, 관객 경험 콘셉트, or camera-led mystery/history/fiction experiences feeding Topic Finder. Produce experience mechanisms and a transferable experience brief, not a finished script or historical topic list.
---

# Visual Experience Concept Director · 1

먼저 [공통 계약](references/experience-first-contract.md)과 [전달 형식](references/handoff.md)을 읽고 적용하라.

## 목적과 경계
관객의 눈과 귀를 붙잡는 시청각 경험을 먼저 설계하라. 그 경험에 맞는 소재는 2번에서 찾게 하라. 카메라의 이동으로 단서를 발견하고, 소리의 출처를 추적하고, 관점 변화로 앞 장면의 의미를 바꾸게 하라.
기존 사건·대본이 입력되면 사용자 고정 조건으로 기록하고 경험을 먼저 재설계하라. 기존 대본을 그대로 잠그고 장식적인 카메라를 붙이지 말라. 주제가 열려 있으면 여기서 유명 사건을 골라 결론 내리지 말라.

## 진행
1. 사용자의 길이·화면비·관객·강도·장르·금지 조건을 추출하라. 선택적 정보가 없으면 공통 기본값을 사용하고 assumptions에 기록하라. 영상 시작 시 스타일 적용을 한 문장으로 알리라.
2. 서로 다른 경험 콘셉트 3개를 제안하라. 각 콘셉트에 아래 필드를 채우라.
   - viewer_promise: 관객이 직접 겪을 경험 한 문장.
   - sensory_hook: 첫 3~4초에 보이는 변화와 들리는 변화.
   - attention_target: 시선을 붙잡고 추적하게 할 대상.
   - perception_arc: 기대 → 의심 → 발견 → 앞 장면의 재해석.
   - camera_mechanism: 시작 구도·이동 경로·가림·공개 대상·공개 이유.
   - sound_mechanism: 음원의 위치·반복·멈춤·엇박자가 정보를 바꾸는 방식.
   - visual_transformation: 비실사 그래픽/판타지 변형의 목적과 사실 오해 위험.
   - connection_motif: 다음 클립으로 이어질 대상·방향·리듬.
   - topic_requirements: 2번에서 찾아야 할 사건의 공간·단서·관점 전환 조건.
   - production_risk와 fallback: 구현이 어려운 지점과 경험을 보존하는 대안.
3. 콘셉트마다 20~30초 경험 실험 구간을 계획하라. 훅, 추적, 의미 전환, 다음 질문을 배치하되 전부 같은 템플릿으로 만들지 말라. 이 시간은 계획값이며 실제 클립 검증값이 아님을 표시하라.
4. 흡인력, 시각·소리의 인과성, 관점 전환, 클립 연결, 주제 탐색 유연성, 구현 가능성을 각각 0~2점으로 평가하라. 점수 근거를 쓰고 가장 강한 1개를 추천하라. 평가를 실제 관객 테스트로 표현하지 말라.
5. 사용자가 선택한 것이 있으면 그것을 사용하라. 선택이 없으면 추천안을 selection_basis: director_recommendation으로 전달하고 선택 확인 때문에 작업을 멈추지 말라.
6. 전달 형식에 따라 experience_brief를 작성하라. 상위 콘셉트와 보존할 경험 조건을 2번에 넘기라.

## 통과 기준
- 소리·카메라를 제거했을 때 관객의 발견이나 해석이 달라지는 이유가 구체적인가?
- 첫 3~4초 안에 의미 있는 변화가 있고 추적할 대상이 분명한가?
- 앞에서 보인 단서가 이후의 관점 전환에 쓰이는가?
- 분위기나 카메라 동작 이름 대신 실제로 볼 것과 들을 것이 있는가?
- 경험을 살릴 소재 탐색 조건과 실패 대안이 있는가?
하나라도 빠지면 자체 수정하라. 통과 시 design_status: PASS로 표시하되 pilot_status: NOT_RUN을 유지하라. 도구 기능을 확인하지 않았으면 구현 가능성은 잠정 판단으로 표시하라.

## 출력
한국어 일반 채팅 본문에 콘셉트 비교와 추천 이유를 먼저 제시하고 필요할 때 구조화된 전달 패킷을 붙이라. 간단한 출력 요청에도 후속 단계가 읽을 핵심 필드를 유지하라.
끝에 다음 단계: 2번 Mystery / History / Fiction Topic Finder와 experience_id, revision을 표시하라. 2번 실행까지 요청된 경우 바로 이어가라.
