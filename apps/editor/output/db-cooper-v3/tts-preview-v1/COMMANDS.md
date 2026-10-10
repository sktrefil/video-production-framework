# D.B. Cooper v3 — 검토용 TTS 실행

VS Code 터미널을 `D:\git\video-production-framework-migrated\apps\editor`에서 열어 실행한다.

```powershell
python scripts/db-cooper-tts-preview.py check
python scripts/db-cooper-tts-preview.py generate --scene SC06
python scripts/db-cooper-tts-preview.py report
```

SC06 음성과 샷별 시간 결과를 확인한 뒤, 7개 장면을 모두 생성하려면 다음 명령을 실행한다. 이미 완료한 SC06은 재요청하지 않는다.

```powershell
python scripts/db-cooper-tts-preview.py generate
```

- 원본 음성: `03_tts/sections/SCxx_raw.mp3`
- 1.1배속 청취본: `playback/SCxx_1p1.mp3`
- 장면·샷별 시간: `timing-report.json`
- 입력 작업: `jobs/SCxx.json`, `preview-plan.json`

이 작업은 **현재 v3 대본의 검토용 TTS**다. SC06 수정 후보 v3.1은 아직 반영하지 않았다. 결과를 듣고 길이와 발음을 확인한 뒤 대본·샷 타이밍을 수정한다. 이 음성은 승인된 FINAL TTS가 아니며 `project.db` 또는 최종 편집 타임라인에 등록하지 않는다. 최종 TTS는 Script Directing Lock, 관리자 Story Gate와 FINAL TTS 게이트 검증 후 별도 실행한다.

ElevenLabs 키와 `HISTORY_MYSTERY_LONGFORM` 음성 ID는 저장소 `.env` 또는 현재 터미널 환경 변수에 설정돼 있어야 한다. `check`는 설정 여부만 표시하며 값을 출력하지 않는다. 생성에는 제공자 호출이 발생한다.
