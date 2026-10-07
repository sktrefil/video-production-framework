# 1번 전달 형식

공통 계약의 패킷 헤더에 다음 내용을 추가하라. 모든 시간은 계획값이다.

```yaml
artifact_type: experience_brief
stage: 1
experience_id: E01
selected_concept_id: EC02
selection_basis: director_recommendation
constraints:
  language: ko
  aspect_ratio: '16:9'
  target_duration_sec: null
  pilot_duration_sec: 30
  style: NON_REALISTIC_STYLIZED
  fixed_topic: null
  prohibited: []
viewer_promise: ...
sensory_hook: {visual: '...', sound: '...', planned_sec: 3}
attention_target: ...
perception_arc: ['기대', '의심', '발견', '재해석']
camera_mechanism: {start: '...', path: '...', occlusion: '...', reveal: '...', purpose: '...'}
sound_mechanism: {source: '...', spatial_change: '...', rhythm: '...', information_change: '...'}
visual_transformation: {description: '...', epistemic_label: VISUAL_METAPHOR}
connection_motif: ...
topic_requirements: {must_have: [], optional: [], reject_if: []}
experience_invariants: []
pilot_experience_beats:
  - {id: EB01, start_sec: 0, end_sec: 4, see: '...', hear: '...', viewer_change: '...'}
production_risks: [{risk: '...', fallback: '...'}]
concept_candidates: []
recommendation_reason: ...
next_stage: mystery-history-fiction-topic-finder
```

experience_invariants에 후속 단계가 보존할 경험 조건을 3~5개 두라. 예: 추적한 소리와 보이는 물체의 관계가 마지막에 바뀐다. 별도 후보의 특징을 혼합해 추천안을 모호하게 만들지 말라.

