---
name: experience-storyboard-director
description: Turn an EXPERIENCE-FIRST experience brief and researched topic match into an audiovisual storyboard before narration. Use for step 3 Experience Storyboard Director, 경험 중심 콘티, 단서 공개와 관점 전환 콘티, or frame/action/camera/sound/exit cards that feed connected I2V clips. Preserve evidence and viewer perception rather than illustrating a prewritten script.
---

# Experience Storyboard Director · 3

먼저 [공통 계약](references/experience-first-contract.md), [카드·전달 형식](references/handoff.md), [연결 예시](references/connection-example.md)를 읽고 적용하라.

## 입력
1번 experience_brief와 2번 topic_match_pack을 같은 project_id 및 upstream revision으로 확인하라. topic_match_pack의 experience_summary로 필요한 내용이 모두 복원되면 그것을 사용하되 누락을 가정으로 감추지 말라.
역사 핵심 주장이 미검증이면 사실 확정을 차단하라. 허구는 FICTION 설정을 그대로 유지하라. 경험 조건과 주제 근거가 충돌하면 2번에 돌려보내라.

## 진행
1. 핵심 지각 변화와 한 가지 중심 질문을 고정하라. 관객이 처음 믿는 것, 의심하는 단서, 새로 보는 정보, 재해석하는 순간을 적으라.
2. 전체 길이가 지정됐으면 그 길이에 맞는 시퀀스 구조를 계획하라. 길이가 미정이면 20~30초 파일럿 범위만 구체화하고 전체 분량은 미확정으로 두라.
3. 시퀀스를 경험 비트로 나누고 각 비트의 STORY / FRAME / MOTION / EXIT를 모두 작성하라. SOUND, VIEWER_CHANGE, REVEAL, EVIDENCE도 필수로 채우라. 내레이션 문장으로 시간과 화면을 대신하지 말라.
4. FRAME에 전경·중경·후경, 주 대상의 화면 위치·크기, 가림 대상, 아직 숨길 단서를 적으라. 시작 프레임과 끝 프레임의 차이를 명확하게 하라. 좌표는 화면 정규화 x/y 0~1, 시선 이동은 화면 기준 좌/우로 표시하라.
5. MOTION에 대상 행동과 카메라 경로를 분리하라. 시작 위치 → 이동 → 종료 위치와 공개 시점을 쓰라. 초반 긴 정적 접근을 피하고 3~4초 이내에 의미 있는 변화를 두라. 긴 트래킹 중에도 관심 대상을 전환하거나 단서를 읽을 순간을 확보하라.
6. SOUND에 음원의 위치·타이밍·리듬·잔향·멈춤을 명시하라. 소리를 제거해도 단서가 읽히는지, 소리가 있을 때 무엇이 더 달라지는지 점검하라. 모노 재생 대안도 두라.
7. EXIT에 다음 비트의 진입 대상·방향·크기·움직임·음향 접속을 적으라. 실제 공간을 잇는 CONTINUOUS와 의미를 잇는 MATCH_CUT 등을 구분하라. 주제적 매치 컷을 같은 물체나 같은 장소로 오해시키지 말라.
8. 구현 방식 SINGLE / START_TARGET / CONTINUATION / EXIT_REFERENCE / GRAPHIC_COMPOSITE 중 하나를 계획하라. 도구 지원 여부는 4번에서 확인하게 하라. 어려운 움직임에는 경험을 보존하는 편집·합성 대안을 두라.
9. 가장 중요한 공개와 연결을 포함하는 대표 20~30초를 파일럿으로 선정하라. 쉬운 도입만 골라 핵심 난점을 피하지 말라. 기본 10초 클립 프로젝트는 2~3클립으로 묶되 비트는 3~5초 등 필요에 따라 나누라. 생성 길이가 미확인이라면 이 묶음은 가정으로 표시하라.
10. 경험 비트와 생성 클립은 분리하라. 같은 클립 안의 카메라 비트를 별도 이미지로 무조건 쪼개지 말라. 클립 경계는 4번의 기능 확인 후 확정하도록 planned clip grouping을 넘기라.

## 시간과 콘티 산출물
planned_start_sec / planned_end_sec / planned_duration_sec는 앞단의 연출 계획값으로 사용하라. measured_duration_sec와 editorial_duration_sec는 실제 생성/편집 전에는 null로 두라. 합계·누락·겹침을 검사하라. 전체에서 추출한 파일럿은 원래 범위와 파일럿 재생 시간을 각각 기록하라.
먼저 텍스트 카드와 프레임 구도를 제공하라. 그림 콘티를 요청하면 카드에 대응하는 16:9 러프 프레임을 SVG 등 정확한 도구로 만들고, 미술 기준 이미지는 이미지 생성 도구로 만들라. 생성하지 않은 그림을 완성 이미지로 표시하지 말라. 파일 산출물을 만들면 구조화된 콘티를 정본으로 삼고 HTML 등은 동일 데이터의 보기로 생성하며 영구 저장하라.

## 통과 기준
experience_invariants가 비트 ID에 매핑되는지, 숨긴 단서가 의도한 순간에 공개되는지, 모든 공개가 앞단의 근거나 허구 설정에 맞는지 검사하라. 카메라와 소리가 정보·감정·공간 이해를 바꿔야 한다. 모든 연결의 끝과 시작이 일치하거나 의도된 전환이어야 한다.
통과하면 design_status: PASS, pilot_status: PLANNED로 4번에 전달하라. 실제 영상 생성·통과로 표현하지 말라. 실패하면 영향받는 카드만 새 revision으로 수정하라.
