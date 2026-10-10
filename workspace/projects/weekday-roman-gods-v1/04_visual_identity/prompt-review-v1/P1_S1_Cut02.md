# P1_S1_Cut02 — 세 요일의 어원 질문

**상태: CANDIDATE · 사용자/Agent1 검토용 · 실제 이미지/음성/비디오 없음**

## Identity / Script

- 원본 단위 `cut1_2` → 승인 장면 `sc_e3f0d937-5f3f-470a-b307-efd6ddf02b52`. Part `P1` / Sequence `S1`.
- 서사 사건: 세 요일의 어원 질문
- 전후 상태: 컷 cut1_1: 앱 아이콘에서 요일 글자로 진입 → 세 요일의 어원 질문 → 컷 cut1_2: 요일 칸의 직사각형을 석판 외곽과 매치
- 연출 의도: 언어 질문을 읽을 수 있는 문자 대상으로 접지
- 카메라 이유(PF04): 좌우 문자 칸을 한 방향으로 훑되 세 번의 줌을 반복하지 않는다.
- 원본 장면 제약: A: 스마트폰의 월·화·금 글자를 순차 확대. 정확한 글자는 편집에서 합성.
- 공개 순서/보류: 정답 없이 세 칸을 연결
- 근거 ID: F-05, ED-01

## 04 Timeline / Narration

부모 단위 계획 `00:05.0–00:10.0`. 낭독 추정 4.5초, **TTS 실측 미생성/미확인(null)**. 속도 1.0×. 컷 경계·모션 비트·종료는 실측 뒤 다시 맞춘다.

> 월요일, 화요일, 금요일. 이 이름들은 어디서 왔을까요?

계획 오디오 `03_tts/P1_S1_Cut02.mp3`. 위 문장 그대로 한 부모 MP3를 유지한다. A/B 분할이 있어도 별도 TTS를 만들지 않으며 의미가 완결되는 단어 구간은 실측 정렬로 결정한다.

|시각 샷|계획 구간|사용 길이|부모 내 구간|
|---|---|---:|---|
|`P1_S1_Cut02`|00:05.0–00:10.0|5초|0.0–5.0초|

생성 길이/도구/모델은 미선택(null). 머리·꼬리 핸들 각 0.3초는 계획 여유이며 도구의 실제 지원 길이가 아니다. 위 시간은 사용 구간; 생성 길이와 동일하다고 가정하지 않는다.

## 05 컷별 상세 제작 시트

<a id="p1_s1_cut02"></a>

### P1_S1_Cut02 — 월·화·금의 질문

월·화·금 세 칸을 한 방향으로 훑는다. 글자는 편집 합성이며 한국어가 로마 신명으로 변하는 효과는 넣지 않는다.

**IMAGE PROMPT — English / GPT ENTRY image candidate**

```text
Horizontal 16:9 ENTRY image, generation target 1536x864, composed for a 1920x1080 edit. SCENE PURPOSE: The approved factual/narrative event is specified in the accompanying story sheet; the English geometry below expresses that approved scene without adding claims. Close view of the same illustrated smartphone calendar surface, keeping the upper-right device orientation, blue-gray bezel and amber light from upper left. Show a clean seven-cell weekday row with blank text locations; mark three discrete cell positions through slightly brighter borders for later Korean labels. Maintain a sliver of the same desk and phone edge at the lower side so the view remains grounded in one object. Camera-ready diagonal depth permits a single lateral scan, with the first target nearest the left. This image supplies geometry; all required weekday lettering will be typeset later. CONTINUITY: The phone, desk, uninscribed tablet and card geometry described here are candidate appearance specifications; use their actual manager-approved reference anchors once bound. Use user board panel(s) A only for composition, palette, shape and transition ideas, transformed visibly into illustrated graphic fantasy. All required labels listed in metadata are composited later as modern explanatory text. NEGATIVE: No letter generation or mutation, Roman names on the Korean screen, extra screens, new iconography or repeated zoom pulses. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.

Stylized cinematic history-fantasy graphic animation, bold illustrated forms and sculptural textures, dark moody atmosphere, consistent recurring visual motifs and prop shapes, kinetic-camera-ready depth, muted color palette with deep blues and burnt orange accents, clear focal hierarchy, high-detail illustrated finish, horizontal 16:9 composition.
```

**I2V MOTION GUIDE — English / STORY · FRAME · MOTION · EXIT**

```text
STORY: Close view of the same illustrated smartphone calendar surface, keeping the upper-right device orientation, blue-gray bezel and amber light from upper left. Communicate the event and factual limit stated in the parent story sheet; this proposed subshot adds no narration or historical claim.
FRAME: Future production requirement, after prior media exists and passes Agent1 review: use the previous shot's actual EDITED use-exit frame as START, with exact object geometry, desk angle and light direction. The prose ENTRY specification below is a review target and may not replace that continuity reference. The illustrated ENTRY state in the image prompt is a CANDIDATE description, not an existing approved asset. In future production retain horizontal 16:9, all object counts and visible drawing language.
MOTION: 0.0–1.0s: start on the inherited calendar area and begin one continuous left-to-right oblique tracking move. 1.0–3.8s: pass the three editorially labeled target cells in spoken order; alter the composited emphasis, not the screen geometry, while maintaining one camera trajectory. 3.8–5.0s: settle on the final rectangular cell boundary and let its shape become the handoff. Do not perform three separate zoom punches. Timing values are proposed EDITED-use seconds at 1.0x narration, not measured TTS or provider generation length.
EXIT: A single clear calendar rectangle fills the visual center; retain its angle for the phone-to-tablet graphic match in cut1_3. Extract the actual edited use-exit at the chosen handoff timestamp, not the provider's final generation frame. Render no inter-shot fades, wipes or typography mutations inside I2V; planned UI/text/symbol layers are assembled in editing.
NEGATIVE: No letter generation or mutation, Roman names on the Korean screen, extra screens, new iconography or repeated zoom pulses. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.
```

**References / continuity**

- A–D 참조 범위: `A` — 구도·색감·형태·전환 아이디어만. 최종 스타일 타깃은 비실사 그래픽 판타지.
- 실제 사용자 보드: `D:\컴폴더\다운로드\파트 A,B,C,D기준 보드.png` / `sha256:003c7796688e44e7d1171254e2fc5f049e07031d4d348a3fb86241618d2ebf4c`. 이 원본은 master board 승인이나 실사 스타일 승인을 뜻하지 않는다. 추출 패널 경로는 미생성·미승인 placeholder이고 승인 외형 앵커 ID는 아직 없다. 후보 소품 설명을 승인 Reference library 항목으로 취급하지 않는다.
- 연결 유형 `CONTINUATION` / 이전 샷 `P1_S1_Cut01`. 실제 **편집 사용 종료 프레임**은 미생성(null). CONTINUATION은 해당 프레임 검수 뒤 순차 연결한다.
- ENTRY 텍스트와 예시 경로는 검토 사양이다. 실제 생성 전 manager가 승인한 이미지·정확한 참조 인벤토리·현재 provenance를 결합한다.

**Edit & Audio / QC**

- 후보 입력 전환: `hard_cut` 0초. 문자·기하 중첩 방지를 위한 가이드 기본 0.3초 디졸브의 명시적 예외.
- 합성 글자/기호: 월 / 화 / 금. 이미지·I2V가 생성하는 글자가 아니라 편집층.
- SFX: 세 개의 아주 짧은 강조음; 나레이션보다 작게.
- BGM: 가사 없는 낮은 앰비언트·그래픽 리듬; 나레이션보다 낮게. 컷 사이 음악은 이어간다.
- 나레이션 자막은 단어 정렬 실측 뒤 별도 편집층에 합성. SHORTFORM 고정 헤더·중앙 띠 규칙 없음.
- 검수할 항목: 부모 서사·근거·공개 시점, 물체 수/모양, 스타일, 시작/사용 종료 인계, 화면 문자 정확성, TTS와 사용 길이, 이전·다음 샷 연속성. 현재 QC는 후보 자체 점검이며 승인 없음.

**06 Asset filename / matching — 계획 경로, 파일 없음**

|종류|경로|
|---|---|
|이미지 1안|`05_images/candidates/P1_S1_Cut02_1.png`|
|I2V 1안|`06_clips/generated/P1_S1_Cut02_1.mp4`|
|부모 TTS|`03_tts/P1_S1_Cut02.mp3`|
|실제 사용 종료 프레임|`06_clips/used_exits/P1_S1_Cut02_use_exit.png`|
|후보 메타데이터|`04_visual_identity/prompt-review-v1/P1_S1_Cut02.json`|

## Provenance / approval boundary

`r04 / SG01 / VS03 / PF04 / GIPC01 / SDL-weekday-roman-gods-v1-r04 / MSTG-weekday-roman-gods-v1-01`에 묶인 검토 후보. 원본 파일 바이트 해시는 [provenance-v1.json](provenance-v1.json)에 보존한다. 소스의 선언 해시는 바이트 해시와 구별한다. script, scene graph, development lock, project.db는 이 패키지로 바꾸지 않았다.

시각 분할을 생산에 적용할지와 실제 TTS 길이에 따른 변경 범위는 Agent1이 판단한다. 원본 의미·시간 가정·Scene graph를 바꾸는 결정이면 재검토/잠금·downstream invalidation 절차를 따른다. 이 문서는 생성 작업 지시나 승인 게이트가 아니다.
