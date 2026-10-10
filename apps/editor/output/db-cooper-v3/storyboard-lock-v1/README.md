# D.B. Cooper — FINAL TTS 기준 30샷 콘티·연결 잠금 v1

상태: **연출 설계 잠금 / 실제 미디어 제작 보류**. FINAL TTS 7개 섹션과 30샷의 대사 창을 대조했다.
실제 이미지·영상 품질 및 마지막 사용 프레임은 아직 승인되지 않았다.

- 잠금: `SDL-db_cooper_1971_4m30_v3-r2` · 관리자 Story Gate PASS
- FINAL TTS: plan `tts-plan_3c3aa78843564ae39676505a41c347fb` rev 2 · result `tts-result_c5c0bc22f8b246c584032721379e6228` · 162.601초
- 화면: 30샷 × 생성 10초 = 원본 300초, 편집 사용 합계 270초
- 화풍: NON_REALISTIC_STYLIZED 2D 잉크 누아르, 16:9

## 제작 순서

1. CL01 START 이미지 생성·눈으로 검토. 727의 후방 3/4 원경과 꼬리 아래 공간을 확인한다.
2. CL01 END/TARGET 이미지 생성·검토. 10초 검은 계단 내부 차폐를 목표로 한다. 6~8초 열린 계단 프레임과 혼동하지 않는다.
3. CL01 VIDEO 프롬프트로 10초를 생성한다. 6~8초 계단 구조 공개, 8~10초 검은 내부 진입, 직접 점프 묘사 금지를 실제 영상에서 확인한다.
4. 채택된 CL01의 실제 사용 종료 프레임을 추출하고, CL02는 시간 점프이므로 독립 START로 제작한다.
5. 이후 모든 클립에서 같은 동기화 명령을 사용한다. 파생 START는 검토된 실제 사용 종료 프레임에서만 연결한다.
6. CL29는 CL01 6~8초 공개 프레임을 구조 참고로 사용하는 독립 START다. CL01의 검은 10초 EXIT을 복사하지 않는다.

```powershell
node scripts/db-cooper-chain.mjs status --output-dir output/db-cooper-v3/storyboard-lock-v1
node scripts/db-cooper-chain.mjs sync --output-dir output/db-cooper-v3/storyboard-lock-v1
```

## 30샷 연결표

| 샷 | 화면 시간 | 음성 사용 구간 | START | END | 다음 연결 |
| --- | --- | --- | --- | --- | --- |
| CL01 | 0–10초 | 0.300–6.991초 | GENERATE_START | TARGET | EXIT_MATCH |
| CL02 | 10–18초 | 1.200–6.364초 | GENERATE_START | 없음 | STORY_CUT |
| CL03 | 18–27초 | 0.700–6.518초 | GENERATE_START | TARGET | BIBLE_MATCH |
| CL04 | 27–36초 | 1.800–6.273초 | PREVIOUS_USED_EXIT:CL03 | TARGET | CONTINUATION |
| CL05 | 36–45초 | 0.800–6.909초 | PREVIOUS_USED_EXIT:CL04 | TARGET | EXIT_MATCH |
| CL06 | 45–54초 | 1.100–6.882초 | PREVIOUS_USED_EXIT:CL05 | TARGET | CONTINUATION |
| CL07 | 54–62초 | 1.500–5.864초 | GENERATE_START | TARGET | STORY_CUT |
| CL08 | 62–72초 | 0.400–7.164초 | GENERATE_START | TARGET | BIBLE_MATCH |
| CL09 | 72–82초 | 0.700–7.100초 | PREVIOUS_USED_EXIT:CL08 | TARGET | CONTINUATION |
| CL10 | 82–92초 | 1.800–6.866초 | GENERATE_START | TARGET | BIBLE_MATCH |
| CL11 | 92–102초 | 1.000–6.309초 | GENERATE_START | TARGET | STORY_CUT |
| CL12 | 102–112초 | 0.200–7.400초 | PREVIOUS_USED_EXIT:CL11 | TARGET | EXIT_MATCH |
| CL13 | 112–121초 | 1.300–6.173초 | PREVIOUS_USED_EXIT:CL12 | TARGET | CONTINUATION |
| CL14 | 121–130초 | 1.000–6.091초 | GENERATE_START | 없음 | STORY_CUT |
| CL15 | 130–139초 | 1.800–5.418초 | PREVIOUS_USED_EXIT:CL14 | TARGET | EXIT_MATCH |
| CL16 | 139–148초 | 1.200–5.709초 | PREVIOUS_USED_EXIT:CL15 | TARGET | CONTINUATION |
| CL17 | 148–157초 | 0.800–6.036초 | PREVIOUS_USED_EXIT:CL16 | TARGET | CONTINUATION |
| CL18 | 157–166초 | 0.400–6.564초 | GENERATE_START | TARGET | STORY_CUT |
| CL19 | 166–175초 | 0.700–6.882초 | GENERATE_START | TARGET | STORY_CUT |
| CL20 | 175–185초 | 0.300–5.900초 | PREVIOUS_USED_EXIT:CL19 | TARGET | EXIT_MATCH |
| CL21 | 185–194초 | 0.500–6.973초 | GENERATE_START | TARGET | STORY_CUT |
| CL22 | 194–203초 | 1.100–6.336초 | PREVIOUS_USED_EXIT:CL21 | TARGET | CONTINUATION |
| CL23 | 203–211초 | 2.000–4.691초 | GENERATE_START | 없음 | STORY_CUT |
| CL24 | 211–220초 | 1.300–5.445초 | GENERATE_START | TARGET | STORY_CUT |
| CL25 | 220–229초 | 1.200–5.927초 | PREVIOUS_USED_EXIT:CL24 | TARGET | CONTINUATION |
| CL26 | 229–238초 | 0.300–7.355초 | GENERATE_START | TARGET | STORY_CUT |
| CL27 | 238–246초 | 0.500–6.609초 | PREVIOUS_USED_EXIT:CL26 | TARGET | EXIT_MATCH |
| CL28 | 246–254초 | 1.200–6.000초 | GENERATE_START | TARGET | STORY_CUT |
| CL29 | 254–262초 | 1.400–5.400초 | GENERATE_START | 없음 | BIBLE_MATCH |
| CL30 | 262–270초 | 0.600–5.618초 | PREVIOUS_USED_EXIT:CL29 | TARGET | CONTINUATION |

## 제작 게이트

현재 프로젝트 preflight는 저장소 `.env`를 읽어 PASS지만, 현재 checkout의 전체 typecheck·build·tests·LONGFORM E2E·pilot-readiness CI 증빙은 이 패키지에서 아직 확인되지 않았다.
따라서 이 파일은 설계 잠금이며 실제 CL01 이미지·영상 생성의 관리자 제작 승인 기록이 아니다.
사람의 TTS 청취 QC도 아직 기록되지 않았다. 실제 미디어 결과가 생기면 Agent1이 이미지·연결·사용 구간을 다시 검수한다.
