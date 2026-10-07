# 4번 전달 형식
공통 헤더에 아래를 추가하고 사실·허구 요약과 경험 조건을 함께 보존하라.

```yaml
artifact_type: connected_clip_plan
stage: 4
experience_id: E01
topic_id: T01
storyboard_ref: {artifact_id: '...', revision: 1, content_hash: null}
constraints: {}
experience_invariants: []
evidence_summary: {claims: [], fictional_layer: [], forbidden_assertions: []}
capability_profile:
  generator: null
  available: false
  requested_duration_sec: 10
  supported_durations_sec: []
  start_image: null
  end_image: null
  continuation: null
  aspect_ratio: null
  resolution: null
  audio_support: null
  checked_at: null
  evidence: []
  status: UNVERIFIED
clips:
  - clip_id: CL01
    beat_ids: [B01, B02]
    planned_duration_sec: 10
    intended_use_range_sec: [0, 10]
    beat_local_ranges: [{beat_id: B01, start_sec: 0, end_sec: 4}]
    asset_mode: SINGLE
    start_frame: {description: '...', asset_ref: null}
    end_frame: {description: '...', asset_ref: null}
    locks: {subject_identity: '...', geometry: '...', screen_direction: '...', style: '...'}
    camera_beats: []
    reveal_events: []
    sound_cues: []
    image_prompts: {start: '...', target: null}
    i2v_prompt: ...
    negative_constraints: []
    fallback: {method: GRAPHIC_COMPOSITE, preserves: [], limitations: []}
    execution_status: PLANNED
connections:
  - {from: CL01, to: CL02, transition: CONTINUOUS, outgoing: {}, incoming: {}, sound_bridge: '...', check: '...'}
pilot_assembly:
  ordered_clip_ids: [CL01, CL02, CL03]
  planned_duration_sec: 30
  temporary_audio_cues: []
clip_manifest_ref: null
next_stage: sequence-qc-director
```

실제 생성했다면 공통 헤더와 artifact_type: clip_manifest로 별도 manifest를 만들라. clips 항목에는 clip_id, source_plan_ref, asset_path 또는 asset_url, sha256, dimensions, fps, measured_duration_sec, intended_use_range_sec, generation_status, review_status, issues를 기록하라. 예상값을 실측 필드에 쓰지 말라. 음향이 별도라면 audio_assets에 실제 파일과 타이밍을 따로 기록하라.

