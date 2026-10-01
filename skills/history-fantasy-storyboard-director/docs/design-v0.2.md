# 메인 스킬 커스텀 설계서 v0.2
## 가칭: `history-fantasy-storyboard-director`

---

# 0. 목적

기존 `create-storyboard-skill`의 강점인 continuity bible, shot card, handoff matrix, edit boundary, reference-image discipline을 유지하되, 현재 VPF의 히스토리 판타지 롱폼 제작 방식에 맞게 재설계한다.

이 스킬은 **이미지를 직접 생성하는 스킬이 아니라, 서사와 영상클립과 카메라 연출을 먼저 설계하고 그 결과를 이미지 및 I2V 프롬프트로 연결하는 감독 스킬**이다.

핵심 목표는 다음과 같다.

1. 대본/TTS를 서사 비트와 Visual Beat로 분해한다.
2. 각 Visual Beat가 실제 영상클립에서 무엇을 전달해야 하는지 먼저 정의한다.
3. 이미지보다 **카메라 연출을 우선**한다.
4. 카메라 연출에 맞는 START / TARGET / EXIT 이미지 구조를 설계한다.
5. 이미지가 카메라 모션을 잘 구현할 수 있도록 화면 구도, depth, corridor, subject placement를 먼저 설계한다.
6. 이미지 프롬프트와 영상 프롬프트를 별도로 만들지 않고, 하나의 `CLIP DIRECTING CONTRACT`에서 파생한다.
7. 클립 사이에는 frame continuity뿐 아니라 **camera energy / tension continuity**까지 설계한다.
8. 시청자의 흥미, 긴장, 시청지속을 우선하며 정적·느린 연출을 기본값으로 사용하지 않는다.
9. 역사 사실과 판타지 연출의 경계를 명확히 분리한다.
10. Chrome ChatGPT에서 실제 이미지를 생성할 수 있도록 검증된 이미지 생성 패킷을 출력한다.
11. 생성 이미지가 반환되면 Motion Readiness / Continuity / Camera-Tension / Horizon Grammar 기준으로 재검수한다.
12. 통과한 이미지만 I2V 영상 생성 단계로 넘긴다.

---

# 1. 최상위 제작 철학

## 1.1 Clip-first Principle
실제 제작 단위는 정지 이미지가 아니라 **영상클립**이다.

> The clip is the real unit, not the still image.

이미지는 독립적인 완성 일러스트가 아니라, 향후 영상클립의 카메라 모션과 서사 전달을 가능하게 하는 **camera-ready narrative surface**다.

## 1.2 Camera-first Principle
이미지보다 카메라 연출이 먼저다.

순서:

`대본/TTS → 서사 사건 → 영상클립 목적 → 카메라 연출 → 이미지 구조 → I2V 모션 → 편집`

금지 순서:

`대본 → 이미지 → 나중에 카메라를 붙이는 방식`

## 1.3 Viewer-Attention Principle
시청자의 관심, 긴장감, 시청지속을 우선한다.

- 정적 프레임 장시간 유지 금지
- 느린 push-in 반복 금지
- 단순 얼굴 확대만으로 긴장 유지 금지
- 짧은 컷 남발도 금지
- 카메라·시선·정보 변화로 체감 속도를 만든다

## 1.4 Readability over Excess Detail
정지 이미지의 세부 디테일보다 **카메라가 움직일 때 읽히는 화면**이 중요하다.

- clean focal hierarchy
- clear silhouette
- subject/background separation
- uncluttered camera corridor
- controlled depth
- motion-readable composition

디테일이 많아도 카메라 움직임을 방해하면 감점한다.

## 1.5 Narrative → Clip → Image Link
모든 이미지와 영상 프롬프트는 반드시 대본의 서사 비트까지 추적 가능해야 한다.

---

# 2. 원본 `create-storyboard-skill`에서 유지할 핵심

유지 항목:

- continuity bible
- character / scene / prop lock
- shot card
- action start / action end
- emotion start / emotion end
- receiver-in
- handoff-out
- motion vector
- spatial bridge
- visual bridge
- edit boundary matrix
- reference image discipline
- risk / fallback
- clean keyframe 우선
- storyboard board와 실제 video input keyframe 분리
- 180-degree axis / eyeline / screen direction 관리
- J-cut / L-cut / action match / eyeline match / occlusion cut
- 한 클립에 복잡한 다중 blocking을 몰아넣지 않는 원칙
- story-driven duration

---

# 3. 원본에서 제거 또는 추상화할 항목

## 3.1 특정 도구 종속성 제거
원본:
- Image 2
- SceneDance / Seedance
- Jianying / CapCut

커스텀:
- `IMAGE_RENDERER`
- `VIDEO_GENERATOR`
- `EDITOR`

현재 기본 실행 프로필:
- `IMAGE_RENDERER = Chrome ChatGPT`
- `VIDEO_GENERATOR = project-selected I2V`
- `EDITOR = VPF-selected editor`

감독 스킬의 연출 논리는 특정 생성기 이름에 종속되지 않는다.

## 3.2 `SH### = CLIP###` 고정 제거

새 구조:

`SCENE → VB### → SH### → CLIP###`

- Visual Beat가 상위 연출 단위
- 하나의 Visual Beat는 기본적으로 새 정보/사건 1개
- 하나의 VB가 1개 또는 여러 CLIP으로 구현 가능
- 기본 4–7초
- sustained action / atmosphere / 긴 문장: 8–12초
- 필요 시 10–15초
- 2초대 컷 반복적 남발 금지

## 3.3 중국어/영어 이중 프롬프트 의무 제거
- canonical image prompt = English
- review summary = Korean optional
- 중국어 프롬프트는 generator adapter에서만 사용

---

# 4. 상위 우선순위 규칙

충돌 시:

`FACT_LOCK`
→ `PROJECT VISUAL BIBLE`
→ `CAMERA-FIRST DIRECTING`
→ `ATTENTION / TENSION`
→ `CONTINUITY`
→ `VISUAL BEAT STORY EVENT`
→ `RENDER POLISH`
→ `GENERATOR-SPECIFIC OPTIMIZATION`

Render Polish나 이미지 모델의 미적 선택이 역사 사실, 카메라 설계, continuity를 덮어쓸 수 없다.

---

# 5. History / Fantasy 경계

각 Visual Beat에 반드시 포함:

## `FACT_LOCK`
변경·창작 금지 사실.

## `FANTASY_ALLOWED`
사실 왜곡 없이 허용되는 영화적 표현.

## `INVENTION_PROHIBITED`
창작 금지.

예:
- 확인되지 않은 인물 이름
- 가족관계
- 실제 만남
- 전투
- 원인·동기 단정
- 허구적 유물 기능
- 근거 없는 갑옷/무기/문자/지도

---

# 6. Visual Beat 기본 계약

```yaml
vb_id: SC01_VB01
story_event: ""
duration_target: ""

fact_lock: []
fantasy_allowed: []
invention_prohibited: []

clip_structure_mode: ""
tension_function: ""
attention_event: ""

shot_size_start: ""
shot_size_end: ""
camera_height: ""
camera_angle: ""

camera_intent: ""
camera_path: ""
camera_speed_profile: ""
camera_phases: []
reveal_point: ""
parallax_source: ""
focus_shift: ""
exit_orientation: ""

foreground: ""
midground: ""
background: ""

primary_subject: ""
primary_action: ""
secondary_action: ""
environment_motion: ""

entry_state: ""
key_event: ""
target_state: ""
exit_state: ""

continuity_mode: ""
next_handoff: ""

camera_energy_in: ""
camera_energy_out: ""
motion_vector_in: ""
motion_vector_out: ""
entry_speed: ""
exit_speed: ""

reference_images: []
bible_ids: []

motion_readiness: ""
horizon_gate: ""
attention_gate: ""
camera_tension_gate: ""
readability_gate: ""

risks: []
fallback_plan: ""
```

---

# 7. CLIP_STRUCTURE_MODE

## `SINGLE_IMAGE`
한 이미지로 충분한 클립.

적합:
- insert
- evidence detail
- 짧은 atmosphere
- 단순 reveal
- 작은 camera move

## `START_TARGET`
IMG01 → IMG02가 필요한 클립.

적합:
- 시작과 끝 상태가 분명히 다름
- reveal 결과 중요
- camera arrival point 중요
- composition target 변화
- 정보 진전 명확

## `CONTINUATION`
이전 EXIT를 강하게 이어받는 클립.

내부적으로:
- single image일 수도 있고
- start-target일 수도 있음

즉 `CONTINUATION`은 클립 간 관계이고, 이미지 구조와 독립적이다.

## 자동 선택 규칙

- static evidence insert + small camera move → `SINGLE_IMAGE`
- meaningful camera translation + clear arrival composition → `START_TARGET`
- pose/state change medium 이상 → `START_TARGET`
- reveal target이 최종 프레임에서 중요 → `START_TARGET`
- 이전 EXIT의 frame/motion을 직접 이어받음 → `CONTINUATION`
- strict motion handoff가 없고 새 정보로 전환 → `SINGLE_IMAGE` 또는 `START_TARGET` + `STORY_CUT`

---

# 8. CLIP DIRECTING CONTRACT

이미지 프롬프트와 영상 프롬프트는 반드시 하나의 계약에서 파생한다.

```yaml
clip_id: CLIP012
vb_id: SC01_VB04

story_event: ""
tension_function: BUILD | HOLD | RELEASE | REVEAL | REDIRECT | HANDOFF

camera_start: ""
camera_path: ""
camera_speed_profile: ""
camera_phases:
  - time: "0-2s"
    function: "REVEAL"
  - time: "2-4s"
    function: "FOLLOW"
  - time: "4-6s"
    function: "PARALLAX_HIT"
  - time: "6-8s"
    function: "TARGET_EXIT"

reveal_point: ""
focus_shift: ""
parallax_source: ""

entry_state: ""
target_state: ""
exit_state: ""

camera_energy_in: ""
camera_energy_out: ""
motion_vector_in: ""
motion_vector_out: ""
entry_speed: ""
exit_speed: ""

next_clip_receiver: ""
audio_bridge: ""
tts_cue_time: ""
visual_hit_time: ""
sfx_cue: ""
```

---

# 9. Horizon / Cinematic Directing Grammar

## 9.1 Story Rule
한 Visual Beat에서 새로 전달하는 핵심 정보/사건은 기본 1개.

## 9.2 Scale Contrast
연속 비트에서 같은 shot scale 반복을 피한다.

권장:
- Wide → Medium → Detail → Wide
- Medium → Close → Wide
- Tracking Wide → Hand Detail → Environmental Reveal

## 9.3 Minimum Change Rule
인접 VB는 다음 중 최소 2개 변화:

- 장소
- shot size
- 주피사체
- 카메라 방식
- depth 구조
- 빛/환경 상태
- motion vector

strict continuity일 때만 예외.

## 9.4 Depth Rule
가능하면 foreground / midground / background 기능 분리.

foreground는 최소 하나의 역할:
- parallax
- reveal
- occlusion
- transition

## 9.5 Camera Rule
카메라는 정보 전달과 긴장 조절에 사용.

금지:
- 이유 없는 slow push-in 반복
- 동일한 straight zoom 반복
- 인물 확대만으로 관심 유지
- 물리적 corridor가 없는 이동

## 9.6 Interest Rule
가능하면 첫 3–4초 내 의미 있는 변화 발생.

허용:
- reveal
- subject action
- parallax change
- focus shift
- spatial discovery
- visual question
- camera reorientation

## 9.7 Exit Rule
모든 연속 장면은 `EXIT_STATE` 명시.

다음으로 넘길 수 있는 baton:
- 피사체
- motion direction
- eyeline
- object
- foreground
- light
- spatial opening
- silhouette
- sound cue

---

# 10. Camera Tension Grammar

카메라는 단순 이동이 아니라 긴장 곡선을 만든다.

## `TENSION_FUNCTION`

- `BUILD` = 긴장 상승
- `HOLD` = 긴장 유지
- `RELEASE` = 일시적 완화
- `REVEAL` = 정보 공개
- `REDIRECT` = 시선 전환
- `HANDOFF` = 다음 컷으로 에너지 전달

## 기본 원칙

- 이동 → 감속 → focus shift → 재이동 같은 속도 대비 활용
- 장면 내부에 최소 1개의 attention event
- 카메라 모션 종료점과 편집 판단점을 연결
- 무의미한 hold 금지
- 정적 장면은 예외적으로만 사용

정적 허용 예:
- 긴장 직전 짧은 hold
- 증거 확인 1–2초
- 충격 직후 의도적 pause

---

# 11. Camera Energy Continuity

프레임 연속성 외에 에너지 연속성을 관리한다.

필수 필드:

```yaml
camera_energy_in: ""
camera_energy_out: ""
motion_vector_in: ""
motion_vector_out: ""
entry_speed: ""
exit_speed: ""
entry_orientation: ""
exit_orientation: ""
visual_focus_in: ""
visual_focus_out: ""
```

연결 원칙:

- 강한 tracking → 다음 컷도 같은 vector를 이어받거나 의미 있는 변환
- 강한 motion → detail movement로 에너지 축소 가능
- 의도적 정지 → 이유 명시
- 에너지 급락은 서사적 목적 없으면 FAIL

---

# 12. Continuity Mode

## `BIBLE_MATCH`
세계관/인물/장소 유지, strict frame continuation 불필요.

## `EXIT_MATCH`
이전 EXIT가 다음 START를 직접 받음.

## `CONTINUATION`
하나의 동작/카메라 이동이 다음 클립까지 지속.

## `STORY_CUT`
의도적으로 새 시간/장소/정보로 전환.

모호한 `smooth transition`만 단독 사용 금지.

---

# 13. Shot Fingerprint / 반복 방지

각 VB/CLIP마다 fingerprint 생성:

```text
SHOT_FINGERPRINT =
location
+ shot_size
+ camera_move
+ primary_subject
+ depth_pattern
+ visual_motif
+ lighting_state
+ motion_vector
```

검사:
- 이전 2~3개 비트와 비교
- 유사도가 높고 서사적 이유 없음 → WARN 또는 BLOCKED
- 동일 Wide + Push + Centered 반복 → 기본 FAIL

---

# 14. Reference Priority

참조 이미지가 여러 개일 때 우선순위:

1. `CONTINUITY_EXIT`
2. `CHARACTER_LOCK`
3. `WORLD_LOCK`
4. `PROP_LOCK`
5. `COMPOSITION_REFERENCE`
6. `STYLE_ANCHOR`

하위 참조는 상위 참조를 덮어쓸 수 없다.

각 reference는 반드시 role 선언.

---

# 15. 이미지 프롬프트 구조

프롬프트 우선순위:

1. `MUST PRESERVE`
2. `CAMERA / COMPOSITION`
3. `SUBJECT / ACTION`
4. `ENVIRONMENT / DEPTH`
5. `RENDER QUALITY`
6. `NEGATIVE CONSTRAINTS`

과도한 장문 설명보다 계층화된 지시를 우선.

---

# 16. Chrome GPT 이미지 생성 패킷

```yaml
image_job_id: SC01_VB04_START
renderer: CHROME_CHATGPT
aspect_ratio: "16:9"

purpose: ""
story_event: ""

reference_images:
  - id: ""
    role: CHARACTER_LOCK | WORLD_LOCK | STYLE_ANCHOR | CONTINUITY_EXIT | COMPOSITION_REFERENCE

must_preserve: []
must_change: []
must_not_add: []

shot_size: ""
camera_height: ""
camera_angle: ""
camera_path_support: ""
composition: ""
depth_design: ""
camera_corridor: ""

subject_state: ""
environment_state: ""
motion_ready_space: ""
next_handoff: ""

canonical_prompt_en: |
  ...

review_summary_ko: |
  ...

negative_constraints: []
```

---

# 17. Chrome GPT Renderer-only 원칙

Chrome GPT는 감독 역할을 다시 수행하지 않는다.

변경 금지:
- story event
- shot size
- camera direction
- primary subject
- continuity mode
- entry / target / exit
- FACT_LOCK
- Visual Bible lock

허용:
- 세부 시각 구현
- 자연스러운 재질
- 얼굴/손/의상 표현
- 조명 자연화
- aesthetic execution

---

# 18. TTS / Audio Synchronization

카메라 reveal과 정보 전달을 TTS에 동기화한다.

필드:
- `tts_cue_time`
- `visual_hit_time`
- `sfx_cue`
- `audio_bridge`

원칙:
- 핵심 단어가 나오는 시점과 visual reveal의 시간차 최소화
- 컷 전환 시 sound cue가 continuity 유지 가능
- J-cut / L-cut 적극 활용
- TTS 연속성을 위해 불필요한 짧은 컷 남발 금지

---

# 19. Horizon / Camera / Attention Gates

## H0 — FACT
역사적 사실 및 금지 창작 검사.

## H1 — BIBLE
세계관 / 캐릭터 / 의상 / 환경 / 팔레트 / 소품 일치.

## H2 — COMPOSITION
shot scale, focal hierarchy, depth, subject readability.

## H3 — MOTION READINESS
다음 4개 중 최소 3개 충족:

- camera corridor visible
- foreground parallax source exists
- executable subject motion vector exists
- target/exit state visually distinct

미충족 시 BLOCKED 또는 설계 수정.

## H4 — NARRATIVE
한 비트의 핵심 사건 명확.
다중 사건 혼합 금지.

## H5 — HANDOFF
EXIT → NEXT START 관계 명시.

## H6 — RHYTHM
이전 2~3개 비트와 반복 검사.
Shot Fingerprint 사용.

## H7 — ATTENTION / PACING
검사:
- 첫 3–4초 내 의미 있는 변화 존재
- 5–6초 이상 동일 구도/동일 초점 지속 금지
- 시각적 초점 이동 최소 1회
- 단순 push-in 반복 금지
- 정보 변화 없이 분위기만 유지하는 구간 제한

## H8 — CAMERA-TENSION / EDIT RHYTHM
검사:
- 카메라가 긴장 build/hold/reveal 중 무엇을 수행하는지 명확
- 움직임 종료점이 편집점과 연결
- EXIT 에너지가 다음 START로 연결
- 불필요한 정적 구간 없음
- 속도 변화가 서사적 역할을 가짐

## H9 — READABILITY UNDER CAMERA MOTION
검사:
- 카메라 이동 중에도 주피사체 읽힘
- 화면 과밀하지 않음
- focal hierarchy 유지
- foreground/subject/background 충돌 없음
- detail이 motion clarity를 방해하지 않음

판정:
- `PASS`
- `PASS_WITH_WARNINGS`
- `BLOCKED`

BLOCKED면 이미지 프롬프트 생성 금지.

---

# 20. 생성 이미지 반환 후 QC

## Image QC
- subject readability
- requested shot size
- camera height/angle
- FG/MG/BG 관계
- identity drift
- 불필요 소품/문자/무기 추가
- FACT_LOCK 위반
- poster-like static composition 여부

## Motion Readiness QC
- camera path physical space
- parallax 가능
- subject motion 가능
- START→TARGET 변화 명확
- EXIT 활용 가능

## Camera-Tension QC
- visual attention progression
- energy continuity
- reveal timing
- exit energy

판정:
- `APPROVED`
- `REVISE`
- `REGENERATE`
- `BLOCKED`

---

# 21. Fail / Recovery 전략

## `REVISE`
부분 수정으로 해결 가능:
- 조명
- 배경 clutter
- small subject position
- minor prop drift

## `REGENERATE`
전체 재생성이 적합:
- shot size 실패
- camera corridor 없음
- wrong composition
- START/TARGET 관계 붕괴
- subject identity major drift

## `BLOCKED`
상위 설계부터 재작성 필요:
- FACT_LOCK 충돌
- camera path 불가능
- continuity 모순
- scene purpose 불명확

---

# 22. Render Polish Skill과의 책임 경계

메인 스킬:
> **영상으로 움직일 수 있는가?**

보조 스킬:
> **한 장으로 봐도 깔끔하고 고급스러운가?**

보조 스킬 변경 금지:
- FACT_LOCK
- story_event
- shot size
- camera path
- entry / target / exit
- primary action
- continuity mode
- reference hierarchy

보조 스킬 허용:
- visual cleanliness
- lighting refinement
- material separation
- focal hierarchy
- clutter reduction
- color discipline
- premium animation-keyframe finish

---

# 23. VPF 단계 매핑

## T040
- Visual Beat
- CLIP DIRECTING CONTRACT
- Horizon / Camera / Attention Gate

## T050
- START / TARGET / EXIT image job
- Chrome GPT prompt packet
- image QC
- Motion Readiness QC

## T060
- 승인 키프레임 기반 I2V motion prompt
- camera phases
- bridge motion
- tension function
- audio/TTS cue sync

## T080
- 실제 영상 생성
- continuity QC
- cinematic QC
- energy continuity QC

---

# 24. 20–30초 블록 단위 편집 QC

개별 클립 PASS만으로 충분하지 않다.

20–30초 단위로 검사:

- tension curve
- shot scale rhythm
- motion contrast
- visual repetition
- camera energy continuity
- TTS continuity
- sound bridge
- information density
- static dead zone

---

# 25. 권장 Skill 디렉터리

```text
history-fantasy-storyboard-director/
├── SKILL.md
├── references/
│   ├── horizon-directing-grammar.md
│   ├── history-fantasy-boundary.md
│   ├── continuity-rules.md
│   ├── camera-tension-grammar.md
│   ├── motion-readiness.md
│   ├── attention-pacing.md
│   ├── reference-priority.md
│   ├── negative-patterns.md
│   └── chrome-gpt-image-workflow.md
├── assets/
│   ├── visual-beat-template.md
│   ├── clip-directing-contract.md
│   ├── shot-card-template.md
│   ├── image-job-template.md
│   ├── handoff-matrix-template.md
│   └── qc-template.md
└── scripts/
    ├── scaffold_project.py
    ├── validate_storyboard_contract.py
    ├── validate_shot_fingerprint.py
    └── validate_attention_gate.py
```

---

# 26. SKILL.md 상단 메타데이터 초안

```yaml
---
name: history-fantasy-storyboard-director
description: >
  Direct long-form history-fantasy and cinematic animation projects from
  script/TTS into Visual Beats, clip directing contracts, camera choreography,
  START/TARGET/EXIT keyframe plans, Chrome ChatGPT image-generation jobs,
  I2V motion prompts, and continuity handoffs. Prioritize viewer attention,
  camera tension, readable motion-ready compositions, factual locks,
  Visual Bible consistency, and clip-to-clip energy continuity.
---
```

---

# 27. 필수 실패 규칙

다음 상태에서는 이미지 프롬프트 생성 금지.

1. story event가 2개 이상 뒤섞임
2. FACT_LOCK 미확정
3. camera move 물리적으로 불가능
4. START / TARGET 모순
5. strict continuation인데 EXIT 미정
6. 필요한 reference 식별 불가
7. 이전 컷과 거의 동일한 구도 반복 + 이유 없음
8. Visual Bible 직접 충돌
9. 판타지 연출이 역사 사실로 오인될 위험
10. attention event 부재
11. camera energy handoff 부재
12. image detail이 motion readability를 심각하게 방해

---

# 28. 검증 시나리오

## Test A — 단일 환경 Reveal
기대:
- Wide/Medium/Detail 흐름
- foreground parallax
- camera corridor
- EXIT가 다음 detail shot 준비

## Test B — 연속 인물 동작
기대:
- action start/end
- motion vector
- screen direction
- START_TARGET
- energy continuity

## Test C — 사실 + 편집적 시각화
기대:
- 실제 공간과 editorial panel 구분
- 사실/추정 범위 분리
- text/DNA/map 금지 반영

## Test D — 반복 구도 차단
입력: 3개 연속 Wide + push.
기대:
- H6 FAIL 또는 수정 요구

## Test E — 잘못된 판타지 창작
기대:
- H0 BLOCKED

## Test F — 정적인 느린 연출
입력: 8초 locked medium + 정보 변화 없음.
기대:
- H7 또는 H8 FAIL

## Test G — 카메라 에너지 단절
입력:
CLIP01 fast lateral tracking → CLIP02 static frontal hold.
기대:
- H8 FAIL unless deliberate reason recorded

## Test H — 디테일 과잉
입력:
foreground clutter / decorative props / complex texture가 camera corridor를 가림.
기대:
- H9 FAIL

---

# 29. 검증 합격 기준

| 영역 | 합격 기준 |
|---|---|
| 사실성 | FACT_LOCK 위반 0 |
| Visual Bible | lock 누락 0 |
| Camera-first | 모든 영상 대상 VB에 camera intent/path 존재 |
| Motion Readiness | 모든 I2V 대상 VB H3 PASS |
| Attention | 모든 주요 VB H7 PASS |
| Camera-Tension | 연속 클립 H8 PASS |
| Readability | 모든 keyframe H9 PASS |
| Handoff | 연속 VB 100% continuity mode 선언 |
| Energy Continuity | 연속 클립 100% energy in/out 정의 |
| 반복 방지 | 이유 없는 동일 shot fingerprint 반복 0 |
| 이미지 패킷 | reference role / must preserve / must not add 필수 |
| Chrome GPT | renderer-only 패킷 |
| VPF 연동 | T040/T050/T060/T080 매핑 가능 |
| Fail-safe | 불충분한 설계에서 BLOCKED 출력 |
| Block QC | 20–30초 단위 편집 QC 가능 |

---

# 30. 이번 단계에서 의도적으로 제외

아직 구현하지 않음:

- `render-polish-skill` 상세 설계
- 실제 `SKILL.md` 완성본
- scaffold script 구현
- VPF 코드 변경
- Chrome 자동 입력/브라우저 자동화
- I2V generator별 adapter
- Git commit / push

먼저 이 v0.2 설계서를 검증하고 승인한 뒤, 메인 스킬 실제 구현으로 넘어간다.
