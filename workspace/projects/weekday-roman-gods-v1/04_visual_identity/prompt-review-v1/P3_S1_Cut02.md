# P3_S1_Cut02 — 영어 Tuesday와 Friday의 다른 신명

**상태: CANDIDATE · 사용자/Agent1 검토용 · 실제 이미지/음성/비디오 없음**

## Identity / Script

- 원본 단위 `cut3_2` → 승인 장면 `sc_c64585c4-2311-4ba4-a12c-cb93d744a736`. Part `P3` / Sequence `S1`.
- 서사 사건: 영어 Tuesday와 Friday의 다른 신명
- 전후 상태: 컷 cut3_1: 라틴 칸을 유지한 채 영어 비교 열을 열기 → 영어 Tuesday와 Friday의 다른 신명 → 컷 cut3_2: 이름 변형을 요일 칸의 연속과 대비
- 연출 의도: 영어의 두 어원을 한 컷에서 나란히 읽힘
- 카메라 이유(PF04): 두 행을 한 행씩 차례로 읽고 카메라는 정지에 가까운 짧은 시선 이동만 사용. 로마 신을 게르만 신으로 모핑하지 않는다.
- 원본 장면 제약: 두 행의 문자 비교: Tuesday/Tiw, Friday/Frigg. 게르만 신 얼굴 대신 구별되는 추상 문장 기호. 로마 신과 동일 인물처럼 모핑하지 않음.
- 공개 순서/보류: Tuesday 대응 먼저, Friday 대응 뒤
- 근거 ID: F-04

## 04 Timeline / Narration

부모 단위 계획 `01:30.0–01:40.0`. 낭독 추정 9.0초, **TTS 실측 미생성/미확인(null)**. 속도 1.0×. 컷 경계·모션 비트·종료는 실측 뒤 다시 맞춘다.

> 그런데 영어 튜즈데이는 티우의 날, 프라이데이는 프리그의 날에서 왔습니다. 로마 신의 이름이 그대로 남은 말은 아니죠.

계획 오디오 `03_tts/P3_S1_Cut02.mp3`. 위 문장 그대로 한 부모 MP3를 유지한다. A/B 분할이 있어도 별도 TTS를 만들지 않으며 의미가 완결되는 단어 구간은 실측 정렬로 결정한다.

|시각 샷|계획 구간|사용 길이|부모 내 구간|
|---|---|---:|---|
|`P3_S1_Cut02`|01:30.0–01:40.0|10초|0.0–10.0초|

생성 길이/도구/모델은 미선택(null). 머리·꼬리 핸들 각 0.3초는 계획 여유이며 도구의 실제 지원 길이가 아니다. 위 시간은 사용 구간; 생성 길이와 동일하다고 가정하지 않는다.

## 05 컷별 상세 제작 시트

<a id="p3_s1_cut02"></a>

### P3_S1_Cut02 — Tuesday/Tiw와 Friday/Frigg

두 행에서 Tuesday/Tiw 다음 Friday/Frigg를 읽힌다. 이 한 컷에서만 해당 대비를 전개하고 로마 신과 같은 인물로 그리지 않는다.

**IMAGE PROMPT — English / GPT ENTRY image candidate**

```text
Horizontal 16:9 ENTRY image, generation target 1536x864, composed for a 1920x1080 edit. SCENE PURPOSE: The approved factual/narrative event is specified in the accompanying story sheet; the English geometry below expresses that approved scene without adding claims. One stable modern comparison board with exactly two rows, placed on a grounded dark blue editorial surface. Each row has two generous blank typesetting zones, a small abstract emblem and no human or deity portrait. The upper-row emblem uses an angular notch; the lower-row emblem uses an offset loop, making them visibly distinct without claiming historical iconography. Leave the lower row subtly subordinate in the ENTRY image. Use a medium oblique framing with very shallow layer depth, blue-gray board material and restrained amber edge light; the board geometry must allow static editorial typography. CONTINUITY: The phone, desk, uninscribed tablet and card geometry described here are candidate appearance specifications; use their actual manager-approved reference anchors once bound. Use user board panel(s) B only for composition, palette, shape and transition ideas, transformed visibly into illustrated graphic fantasy. All required labels listed in metadata are composited later as modern explanatory text. NEGATIVE: No additional Germanic deity roster, Roman/Germanic identity equivalence, god faces, face morphing, automatic letters or repeated zooms. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.

Stylized cinematic history-fantasy graphic animation, bold illustrated forms and sculptural textures, dark moody atmosphere, consistent recurring visual motifs and prop shapes, kinetic-camera-ready depth, muted color palette with deep blues and burnt orange accents, clear focal hierarchy, high-detail illustrated finish, horizontal 16:9 composition.
```

**I2V MOTION GUIDE — English / STORY · FRAME · MOTION · EXIT**

```text
STORY: One stable modern comparison board with exactly two rows, placed on a grounded dark blue editorial surface. Communicate the event and factual limit stated in the parent story sheet; this proposed subshot adds no narration or historical claim.
FRAME: Future production requirement: generate and review this shot's START image, then use it only after Agent1 approves it. No approved START image currently exists. For a graphic match, bind the previous actual EDITED use-exit frame once available for shape/direction reference; preserve only the planned match, not a false physical continuity. The illustrated ENTRY state in the image prompt is a CANDIDATE description, not an existing approved asset. In future production retain horizontal 16:9, all object counts and visible drawing language.
MOTION: 0.0–1.5s: settle into the single comparison board; at 1.5s reveal the Tuesday/Tiw row by composited emphasis. 1.5–5.3s: retain a gentle 8% forward camera approach while the first row reads. At 5.5s move editorial emphasis to the Friday/Frigg row, with a small downward camera adjustment. 5.5–9.3s: keep both rows in one stable frame for the contrast. 9.3–10.0s: settle, preserving rectangular paper-plane geometry for the next shot. No gods or names morph into one another. Timing values are proposed EDITED-use seconds at 1.0x narration, not measured TTS or provider generation length.
EXIT: Both distinct rows remain legible; hand off their rectangular comparison geometry to two separate language cards on the desk. Extract the actual edited use-exit at the chosen handoff timestamp, not the provider's final generation frame. Render no inter-shot fades, wipes or typography mutations inside I2V; planned UI/text/symbol layers are assembled in editing.
NEGATIVE: No additional Germanic deity roster, Roman/Germanic identity equivalence, god faces, face morphing, automatic letters or repeated zooms. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.
```

**References / continuity**

- A–D 참조 범위: `B의 설명판 구도` — 구도·색감·형태·전환 아이디어만. 최종 스타일 타깃은 비실사 그래픽 판타지.
- 실제 사용자 보드: `D:\컴폴더\다운로드\파트 A,B,C,D기준 보드.png` / `sha256:003c7796688e44e7d1171254e2fc5f049e07031d4d348a3fb86241618d2ebf4c`. 이 원본은 master board 승인이나 실사 스타일 승인을 뜻하지 않는다. 추출 패널 경로는 미생성·미승인 placeholder이고 승인 외형 앵커 ID는 아직 없다. 후보 소품 설명을 승인 Reference library 항목으로 취급하지 않는다.
- 연결 유형 `MATCH_TRANSITION` / 이전 샷 `P3_S1_Cut01`. 실제 **편집 사용 종료 프레임**은 미생성(null). CONTINUATION은 해당 프레임 검수 뒤 순차 연결한다.
- ENTRY 텍스트와 예시 경로는 검토 사양이다. 실제 생성 전 manager가 승인한 이미지·정확한 참조 인벤토리·현재 provenance를 결합한다.

**Edit & Audio / QC**

- 후보 입력 전환: `match_cut` 0초. 문자·기하 중첩 방지를 위한 가이드 기본 0.3초 디졸브의 명시적 예외.
- 합성 글자/기호: Tuesday / Tiw / Friday / Frigg / 서로 다른 이름 전통. 이미지·I2V가 생성하는 글자가 아니라 편집층.
- SFX: 행 전환 시 작은 톤 2개.
- BGM: 가사 없는 낮은 앰비언트·그래픽 리듬; 나레이션보다 낮게. 컷 사이 음악은 이어간다.
- 나레이션 자막은 단어 정렬 실측 뒤 별도 편집층에 합성. SHORTFORM 고정 헤더·중앙 띠 규칙 없음.
- 검수할 항목: 부모 서사·근거·공개 시점, 물체 수/모양, 스타일, 시작/사용 종료 인계, 화면 문자 정확성, TTS와 사용 길이, 이전·다음 샷 연속성. 현재 QC는 후보 자체 점검이며 승인 없음.

**06 Asset filename / matching — 계획 경로, 파일 없음**

|종류|경로|
|---|---|
|이미지 1안|`05_images/candidates/P3_S1_Cut02_1.png`|
|I2V 1안|`06_clips/generated/P3_S1_Cut02_1.mp4`|
|부모 TTS|`03_tts/P3_S1_Cut02.mp3`|
|실제 사용 종료 프레임|`06_clips/used_exits/P3_S1_Cut02_use_exit.png`|
|후보 메타데이터|`04_visual_identity/prompt-review-v1/P3_S1_Cut02.json`|

## Provenance / approval boundary

`r04 / SG01 / VS03 / PF04 / GIPC01 / SDL-weekday-roman-gods-v1-r04 / MSTG-weekday-roman-gods-v1-01`에 묶인 검토 후보. 원본 파일 바이트 해시는 [provenance-v1.json](provenance-v1.json)에 보존한다. 소스의 선언 해시는 바이트 해시와 구별한다. script, scene graph, development lock, project.db는 이 패키지로 바꾸지 않았다.

시각 분할을 생산에 적용할지와 실제 TTS 길이에 따른 변경 범위는 Agent1이 판단한다. 원본 의미·시간 가정·Scene graph를 바꾸는 결정이면 재검토/잠금·downstream invalidation 절차를 따른다. 이 문서는 생성 작업 지시나 승인 게이트가 아니다.
