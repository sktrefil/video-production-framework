---
name: mystery-history-fiction-topic-finder
description: Find mystery, history, or fiction topics that satisfy an existing EXPERIENCE-FIRST experience brief. Use for step 2 Mystery / History / Fiction Topic Finder, 시청각 경험에 맞는 소재 발굴, or matching a camera/sound/reveal mechanism to grounded episodes or explicitly fictional premises. Research topic fit and evidence before storyboarding; do not replace the experience with a generic historical overview.
---

# Mystery / History / Fiction Topic Finder · 2

먼저 [공통 계약](references/experience-first-contract.md)과 [전달 형식](references/handoff.md)을 읽고 적용하라.

## 입력 확인
1번 experience_brief의 revision, experience_invariants, topic_requirements를 확인하라. 입력이 없으면 공통 계약의 누락 처리 규칙을 따르라. 고정 주제·장르가 있으면 보존하라. 역사만 요청한 경우 허구를 추천안으로 대체하지 말라.

## 진행
1. 경험 요구를 검색 조건으로 바꾸라. 소리의 출처, 가려진 공간, 시점 변화, 반복되는 단서, 기대를 뒤집을 증거 등 구체적인 조건을 사용하라.
2. 기본 3개 후보를 만들라. 사건 전체보다 하나의 에피소드·장면·쟁점에 집중하라. 장르가 열려 있으면 역사·미스터리·허구의 차이를 활용하되 억지로 각 장르를 한 개씩 채우지 말라.
3. 역사·실제 사건·전설 후보는 현재 공개 자료를 조사하라. 핵심 주장마다 출처 URL·문서명·작성/발행 시점·확인 구간·독립성·확실성을 기록하라. 기술 사건은 공식 기록·논문·당시 1차 자료를 우선하라. 검색 결과 요약만으로 사실을 확정하지 말고 원문을 읽으라.
4. 사실과 시각적 연출 가능성을 분리하라. 기록에 없는 통로·행동·인물 지식은 추가 사실로 쓰지 말라. 실제 사건에 창작을 섞을 때는 factual_core와 fictional_layer를 나누고 화면에서 구분할 방법을 제시하라.
5. 순수 허구 요청은 웹 검색 없이 설계할 수 있다. 전체를 FICTION으로 표시하고 실제 사건의 이름·기록·날짜를 근거처럼 쓰지 말라. 허구를 위한 출처를 만들어내지 말라.
6. 각 후보를 경험 보존, 핵심 단서의 강도, 관점 전환, 시각·소리 인과, 제작 가능성, 증거 준비도에서 0~2점으로 평가하라. 순수 허구의 증거 준비도는 N/A로 두고 공통 항목만 비교하라. 합계 분모가 다르면 백분율과 근거를 함께 표시하라.
7. 사용자 선택이 없으면 가장 적합한 1개를 추천하라. 경험 조건을 충족하지 못하면 유명 사건을 억지로 끼워 맞추지 말고 REVISE로 1번에 요구 수정안을 돌려보내라. 원래 장르 조건을 넘는 변경은 가정으로 처리하지 말라.
8. 선택된 후보의 최소 서사 씨앗을 작성하라: 첫 오해 → 추적 단서 → 공개되는 원인 → 앞 장면 재해석 → 다음 질문. 완성 내레이션 대신 관객의 지각 변화와 사건 인과를 적으라.
9. fact_pack과 topic_match_pack을 3번에 전달하라. 미확정 핵심 주장은 blocker로 두라. 중요하지 않은 세부가 미확정이면 해당 세부를 빼고 진행할 수 있다.

## 통과 기준
experience_invariants 각각에 대응하는 장면·근거 또는 명시적 허구 설정이 있어야 한다. 역사 추천안의 핵심 주장에는 독립적인 출처 2종 이상과 claim-source 연결이 있어야 한다. 근거가 부족하면 evidence_status: UNVERIFIED와 design_status: BLOCKED 또는 REVISE로 기록하라. 장면의 재미만으로 사실 검증을 통과시키지 말라.
순수 허구는 evidence_status: NOT_APPLICABLE_FICTION으로 통과할 수 있다. 모든 표현에 적절한 인식론적 표지를 붙이고 원안의 experience_id를 보존하라.

## 출력
후보 비교, 추천 이유, fact_pack, 경험 보존 매핑, 3번 전달 패킷 순으로 한국어 일반 채팅에 제시하라. 사용자가 출처 표시를 생략해 달라고 해도 내부 fact_pack의 출처와 검증 상태를 보존하고 현재 환경에서 필요한 인용 규칙을 따르라.
끝에 다음 단계: 3번 Experience Storyboard Director와 선택 topic_id, revision을 표시하라. 요청된 범위에 3번이 포함되면 바로 이어가라.
