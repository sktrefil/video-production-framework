# P2_S1_Cut03 — 행성 주간의 점진적 정착

**상태: CANDIDATE · 사용자/Agent1 검토용 · 실제 이미지/음성/비디오 없음**

## Identity / Script

- 원본 단위 `cut2_3` → 승인 장면 `sc_58f855cb-c118-4638-a0ef-92fe81e4b9c2`. Part `P2` / Sequence `S1`.
- 서사 사건: 행성 주간의 점진적 정착
- 전후 상태: 컷 cut2_2: 같은 일곱 칸이 퍼지는 시간축으로 이동 → 행성 주간의 점진적 정착 → 컷 cut2_3: 문서 가장자리의 붉은 기호를 화성 원반으로 전달
- 연출 의도: 단일 문서 세부에서 책상 위 여러 분리된 문서 물체로 스케일을 바꾸어 점진적 사용을 읽힘. 각 문서는 상징이며 이동 화살표나 일곱 칸 복제 애니메이션으로 확산을 설명하지 않음.
- 카메라 이유(PF04): 문서 물체 한 장에서 책상 위 여러 문서 층으로 후퇴. 1초 한 칸 등장, 5.5초 여러 자료 발견으로 점진적 사용을 설명하며 실제 전파 지도는 피함.
- 원본 장면 제약: 한 장의 그래픽 문서 모서리와 요일 칸을 먼저 읽힌다. 5.5초에 책상 폭으로 시야를 넓혀 별도의 문서 물체가 같은 칸을 사용함을 발견. 미검증 비문은 만들지 않고 정확한 어구는 현대 설명층으로 합성한다. 실제 유물이나 전파 경로 재현이 아니다.
- 공개 순서/보류: 문서의 모서리와 첫 칸을 먼저, 별도 문서는 5.5초에 발견
- 근거 ID: F-01, F-03

## 04 Timeline / Narration

부모 단위 계획 `00:46.0–00:55.0`. 낭독 추정 8.0초, **TTS 실측 미생성/미확인(null)**. 속도 1.0×. 컷 경계·모션 비트·종료는 실측 뒤 다시 맞춘다.

> 로마 세계에서는 이런 행성 요일이 제정기 초기에 퍼졌습니다. 하루아침에 모두의 달력이 된 건 아닙니다.

계획 오디오 `03_tts/P2_S1_Cut03.mp3`. 위 문장 그대로 한 부모 MP3를 유지한다. A/B 분할이 있어도 별도 TTS를 만들지 않으며 의미가 완결되는 단어 구간은 실측 정렬로 결정한다.

|시각 샷|계획 구간|사용 길이|부모 내 구간|
|---|---|---:|---|
|`P2_S1_Cut03`|00:46.0–00:55.0|9초|0.0–9.0초|

생성 길이/도구/모델은 미선택(null). 머리·꼬리 핸들 각 0.3초는 계획 여유이며 도구의 실제 지원 길이가 아니다. 위 시간은 사용 구간; 생성 길이와 동일하다고 가정하지 않는다.

## 05 컷별 상세 제작 시트

<a id="p2_s1_cut03"></a>

### P2_S1_Cut03 — 점진적으로 쓰인 행성 주간

한 문서 모서리에서 5.5초에 책상 폭으로 확대해 다른 문서들을 발견한다. 문서 복제나 전파 화살표로 확산을 단정하지 않는다.

**IMAGE PROMPT — English / GPT ENTRY image candidate**

```text
Horizontal 16:9 ENTRY image, generation target 1536x864, composed for a 1920x1080 edit. SCENE PURPOSE: The approved factual/narrative event is specified in the accompanying story sheet; the English geometry below expresses that approved scene without adding claims. Close oblique view of one illustrated paper document corner on a dark-indigo editorial desk. Its first calendar cell is visible, with blank modern typesetting space; a muted red circular marker sits at the far document margin for a later Mars match. Two other separate paper documents already exist outside the initial camera crop; their corners may be glimpsed only at the image edge. Use drawn paper thickness, broad sculptural planes and amber side light from upper left. This is a present-day explanatory tabletop staging, not an ancient room, recovered manuscript or proof of a specific spread route. Establish spatial room for a later wide view of all three distinct objects. CONTINUITY: The phone, desk, uninscribed tablet and card geometry described here are candidate appearance specifications; use their actual manager-approved reference anchors once bound. Use user board panel(s) B, A only for composition, palette, shape and transition ideas, transformed visibly into illustrated graphic fantasy. All required labels listed in metadata are composited later as modern explanatory text. NEGATIVE: No repeated calendar-grid cloning, spread arrows, historical route map, emperor, invented manuscript writing, seals or exact archaeological artifact claims. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.

Stylized cinematic history-fantasy graphic animation, bold illustrated forms and sculptural textures, dark moody atmosphere, consistent recurring visual motifs and prop shapes, kinetic-camera-ready depth, muted color palette with deep blues and burnt orange accents, clear focal hierarchy, high-detail illustrated finish, horizontal 16:9 composition.
```

**I2V MOTION GUIDE — English / STORY · FRAME · MOTION · EXIT**

```text
STORY: Close oblique view of one illustrated paper document corner on a dark-indigo editorial desk. Communicate the event and factual limit stated in the parent story sheet; this proposed subshot adds no narration or historical claim.
FRAME: Future production requirement: generate and review this shot's START image, then use it only after Agent1 approves it. No approved START image currently exists. For a graphic match, bind the previous actual EDITED use-exit frame once available for shape/direction reference; preserve only the planned match, not a false physical continuity. The illustrated ENTRY state in the image prompt is a CANDIDATE description, not an existing approved asset. In future production retain horizontal 16:9, all object counts and visible drawing language.
MOTION: 0.0–1.0s: travel along the document corner until its first calendar cell is readable. 1.0–5.3s: maintain a shallow diagonal move over the single document, with restrained paper-edge parallax. At 5.5s begin a decisive backward camera expansion to reveal the two previously offscreen documents separately on the same desk. 5.5–8.2s: hold their coexistence as a symbol of gradual adoption. 8.2–9.0s: redirect to the red margin marker for the next graphic match. No documents spawn or clone. Timing values are proposed EDITED-use seconds at 1.0x narration, not measured TTS or provider generation length.
EXIT: Leave the red circular marker readable and the separate documents grounded; its color and circular shape match the next Mars disc. Extract the actual edited use-exit at the chosen handoff timestamp, not the provider's final generation frame. Render no inter-shot fades, wipes or typography mutations inside I2V; planned UI/text/symbol layers are assembled in editing.
NEGATIVE: No repeated calendar-grid cloning, spread arrows, historical route map, emperor, invented manuscript writing, seals or exact archaeological artifact claims. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.
```

**References / continuity**

- A–D 참조 범위: `B의 문서 형태 / A의 책상` — 구도·색감·형태·전환 아이디어만. 최종 스타일 타깃은 비실사 그래픽 판타지.
- 실제 사용자 보드: `D:\컴폴더\다운로드\파트 A,B,C,D기준 보드.png` / `sha256:003c7796688e44e7d1171254e2fc5f049e07031d4d348a3fb86241618d2ebf4c`. 이 원본은 master board 승인이나 실사 스타일 승인을 뜻하지 않는다. 추출 패널 경로는 미생성·미승인 placeholder이고 승인 외형 앵커 ID는 아직 없다. 후보 소품 설명을 승인 Reference library 항목으로 취급하지 않는다.
- 연결 유형 `MATCH_TRANSITION` / 이전 샷 `P2_S1_Cut02`. 실제 **편집 사용 종료 프레임**은 미생성(null). CONTINUATION은 해당 프레임 검수 뒤 순차 연결한다.
- ENTRY 텍스트와 예시 경로는 검토 사양이다. 실제 생성 전 manager가 승인한 이미지·정확한 참조 인벤토리·현재 provenance를 결합한다.

**Edit & Audio / QC**

- 후보 입력 전환: `match_cut` 0초. 문자·기하 중첩 방지를 위한 가이드 기본 0.3초 디졸브의 명시적 예외.
- 합성 글자/기호: 행성 요일 / 점진적 정착(현대 설명층). 이미지·I2V가 생성하는 글자가 아니라 편집층.
- SFX: 종이 가장자리의 짧은 마찰음; 확대 시 낮은 공간음.
- BGM: 가사 없는 낮은 앰비언트·그래픽 리듬; 나레이션보다 낮게. 컷 사이 음악은 이어간다.
- 나레이션 자막은 단어 정렬 실측 뒤 별도 편집층에 합성. SHORTFORM 고정 헤더·중앙 띠 규칙 없음.
- 검수할 항목: 부모 서사·근거·공개 시점, 물체 수/모양, 스타일, 시작/사용 종료 인계, 화면 문자 정확성, TTS와 사용 길이, 이전·다음 샷 연속성. 현재 QC는 후보 자체 점검이며 승인 없음.

**06 Asset filename / matching — 계획 경로, 파일 없음**

|종류|경로|
|---|---|
|이미지 1안|`05_images/candidates/P2_S1_Cut03_1.png`|
|I2V 1안|`06_clips/generated/P2_S1_Cut03_1.mp4`|
|부모 TTS|`03_tts/P2_S1_Cut03.mp3`|
|실제 사용 종료 프레임|`06_clips/used_exits/P2_S1_Cut03_use_exit.png`|
|후보 메타데이터|`04_visual_identity/prompt-review-v1/P2_S1_Cut03.json`|

## Provenance / approval boundary

`r04 / SG01 / VS03 / PF04 / GIPC01 / SDL-weekday-roman-gods-v1-r04 / MSTG-weekday-roman-gods-v1-01`에 묶인 검토 후보. 원본 파일 바이트 해시는 [provenance-v1.json](provenance-v1.json)에 보존한다. 소스의 선언 해시는 바이트 해시와 구별한다. script, scene graph, development lock, project.db는 이 패키지로 바꾸지 않았다.

시각 분할을 생산에 적용할지와 실제 TTS 길이에 따른 변경 범위는 Agent1이 판단한다. 원본 의미·시간 가정·Scene graph를 바꾸는 결정이면 재검토/잠금·downstream invalidation 절차를 따른다. 이 문서는 생성 작업 지시나 승인 게이트가 아니다.
