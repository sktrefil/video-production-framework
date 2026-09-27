# 연출 디렉션 v2 적용

기준: [제작 가이드 v2](directing-production-guide-v2.md), 2026-09-27.
이 변경은 코드·예제·검수 계약의 변경이다. 기존 프로젝트의 대본, 미디어, 승인, `project.db`를 자동 마이그레이션하거나 실제 제작을 실행하지 않는다.

## 적용 범위와 호환성

- 새 LONGFORM T060 런타임 출력에는 `directing.version="2"`가 필수다. API·Codex 경로 모두 같은 스키마와 결정적 검증을 사용한다.
- 자동 T060 실행 전 `VPF_VIDEO_GENERATION_DURATION_SEC`에 실제 외부 영상 도구에서 선택한 생성 길이를 지정한다. 설정이 없으면 추측하지 않고 prerequisite 오류로 중단한다. 수동 v2 계획 import는 JSON의 명시된 생성 길이를 검증한다.
- 기존 저장된 v1 계획과 SHORTS는 기존 reader/compiler를 유지한다. 수동으로 기존 계획을 읽거나 import하는 경로는 v1 호환용이다. v2로 전환할 때는 계획 전체를 수정·재승인하며 한 계획에 v1/v2 클립을 섞지 않는다.
- 기존 VPF의 Agent1/Agent2/Agent3, `project.db`, workflow 명령, 대시보드와 편집기 materialization 경로를 그대로 사용한다. 별도 제작 상태나 승인 체계를 만들지 않는다. 새 필드는 기존 canonical artifact와 tail artifact에 저장된다.
- 클립 JSON 안에 카드를 저장하므로 기존 revision/hash와 게이트 입력 해시에 포함된다. DB schema migration은 필요 없다. 샘플 검수는 `production_tail_artifacts.directing_pilot_qc`에 기록되며 downstream 무효화 대상에 포함된다.
- 기존 dispatch ID 고유값 수정과 `.gitignore`, 미추적 PowerShell 내보내기 도구·HTML·백업은 보존했다. 새 검토 화면은 별도 exporter다.

## 제작 경로

| 영역 | 변경 |
| --- | --- |
| 대본/T020 | 사건·인물과 중심 질문을 좁히고 결말 보상, 장면별 행동·변화·다음 이유, 내레이션/화면의 보완 관계와 물리 위험 대체안을 `narrative_purpose`에 작성한다. 창작 행동을 확인된 사실로 서술하지 않는다. |
| TTS/T030 | 기존 섹션별 음성·실측 정렬을 유지한다. 문장 수로 클립을 고정하지 않는다. |
| 상태 설계/T050 | ENTRY/TARGET은 항상 존재하는 **설계 상태**다. 이 단계에서는 이미지 파일을 만들지 않는다. |
| 연출/T060 | 한영 STORY/ACTION/SPACE/START/SUBJECT_MOTION/CAMERA_PATH/REVEAL/END/HANDOFF/LOCKS/RISK/FALLBACK, 레퍼런스 ID, 이미지 모드와 시간 범위를 작성한다. T050과 동선이 충돌하면 상태 설계로 돌려보낸다. |
| 연출 다양성 | 추적·공간 진입·규모 확장·시선 전환·증거 비교 등 서사에 맞는 진행을 고른다. 모든 클립을 가림막 리빌로 만들지 않고, 3~4초 목표를 위해 사건이나 무리한 카메라를 꾸미지 않는다. |
| 시간 검증 | 실측 TTS의 전역 시작/종료, 편집 길이, 생성 길이, 원본 사용 in/out을 분리한다. 공개 마감은 사용 시작부터 `min(4, 편집 길이)` 이내다. 카메라는 사용 시작부터 움직인다. 3초 미만 클립도 허용한다. |
| 이미지/T070 | START_ONLY는 시작 파일만, START_END는 시작/종료 파일을 생성한다. 종료 상태는 두 경우 모두 카드에 남는다. 한영 프롬프트는 카드의 같은 필드를 사용하며 내부 서사·검수표를 provider prompt에 붙이지 않는다. |
| 레퍼런스 | `reference_ids`는 canonical DB에서 이미 APPROVED이고 stale이 아닌 REFERENCE asset의 AVAILABLE media ID다. 컴파일 시 revision/path/hash를 고정하고 생성 직전에 재확인한다. 새 미디어를 자동으로 레퍼런스에 승격하지 않는다. |
| 샘플 검수 | 새 v2 T070은 처음 최대 5개 연속 클립에 필요한 이미지를 seed로 만든다. 3개 이상인 프로젝트는 3–5개 대표 구간으로 계획하고, 인물 이동·공간 공개·규모 변화가 포함되도록 첫 구간을 설계한다. 해당 실제 클립들의 서사 연결·카메라 다양성·이미지 구현성 검수가 있어야 나머지 이미지 생성으로 간다. 전체가 1–2클립이면 전부 검토한다. |
| 실제 끝 프레임 | PREVIOUS_END_FRAME은 바로 앞 같은 scene의 채택 클립을 참조한다. 계획된 TARGET 스틸로 대체하지 않는다. 다음 입력에 방향·속도·동작 단계를 전달하고 실제 추출 프레임 provenance를 검사한다. |
| 영상/T080 | 파일/길이 검사만으로 창작 QC를 통과시키지 않는다. 실제 공개 시점·카메라 시작 시점, 경로·행동·물리/정체성·의미·사용 구간의 독립 검수 증거를 영상/카드 해시와 결합한다. |
| 편집/T090 | source in을 실제 `sourceStartFrame`에 적용한다. 기존 섹션별 TTS 타임라인을 유지한다. |
| 이미지 실패 | v2의 seed/scene/final QC 실패는 T050/T060에서 새 프롬프트 revision을 승인받도록 중단한다. 동일 revision에 피드백을 몰래 덧붙이지 않는다. 기술 오류 재시도에는 같은 프롬프트/레퍼런스를 사용한다. |

숫자·ID·해시 검증은 공간의 실현 가능성이나 한영 의미 동일성을 증명하지 않는다. Agent1은 실제 이미지와 연출 카드, 실제 영상 검수 증거를 대조한다. 모호한 “역동적/영화적” 표현이나 점수 평균으로 핵심 결함을 통과시키지 않는다. 한 번 수정해도 구조적 문제가 반복되면 scene 교체를 우선 검토한다.

## 수동 영상 생성과 검수 파일

seed 이미지 QC 후 `06_clips/directing-pilot-manifest.json`이 만들어진다. 전체 생성 전에 대표 클립을 외부 도구로 생성·검수하고 `06_clips/directing-pilot-review.json`을 제공한다. 이 파일이 없으면 full generation이 중단된다. 이는 작업 증거이며 canonical 승인 자체가 아니다.

샘플 보고서에는 현재 `source_prompt_bundle_sha256`, `story_connection` / `camera_variety` / `image_feasibility` 각각의 `{ "status": "PASS", "evidence": "실제 관찰 내용" }`, 선택된 클립마다 아래 형태의 `reviews`가 필요하다. T080 전체 보고서 `06_clips/directing-review.json`은 같은 `reviews` 배열을 사용한다.

```json
{
  "source_prompt_bundle_sha256": "현재 manifest의 source_prompt_bundle_sha256",
  "reviews": [{
    "clip_id": "CLIP_01A",
    "clip_sha256": "생성 영상 파일의 SHA-256",
    "directing_sha256": "manifest의 directing_sha256",
    "reviewed_by": "AGENT1_MANAGER",
    "reviewed_at": "2026-09-27T12:00:00Z",
    "observed_reveal_sec": 2.9,
    "observed_motion_start_sec": 0,
    "checks": {
      "reveal": { "status": "PASS", "evidence": "사용 2.9초에 바위 뒤 굽은 길이 드러남" },
      "camera_path": { "status": "PASS", "evidence": "전경 시차로 실제 측면 이동 확인" },
      "action_progression": { "status": "PASS", "evidence": "행군이 시작부터 사용 끝까지 이어짐" },
      "physical_identity_continuity": { "status": "PASS", "evidence": "군장 크기와 지형이 일관됨" },
      "meaning": { "status": "PASS", "evidence": "마법적 소멸이나 새 역사 주장 없음" },
      "used_range": { "status": "PASS", "evidence": "원본 1–6초 안에 결과와 연속 행동이 있음" }
    }
  }]
}
```

위 값은 형식 예시이며 검수 완료 증거가 아니다. 관찰 시간은 원본 0초가 아닌 **사용 구간 시작** 기준이다. 카메라 시작 관찰에는 0.1초 허용 오차를 둔다. 여섯 critical 항목은 NA 또는 REVISE이면 차단된다. 이미지/편집의 해당 없음 항목은 manager notes에 NA와 이유를 기록한다.

PREVIOUS_END_FRAME의 입력 파일 위치는 manifest의 `entry_image_relative_path`다. 앞 채택 영상의 source out 직전 마지막 프레임을 추출하고 같은 경로 뒤에 `.json`을 붙여 `source_clip_sha256`, `frame_sha256`, `source_time_sec`를 기록한다. 원본·프레임 해시가 맞아야 하며 source time은 사용 끝 직전 0.1초 이내여야 한다. 실제 마지막 프레임/동작 연결 여부는 manager가 확인한다. 이 구현은 외부 도구의 첫/끝 프레임 지원이나 두 프레임 사이 복원 정확성을 보장하지 않는다.

## 검토 HTML

기존 사용자 PowerShell 스크립트와 별개로 읽기 전용 canonical DB exporter를 제공한다.

```powershell
node scripts/export-directing-review.mjs --db <project.db> --project <project-id> --root <project-root> --out <review.html>
node scripts/export-directing-review.mjs --spec examples/production-spec/roman_ix_001/clip_production_spec.json --out <example-review.html>
```

클립 ID로 시간·연출·레퍼런스·생성된 이미지·한영 프롬프트·영상 경로·검수 결과를 함께 표시한다. 예제 모드는 카드만 표시하며 없는 프롬프트/이미지/승인을 만들어내지 않는다. 출력은 검토 스냅샷이고 승인 버튼이나 DB 쓰기 기능이 없다.

`roman_ix_001` 예제의 TTS 5초/생성 10초는 예제 수치이며, 실제 역사 사건이나 영상 제작의 성공 증거가 아니다. 실프로젝트에는 현재 승인된 대본과 실제 TTS를 사용해야 한다.
