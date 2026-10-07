# 3번 카드·전달 형식
공통 헤더를 포함하고 다음 구조를 사용하라. 증거 패킷과 경험 조건을 요약·참조로 함께 보존하라.

```yaml
artifact_type: experience_storyboard
stage: 3
experience_id: E01
topic_id: T01
constraints: {}
experience_invariants: []
fact_pack_ref: {artifact_id: '...', revision: 1, content_hash: null}
fact_pack_summary: {claims: [], fictional_layer: [], forbidden_assertions: []}
central_question: ...
sequence_arc: []
beat_cards:
  - beat_id: B01
    planned_start_sec: 0
    planned_end_sec: 4
    STORY: ...
    FRAME:
      start: {foreground: '...', midground: '...', background: '...', target_xy: [0.5, 0.5], target_scale: '...'}
      end: {foreground: '...', midground: '...', background: '...', target_xy: [0.7, 0.5], target_scale: '...'}
      hidden: []
      sketch_ref: null
    MOTION: {subject_action: '...', camera_start: '...', camera_path: '...', camera_end: '...'}
    EXIT: {next_beat_id: B02, transition: CONTINUOUS, object_match: '...', direction: right, screen_position: '...', sound_bridge: '...'}
    SOUND: {cues: [], spatial_source: '...', mono_fallback: '...'}
    VIEWER_CHANGE: {before: '...', after: '...'}
    REVEAL: {object: '...', planned_sec: 3, withheld: []}
    EVIDENCE: {claim_refs: [], label: FICTION, limitation: '...'}
    asset_mode: SINGLE
    continuity_locks: []
    fallback: ...
pilot_selection:
  source_beat_ids: [B01, B02]
  source_range_sec: [0, 30]
  planned_duration_sec: 30
  tests: []
  provisional_clip_groups: [{clip_id: CL01, beat_ids: [], planned_duration_sec: 10}]
measured_duration_sec: null
editorial_duration_sec: null
invariant_to_beats: []
next_stage: connected-i2v-clip-director
```

REVEAL.planned_sec와 SOUND.cues의 시간은 해당 비트 시작 기준인지 전체 기준인지 명시하라. 기본은 비트 내 로컬 초이다. 마지막 EXIT는 다음 시퀀스 또는 END를 가리키고 남길 질문을 적으라. ID가 연결되는지 검사하라. 화면 정보의 존재와 인물의 지식을 분리하라.

