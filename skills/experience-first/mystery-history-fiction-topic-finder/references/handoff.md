# 2번 전달 형식
공통 헤더와 함께 아래 내용을 작성하라. 1번 경험 요약도 보존하여 3번에서 재해석하지 않게 하라.

```yaml
artifact_type: topic_match_pack
stage: 2
experience_id: E01
experience_brief_ref: {artifact_id: '...', revision: 1, content_hash: null}
experience_summary: {viewer_promise: '...', experience_invariants: [], constraints: {}}
selected_topic:
  topic_id: T01
  title: ...
  genre: HISTORY # MYSTERY / LEGEND / FICTION / HISTORY_WITH_FICTION
  scope: ...
  central_question: ...
  selection_basis: director_recommendation
  evidence_status: VERIFIED # UNVERIFIED / PARTIAL / NOT_APPLICABLE_FICTION
topic_candidates: []
experience_fit:
  - {invariant: '...', realization: '...', fact_refs: [], epistemic_label: FICTION}
story_seed:
  initial_inference: ...
  pursuit_clue: ...
  reveal: ...
  reinterpretation: ...
  unresolved_question: ...
fact_pack:
  sources:
    - {source_id: S01, title: '...', url: '...', publisher: '...', date: null, locator: '...', independence_group: '...'}
  claims:
    - {claim_id: F01, claim: '...', label: FACT, source_refs: [S01, S02], confidence: '...', limitations: '...'}
  uncertainties: []
  factual_core: []
  fictional_layer: []
  visual_metaphors: []
  forbidden_assertions: []
production_implications: []
next_stage: experience-storyboard-director
```

허구는 sources를 비워두고 fictional_layer의 설정에 FICTION claim ID를 부여하라. fact_refs를 빈 배열로 쓰더라도 화면 설정의 분류와 인과를 기록하라. source_id/claim_id를 문서 전체에서 유일하게 유지하라. 실제 사건의 claims에서 source_refs가 존재하는지 확인하라.

