# P4_S1_Cut01 — 같은 일곱 칸과 서로 다른 이름 종합

**상태: CANDIDATE · 사용자/Agent1 검토용 · 실제 이미지/음성/비디오 없음**

## Identity / Script

- 원본 단위 `cut4_1` → 승인 장면 `sc_8023d5f0-019f-45b6-bd9c-263d7db68c74`. Part `P4` / Sequence `S1`.
- 서사 사건: 같은 일곱 칸과 서로 다른 이름 종합
- 전후 상태: 컷 cut3_4: 개별 일곱 칸을 하나의 달력 틀로 되모음 → 같은 일곱 칸과 서로 다른 이름 종합 → 컷 cut4_1: 책상 표면과 분리된 카드 물체를 유지해 다음 컷으로 전달
- 연출 의도: 첫 상태의 순차 관심 이동과 둘째 상태의 물체 스케일 변화로 세 정보의 관계를 종합. 네 보드와 언어층을 한꺼번에 누적하지 않고 두 읽기 상태 안에서 세 관심 변화만 실행한다.
- 카메라 이유(PF04): 책상 세부의 언어 카드를 순차 강조하는 첫 읽기 상태 뒤 5.5초 달력 카드/스마트폰 전체로 확대하는 둘째 상태. 8.5초 공통 위치의 빛으로 회수. 네 보드 동시 몽타주 제거.
- 원본 장면 제약: 두 개의 읽기 상태만 사용. 첫 상태는 현대 설명용 언어 카드가 놓인 책상 세부: 이미 설명한 세 이름 전통을 차례로 강조. 5.5초에 동일 공간에서 달력 카드와 스마트폰 전체가 드러나는 둘째 상태로 확대. 8.5초 공통 요일 위치를 빛 하나로 회수한다. A/B/C/D 네 이미지의 동시 몽타주는 사용하지 않는다.
- 공개 순서/보류: 이미 알려진 카드의 이름을 순차 확인한 뒤 공통 달력 위치로 회수
- 근거 ID: F-02, F-04, F-05, ED-01

## 04 Timeline / Narration

부모 단위 계획 `02:10.0–02:22.0`. 낭독 추정 10.5초, **TTS 실측 미생성/미확인(null)**. 속도 1.0×. 컷 경계·모션 비트·종료는 실측 뒤 다시 맞춘다.

> 이제 보이죠? 라틴어의 신 이름, 영어의 다른 신 이름, 한국어의 천체 표기. 비슷한 일곱 칸을, 서로 다른 말이 채우고 있었습니다.

계획 오디오 `03_tts/P4_S1_Cut01.mp3`. 위 문장 그대로 한 부모 MP3를 유지한다. A/B 분할이 있어도 별도 TTS를 만들지 않으며 의미가 완결되는 단어 구간은 실측 정렬로 결정한다.

|시각 샷|계획 구간|사용 길이|부모 내 구간|
|---|---|---:|---|
|`P4_S1_Cut01_A`|02:10.0–02:16.0|6.0초|0.0–6.0초|
|`P4_S1_Cut01_B`|02:16.0–02:22.0|6.0초|6.0–12.0초|

생성 길이/도구/모델은 미선택(null). 머리·꼬리 핸들 각 0.3초는 계획 여유이며 도구의 실제 지원 길이가 아니다. 위 시간은 사용 구간; 생성 길이와 동일하다고 가정하지 않는다.

## 05 컷별 상세 제작 시트

<a id="p4_s1_cut01_a"></a>

### P4_S1_Cut01_A — 이미 설명한 세 이름 전통

130–136초 제안. 3개 이름 전통을 같은 책상 카드로 회수하고 135.5초에 두 번째 읽기 상태로 확대를 시작한다.

**IMAGE PROMPT — English / GPT ENTRY image candidate**

```text
Horizontal 16:9 ENTRY image, generation target 1536x864, composed for a 1920x1080 edit. SCENE PURPOSE: The approved factual/narrative event is specified in the accompanying story sheet; the English geometry below expresses that approved scene without adding claims. Detail view of three modern explanatory paper cards grounded on the familiar desk, with generous blank label zones for Latin, English and Korean name traditions. Use the same compact set of cards already established in the sequence, never a four-panel montage of boards A/B/C/D. Begin close enough that the card surfaces and their different headings dominate; the original phone and one calendar card already occupy an offscreen part of the same desk. Each card has equal physical stature. Preserve upper-left amber light and cool blue-gray painted shadows, leaving one clean camera path outward to the full device. CONTINUITY: The phone, desk, uninscribed tablet and card geometry described here are candidate appearance specifications; use their actual manager-approved reference anchors once bound. Use user board panel(s) A, B only for composition, palette, shape and transition ideas, transformed visibly into illustrated graphic fantasy. All required labels listed in metadata are composited later as modern explanatory text. NEGATIVE: No four-board simultaneous montage, hierarchy of card sizes, new god roster, floating explanation panels or three repeated zoom hits. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.

Stylized cinematic history-fantasy graphic animation, bold illustrated forms and sculptural textures, dark moody atmosphere, consistent recurring visual motifs and prop shapes, kinetic-camera-ready depth, muted color palette with deep blues and burnt orange accents, clear focal hierarchy, high-detail illustrated finish, horizontal 16:9 composition.
```

**I2V MOTION GUIDE — English / STORY · FRAME · MOTION · EXIT**

```text
STORY: Detail view of three modern explanatory paper cards grounded on the familiar desk, with generous blank label zones for Latin, English and Korean name traditions. Communicate the event and factual limit stated in the parent story sheet; this proposed subshot adds no narration or historical claim.
FRAME: Future production requirement: generate and review this shot's START image, then use it only after Agent1 approves it. No approved START image currently exists. For a graphic match, bind the previous actual EDITED use-exit frame once available for shape/direction reference; preserve only the planned match, not a false physical continuity. The illustrated ENTRY state in the image prompt is a CANDIDATE description, not an existing approved asset. In future production retain horizontal 16:9, all object counts and visible drawing language.
MOTION: 0.0–1.0s: reorient to the modern language-card details and begin composited heading emphasis at parent 1.0s. 1.0–5.3s: follow one lateral scan that recalls the three already-taught naming traditions; no new tableau appears. At parent 5.5s begin a clear camera pullback to expose the calendar card and full smartphone in the same space, introducing the second and final reading state. 5.5–6.0s: continue this movement across the proposed subshot boundary. Timing values are proposed EDITED-use seconds at 1.0x narration, not measured TTS or provider generation length.
EXIT: Leave the second reading state opening, with the phone body and calendar card entering the frame; cut4_1_B continues the actual used motion state. Extract the actual edited use-exit at the chosen handoff timestamp, not the provider's final generation frame. Render no inter-shot fades, wipes or typography mutations inside I2V; planned UI/text/symbol layers are assembled in editing.
NEGATIVE: No four-board simultaneous montage, hierarchy of card sizes, new god roster, floating explanation panels or three repeated zoom hits. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.
```

**References / continuity**

- A–D 참조 범위: `A / B의 카드 형태` — 구도·색감·형태·전환 아이디어만. 최종 스타일 타깃은 비실사 그래픽 판타지.
- 실제 사용자 보드: `D:\컴폴더\다운로드\파트 A,B,C,D기준 보드.png` / `sha256:003c7796688e44e7d1171254e2fc5f049e07031d4d348a3fb86241618d2ebf4c`. 이 원본은 master board 승인이나 실사 스타일 승인을 뜻하지 않는다. 추출 패널 경로는 미생성·미승인 placeholder이고 승인 외형 앵커 ID는 아직 없다. 후보 소품 설명을 승인 Reference library 항목으로 취급하지 않는다.
- 연결 유형 `MATCH_TRANSITION` / 이전 샷 `P3_S1_Cut04_B`. 실제 **편집 사용 종료 프레임**은 미생성(null). CONTINUATION은 해당 프레임 검수 뒤 순차 연결한다.
- ENTRY 텍스트와 예시 경로는 검토 사양이다. 실제 생성 전 manager가 승인한 이미지·정확한 참조 인벤토리·현재 provenance를 결합한다.

**Edit & Audio / QC**

- 후보 입력 전환: `match_cut` 0초. 문자·기하 중첩 방지를 위한 가이드 기본 0.3초 디졸브의 명시적 예외.
- 합성 글자/기호: 라틴어: 신명·행성명 / 영어: 일부 다른 신명 / 한국어: 천체 표기. 이미지·I2V가 생성하는 글자가 아니라 편집층.
- SFX: 회수 강조음은 작은 한 계열로 통일.
- BGM: 가사 없는 낮은 앰비언트·그래픽 리듬; 나레이션보다 낮게. 컷 사이 음악은 이어간다.
- 나레이션 자막은 단어 정렬 실측 뒤 별도 편집층에 합성. SHORTFORM 고정 헤더·중앙 띠 규칙 없음.
- 검수할 항목: 부모 서사·근거·공개 시점, 물체 수/모양, 스타일, 시작/사용 종료 인계, 화면 문자 정확성, TTS와 사용 길이, 이전·다음 샷 연속성. 현재 QC는 후보 자체 점검이며 승인 없음.

**06 Asset filename / matching — 계획 경로, 파일 없음**

|종류|경로|
|---|---|
|이미지 1안|`05_images/candidates/P4_S1_Cut01_A_1.png`|
|I2V 1안|`06_clips/generated/P4_S1_Cut01_A_1.mp4`|
|부모 TTS|`03_tts/P4_S1_Cut01.mp3`|
|실제 사용 종료 프레임|`06_clips/used_exits/P4_S1_Cut01_A_use_exit.png`|
|후보 메타데이터|`04_visual_identity/prompt-review-v1/P4_S1_Cut01.json`|

<a id="p4_s1_cut01_b"></a>

### P4_S1_Cut01_B — 같은 일곱 칸을 빛 하나로

136–142초 제안. 원래 138.5초 공통 위치의 빛 회수를 유지한다. 첫 컷과 합쳐 두 읽기 상태만 사용한다.

**IMAGE PROMPT — English / GPT ENTRY image candidate**

```text
Horizontal 16:9 ENTRY image, generation target 1536x864, composed for a 1920x1080 edit. SCENE PURPOSE: The approved factual/narrative event is specified in the accompanying story sheet; the English geometry below expresses that approved scene without adding claims. Wider continuation of the same three paper language cards, one calendar card and original smartphone on the same illustrated desk. The phone is fully visible and the calendar positions are prepared as static blank text locations. Keep precisely the previous object placement and light direction. Give the shared weekday position a clean subtle amber line cue as an editorial overlay target, with no extra diagrams. The cards and phone occupy one coherent tabletop space with clear drawn thickness and perspective. CONTINUITY: The phone, desk, uninscribed tablet and card geometry described here are candidate appearance specifications; use their actual manager-approved reference anchors once bound. Use user board panel(s) A only for composition, palette, shape and transition ideas, transformed visibly into illustrated graphic fantasy. All required labels listed in metadata are composited later as modern explanatory text. NEGATIVE: No orbit rings, animated geographic arrows, direct Roman-to-Korean descent line, card cloning, montage or new background. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.

Stylized cinematic history-fantasy graphic animation, bold illustrated forms and sculptural textures, dark moody atmosphere, consistent recurring visual motifs and prop shapes, kinetic-camera-ready depth, muted color palette with deep blues and burnt orange accents, clear focal hierarchy, high-detail illustrated finish, horizontal 16:9 composition.
```

**I2V MOTION GUIDE — English / STORY · FRAME · MOTION · EXIT**

```text
STORY: Wider continuation of the same three paper language cards, one calendar card and original smartphone on the same illustrated desk. Communicate the event and factual limit stated in the parent story sheet; this proposed subshot adds no narration or historical claim.
FRAME: Future production requirement, after prior media exists and passes Agent1 review: use the previous shot's actual EDITED use-exit frame as START, with exact object geometry, desk angle and light direction. The prose ENTRY specification below is a review target and may not replace that continuity reference. The illustrated ENTRY state in the image prompt is a CANDIDATE description, not an existing approved asset. In future production retain horizontal 16:9, all object counts and visible drawing language.
MOTION: Local 0.0–2.4s (parent 6.0–8.4s): finish the inherited pullback, revealing the full phone and calendar-card relationship. At local 2.5s (parent 8.5s), use one restrained editorial light cue to collect the common weekday position across the existing objects. Local 2.5–5.0s: hold this second reading state and allow the synthesis to land. Local 5.0–6.0s: settle on the desk plane and separated card objects for the next comparison. Do not add a third reading state. Timing values are proposed EDITED-use seconds at 1.0x narration, not measured TTS or provider generation length.
EXIT: Keep the same cards grounded and separately readable; next cut explores their equal coexistence rather than introducing a new space. Extract the actual edited use-exit at the chosen handoff timestamp, not the provider's final generation frame. Render no inter-shot fades, wipes or typography mutations inside I2V; planned UI/text/symbol layers are assembled in editing.
NEGATIVE: No orbit rings, animated geographic arrows, direct Roman-to-Korean descent line, card cloning, montage or new background. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.
```

**References / continuity**

- A–D 참조 범위: `A` — 구도·색감·형태·전환 아이디어만. 최종 스타일 타깃은 비실사 그래픽 판타지.
- 실제 사용자 보드: `D:\컴폴더\다운로드\파트 A,B,C,D기준 보드.png` / `sha256:003c7796688e44e7d1171254e2fc5f049e07031d4d348a3fb86241618d2ebf4c`. 이 원본은 master board 승인이나 실사 스타일 승인을 뜻하지 않는다. 추출 패널 경로는 미생성·미승인 placeholder이고 승인 외형 앵커 ID는 아직 없다. 후보 소품 설명을 승인 Reference library 항목으로 취급하지 않는다.
- 연결 유형 `CONTINUATION` / 이전 샷 `P4_S1_Cut01_A`. 실제 **편집 사용 종료 프레임**은 미생성(null). CONTINUATION은 해당 프레임 검수 뒤 순차 연결한다.
- ENTRY 텍스트와 예시 경로는 검토 사양이다. 실제 생성 전 manager가 승인한 이미지·정확한 참조 인벤토리·현재 provenance를 결합한다.

**Edit & Audio / QC**

- 후보 입력 전환: `hard_cut` 0초. 문자·기하 중첩 방지를 위한 가이드 기본 0.3초 디졸브의 명시적 예외.
- 합성 글자/기호: 공통된 일곱 칸 / 서로 다른 이름. 이미지·I2V가 생성하는 글자가 아니라 편집층.
- SFX: 138.5초 단음 하나; 확대 잔향은 작게.
- BGM: 가사 없는 낮은 앰비언트·그래픽 리듬; 나레이션보다 낮게. 컷 사이 음악은 이어간다.
- 나레이션 자막은 단어 정렬 실측 뒤 별도 편집층에 합성. SHORTFORM 고정 헤더·중앙 띠 규칙 없음.
- 검수할 항목: 부모 서사·근거·공개 시점, 물체 수/모양, 스타일, 시작/사용 종료 인계, 화면 문자 정확성, TTS와 사용 길이, 이전·다음 샷 연속성. 현재 QC는 후보 자체 점검이며 승인 없음.

**06 Asset filename / matching — 계획 경로, 파일 없음**

|종류|경로|
|---|---|
|이미지 1안|`05_images/candidates/P4_S1_Cut01_B_1.png`|
|I2V 1안|`06_clips/generated/P4_S1_Cut01_B_1.mp4`|
|부모 TTS|`03_tts/P4_S1_Cut01.mp3`|
|실제 사용 종료 프레임|`06_clips/used_exits/P4_S1_Cut01_B_use_exit.png`|
|후보 메타데이터|`04_visual_identity/prompt-review-v1/P4_S1_Cut01.json`|

## Provenance / approval boundary

`r04 / SG01 / VS03 / PF04 / GIPC01 / SDL-weekday-roman-gods-v1-r04 / MSTG-weekday-roman-gods-v1-01`에 묶인 검토 후보. 원본 파일 바이트 해시는 [provenance-v1.json](provenance-v1.json)에 보존한다. 소스의 선언 해시는 바이트 해시와 구별한다. script, scene graph, development lock, project.db는 이 패키지로 바꾸지 않았다.

시각 분할을 생산에 적용할지와 실제 TTS 길이에 따른 변경 범위는 Agent1이 판단한다. 원본 의미·시간 가정·Scene graph를 바꾸는 결정이면 재검토/잠금·downstream invalidation 절차를 따른다. 이 문서는 생성 작업 지시나 승인 게이트가 아니다.
