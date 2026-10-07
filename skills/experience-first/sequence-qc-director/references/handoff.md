# 5번 보고서 형식
공통 헤더와 다음 내용을 작성하라.

```yaml
artifact_type: sequence_qc_report
stage: 5
experience_id: E01
topic_id: T01
mode: PRE_PRODUCTION # PILOT_REVIEW
reviewed_refs: []
inspection:
  method: text_only # direct_av_playback / visual_frame_sampling / metadata_only
  evidence_refs: []
  temporal_review_complete: false
  audio_review_complete: false
  actual_playback_range_sec: null
  limitations: []
pilot_asset:
  path_or_url: null
  sha256: null
  measured_duration_sec: null
  dimensions: null
  fps: null
  audio_present: null
checks:
  - {check_id: Q01, criterion: '...', result: UNVERIFIED, evidence: '...', observed_time_sec: null}
issues:
  - issue_id: I01
    kind: planned_risk # observed_defect
    severity: P1
    beat_ids: []
    clip_ids: []
    time_range_sec: null
    observation: ...
    viewer_consequence: ...
    action: REVISE_CLIP
    owner_stage: 4
    recheck_scope: []
readiness: BLOCKED
viewer_test: NOT_RUN
narration_gate:
  eligible: false
  reason: 실제 파일럿 검증 전
  locked_storyboard_ref: null
  locked_clip_plan_ref: null
  passed_pilot_ref: null
next_action: ...
```

checks.result는 PASS / FAIL / UNVERIFIED / NOT_APPLICABLE 중 하나로 기록하라. 설계 조건을 검토했으면 계획 근거, 실제 영상을 봤으면 관찰 근거를 쓰라. 실제 음향이 없어 검사할 수 없는 항목을 NOT_APPLICABLE로 감추지 말라.
narration_gate.eligible이 true이면 공통 pilot_status가 PASS이고 mode가 PILOT_REVIEW이며 모든 필수 실제 통과 조건을 충족해야 한다. 다음 단계에 콘티·클립·실제 파일럿의 확정 revision과 해결된 결함 목록을 넘기라.

