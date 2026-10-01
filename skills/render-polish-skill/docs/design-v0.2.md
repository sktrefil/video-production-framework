# 보조 스킬 설계서 v0.2
## 가칭: `render-polish-skill`

---

# 0. 목적

`render-polish-skill`은 메인 감독 스킬인 `history-fantasy-storyboard-director`가 확정한
서사, 카메라, 구도, 연속성, 역사 사실, START/TARGET/EXIT 상태를 **절대 재설계하지 않고**,
이미지 생성용 프롬프트의 시각적 완성도와 화면 가독성을 높이는 보조 스킬이다.

핵심 역할은 다음과 같다.

1. 이미지의 시각적 청결도 향상
2. focal hierarchy 강화
3. subject / background separation 개선
4. depth / material separation 개선
5. lighting hierarchy 개선
6. clutter 감소
7. cinematic animation-keyframe finish 강화
8. 카메라 모션을 방해하는 시각 요소 제거
9. 스타일 참조와 Visual Bible의 외관 일치 강화
10. Chrome ChatGPT 이미지 생성용 최종 render prompt 보정
11. polish 전후 locked field 무결성 자동 검증
12. polish로 실제 무엇을 변경했는지 추적
13. prompt 길이/중복 통제
14. continuity clip의 색/조명 변화 폭 제한
15. pre-render와 post-render QC를 분리

이 스킬은 **감독 스킬이 아니다.**

---

# 1. 상위 관계

구조:

`MAIN DIRECTOR`
→ `LOCKED IMAGE CONTRACT`
→ `PRE-RENDER POLISH VALIDATION`
→ `RENDER POLISH`
→ `FINAL CHROME GPT PROMPT`
→ `IMAGE GENERATION`
→ `POST-RENDER VISUAL QC`
→ `MAIN DIRECTOR QC`

메인 스킬이 카메라와 영상적 목적을 결정하고,
보조 스킬은 그 결정을 **더 보기 좋게 구현**한다.

---

# 2. 최상위 철학

## 2.1 Directing Lock Principle
보조 스킬은 다음을 바꿀 수 없다.

- FACT_LOCK
- story_event
- clip_structure_mode
- tension_function
- shot_size
- camera_height
- camera_angle
- camera_path
- camera_speed_profile
- entry_state
- target_state
- exit_state
- continuity_mode
- primary_action
- motion_vector
- next_handoff
- reference priority

## 2.2 Readability-first Polish
장식적 디테일보다 **카메라가 움직일 때 잘 읽히는 화면**을 우선한다.

## 2.3 Clean Cinematic Finish
목표는 과장된 디테일이 아니라:

- clean silhouette
- controlled contrast
- readable depth
- restrained palette
- material separation
- elegant lighting
- stable face/hand readability
- uncluttered frame

이다.

## 2.4 Motion-supportive Polish
이미지는 정지 일러스트가 아니라 영상클립의 키프레임이므로
polish는 camera corridor, parallax, negative space를 보존해야 한다.

## 2.5 Reference Discipline
STYLE_ANCHOR는 CHARACTER_LOCK, WORLD_LOCK, CONTINUITY_EXIT보다 우선할 수 없다.

---

# 3. 입력 계약

입력은 메인 스킬에서 승인된 `LOCKED IMAGE CONTRACT`다.

```yaml
image_job_id: ""
story_event: ""

fact_lock: []
visual_bible_ids: []

must_preserve: []
must_change: []
must_not_add: []

shot_size: ""
camera_height: ""
camera_angle: ""
camera_path_support: ""
camera_corridor: ""
depth_design: ""

subject_state: ""
environment_state: ""
motion_ready_space: ""
next_handoff: ""

reference_images:
  - id: ""
    role: ""

base_prompt_en: |
  ...

negative_constraints: []

locked_snapshot_before:
  fact_lock: []
  story_event: ""
  clip_structure_mode: ""
  tension_function: ""
  shot_size: ""
  camera_height: ""
  camera_angle: ""
  camera_path: ""
  camera_speed_profile: ""
  entry_state: ""
  target_state: ""
  exit_state: ""
  continuity_mode: ""
  primary_action: ""
  motion_vector: ""
  next_handoff: ""
  reference_priority: []
```

---

# 4. 출력 계약

보조 스킬은 다음을 출력한다.

```yaml
render_polish_job_id: ""

locked_snapshot_before: {}
locked_snapshot_after: {}

locked_fields_verified: true
locked_diff_count: 0

polish_strength: LIGHT | STANDARD | STRONG

polish_delta:
  reduced: []
  enhanced: []
  preserved: []

visual_hierarchy:
  focal_subject: ""
  secondary_read: ""
  background_role: ""

lighting_polish:
  key_light: ""
  fill_behavior: ""
  contrast_control: ""
  separation_goal: ""
  delta_limit:
    exposure_change: LOW | MEDIUM
    contrast_change: LOW | MEDIUM
    direction_change: PROHIBITED | LIMITED
    color_temperature_shift: MINIMAL | LIMITED

material_polish:
  subject_materials: []
  environment_materials: []
  separation_notes: []

clutter_control:
  remove_or_reduce: []
  preserve: []

color_discipline:
  dominant_palette: []
  accent_policy: ""
  saturation_policy: ""
  continuity_mode: STRICT | MODERATE | FREE

motion_support:
  camera_corridor_clear: true
  parallax_source_preserved: true
  negative_space_preserved: true
  exit_readability_preserved: true

anatomy_readability:
  face_readability: ""
  hand_readability: ""
  silhouette_readability: ""
  identity_preserved: true
  pose_preserved: true

style_alignment:
  visual_bible_match: ""
  style_anchor_match: ""
  forbidden_style_drift: []

prompt_budget:
  base_prompt_chars: 0
  polish_added_chars: 0
  added_ratio: 0.0
  max_added_ratio: 0.40
  duplicate_instruction_count: 0

final_prompt_en: |
  ...

pre_render_qc:
  status: PASS | PASS_WITH_WARNINGS | BLOCKED
  warnings: []

post_render_qc:
  status: PASS | PASS_WITH_WARNINGS | BLOCKED
  warnings: []
```

---

# 5. Locked Snapshot Diff

보조 스킬 실행 전후에 locked field를 비교한다.

필수 규칙:

```text
locked_snapshot_before
vs
locked_snapshot_after
```

다음 항목은 diff 0이어야 한다.

- story_event
- shot_size
- camera_angle
- camera_height
- camera_path
- camera_speed_profile
- entry_state
- target_state
- exit_state
- continuity_mode
- primary_action
- motion_vector
- next_handoff
- fact_lock
- reference_priority

판정:

- `locked_diff_count = 0` → PASS 가능
- `locked_diff_count > 0` → `P0 BLOCKED`

보조 스킬은 locked field 변경을 "개선"으로 간주할 수 없다.

---

# 6. Polish Delta

보조 스킬은 실제로 무엇을 바꿨는지 반드시 기록한다.

```yaml
polish_delta:
  reduced:
    - background micro-detail
    - secondary light hotspots
  enhanced:
    - subject/background luminance separation
    - stone/bone material separation
  preserved:
    - camera corridor
    - subject position
    - exit opening
    - foreground parallax source
```

원칙:
- 변경 사항이 없는 polish는 불필요한 재작성 금지
- preserved 항목은 locked/motion-support 핵심을 반영
- 새 요소 추가보다 reduction / separation을 우선

---

# 7. Polish 우선순위

충돌 시:

`DIRECTING_LOCK`
→ `CONTINUITY_LOCK`
→ `MOTION_READABILITY`
→ `FOCAL_HIERARCHY`
→ `LIGHTING`
→ `MATERIAL`
→ `COLOR`
→ `MICRO_DETAIL`

세부 질감은 항상 마지막이다.

---

# 8. Visual Hierarchy 규칙

이미지에서 시청자의 첫 시선이 어디로 가는지 명확해야 한다.

## 필수 구조
- Primary read
- Secondary read
- Background role

## 금지
- 모든 요소가 같은 대비
- 모든 영역이 동일한 디테일 밀도
- 배경이 주피사체보다 강한 색/빛
- 장식물이 시선을 빼앗는 구도

---

# 9. Lighting Polish + Delta Limit

조명은 예쁘게 만드는 용도만이 아니라 **읽기 쉽게 만드는 용도**다.

목표:
- subject separation
- depth separation
- material readability
- focal guidance

기본 delta 제한:

```yaml
lighting_delta_limit:
  exposure_change: LOW
  contrast_change: LOW | MEDIUM
  direction_change: PROHIBITED
  color_temperature_shift: MINIMAL
```

`STORY_CUT` 또는 명시된 장소/시간 변화가 있을 때만 일부 완화 가능.

금지:
- 과한 rim light
- 과도한 bloom
- 판타지 광원 남발
- 역사적 환경과 충돌하는 네온성 조명
- 배경 전체를 밝히는 flat lighting
- continuity clip에서 광원 방향 재설계

---

# 10. Material Separation

서로 다른 재질이 한 덩어리처럼 보이지 않게 한다.

예:
- skin
- hide/fur
- stone
- bone
- wood
- metal(허용 시)
- cave wall
- soil

하지만 재질 표현은 과도한 micro-detail이 아니라
**시각적 구분**이 목적이다.

---

# 11. Clutter Control

보조 스킬의 핵심 역할 중 하나.

감점 대상:
- 불필요한 소품
- 같은 종류의 오브젝트 과다
- 배경 텍스처 과밀
- foreground가 camera corridor 방해
- 의미 없는 장식
- 빛 포인트 과다

원칙:
> Remove detail before adding detail.

---

# 12. Color Discipline + Continuity-safe Color

## 기본
- dominant color family 1~2개
- accent color 제한
- saturation 전체 상승 금지
- focal subject 주변만 필요 시 대비 강화
- Visual Bible 우선

## continuity mode

### `STRICT`
기본 적용:
- EXIT_MATCH
- CONTINUATION

규칙:
- hue family shift 최소
- saturation shift 최소
- exposure shift 최소
- dominant palette 변경 금지
- accent color 변경 최소

### `MODERATE`
적용:
- BIBLE_MATCH
- 같은 장면이지만 shot scale/lighting이 약간 달라짐

### `FREE`
적용:
- STORY_CUT
- 장소/시간/세계 상태가 명확히 바뀜

단, FREE도 Visual Bible 범위 내.

---

# 13. Anatomy / Figure Readability

인물이 있을 경우:
- face shape 안정
- hand/finger readability
- limb silhouette 분명
- costume layers 구분
- 과도한 포즈 왜곡 금지

우선순위:

`identity preservation`
→ `pose preservation`
→ `hand correctness`
→ `facial clarity`
→ `cosmetic improvement`

보조 스킬은 포즈 자체를 변경하지 않는다.

---

# 14. Motion-support Polish

보조 스킬은 반드시 확인:

- camera corridor가 여전히 열려 있는가
- foreground parallax source가 유지되는가
- subject motion space가 남아 있는가
- negative space가 사라지지 않았는가
- target/exit composition이 유지되는가

이 중 하나라도 polish 때문에 망가지면 `P7 BLOCKED`.

---

# 15. Reference Role 처리

우선순위:

1. CONTINUITY_EXIT
2. CHARACTER_LOCK
3. WORLD_LOCK
4. PROP_LOCK
5. COMPOSITION_REFERENCE
6. STYLE_ANCHOR

STYLE_ANCHOR는:
- palette
- finish
- cleanliness
- lighting feel
- material treatment

만 참고한다.

---

# 16. Prompt 구조 + Prompt Budget

최종 Chrome GPT prompt는 다음 순서를 사용한다.

1. LOCKED DIRECTING
2. MUST PRESERVE
3. VISUAL HIERARCHY
4. LIGHTING
5. MATERIAL / DEPTH
6. COLOR
7. MOTION SUPPORT
8. RENDER FINISH
9. NEGATIVE CONSTRAINTS

## Prompt Budget

기본 제한:

```text
polish_added_chars / base_prompt_chars <= 0.40
```

권장:
- LIGHT: <= 0.20
- STANDARD: <= 0.35
- STRONG: <= 0.40

금지:
- 중복 형용사
- 같은 의미의 lighting/material 반복
- 기존 directing 문장 재서술
- 핵심 연출보다 polish 문장이 길어지는 구조

---

# 17. Polish Strength Level

```yaml
polish_strength: LIGHT | STANDARD | STRONG
```

## LIGHT
- continuity image
- 이미 잘 나온 이미지
- 작은 조명/클러터 정리

## STANDARD
기본값.
- hierarchy
- lighting
- material
- color
- clutter

## STRONG
사용 조건:

- P0 Directing Lock PASS
- P7 Motion Support PASS
- composition already approved
- identity reference available

하나라도 미충족하면 STANDARD 이하로 제한.

---

# 18. Pre-render Validator

이미지 생성 전에 자동/구조적으로 검사 가능한 항목.

검사:
- required fields
- locked snapshot before/after diff
- reference priority
- polish strength
- prompt budget
- continuity color mode
- lighting delta limit
- final prompt section order
- forbidden directing rewrite

판정:
- PASS
- PASS_WITH_WARNINGS
- BLOCKED

---

# 19. Post-render Visual QC

이미지 생성 후 실제 시각 결과를 검사한다.

검사:
- subject readability
- focal hierarchy
- clutter
- camera corridor
- parallax source
- depth separation
- lighting separation
- material separation
- color continuity
- face/hand readability
- style drift
- exit readability

판정:
- APPROVED
- REVISE
- REGENERATE
- BLOCKED

Pre-render PASS라도 Post-render에서 실패할 수 있다.

---

# 20. Render Quality Gate

## P0 — DIRECTING LOCK
locked snapshot diff 검사

## P1 — FOCAL HIERARCHY
주피사체/보조/배경 읽기 순서

## P2 — LIGHTING SEPARATION
subject/depth 분리 + delta limit

## P3 — MATERIAL SEPARATION
재질 구분

## P4 — CLUTTER CONTROL
화면 혼잡도

## P5 — COLOR DISCIPLINE
팔레트/강조색 + continuity-safe color

## P6 — ANATOMY READABILITY
얼굴/손/실루엣/identity

## P7 — MOTION SUPPORT
camera corridor/parallax/negative space

## P8 — STYLE ALIGNMENT
Visual Bible / Style Anchor

## P9 — PROMPT EFFICIENCY
prompt budget / duplicate instruction

판정:
- PASS
- PASS_WITH_WARNINGS
- BLOCKED

Hard fail:
- P0
- P7
- P9 prompt budget 심각 초과

---

# 21. 금지 패턴

- detail for detail's sake
- over-sharpened textures
- overdesigned fantasy ornaments
- cinematic teal-orange 강제
- heavy bloom
- excessive rim light
- busy particles
- dramatic color shift that breaks continuity
- background enhancement stronger than subject
- face beautification that changes identity
- composition recrop that changes shot size
- new props for visual richness
- fake text / symbols / map / DNA graphics
- camera corridor filling
- depth flattening
- locked field rewrite
- prompt padding / adjective stacking

---

# 22. Main Skill과의 역할 경계

메인 스킬 질문:
> 이 이미지가 영상클립으로 움직일 수 있는가?

보조 스킬 질문:
> 그 움직임을 유지하면서 화면을 더 깔끔하고 읽기 좋게 만들 수 있는가?

보조 스킬은:
- 새로운 camera idea를 제안하지 않는다
- shot scale을 변경하지 않는다
- 새로운 서사 이벤트를 추가하지 않는다
- START/TARGET/EXIT를 재설계하지 않는다

---

# 23. Fail / Recovery

## REVISE
- clutter 일부 감소
- lighting contrast 조정
- color saturation 정리
- material separation 개선

## REGENERATE
- 이미지 자체의 anatomy 실패가 큼
- style drift 심함
- continuity identity drift 심함

## BLOCKED
- polish 요구가 directing lock 변경을 요구함
- motion-support가 이미 깨져 있음
- 입력 contract 불완전
- locked snapshot diff 발생
- prompt budget 심각 초과

---

# 24. 검증 시나리오

## Test A — 과도한 배경 디테일
기대:
- P4 fail
- background detail 감소

## Test B — 주피사체가 배경에 묻힘
기대:
- P1/P2 fail
- subject separation 강화

## Test C — Style Anchor가 Character Lock을 덮어씀
기대:
- P0 BLOCKED

## Test D — 카메라 corridor를 장식물이 막음
기대:
- P7 BLOCKED

## Test E — 이미지가 이미 충분히 좋음
기대:
- LIGHT polish
- 최소 수정

## Test F — 과도한 판타지 조명
기대:
- P2/P5/P8 fail
- Visual Bible 범위로 복귀

## Test G — 손/얼굴은 약하지만 구도는 좋음
기대:
- anatomy readability 개선
- identity/pose/camera 유지

## Test H — locked field 하나라도 변경
기대:
- locked_diff_count > 0
- P0 BLOCKED

## Test I — prompt가 과도하게 길어짐
기대:
- P9 FAIL
- 중복 polish 문장 축약

## Test J — CONTINUATION에서 palette 급변
기대:
- P5 BLOCKED 또는 REVISE
- STRICT continuity color 적용

---

# 25. 합격 기준

| 영역 | 기준 |
|---|---|
| Directing Lock | diff 0 |
| Motion Support | 손상 0 |
| Visual Hierarchy | 주/보조/배경 명확 |
| Clutter | 불필요 요소 최소 |
| Lighting | separation 확보 + delta limit 준수 |
| Color | continuity mode 준수 |
| Material | 핵심 재질 구분 |
| Anatomy | 얼굴/손/실루엣 실사용 수준 |
| Style | Style Anchor는 보조 역할만 수행 |
| Prompt | polish ratio 제한 준수 |
| Polish Delta | 변경/유지 추적 가능 |
| Pre-render QC | 구조 검증 가능 |
| Post-render QC | 실제 이미지 판정 가능 |
| Recovery | REVISE / REGENERATE / BLOCKED 구분 가능 |

---

# 26. 디렉터리 제안

```text
render-polish-skill/
├── SKILL.md
├── references/
│   ├── visual-hierarchy.md
│   ├── lighting-separation.md
│   ├── material-separation.md
│   ├── clutter-control.md
│   ├── color-discipline.md
│   ├── anatomy-readability.md
│   ├── motion-support.md
│   ├── reference-discipline.md
│   ├── prompt-budget.md
│   └── negative-patterns.md
├── assets/
│   ├── polish-job-template.md
│   ├── polish-qc-template.md
│   └── final-prompt-template.md
└── scripts/
    ├── validate_polish_contract.py
    ├── validate_locked_fields.py
    ├── validate_prompt_budget.py
    └── validate_continuity_color.py
```

---

# 27. 아직 구현하지 않는 것

- 실제 SKILL.md
- validator 구현
- Chrome 자동화
- 이미지 생성
- 메인 스킬과 자동 체이닝
- VPF 코드 변경

먼저 이 v0.2 설계서 검증 후 실제 패키지로 구현한다.
