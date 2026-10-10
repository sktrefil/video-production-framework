# P4_S1_Cut04 — 다음 요일로 넘어가며 관객의 질문 남김

**상태: CANDIDATE · 사용자/Agent1 검토용 · 실제 이미지/음성/비디오 없음**

## Identity / Script

- 원본 단위 `cut4_4` → 승인 장면 `sc_4e88511d-ec69-40dc-8625-41befd59b4bd`. Part `P4` / Sequence `S1`.
- 서사 사건: 다음 요일로 넘어가며 관객의 질문 남김
- 전후 상태: 컷 cut4_3: D 달빛을 스마트폰 반사색으로 회수하여 엔딩 → 다음 요일로 넘어가며 관객의 질문 남김 → 컷 cut4_4: 179초 이후 음악 잔향과 화면 페이드; 목표 180초 종료
- 연출 의도: 요약 후 잔여 질문; 문장 끝 이전에 화면과 오디오를 급히 닫지 않음
- 카메라 이유(PF04): 달 실루엣에서 달력 칸의 이동을 읽힌 뒤 별빛으로 여백을 넓힌다. 179초 페이드는 마지막 낭독 종료 후에만 시작한다.
- 원본 장면 제약: D의 달 실루엣→A 달력의 다음 칸. 마지막 글자와 기호가 C 별빛으로 흩어지고 179초부터 어두워짐. 가사 노래 대신 질문을 차분히 낭독.
- 공개 순서/보류: 마지막 칸 이동 뒤 일상적 질문
- 근거 ID: ED-01

## 04 Timeline / Narration

부모 단위 계획 `02:48.0–03:00.0`. 낭독 추정 10.7초, **TTS 실측 미생성/미확인(null)**. 속도 1.0×. 컷 경계·모션 비트·종료는 실측 뒤 다시 맞춘다.

> 달은 다시 뜨고, 달력은 다음 칸으로 넘어갑니다. 오늘 밤, 요일 이름을 한번 바라보세요. 당신의 하루에는 어떤 시간의 흔적이 남아 있습니까?

계획 오디오 `03_tts/P4_S1_Cut04.mp3`. 위 문장 그대로 한 부모 MP3를 유지한다. A/B 분할이 있어도 별도 TTS를 만들지 않으며 의미가 완결되는 단어 구간은 실측 정렬로 결정한다.

|시각 샷|계획 구간|사용 길이|부모 내 구간|
|---|---|---:|---|
|`P4_S1_Cut04_A`|02:48.0–02:54.0|6.0초|0.0–6.0초|
|`P4_S1_Cut04_B`|02:54.0–03:00.0|6.0초|6.0–12.0초|

생성 길이/도구/모델은 미선택(null). 머리·꼬리 핸들 각 0.3초는 계획 여유이며 도구의 실제 지원 길이가 아니다. 위 시간은 사용 구간; 생성 길이와 동일하다고 가정하지 않는다.

## 05 컷별 상세 제작 시트

<a id="p4_s1_cut04_a"></a>

### P4_S1_Cut04_A — 달의 기억에서 다음 달력 칸으로

168–174초 제안. 169초 달력으로 초점 이동, 173.5초 다음 한 칸으로 이동한다. 노래 대신 승인 문장을 차분히 읽는다.

**IMAGE PROMPT — English / GPT ENTRY image candidate**

```text
Horizontal 16:9 ENTRY image, generation target 1536x864, composed for a 1920x1080 edit. SCENE PURPOSE: The approved factual/narrative event is specified in the accompanying story sheet; the English geometry below expresses that approved scene without adding claims. Same smartphone and desk in the prior wide composition, with a small crescent-shaped blue reflection on the device edge as an editorial echo of the stylized moon. The screen calendar has stable weekday typesetting targets and one current-position highlight, prepared to move only one cell. Keep quiet dark space to the left, the original device angle and the restrained amber desk light. The moon echo is visibly graphic and does not introduce a new real night exterior. Keep the ending composition free of new characters and clutter. CONTINUITY: The phone, desk, uninscribed tablet and card geometry described here are candidate appearance specifications; use their actual manager-approved reference anchors once bound. Use user board panel(s) D, A only for composition, palette, shape and transition ideas, transformed visibly into illustrated graphic fantasy. All required labels listed in metadata are composited later as modern explanatory text. NEGATIVE: No lyric singing, day-counter acceleration, multiple page flips, new deity words, real moon exterior, confetti or loud climax. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.

Stylized cinematic history-fantasy graphic animation, bold illustrated forms and sculptural textures, dark moody atmosphere, consistent recurring visual motifs and prop shapes, kinetic-camera-ready depth, muted color palette with deep blues and burnt orange accents, clear focal hierarchy, high-detail illustrated finish, horizontal 16:9 composition.
```

**I2V MOTION GUIDE — English / STORY · FRAME · MOTION · EXIT**

```text
STORY: Same smartphone and desk in the prior wide composition, with a small crescent-shaped blue reflection on the device edge as an editorial echo of the stylized moon. Communicate the event and factual limit stated in the parent story sheet; this proposed subshot adds no narration or historical claim.
FRAME: Future production requirement, after prior media exists and passes Agent1 review: use the previous shot's actual EDITED use-exit frame as START, with exact object geometry, desk angle and light direction. The prose ENTRY specification below is a review target and may not replace that continuity reference. The illustrated ENTRY state in the image prompt is a CANDIDATE description, not an existing approved asset. In future production retain horizontal 16:9, all object counts and visible drawing language.
MOTION: 0.0–1.0s: redirect from the crescent-blue reflection to the calendar screen, landing on the current position at parent 1.0s. 1.0–5.3s: make a short controlled diagonal camera move while the final narration begins. At parent 5.5s advance the editorial calendar position by exactly one cell, keeping all weekday lettering intact. 5.5–6.0s: settle on that next-cell state for cut4_4_B. Do not reset the camera at the subshot boundary. Timing values are proposed EDITED-use seconds at 1.0x narration, not measured TTS or provider generation length.
EXIT: The next weekday cell is selected on the same calendar; retain this stable state for the last symbolic release and quiet question. Extract the actual edited use-exit at the chosen handoff timestamp, not the provider's final generation frame. Render no inter-shot fades, wipes or typography mutations inside I2V; planned UI/text/symbol layers are assembled in editing.
NEGATIVE: No lyric singing, day-counter acceleration, multiple page flips, new deity words, real moon exterior, confetti or loud climax. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.
```

**References / continuity**

- A–D 참조 범위: `D → A` — 구도·색감·형태·전환 아이디어만. 최종 스타일 타깃은 비실사 그래픽 판타지.
- 실제 사용자 보드: `D:\컴폴더\다운로드\파트 A,B,C,D기준 보드.png` / `sha256:003c7796688e44e7d1171254e2fc5f049e07031d4d348a3fb86241618d2ebf4c`. 이 원본은 master board 승인이나 실사 스타일 승인을 뜻하지 않는다. 추출 패널 경로는 미생성·미승인 placeholder이고 승인 외형 앵커 ID는 아직 없다. 후보 소품 설명을 승인 Reference library 항목으로 취급하지 않는다.
- 연결 유형 `CONTINUATION` / 이전 샷 `P4_S1_Cut03_B`. 실제 **편집 사용 종료 프레임**은 미생성(null). CONTINUATION은 해당 프레임 검수 뒤 순차 연결한다.
- ENTRY 텍스트와 예시 경로는 검토 사양이다. 실제 생성 전 manager가 승인한 이미지·정확한 참조 인벤토리·현재 provenance를 결합한다.

**Edit & Audio / QC**

- 후보 입력 전환: `hard_cut` 0초. 문자·기하 중첩 방지를 위한 가이드 기본 0.3초 디졸브의 명시적 예외.
- 합성 글자/기호: 실제 한국어 요일명 / 다음 칸 강조(편집). 이미지·I2V가 생성하는 글자가 아니라 편집층.
- SFX: 173.5초 작고 한 번의 달력 칸 이동음.
- BGM: 가사 없는 낮은 앰비언트·그래픽 리듬; 나레이션보다 낮게. 컷 사이 음악은 이어간다.
- 나레이션 자막은 단어 정렬 실측 뒤 별도 편집층에 합성. SHORTFORM 고정 헤더·중앙 띠 규칙 없음.
- 검수할 항목: 부모 서사·근거·공개 시점, 물체 수/모양, 스타일, 시작/사용 종료 인계, 화면 문자 정확성, TTS와 사용 길이, 이전·다음 샷 연속성. 현재 QC는 후보 자체 점검이며 승인 없음.

**06 Asset filename / matching — 계획 경로, 파일 없음**

|종류|경로|
|---|---|
|이미지 1안|`05_images/candidates/P4_S1_Cut04_A_1.png`|
|I2V 1안|`06_clips/generated/P4_S1_Cut04_A_1.mp4`|
|부모 TTS|`03_tts/P4_S1_Cut04.mp3`|
|실제 사용 종료 프레임|`06_clips/used_exits/P4_S1_Cut04_A_use_exit.png`|
|후보 메타데이터|`04_visual_identity/prompt-review-v1/P4_S1_Cut04.json`|

<a id="p4_s1_cut04_b"></a>

### P4_S1_Cut04_B — 질문과 여백, 180초 종료

174–180초 제안. 흩어지는 것은 별도 의미 기호·편집 제목이며 실제 달력 글자는 유지한다. 179초 페이드는 TTS 종료 실측 뒤 편집에서 적용한다.

**IMAGE PROMPT — English / GPT ENTRY image candidate**

```text
Horizontal 16:9 ENTRY image, generation target 1536x864, composed for a 1920x1080 edit. SCENE PURPOSE: The approved factual/narrative event is specified in the accompanying story sheet; the English geometry below expresses that approved scene without adding claims. Quiet continuation of the identical smartphone calendar with the next cell selected, resting on the established dark-indigo desk. Preserve all screen weekday labels as static blank typesetting zones in the source image. A few understated illustrated star marks are prepared only on the separate meaning-symbol layer, not on the actual phone lettering. Leave broad dark negative space at the left for an optional final editorial question. The camera-ready composition remains open and calm, with cool blue reflection and a faint amber device edge; it has not faded to black yet. CONTINUITY: The phone, desk, uninscribed tablet and card geometry described here are candidate appearance specifications; use their actual manager-approved reference anchors once bound. Use user board panel(s) A, C only for composition, palette, shape and transition ideas, transformed visibly into illustrated graphic fantasy. All required labels listed in metadata are composited later as modern explanatory text. NEGATIVE: No dissolving real phone characters into Roman names, new information, lyric vocals, automatic fade baked into I2V, abrupt sound cutoff or effect overload. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.

Stylized cinematic history-fantasy graphic animation, bold illustrated forms and sculptural textures, dark moody atmosphere, consistent recurring visual motifs and prop shapes, kinetic-camera-ready depth, muted color palette with deep blues and burnt orange accents, clear focal hierarchy, high-detail illustrated finish, horizontal 16:9 composition.
```

**I2V MOTION GUIDE — English / STORY · FRAME · MOTION · EXIT**

```text
STORY: Quiet continuation of the identical smartphone calendar with the next cell selected, resting on the established dark-indigo desk. Communicate the event and factual limit stated in the parent story sheet; this proposed subshot adds no narration or historical claim.
FRAME: Future production requirement, after prior media exists and passes Agent1 review: use the previous shot's actual EDITED use-exit frame as START, with exact object geometry, desk angle and light direction. The prose ENTRY specification below is a review target and may not replace that continuity reference. The illustrated ENTRY state in the image prompt is a CANDIDATE description, not an existing approved asset. In future production retain horizontal 16:9, all object counts and visible drawing language.
MOTION: Local 0.0–3.0s (parent 6.0–9.0s): ease the camera to a quiet wider framing; release only the explanatory symbols and optional editorial title into a few drawn star marks. Keep the actual Korean screen text intact. Local 3.0–5.0s: settle and preserve reading space while the final spoken question ends. At local 5.0s (absolute 179.0s), begin the final fade in the editor, reaching black at 180.0s only after verifying the measured narration has finished. Do not render any fade inside the generated clip; the usable source must retain handles. Timing values are proposed EDITED-use seconds at 1.0x narration, not measured TTS or provider generation length.
EXIT: A stable quiet phone/desk image before the editorial fade; archive the actual used exit frame, then apply the measured end fade and music tail. Extract the actual edited use-exit at the chosen handoff timestamp, not the provider's final generation frame. Render no inter-shot fades, wipes or typography mutations inside I2V; planned UI/text/symbol layers are assembled in editing.
NEGATIVE: No dissolving real phone characters into Roman names, new information, lyric vocals, automatic fade baked into I2V, abrupt sound cutoff or effect overload. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.
```

**References / continuity**

- A–D 참조 범위: `A / C의 마지막 별빛` — 구도·색감·형태·전환 아이디어만. 최종 스타일 타깃은 비실사 그래픽 판타지.
- 실제 사용자 보드: `D:\컴폴더\다운로드\파트 A,B,C,D기준 보드.png` / `sha256:003c7796688e44e7d1171254e2fc5f049e07031d4d348a3fb86241618d2ebf4c`. 이 원본은 master board 승인이나 실사 스타일 승인을 뜻하지 않는다. 추출 패널 경로는 미생성·미승인 placeholder이고 승인 외형 앵커 ID는 아직 없다. 후보 소품 설명을 승인 Reference library 항목으로 취급하지 않는다.
- 연결 유형 `CONTINUATION` / 이전 샷 `P4_S1_Cut04_A`. 실제 **편집 사용 종료 프레임**은 미생성(null). CONTINUATION은 해당 프레임 검수 뒤 순차 연결한다.
- ENTRY 텍스트와 예시 경로는 검토 사양이다. 실제 생성 전 manager가 승인한 이미지·정확한 참조 인벤토리·현재 provenance를 결합한다.

**Edit & Audio / QC**

- 후보 입력 전환: `hard_cut` 0초. 문자·기하 중첩 방지를 위한 가이드 기본 0.3초 디졸브의 명시적 예외.
- 합성 글자/기호: 당신의 하루에는 어떤 시간의 흔적이 남아 있습니까?(선택적 제목). 이미지·I2V가 생성하는 글자가 아니라 편집층.
- SFX: 미세한 별빛 잔향; 마지막 질문 아래 가사 없는 BGM만.
- BGM: 가사 없는 낮은 앰비언트·그래픽 리듬; 나레이션보다 낮게. 컷 사이 음악은 이어간다.
- 나레이션 자막은 단어 정렬 실측 뒤 별도 편집층에 합성. SHORTFORM 고정 헤더·중앙 띠 규칙 없음.
- 검수할 항목: 부모 서사·근거·공개 시점, 물체 수/모양, 스타일, 시작/사용 종료 인계, 화면 문자 정확성, TTS와 사용 길이, 이전·다음 샷 연속성. 현재 QC는 후보 자체 점검이며 승인 없음.

**06 Asset filename / matching — 계획 경로, 파일 없음**

|종류|경로|
|---|---|
|이미지 1안|`05_images/candidates/P4_S1_Cut04_B_1.png`|
|I2V 1안|`06_clips/generated/P4_S1_Cut04_B_1.mp4`|
|부모 TTS|`03_tts/P4_S1_Cut04.mp3`|
|실제 사용 종료 프레임|`06_clips/used_exits/P4_S1_Cut04_B_use_exit.png`|
|후보 메타데이터|`04_visual_identity/prompt-review-v1/P4_S1_Cut04.json`|

## Provenance / approval boundary

`r04 / SG01 / VS03 / PF04 / GIPC01 / SDL-weekday-roman-gods-v1-r04 / MSTG-weekday-roman-gods-v1-01`에 묶인 검토 후보. 원본 파일 바이트 해시는 [provenance-v1.json](provenance-v1.json)에 보존한다. 소스의 선언 해시는 바이트 해시와 구별한다. script, scene graph, development lock, project.db는 이 패키지로 바꾸지 않았다.

시각 분할을 생산에 적용할지와 실제 TTS 길이에 따른 변경 범위는 Agent1이 판단한다. 원본 의미·시간 가정·Scene graph를 바꾸는 결정이면 재검토/잠금·downstream invalidation 절차를 따른다. 이 문서는 생성 작업 지시나 승인 게이트가 아니다.
