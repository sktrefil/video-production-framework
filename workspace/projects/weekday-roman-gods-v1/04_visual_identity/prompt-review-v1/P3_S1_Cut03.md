# P3_S1_Cut03 — 같은 주간 구조에 다른 명칭

**상태: CANDIDATE · 사용자/Agent1 검토용 · 실제 이미지/음성/비디오 없음**

## Identity / Script

- 원본 단위 `cut3_3` → 승인 장면 `sc_cbefd34c-3bc8-41a1-a70e-a594c24cce1a`. Part `P3` / Sequence `S1`.
- 서사 사건: 같은 주간 구조에 다른 명칭
- 전후 상태: 컷 cut3_2: 이름 변형을 요일 칸의 연속과 대비 → 같은 주간 구조에 다른 명칭 → 컷 cut3_3: A 스마트폰의 한국어 달력을 다음 컷의 日/月 두 그룹 공개로 전달
- 연출 의도: 종합 설명을 두 물체의 겹침과 전체 책상 스케일로 표현. 이미 설명한 어구만 사용하고 10초 이후 스마트폰 몸체를 읽혀 다음 한국어 달력에 물리적으로 접지한다.
- 카메라 이유(PF04): 분리된 라틴어/영어 종이 카드의 가장자리를 1초에 읽히고 5.5초 카드의 겹침으로 같은 요일 위치를 확인. 10초부터 스마트폰 몸체와 책상으로 단일 후퇴. 일곱 칸 색판 교체 반복을 제거.
- 원본 장면 제약: 라틴어와 영어 이름이 적힌 두 장의 분리된 종이 카드로 시작. 1초 카드 가장자리 차이, 5.5초 카드가 겹쳐 같은 요일 위치를 가리키는 관계를 읽힘. 10초부터 A 책상과 스마트폰 몸체를 선명히 보여준다. 일곱 칸 도식의 색판 교체를 반복하지 않는다.
- 공개 순서/보류: 두 카드의 다른 이름을 먼저 읽히고 관계를 확인한 뒤 10초에 스마트폰으로 복귀
- 근거 ID: F-02, F-04, ED-01

## 04 Timeline / Narration

부모 단위 계획 `01:40.0–01:55.0`. 낭독 추정 13.3초, **TTS 실측 미생성/미확인(null)**. 속도 1.0×. 컷 경계·모션 비트·종료는 실측 뒤 다시 맞춘다.

> 라틴어의 마르스와 비너스가, 영어의 이름 속에서는 그대로 보이지 않습니다. 같은 요일을 가리켜도, 부르는 이름에는 다른 전통이 담깁니다. 달력은 이렇게 달라집니다.

계획 오디오 `03_tts/P3_S1_Cut03.mp3`. 위 문장 그대로 한 부모 MP3를 유지한다. A/B 분할이 있어도 별도 TTS를 만들지 않으며 의미가 완결되는 단어 구간은 실측 정렬로 결정한다.

|시각 샷|계획 구간|사용 길이|부모 내 구간|
|---|---|---:|---|
|`P3_S1_Cut03_A`|01:40.0–01:47.5|7.5초|0.0–7.5초|
|`P3_S1_Cut03_B`|01:47.5–01:55.0|7.5초|7.5–15.0초|

생성 길이/도구/모델은 미선택(null). 머리·꼬리 핸들 각 0.3초는 계획 여유이며 도구의 실제 지원 길이가 아니다. 위 시간은 사용 구간; 생성 길이와 동일하다고 가정하지 않는다.

## 05 컷별 상세 제작 시트

<a id="p3_s1_cut03_a"></a>

### P3_S1_Cut03_A — 분리된 카드, 같은 요일 위치

100–107.5초 제안. 분리된 종이 카드가 105.5초에 겹쳐 같은 요일 위치와 다른 이름을 드러낸다.

**IMAGE PROMPT — English / GPT ENTRY image candidate**

```text
Horizontal 16:9 ENTRY image, generation target 1536x864, composed for a 1920x1080 edit. SCENE PURPOSE: The approved factual/narrative event is specified in the accompanying story sheet; the English geometry below expresses that approved scene without adding claims. Close oblique view of two separate illustrated paper language cards on the familiar dark-indigo desk, one Latin comparison card and one English comparison card. Their rectangular edges are offset, exposing distinct paper thicknesses; blank printed-label zones and one corresponding weekday position on each card are clearly separated. Neither card is a full cloned seven-cell board. Keep the two cards partly apart at ENTRY so an later overlap can reveal their positional relationship. The original smartphone exists outside this close crop to the right. Upper-left amber desk light and cool blue-gray painted shadows maintain the established environment. CONTINUITY: The phone, desk, uninscribed tablet and card geometry described here are candidate appearance specifications; use their actual manager-approved reference anchors once bound. Use user board panel(s) A, B only for composition, palette, shape and transition ideas, transformed visibly into illustrated graphic fantasy. All required labels listed in metadata are composited later as modern explanatory text. NEGATIVE: No floating letters, repeated color-swapping week-grid motif, god-name morph, direct transmission arrows, extra cards or spontaneous device arrival. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.

Stylized cinematic history-fantasy graphic animation, bold illustrated forms and sculptural textures, dark moody atmosphere, consistent recurring visual motifs and prop shapes, kinetic-camera-ready depth, muted color palette with deep blues and burnt orange accents, clear focal hierarchy, high-detail illustrated finish, horizontal 16:9 composition.
```

**I2V MOTION GUIDE — English / STORY · FRAME · MOTION · EXIT**

```text
STORY: Close oblique view of two separate illustrated paper language cards on the familiar dark-indigo desk, one Latin comparison card and one English comparison card. Communicate the event and factual limit stated in the parent story sheet; this proposed subshot adds no narration or historical claim.
FRAME: Future production requirement: generate and review this shot's START image, then use it only after Agent1 approves it. No approved START image currently exists. For a graphic match, bind the previous actual EDITED use-exit frame once available for shape/direction reference; preserve only the planned match, not a false physical continuity. The illustrated ENTRY state in the image prompt is a CANDIDATE description, not an existing approved asset. In future production retain horizontal 16:9, all object counts and visible drawing language.
MOTION: 0.0–1.0s: move along the two different paper edges and reveal their separation at 1.0s. 1.0–5.3s: take one shallow lateral camera path with the card edges acting as parallax anchors. At parent 5.5s, slide the two already-present cards a short distance to partially overlap, exposing the correspondence of one weekday position while their labels remain distinct. 5.5–7.5s: hold the overlap relation and begin a gentle pullback toward the unseen phone. The cards remain two physical editorial props. Timing values are proposed EDITED-use seconds at 1.0x narration, not measured TTS or provider generation length.
EXIT: End on two partially overlapping cards with the rightward desk area opening into view; cut3_3_B starts from the actual used exit frame if production is approved. Extract the actual edited use-exit at the chosen handoff timestamp, not the provider's final generation frame. Render no inter-shot fades, wipes or typography mutations inside I2V; planned UI/text/symbol layers are assembled in editing.
NEGATIVE: No floating letters, repeated color-swapping week-grid motif, god-name morph, direct transmission arrows, extra cards or spontaneous device arrival. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.
```

**References / continuity**

- A–D 참조 범위: `A / B의 종이 형태` — 구도·색감·형태·전환 아이디어만. 최종 스타일 타깃은 비실사 그래픽 판타지.
- 실제 사용자 보드: `D:\컴폴더\다운로드\파트 A,B,C,D기준 보드.png` / `sha256:003c7796688e44e7d1171254e2fc5f049e07031d4d348a3fb86241618d2ebf4c`. 이 원본은 master board 승인이나 실사 스타일 승인을 뜻하지 않는다. 추출 패널 경로는 미생성·미승인 placeholder이고 승인 외형 앵커 ID는 아직 없다. 후보 소품 설명을 승인 Reference library 항목으로 취급하지 않는다.
- 연결 유형 `MATCH_TRANSITION` / 이전 샷 `P3_S1_Cut02`. 실제 **편집 사용 종료 프레임**은 미생성(null). CONTINUATION은 해당 프레임 검수 뒤 순차 연결한다.
- ENTRY 텍스트와 예시 경로는 검토 사양이다. 실제 생성 전 manager가 승인한 이미지·정확한 참조 인벤토리·현재 provenance를 결합한다.

**Edit & Audio / QC**

- 후보 입력 전환: `match_cut` 0초. 문자·기하 중첩 방지를 위한 가이드 기본 0.3초 디졸브의 명시적 예외.
- 합성 글자/기호: 라틴어 / 영어 / 서로 다른 이름 / 같은 요일 위치. 이미지·I2V가 생성하는 글자가 아니라 편집층.
- SFX: 105.5초 짧은 종이 미끄러짐.
- BGM: 가사 없는 낮은 앰비언트·그래픽 리듬; 나레이션보다 낮게. 컷 사이 음악은 이어간다.
- 나레이션 자막은 단어 정렬 실측 뒤 별도 편집층에 합성. SHORTFORM 고정 헤더·중앙 띠 규칙 없음.
- 검수할 항목: 부모 서사·근거·공개 시점, 물체 수/모양, 스타일, 시작/사용 종료 인계, 화면 문자 정확성, TTS와 사용 길이, 이전·다음 샷 연속성. 현재 QC는 후보 자체 점검이며 승인 없음.

**06 Asset filename / matching — 계획 경로, 파일 없음**

|종류|경로|
|---|---|
|이미지 1안|`05_images/candidates/P3_S1_Cut03_A_1.png`|
|I2V 1안|`06_clips/generated/P3_S1_Cut03_A_1.mp4`|
|부모 TTS|`03_tts/P3_S1_Cut03.mp3`|
|실제 사용 종료 프레임|`06_clips/used_exits/P3_S1_Cut03_A_use_exit.png`|
|후보 메타데이터|`04_visual_identity/prompt-review-v1/P3_S1_Cut03.json`|

<a id="p3_s1_cut03_b"></a>

### P3_S1_Cut03_B — 카드에서 일상 스마트폰으로

107.5–115초 제안. 원래 잠금의 110초 스마트폰 공개를 그대로 유지한다. 부모 음성은 끊거나 다시 녹음하지 않는다.

**IMAGE PROMPT — English / GPT ENTRY image candidate**

```text
Horizontal 16:9 ENTRY image, generation target 1536x864, composed for a 1920x1080 edit. SCENE PURPOSE: The approved factual/narrative event is specified in the accompanying story sheet; the English geometry below expresses that approved scene without adding claims. Start from the candidate overlap state of the two grounded language cards on the same desk, framed slightly wider than the preceding close view. The same blue-gray smartphone is physically present at the right edge, with its full body mostly concealed beyond the initial crop. Its Korean calendar page has blank stable typography zones and the same device proportions, diagonal angle and amber upper-left light as the opening. The paper cards stay separate objects with visible thickness. Layering must support a camera pullback that reveals the actual device and desk instead of returning to an abstract full-screen diagram. CONTINUITY: The phone, desk, uninscribed tablet and card geometry described here are candidate appearance specifications; use their actual manager-approved reference anchors once bound. Use user board panel(s) A only for composition, palette, shape and transition ideas, transformed visibly into illustrated graphic fantasy. All required labels listed in metadata are composited later as modern explanatory text. NEGATIVE: No new spoken text, audio split assumption, device change, Latin-to-Korean genealogical morph, cosmic prop spawning or detached overlay panels. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.

Stylized cinematic history-fantasy graphic animation, bold illustrated forms and sculptural textures, dark moody atmosphere, consistent recurring visual motifs and prop shapes, kinetic-camera-ready depth, muted color palette with deep blues and burnt orange accents, clear focal hierarchy, high-detail illustrated finish, horizontal 16:9 composition.
```

**I2V MOTION GUIDE — English / STORY · FRAME · MOTION · EXIT**

```text
STORY: Start from the candidate overlap state of the two grounded language cards on the same desk, framed slightly wider than the preceding close view. Communicate the event and factual limit stated in the parent story sheet; this proposed subshot adds no narration or historical claim.
FRAME: Future production requirement, after prior media exists and passes Agent1 review: use the previous shot's actual EDITED use-exit frame as START, with exact object geometry, desk angle and light direction. The prose ENTRY specification below is a review target and may not replace that continuity reference. The illustrated ENTRY state in the image prompt is a CANDIDATE description, not an existing approved asset. In future production retain horizontal 16:9, all object counts and visible drawing language.
MOTION: Local 0.0–2.4s (parent 7.5–9.9s): continue the prior pullback slowly while keeping the overlapping cards readable. At local 2.5s (parent 10.0s), clearly reveal the full original smartphone body and the desk area beside it. Local 2.5–6.5s: travel slightly rightward, settling on the Korean calendar page without altering any names. Local 6.5–7.5s: pause on the familiar object, preparing the next cut to explain the sun/moon and five-element celestial groupings. The parent narration continues without a new audio segment. Timing values are proposed EDITED-use seconds at 1.0x narration, not measured TTS or provider generation length.
EXIT: The familiar device and desk become the focal anchor; leave its screen calendar clear for cut3_4_A. Extract the actual edited use-exit at the chosen handoff timestamp, not the provider's final generation frame. Render no inter-shot fades, wipes or typography mutations inside I2V; planned UI/text/symbol layers are assembled in editing.
NEGATIVE: No new spoken text, audio split assumption, device change, Latin-to-Korean genealogical morph, cosmic prop spawning or detached overlay panels. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.
```

**References / continuity**

- A–D 참조 범위: `A` — 구도·색감·형태·전환 아이디어만. 최종 스타일 타깃은 비실사 그래픽 판타지.
- 실제 사용자 보드: `D:\컴폴더\다운로드\파트 A,B,C,D기준 보드.png` / `sha256:003c7796688e44e7d1171254e2fc5f049e07031d4d348a3fb86241618d2ebf4c`. 이 원본은 master board 승인이나 실사 스타일 승인을 뜻하지 않는다. 추출 패널 경로는 미생성·미승인 placeholder이고 승인 외형 앵커 ID는 아직 없다. 후보 소품 설명을 승인 Reference library 항목으로 취급하지 않는다.
- 연결 유형 `CONTINUATION` / 이전 샷 `P3_S1_Cut03_A`. 실제 **편집 사용 종료 프레임**은 미생성(null). CONTINUATION은 해당 프레임 검수 뒤 순차 연결한다.
- ENTRY 텍스트와 예시 경로는 검토 사양이다. 실제 생성 전 manager가 승인한 이미지·정확한 참조 인벤토리·현재 provenance를 결합한다.

**Edit & Audio / QC**

- 후보 입력 전환: `hard_cut` 0초. 문자·기하 중첩 방지를 위한 가이드 기본 0.3초 디졸브의 명시적 예외.
- 합성 글자/기호: 한국어 달력(정확한 글자 후반 합성). 이미지·I2V가 생성하는 글자가 아니라 편집층.
- SFX: 카메라 확대에는 아주 낮은 책상 공간음.
- BGM: 가사 없는 낮은 앰비언트·그래픽 리듬; 나레이션보다 낮게. 컷 사이 음악은 이어간다.
- 나레이션 자막은 단어 정렬 실측 뒤 별도 편집층에 합성. SHORTFORM 고정 헤더·중앙 띠 규칙 없음.
- 검수할 항목: 부모 서사·근거·공개 시점, 물체 수/모양, 스타일, 시작/사용 종료 인계, 화면 문자 정확성, TTS와 사용 길이, 이전·다음 샷 연속성. 현재 QC는 후보 자체 점검이며 승인 없음.

**06 Asset filename / matching — 계획 경로, 파일 없음**

|종류|경로|
|---|---|
|이미지 1안|`05_images/candidates/P3_S1_Cut03_B_1.png`|
|I2V 1안|`06_clips/generated/P3_S1_Cut03_B_1.mp4`|
|부모 TTS|`03_tts/P3_S1_Cut03.mp3`|
|실제 사용 종료 프레임|`06_clips/used_exits/P3_S1_Cut03_B_use_exit.png`|
|후보 메타데이터|`04_visual_identity/prompt-review-v1/P3_S1_Cut03.json`|

## Provenance / approval boundary

`r04 / SG01 / VS03 / PF04 / GIPC01 / SDL-weekday-roman-gods-v1-r04 / MSTG-weekday-roman-gods-v1-01`에 묶인 검토 후보. 원본 파일 바이트 해시는 [provenance-v1.json](provenance-v1.json)에 보존한다. 소스의 선언 해시는 바이트 해시와 구별한다. script, scene graph, development lock, project.db는 이 패키지로 바꾸지 않았다.

시각 분할을 생산에 적용할지와 실제 TTS 길이에 따른 변경 범위는 Agent1이 판단한다. 원본 의미·시간 가정·Scene graph를 바꾸는 결정이면 재검토/잠금·downstream invalidation 절차를 따른다. 이 문서는 생성 작업 지시나 승인 게이트가 아니다.
