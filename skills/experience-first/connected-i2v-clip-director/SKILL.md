---
name: connected-i2v-clip-director
description: Convert an EXPERIENCE-FIRST storyboard into connected image-to-video clip plans, frame assets, prompts, and honest execution manifests. Use for step 4 Connected I2V Clip Director, 연결 I2V 클립 설계, 시작·끝 프레임 연결, or producing coherent camera-led clips from approved beat cards. Verify current generator capabilities and continuity; never claim prompts are generated videos.
---

# Connected I2V Clip Director · 4

먼저 [공통 계약](references/experience-first-contract.md), [전달 형식](references/handoff.md), [연결·실행 규칙](references/continuity-and-execution.md)을 읽고 적용하라.

## 입력과 실행 범위
3번 experience_storyboard의 승인 revision, 경험 조건, 증거 표지, 비트 ID를 확인하라. 경험 콘티가 없으면 임의의 대본으로 대신하지 말라.
계획 요청에는 제작 패키지를 만들라. 실제 이미지/영상 생성까지 요청되면 현재 사용 가능한 도구로 허용된 범위를 실행하라. 존재하지 않는 도구·모델·완성 파일을 만들어내지 말라. 도구가 없으면 설계는 완료할 수 있지만 실행 상태는 BLOCKED로 기록하라.

## 진행
1. 제공된 모델·플러그인·API의 현재 기능을 조사하라. available, requested_duration_sec, supported_durations_sec, start_image, end_image, continuation, aspect_ratio, resolution, audio_support, limits, checked_at, evidence를 capability_profile에 기록하라. 도구 스키마나 현재 공식 문서로 확인하라. 사용자 지정 10초와 지원 확인을 구분하라.
2. 경험 비트를 생성 가능한 길이의 클립으로 묶으라. 10초가 확인된 프로젝트는 20초=2클립, 30초=3클립을 기본으로 삼되 편집 트림을 허용하라. 여러 비트가 한 클립 안에 있을 수 있다. 실제 기능이 다르면 생성 길이와 사용 구간을 나눠 파일럿 총 20~30초를 유지하라.
3. 각 클립에 시작·종료 구도, 대상 행동, 카메라 경로, 핵심 공개, 정체성·공간 잠금, 음향 큐, 출구/다음 진입 계약을 정의하라. 기본 비실사 스타일을 프롬프트에 포함하라. 카메라 비트를 지나치게 많이 쌓아 실패를 유발하지 말라.
4. 자산 방식 SINGLE, START_TARGET, CONTINUATION, EXIT_REFERENCE, GRAPHIC_COMPOSITE를 기능과 장면 목적에 맞게 선택하라. 선택 이유와 실패 대안을 적으라. 지원하지 않는 끝 이미지나 확장 기능을 프롬프트로만 요청하여 지원된 것처럼 취급하지 말라.
5. 클립별 이미지 프롬프트와 I2V 프롬프트를 콘티 카드에서 파생하라. 공통 프롬프트에는 모든 클립에 실제로 공통인 조건만 넣고, 특정 클립의 이동 방향·속도·정지를 다른 클립에 강제하지 말라. 공통 조건과 로컬 카메라 지시의 모순을 제거하라. 영상 프롬프트는 로컬 시간별 행동·카메라·가림·공개·끝 자세를 구체화하라. 한 컷의 증거/허구 분류를 다른 컷에서 바꾸지 말라. 확정하지 않은 인물 정체를 드러내지 말라.
6. 연속 연결에는 같은 공간 배치, 대상 크기·위치, 화면 방향, 카메라 속도, 가림막, 음향 리듬을 맞추라. 의미적 매치 컷은 공간 차이가 읽히도록 표시하라. 시작과 끝 프레임 일치만으로 중간 움직임까지 통과한 것으로 보지 말라.
7. 실제 생성 시 자산을 먼저 확인하고 지원 기능에 맞는 이미지 생성/편집·영상 도구를 사용하라. 제공된 이미지가 있으면 보기 도구로 확인한 후 편집하라. 시작·끝·참조 이미지 역할과 파일 연결을 기록하라. 지원되는 경우 이전 클립 실제 끝 프레임을 추출해 다음 시작으로 사용하라.
8. 다운로드·실측·검토한 자산만 clip_manifest에 넣으라. 파일 경로/URL, 출처 도구, 입력 리비전, 해시, 해상도, fps, 실제 길이, 사용 구간, 생성/검토 상태를 기록하라. 실제 파일 없는 항목은 null로 두고 PLANNED 또는 BLOCKED로 표시하라.
9. 20~30초 파일럿용 조립 순서와 임시 효과음 큐를 5번에 넘기라. 여기서 완성 내레이션이나 전체 제작을 잠그지 말라. 사용자가 파일럿 제작까지 요청했다면 실제 생성한 클립만 편집하고 5번 사전 검토 및 제작 후 검토 절차를 따르라.

## 통과 기준
모든 비트가 클립에 한 번씩 매핑되는지, 핵심 공개가 생성·사용 구간 안에 남는지, 연결표의 끝/시작이 의도와 맞는지, 합성 대안이 관객 경험을 보존하는지 검사하라.
설계 통과는 design_status: PASS로 기록하라. 실제 미디어가 없으면 pilot_status: PLANNED 또는 BLOCKED, 실제 미디어가 있으나 5번의 연결 재생 검토 전이면 GENERATED_UNREVIEWED로 두라. 4번에서 pilot_status: PASS로 넘어가지 말라.
끝에 다음 단계: 5번 Sequence QC Director와 전달 revision, 실제 생성된 클립 수, 아직 막힌 실행 사항을 표시하라.
