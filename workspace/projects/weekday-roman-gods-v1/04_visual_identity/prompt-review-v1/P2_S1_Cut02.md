# P2_S1_Cut02 — 라틴과 영어가 같은 달 의미를 공유

**상태: CANDIDATE · 사용자/Agent1 검토용 · 실제 이미지/음성/비디오 없음**

## Identity / Script

- 원본 단위 `cut2_2` → 승인 장면 `sc_fce374b8-02ae-4230-87cb-467ae6417121`. Part `P2` / Sequence `S1`.
- 서사 사건: 라틴과 영어가 같은 달 의미를 공유
- 전후 상태: 컷 cut2_1: 동일 달을 영어 글자에 연결 → 라틴과 영어가 같은 달 의미를 공유 → 컷 cut2_2: 같은 일곱 칸이 퍼지는 시간축으로 이동
- 연출 의도: 같은 천체 의미를 유지하는 비교 사례
- 카메라 이유(PF04): 동일 크기 두 판 사이의 한 번의 가로 이동. 전달 화살표로 실제 문화 전파 경로를 단정하지 않는다.
- 원본 장면 제약: 달 모양이 왼쪽 라틴 설명판과 오른쪽 Monday 현대 타이포를 잇는 그래픽 매치.
- 공개 순서/보류: Monday는 비교 후 공개
- 근거 ID: F-04

## 04 Timeline / Narration

부모 단위 계획 `00:38.0–00:46.0`. 낭독 추정 7.2초, **TTS 실측 미생성/미확인(null)**. 속도 1.0×. 컷 경계·모션 비트·종료는 실측 뒤 다시 맞춘다.

> 영어 먼데이도 달의 날입니다. 달이라는 단서는, 다른 언어로 건너가도 알아볼 수 있죠.

계획 오디오 `03_tts/P2_S1_Cut02.mp3`. 위 문장 그대로 한 부모 MP3를 유지한다. A/B 분할이 있어도 별도 TTS를 만들지 않으며 의미가 완결되는 단어 구간은 실측 정렬로 결정한다.

|시각 샷|계획 구간|사용 길이|부모 내 구간|
|---|---|---:|---|
|`P2_S1_Cut02`|00:38.0–00:46.0|8초|0.0–8.0초|

생성 길이/도구/모델은 미선택(null). 머리·꼬리 핸들 각 0.3초는 계획 여유이며 도구의 실제 지원 길이가 아니다. 위 시간은 사용 구간; 생성 길이와 동일하다고 가정하지 않는다.

## 05 컷별 상세 제작 시트

<a id="p2_s1_cut02"></a>

### P2_S1_Cut02 — Monday도 달의 날

같은 달 모양을 좌우 비교한다. Monday는 오른쪽 카드에 후반 공개하고 언어 전파 경로를 그리지 않는다.

**IMAGE PROMPT — English / GPT ENTRY image candidate**

```text
Horizontal 16:9 ENTRY image, generation target 1536x864, composed for a 1920x1080 edit. SCENE PURPOSE: The approved factual/narrative event is specified in the accompanying story sheet; the English geometry below expresses that approved scene without adding claims. A modern two-column comparison on two grounded illustrated cards: the left blank Latin plate carries the established moon symbol, while the right blank English plate carries a matching moon silhouette. The two cards share a simple midnight-blue display surface and slightly different depths; they are not a map or historical timeline. Begin with the left card visually dominant and the right card partly revealed beyond it. Keep ample blank typesetting zones and the inherited crescent proportions. Cool blue shadows and amber card-edge accents provide clear separation. CONTINUITY: The phone, desk, uninscribed tablet and card geometry described here are candidate appearance specifications; use their actual manager-approved reference anchors once bound. Use user board panel(s) D, B only for composition, palette, shape and transition ideas, transformed visibly into illustrated graphic fantasy. All required labels listed in metadata are composited later as modern explanatory text. NEGATIVE: No migration arrows, god face morphing, moving text, proliferating week grids or historical transmission map. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.

Stylized cinematic history-fantasy graphic animation, bold illustrated forms and sculptural textures, dark moody atmosphere, consistent recurring visual motifs and prop shapes, kinetic-camera-ready depth, muted color palette with deep blues and burnt orange accents, clear focal hierarchy, high-detail illustrated finish, horizontal 16:9 composition.
```

**I2V MOTION GUIDE — English / STORY · FRAME · MOTION · EXIT**

```text
STORY: A modern two-column comparison on two grounded illustrated cards: the left blank Latin plate carries the established moon symbol, while the right blank English plate carries a matching moon silhouette. Communicate the event and factual limit stated in the parent story sheet; this proposed subshot adds no narration or historical claim.
FRAME: Future production requirement: generate and review this shot's START image, then use it only after Agent1 approves it. No approved START image currently exists. For a graphic match, bind the previous actual EDITED use-exit frame once available for shape/direction reference; preserve only the planned match, not a false physical continuity. The illustrated ENTRY state in the image prompt is a CANDIDATE description, not an existing approved asset. In future production retain horizontal 16:9, all object counts and visible drawing language.
MOTION: 0.0–1.5s: track gently from the established crescent toward the left card; at 1.5s reveal the matching moon shape beside the right card. 1.5–4.8s: follow one left-to-right camera path across the two shapes, allowing the modern labels to be read. At 5.0s transfer editorial emphasis to Monday. 5.0–8.0s: settle into a balanced two-card view; avoid implying one language is literally transformed into the other. Timing values are proposed EDITED-use seconds at 1.0x narration, not measured TTS or provider generation length.
EXIT: End on a stable rectangular card edge that can match to the corner of the paper document in cut2_3. Extract the actual edited use-exit at the chosen handoff timestamp, not the provider's final generation frame. Render no inter-shot fades, wipes or typography mutations inside I2V; planned UI/text/symbol layers are assembled in editing.
NEGATIVE: No migration arrows, god face morphing, moving text, proliferating week grids or historical transmission map. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.
```

**References / continuity**

- A–D 참조 범위: `D / B의 설명판 형태` — 구도·색감·형태·전환 아이디어만. 최종 스타일 타깃은 비실사 그래픽 판타지.
- 실제 사용자 보드: `D:\컴폴더\다운로드\파트 A,B,C,D기준 보드.png` / `sha256:003c7796688e44e7d1171254e2fc5f049e07031d4d348a3fb86241618d2ebf4c`. 이 원본은 master board 승인이나 실사 스타일 승인을 뜻하지 않는다. 추출 패널 경로는 미생성·미승인 placeholder이고 승인 외형 앵커 ID는 아직 없다. 후보 소품 설명을 승인 Reference library 항목으로 취급하지 않는다.
- 연결 유형 `MATCH_TRANSITION` / 이전 샷 `P2_S1_Cut01`. 실제 **편집 사용 종료 프레임**은 미생성(null). CONTINUATION은 해당 프레임 검수 뒤 순차 연결한다.
- ENTRY 텍스트와 예시 경로는 검토 사양이다. 실제 생성 전 manager가 승인한 이미지·정확한 참조 인벤토리·현재 provenance를 결합한다.

**Edit & Audio / QC**

- 후보 입력 전환: `match_cut` 0초. 문자·기하 중첩 방지를 위한 가이드 기본 0.3초 디졸브의 명시적 예외.
- 합성 글자/기호: dies Lunae / Monday / 달의 날. 이미지·I2V가 생성하는 글자가 아니라 편집층.
- SFX: 두 달 모양 매치에 작은 확인음.
- BGM: 가사 없는 낮은 앰비언트·그래픽 리듬; 나레이션보다 낮게. 컷 사이 음악은 이어간다.
- 나레이션 자막은 단어 정렬 실측 뒤 별도 편집층에 합성. SHORTFORM 고정 헤더·중앙 띠 규칙 없음.
- 검수할 항목: 부모 서사·근거·공개 시점, 물체 수/모양, 스타일, 시작/사용 종료 인계, 화면 문자 정확성, TTS와 사용 길이, 이전·다음 샷 연속성. 현재 QC는 후보 자체 점검이며 승인 없음.

**06 Asset filename / matching — 계획 경로, 파일 없음**

|종류|경로|
|---|---|
|이미지 1안|`05_images/candidates/P2_S1_Cut02_1.png`|
|I2V 1안|`06_clips/generated/P2_S1_Cut02_1.mp4`|
|부모 TTS|`03_tts/P2_S1_Cut02.mp3`|
|실제 사용 종료 프레임|`06_clips/used_exits/P2_S1_Cut02_use_exit.png`|
|후보 메타데이터|`04_visual_identity/prompt-review-v1/P2_S1_Cut02.json`|

## Provenance / approval boundary

`r04 / SG01 / VS03 / PF04 / GIPC01 / SDL-weekday-roman-gods-v1-r04 / MSTG-weekday-roman-gods-v1-01`에 묶인 검토 후보. 원본 파일 바이트 해시는 [provenance-v1.json](provenance-v1.json)에 보존한다. 소스의 선언 해시는 바이트 해시와 구별한다. script, scene graph, development lock, project.db는 이 패키지로 바꾸지 않았다.

시각 분할을 생산에 적용할지와 실제 TTS 길이에 따른 변경 범위는 Agent1이 판단한다. 원본 의미·시간 가정·Scene graph를 바꾸는 결정이면 재검토/잠금·downstream invalidation 절차를 따른다. 이 문서는 생성 작업 지시나 승인 게이트가 아니다.
