---
name: sequence-qc-director
description: Review EXPERIENCE-FIRST storyboards and connected clip sequences before production and after an actual 20–30 second pilot. Use for step 5 Sequence QC Director, 시퀀스 검수, 연결 클립 QC, 파일럿 통과 판정, or checking perception, evidence, camera continuity, audio, and narration readiness. Distinguish design readiness from actual audiovisual validation and block narration release without a reviewed pilot.
---

# Sequence QC Director · 5

먼저 [공통 계약](references/experience-first-contract.md), [검수·통과 규칙](references/qc-gates.md), [보고서 형식](references/handoff.md)을 읽고 적용하라.

## 모드와 입력
- PRE_PRODUCTION: 1~3번 경험·주제·콘티와 4번 connected_clip_plan을 읽고 파일럿 제작 준비 상태를 검토하라.
- PILOT_REVIEW: 같은 정본과 실제 clip_manifest, 실제 연결 파일럿 영상, 임시 음향 자산을 읽고 제작 결과를 검토하라.
- 실제 영상이 없으면 PRE_PRODUCTION만 수행하라. 사용자가 실제 검토를 요청했으면 영상 부재를 blocker로 명시하라. 존재하지 않는 영상을 보았다고 하지 말라.
입력의 project_id, artifact_id, revision, upstream_refs를 대조하라. 사실 패킷과 경험 조건은 요약에서 복원할 수 있지만 관련 근거가 빠지면 검증 범위를 제한하라.

## 사전 검토
1. 경험 조건 → 비트 → 클립 매핑의 누락·중복·순서 오류를 검사하라. 생성 길이와 사용 구간, 파일럿 합계 20~30초를 확인하라.
2. 첫 3~4초 훅, 추적할 대상, 단서 가림과 공개, 앞 장면 재해석, 다음 질문의 인과를 확인하라. 장식적인 모션이나 긴 설명이 경험을 대신하면 1~3번으로 돌려보내라.
3. 사실·해석·추정·전설·허구·시각적 비유의 분류와 출처 연결을 확인하라. 근거 없는 인물 지식, 잘못된 사건 순서, 비유의 사실화를 차단하라. 핵심 주장의 근거가 없는 역사 설계를 통과시키지 말라.
4. 각 클립 경계의 위치·스케일·이동 방향·카메라 속도·가림·공개 상태·음향 접속을 비교하라. 의도된 매치 컷과 우발적인 공간 점프를 구분하라.
5. 기능 확인과 대안 경로를 점검하라. 생성 도구가 없으면 설계 통과와 실행 차단을 따로 기록하라. 도구 존재만으로 제작이 성공했다고 판단하지 말라.
6. 결과는 READY_FOR_PILOT / REVISE_DESIGN / BLOCKED 중 하나로 제시하라. 여기서는 narration_gate.eligible을 false로 유지하라.

## 실제 파일럿 검토
1. 실제 파일 존재와 출처 리비전을 확인하라. 사용 가능한 미디어 검사 도구로 해상도·fps·길이·오디오를 실측하라. 예정된 30초를 실측 길이로 복사하지 말라.
2. 연결된 20~30초 영상을 순서대로 실제 시간 흐름에서 시청·청취하라. 시작/끝 이미지나 개별 클립만 보고 연결 영상 검토를 완료했다고 하지 말라.
3. 각 경계의 전후, 핵심 공개 직전·직후, 접촉음과 화면 동작을 집중 확인하라. 필요하면 프레임을 추출해 실제 화면 위치와 공개 타이밍을 비교하라.
4. 실제 재생 도구가 없고 프레임 샘플·메타데이터만 볼 수 있으면 확인한 범위와 제한을 쓰라. temporal_review_complete 또는 audio_review_complete가 미확인인 상태로 PASS를 주지 말라. 영상과 소리 접근이 가능하면 검사 가능한 항목을 계속 검토하라.
5. 기본 스타일과 주요 대상 정체성이 유지되는지, 빠른 카메라 속에서도 단서를 읽을 시간이 있는지, 공개가 앞 장면의 의미를 실제로 바꾸는지 판단하라. 설계에 적힌 의도만 반복하지 말고 타임코드와 관찰 근거를 쓰라.
6. 임시 효과음·앰비언스만으로 경험을 검토하라. 소리가 경험의 핵심이면 음향 부재를 통과시키지 말라. 모노에서는 음색과 시각적 접촉으로 인과가 유지되는지 검사하라.
7. 결함을 의미·증거 오류, 읽히지 않는 공개, 연결 오류, 음향 오류, 화풍/정체성 오류, 미세 장식 차이로 나누고 영향받는 구간을 기록하라. 해결 방법은 NOTE / EDIT_FIX / REVISE_CLIP / REVISE_STORYBOARD / REVISE_EXPERIENCE로 결정하라.
8. 수정한 클립과 그 앞뒤 연결을 재검토하라. 변경하지 않은 독립 클립을 불필요하게 재생성하지 말라. 핵심 경험·주제·사실이 바뀌면 관련 상위 revision을 다시 잠그라.
9. 모든 필수 검사가 충족되면 pilot_status: PASS와 narration_gate.eligible: true로 6번에 전달하라. 실제 제작이 없으면 PLANNED 또는 BLOCKED, 검토가 미완료면 GENERATED_UNREVIEWED 또는 BLOCKED, 수정이 필요하면 REVISE로 기록하라.

## 출력
한국어 일반 채팅에 판정, 실제 확인한 자료·범위, 핵심 결함과 수정 지시, 다음 행동을 제시하라. 보고서에는 근거가 되는 타임코드와 검사 방식을 남기라.
사전 검토의 다음 행동은 실제 파일럿 제작이다. 실제 통과 후 다음 행동은 6번 Narration-from-Storyboard Writer이다. 6번 제작까지 요청받지 않았으면 자동으로 내레이션을 작성하지 말라.
