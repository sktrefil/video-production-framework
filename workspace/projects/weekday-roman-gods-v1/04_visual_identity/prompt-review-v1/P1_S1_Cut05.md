# P1_S1_Cut05 — 같은 신명인가라는 질문에서 달밤 공간으로 확대

**상태: CANDIDATE · 사용자/Agent1 검토용 · 실제 이미지/음성/비디오 없음**

## Identity / Script

- 원본 단위 `cut1_5` → 승인 장면 `sc_31f0ef5e-9a18-49c7-b416-c08cc739a5d1`. Part `P1` / Sequence `S1`.
- 서사 사건: 같은 신명인가라는 질문에서 달밤 공간으로 확대
- 전후 상태: 컷 cut1_4: 설명판 기호가 우주 균열을 형성 → 같은 신명인가라는 질문에서 달밤 공간으로 확대 → 컷 cut1_5: D의 달에 시선 고정 후 달 요일 설명
- 연출 의도: 답을 보류하면서 스케일을 크게 바꾸어 월요일 달로 접속
- 카메라 이유(PF04): C의 밝은 틈을 한 번 통과한 뒤 D 실루엣의 큰 스케일로 감속한다. 광원과 입구를 겹쳐 통로를 읽힌다.
- 원본 장면 제약: C→D: 석판의 별빛 균열을 통과해 거대한 초승달과 층 분리한 콜로세움 실루엣으로 확장.
- 공개 순서/보류: 영어/한국어 반전 답은 보류
- 근거 ID: ED-01

## 04 Timeline / Narration

부모 단위 계획 `00:23.0–00:30.0`. 낭독 추정 6.3초, **TTS 실측 미생성/미확인(null)**. 속도 1.0×. 컷 경계·모션 비트·종료는 실측 뒤 다시 맞춘다.

> 하지만 우리가 그 신들의 이름을 그대로 부르는 걸까요? 여기서 반전이 시작됩니다.

계획 오디오 `03_tts/P1_S1_Cut05.mp3`. 위 문장 그대로 한 부모 MP3를 유지한다. A/B 분할이 있어도 별도 TTS를 만들지 않으며 의미가 완결되는 단어 구간은 실측 정렬로 결정한다.

|시각 샷|계획 구간|사용 길이|부모 내 구간|
|---|---|---:|---|
|`P1_S1_Cut05`|00:23.0–00:30.0|7초|0.0–7.0초|

생성 길이/도구/모델은 미선택(null). 머리·꼬리 핸들 각 0.3초는 계획 여유이며 도구의 실제 지원 길이가 아니다. 위 시간은 사용 구간; 생성 길이와 동일하다고 가정하지 않는다.

## 05 컷별 상세 제작 시트

<a id="p1_s1_cut05"></a>

### P1_S1_Cut05 — 틈을 통과해 달밤으로

석판 틈 통과 후 달과 콜로세움 실루엣을 큰 스케일로 공개한다. 이 공간은 역사 재현이 아니라 질문을 확장하는 상징이다.

**IMAGE PROMPT — English / GPT ENTRY image candidate**

```text
Horizontal 16:9 ENTRY image, generation target 1536x864, composed for a 1920x1080 edit. SCENE PURPOSE: The approved factual/narrative event is specified in the accompanying story sheet; the English geometry below expresses that approved scene without adding claims. A narrow star-colored graphic seam divides the same blue-gray tablet in extreme foreground. Through that seam, reveal only a sliver of an oversized crescent and two abstract arch layers suggesting the Colosseum silhouette. Build a clearly painted fantasy space: angular indigo planes, a crisp amber seam edge and muted silver-blue crescent light. The tablet edges frame a traversable opening with foreground, midground arch and distant moon layers. Keep the far space mostly concealed in the ENTRY image so the later scale reveal is earned. The architecture is an editorial silhouette, not a reconstruction of ancient Rome. CONTINUITY: The phone, desk, uninscribed tablet and card geometry described here are candidate appearance specifications; use their actual manager-approved reference anchors once bound. Use user board panel(s) C, D only for composition, palette, shape and transition ideas, transformed visibly into illustrated graphic fantasy. All required labels listed in metadata are composited later as modern explanatory text. NEGATIVE: No live city streets, people, historically exact building textures, god names, English/Korean answers, or random galaxy-particle overload. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.

Stylized cinematic history-fantasy graphic animation, bold illustrated forms and sculptural textures, dark moody atmosphere, consistent recurring visual motifs and prop shapes, kinetic-camera-ready depth, muted color palette with deep blues and burnt orange accents, clear focal hierarchy, high-detail illustrated finish, horizontal 16:9 composition.
```

**I2V MOTION GUIDE — English / STORY · FRAME · MOTION · EXIT**

```text
STORY: A narrow star-colored graphic seam divides the same blue-gray tablet in extreme foreground. Communicate the event and factual limit stated in the parent story sheet; this proposed subshot adds no narration or historical claim.
FRAME: Future production requirement: generate and review this shot's START image, then use it only after Agent1 approves it. No approved START image currently exists. For a graphic match, bind the previous actual EDITED use-exit frame once available for shape/direction reference; preserve only the planned match, not a false physical continuity. The illustrated ENTRY state in the image prompt is a CANDIDATE description, not an existing approved asset. In future production retain horizontal 16:9, all object counts and visible drawing language.
MOTION: 0.0–1.5s: advance rapidly but smoothly into the graphic seam; at 1.5s cross the near plane and reveal the large moon-space. 1.5–5.5s: accelerate through the layered opening, then widen to an extreme-wide crescent above separated Colosseum-like silhouettes with clear parallax. 5.5–7.0s: decelerate and fix attention on the crescent. Do not create a realistic city or a historical ceremony. Timing values are proposed EDITED-use seconds at 1.0x narration, not measured TTS or provider generation length.
EXIT: The crescent remains in the upper-middle region, larger than the silhouetted arches; give cut2_1 a stable moon and arch orientation to continue. Extract the actual edited use-exit at the chosen handoff timestamp, not the provider's final generation frame. Render no inter-shot fades, wipes or typography mutations inside I2V; planned UI/text/symbol layers are assembled in editing.
NEGATIVE: No live city streets, people, historically exact building textures, god names, English/Korean answers, or random galaxy-particle overload. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.
```

**References / continuity**

- A–D 참조 범위: `C → D` — 구도·색감·형태·전환 아이디어만. 최종 스타일 타깃은 비실사 그래픽 판타지.
- 실제 사용자 보드: `D:\컴폴더\다운로드\파트 A,B,C,D기준 보드.png` / `sha256:003c7796688e44e7d1171254e2fc5f049e07031d4d348a3fb86241618d2ebf4c`. 이 원본은 master board 승인이나 실사 스타일 승인을 뜻하지 않는다. 추출 패널 경로는 미생성·미승인 placeholder이고 승인 외형 앵커 ID는 아직 없다. 후보 소품 설명을 승인 Reference library 항목으로 취급하지 않는다.
- 연결 유형 `MATCH_TRANSITION` / 이전 샷 `P1_S1_Cut04`. 실제 **편집 사용 종료 프레임**은 미생성(null). CONTINUATION은 해당 프레임 검수 뒤 순차 연결한다.
- ENTRY 텍스트와 예시 경로는 검토 사양이다. 실제 생성 전 manager가 승인한 이미지·정확한 참조 인벤토리·현재 provenance를 결합한다.

**Edit & Audio / QC**

- 후보 입력 전환: `match_cut` 0초. 문자·기하 중첩 방지를 위한 가이드 기본 0.3초 디졸브의 명시적 예외.
- 합성 글자/기호: 필수 문자 없음. 이미지·I2V가 생성하는 글자가 아니라 편집층.
- SFX: 짧은 공간 통과음; 도착 뒤 숨을 둔다.
- BGM: 가사 없는 낮은 앰비언트·그래픽 리듬; 나레이션보다 낮게. 컷 사이 음악은 이어간다.
- 나레이션 자막은 단어 정렬 실측 뒤 별도 편집층에 합성. SHORTFORM 고정 헤더·중앙 띠 규칙 없음.
- 검수할 항목: 부모 서사·근거·공개 시점, 물체 수/모양, 스타일, 시작/사용 종료 인계, 화면 문자 정확성, TTS와 사용 길이, 이전·다음 샷 연속성. 현재 QC는 후보 자체 점검이며 승인 없음.

**06 Asset filename / matching — 계획 경로, 파일 없음**

|종류|경로|
|---|---|
|이미지 1안|`05_images/candidates/P1_S1_Cut05_1.png`|
|I2V 1안|`06_clips/generated/P1_S1_Cut05_1.mp4`|
|부모 TTS|`03_tts/P1_S1_Cut05.mp3`|
|실제 사용 종료 프레임|`06_clips/used_exits/P1_S1_Cut05_use_exit.png`|
|후보 메타데이터|`04_visual_identity/prompt-review-v1/P1_S1_Cut05.json`|

## Provenance / approval boundary

`r04 / SG01 / VS03 / PF04 / GIPC01 / SDL-weekday-roman-gods-v1-r04 / MSTG-weekday-roman-gods-v1-01`에 묶인 검토 후보. 원본 파일 바이트 해시는 [provenance-v1.json](provenance-v1.json)에 보존한다. 소스의 선언 해시는 바이트 해시와 구별한다. script, scene graph, development lock, project.db는 이 패키지로 바꾸지 않았다.

시각 분할을 생산에 적용할지와 실제 TTS 길이에 따른 변경 범위는 Agent1이 판단한다. 원본 의미·시간 가정·Scene graph를 바꾸는 결정이면 재검토/잠금·downstream invalidation 절차를 따른다. 이 문서는 생성 작업 지시나 승인 게이트가 아니다.
