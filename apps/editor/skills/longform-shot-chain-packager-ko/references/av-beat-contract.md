# 음성·화면 비트 계약

`python scripts/validate-longform-av-contract.py --plan <chain-plan.json> --contract <계약.json> --tts-root <FINAL 03_tts 폴더>`를 **첫 이미지 생성 전** 실행한다. 계약과 계획은 같은 프롬프트 개정이어야 한다. 검사기는 FINAL TTS 정렬, 전체 샷 포함, 프롬프트 해시, 핵심 문구와 화면 공개 구간, 파생 START 상태, 반복 모티프를 확인한다. 그림의 품질이나 실제 생성 영상의 동작은 승인하지 않는다.

```json
{
  "schema": "longform-av-beat-contract.v1",
  "project_id": "계획의 project_id",
  "plan_sha256": "chain-plan.json SHA-256",
  "final_tts_manifest_sha256": "FINAL narration_manifest.json SHA-256",
  "shots": [
    {
      "id": "CL01",
      "scene": "SC01",
      "keep_seconds": 10,
      "video_prompt": "prompts/CL01_VIDEO.prompt.txt",
      "video_prompt_sha256": "해당 파일 SHA-256",
      "information_gain": "이 샷에서 새로 알게 되는 사실",
      "start_state_key": "plane_rear_wide",
      "exit_state_key": "stairwell_dark",
      "dominant_visual_motif": "aircraft_rear",
      "beats": [
        {
          "id": "stair_open",
          "narration_phrase": "계단이 열립니다",
          "visual_window_seconds": [4.2, 5.0],
          "tolerance_seconds": 0.35
        }
      ]
    }
  ]
}
```

- 위 숫자와 단어는 형식 예시다. 실제 발화 시간과 계획한 화면 행동을 확인한 값으로 교체한다. 중요한 공개마다 `beats`를 추가하고, 한 구간은 1.5초 이하로 좁게 잡는다.
- 각 VIDEO 프롬프트에 `AV_BEATS_JSON: [{"id":"stair_open","narration_phrase":"계단이 열립니다","visual_window_seconds":[4.2,5.0]}]`처럼 계약의 비트 목록을 그대로 넣는다. 프롬프트에 적힌 행동 초도 이 값과 일치해야 한다. 전체 샷 검사는 이 줄과 계약이 다르면 차단한다.
- 샷 전체를 포함해야 제작 전 검사로 쓸 수 있다. `--allow-partial`은 일부 샷을 진단할 때만 사용한다.
- 다음 START가 직전 클립의 사용 종료 프레임에서 오면 앞 샷의 `exit_state_key`와 다음 샷의 `start_state_key`를 동일하게 쓴다. 독립 START에는 첫 샷을 제외하고 `cut_reason`을 적는다.
- 최근 두 샷과 같은 `dominant_visual_motif`를 다시 쓸 때는 새 정보·화면 변화의 이유를 `repeat_reason`에 적는다. 이유를 적어도 실제 연출의 반복 여부는 관리자 시퀀스 검수에서 다시 판단한다.
- 검사 실패를 시간을 넓히거나 설명 문구만 바꿔 통과시키지 않는다. 실제 연출·음성 배치·프롬프트와 계획의 개정을 함께 수정한다.
