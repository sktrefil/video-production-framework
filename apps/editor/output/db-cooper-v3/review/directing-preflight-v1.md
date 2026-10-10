# D.B. Cooper v3 — 대본·장면 연출 사전 검토

상태: `REVISION_REQUIRED` · 정식 잠금/승인 아님 · 2026-10-09

## 입력과 확인 범위

- 대본 v3: `D:\컴폴더\다운로드\DB_Cooper_4min30_script_v3.md` · SHA-256 `9a5878e298b61d5407a70883d4dd2219134a7016dbf543deccafb7a3779c6777`
- 샷 매니페스트: `D:\컴폴더\다운로드\DB_Cooper_v3_Codex_Shot_Manifest.json` · SHA-256 `fb65ff308d62b6554fca470233b15635ee8b061e9f4923d6bdb917bbae5f7c15` · 자체 상태 `PRODUCTION_SPEC_CANDIDATE_NOT_QC_APPROVED`
- 상세 콘티: `D:\컴폴더\다운로드\DB_Cooper_v3_Detailed_Storyboard_Codex_270s.html` · SHA-256 `2ab96a5d4383395dda7db4122f50900ef49bd1b5e0449537ea79a3bf1125852c`
- 패키지의 START/END/VIDEO 프롬프트는 초안. 이미지, 실제 영상, 분절 TTS 오디오 및 쿠퍼 프로젝트의 canonical Story Gate 기록은 아직 없음.
- `STYLE_START_NOTICE`: `review/style-start-notice-v1.json` · 사용자에게 표시했고 전용 구조 검증 통과.
- 세 마스터보드는 각각 전체 화풍, 카메라·모션, 핵심 장면 기준으로 사용. 보드 경로·해시는 `chain-plan.json`에 기록됨. 보드 설명의 `LOCK`은 프로젝트 대본·Scene 또는 실제 클립 승인 기록이 아님.

## 사실 근거 점검

- FBI 사건 개요는 포틀랜드 탑승, 폭탄 쪽지와 가방 속 붉은 막대·전선, 20만 달러와 낙하산 네 개, 시애틀에서 승객 36명 하차, 1980년 일련번호가 맞는 5,800달러 발견을 뒷받침한다: https://www.fbi.gov/history/cases-and-criminals/db-cooper-hijacking
- FBI 2016 발표는 수사 자원 재배분과 신원 미확정을 뒷받침한다: https://www.fbi.gov/contact-us/field-offices/seattle/news/press-releases/update-on-investigation-of-1971-hijacking-by-d.b.-cooper
- FBI Vault의 당시 진술에는 계단 하강 난항, 경고등, 후속 교신, 계단을 내린 채 이륙 불가능하다는 기술 진술이 있다. 단, 대본의 모든 시각·계기·객실 세부를 이 검토에서 원문 페이지별로 확정하지 않았다: https://vault.fbi.gov/D-B-Cooper%20/d.b.-cooper-skyjacking-part-112.pdf
- 화면에서 직접 목격한 점프, 착지, 생존·사망 확정은 금지. 비행기 구조·승무원 동작·수색 배치는 확인되지 않은 부분을 사실적 재연처럼 고정하지 않는다.

## Script Draft → Directing Preflight

| 장면 | 샷 | 검토 | 수정·확인할 점 |
| --- | --- | --- | --- |
| SC01 열린 계단 | CL01–02 | `REVISION_REQUIRED` | CL01의 계단 공개(6–8초)와 실제 종료(10초 검은 계단 내부)를 분리해야 한다. 기존 END 그림 명세는 두 시점을 한 프레임에 요구한다. CL02는 의도적인 착륙 후 객실 컷이다. |
| SC02 쪽지 | CL03–07 | `PASS_WITH_NOTE` | 첫 폭탄 쪽지 → 가방 속 물체 → 승무원이 새로 적은 요구 사항 순서를 유지한다. 임의로 읽히는 쪽지 원문은 만들지 않는다. |
| SC03 시애틀·재이륙 | CL08–12 | `PASS_WITH_NOTE` | 돈·낙하산 인계, 승객 하차, 재이륙, 닫힌 커튼의 원인·결과를 읽히게 한다. 계단을 내린 채 이륙하는 장면은 그리지 않는다. CL12의 10초에 여러 행동이 몰려 있어 실제 오디오 시간 확인 후 재배분할 수 있다. |
| SC04 보지 못한 탈출 | CL13–20 | `PASS_WITH_NOTE` | 계단 조작, 경고등, 답신, 계기 변화, 리노의 빈 객실을 인과 순서로 유지한다. 계기 바늘의 정확한 반응·시간은 원문 근거와 맞춰 다시 확인한다. 보이지 않은 인물의 점프를 보여주지 않는다. |
| SC05 수색 | CL21–23 | `PASS_WITH_NOTE` | 수색 공간은 사실로 확정되지 않은 헬기 수·정확한 비행 경로를 재연하지 않는 추상 그래픽으로 처리한다. CL21의 내레이션·시각 정보량을 실제 낭독 시간에 맞춰 확인한다. |
| SC06 강변 돈 | CL24–27 | `REVISION_REQUIRED` | 지폐 발견→5,800달러 확인→일련번호 연결→돈의 경로 불명 순서를 유지한다. CL26은 9초에 7.11자/초, CL27은 8초에 7.00자/초로 추정 배분이 빽빽하다. 실제 TTS 측정 또는 문장·샷 재배분 전에는 35초 장면 타이밍을 확정하지 않는다. |
| SC07 열린 계단 회수 | CL28–30 | `REVISION_REQUIRED` | CL29는 계단이 보이는 SC01의 6–8초 상태를 되찾아 후퇴해야 한다. 현 패키지는 CL01의 10초 검은 종료 프레임을 CL29 START로 복사하도록 되어 있어 의도한 화면이 나오지 않는다. 독립 START 또는 검토된 중간 계단 프레임 참조로 바꾼다. |

## 수정한 연출 후보

- `prompts/CL01_END_v2.prompt.txt`: 10초의 검은 계단 내부를 최종 이미지 목표로 고정. 계단의 형태 공개는 6–8초 영상 중간 사건으로 분리.
- `prompts/CL01_VIDEO_v2.prompt.txt`와 `jobs/CL01_v2.json`: 공개 시각과 10초 종료 상태를 일치시킴. 아직 영상 생성이나 승인 없음.
- `prompts/CL29_START_v2.prompt.txt`: CL01의 **실제 종료 프레임**이 아닌 검토된 6–8초 계단 프레임을 형태 참조로 삼는 별도 START 후보. 현 `chain-plan.json`의 CL29 자동 연결은 여전히 구버전이므로 제작에 사용하면 안 된다.
- `review/scene-graph-candidate-v2.json`: 7개 장면의 대본 구간·필수 화면·정체성 앵커와 SC01/SC07 연출 수정을 함께 기록한 Scene graph 후보. 승인된 정본이 아니다.
- `review/SC06-narration-v3.1-candidate.txt`: CL26–27의 중복 문장을 줄인 내레이션 수정 후보. 현재 v3 대본과 매니페스트의 TTS 문구는 변경하지 않았으므로 이를 제작 음성으로 바로 사용하지 않는다.
- 대본 문구는 이 검토에서 변경하지 않았다. 내레이션의 의미 변경이 아니라 샷 경계·연출 수정이 우선이다. 실제 TTS에서 밀리면 SC06 문장을 새 대본 개정으로 조정하고 파생 산출물을 무효화한다.

## Visual Skeleton 및 20–30초 Sequence QC

| 구간 | 관심·움직임 | 판정 |
| --- | --- | --- |
| 0–30초 | 계단 공개→검은 내부→착륙 후 빈 객실→몇 시간 전으로 되감기. 같은 정보의 반복 없이 질문을 확장한다. | `REVISE_CL01_EXIT` |
| 30–62초 | 쪽지 인계→가방 일부→별도 요구 기록→조종실 전달. 작은 물체에서 기체 전체의 위험으로 규모가 커진다. | `PASS_WITH_NOTE` |
| 62–112초 | 시애틀 인계·승객 하차→재이륙→돈가방 결속·커튼 차폐. 공간과 행동이 다양하다. | `PASS_WITH_NOTE` |
| 112–185초 | 계단 조작·조종실 정보·빈 객실. 직접 보지 못한 것을 화면도 보여주지 않는다. 계기 세부는 근거 점검 필요. | `PASS_WITH_NOTE` |
| 185–211초 | 항공기 단서에서 숲·강 수색으로 규모 전환. 단정적 지리 재연을 피한다. | `PASS_WITH_NOTE` |
| 211–246초 | 작은 지폐 모서리→증거 묶음→넓은 빈 강변. 정보 공개는 좋지만 CL26–27 음성 밀도 미검증. | `REVISE_TIMING` |
| 246–270초 | 파일 닫힘→처음의 열린 계단 재방문→카메라 후퇴. CL29 참조 프레임을 고쳐야 의미가 성립한다. | `REVISE_CL29_START` |

## 개발 단계 결정

- `SCRIPT_DRAFT`: v3 확인. `DIRECTING_PREFLIGHT`: 실시, **수정 필요**.
- 전담 `story_audio` 역할 위임은 실행 도구가 `Unknown model gpt-5.6`을 반환해 시작되지 않았다. 이 문서는 관리자 스레드의 사전 검토이며, 정식 역할별 자체 QC가 끝났다고 표시하지 않는다.
- `SCRIPT_REVISION`: 대본 문구 변경은 보류, 연출 개정 후보 v2 작성. `VISUAL_SKELETON`/`SEQUENCE_QC`: 후보 검토 완료이나 전체 PASS 아님.
- `SCRIPT_DIRECTING_LOCK`: **생성하지 않음**. 미해결 항목이 있으므로 `validate_script_directing_lock.py`에 PASS 값을 꾸며 넣지 않는다.
- `MANAGER_STORY_GATE`: **진행하지 않음**. 쿠퍼 canonical `project.db`와 승인된 FINAL 대본·Scene graph가 없고, 개발 잠금 조건도 미충족.
- 다음 합법적 작업: SC06 낭독 배분 검토, CL29 START 연결 방식의 정식 샷 매니페스트 개정, CL01/CL29 연출 후보의 교차 QC → 다시 Sequence QC → 개발 잠금 후보 검증 → canonical Story Gate 심사.
