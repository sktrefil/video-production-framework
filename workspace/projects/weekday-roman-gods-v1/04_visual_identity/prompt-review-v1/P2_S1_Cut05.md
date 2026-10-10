# P2_S1_Cut05 — 요일명으로 실제 전쟁을 증명할 수 없음

**상태: CANDIDATE · 사용자/Agent1 검토용 · 실제 이미지/음성/비디오 없음**

## Identity / Script

- 원본 단위 `cut2_5` → 승인 장면 `sc_50a5f1c9-74a7-40b8-8d19-794be8adb75d`. Part `P2` / Sequence `S1`.
- 서사 사건: 요일명으로 실제 전쟁을 증명할 수 없음
- 전후 상태: 컷 cut2_4: 무기 상징을 실제 사건의 증거로 읽지 않게 제한 → 요일명으로 실제 전쟁을 증명할 수 없음 → 컷 cut2_5: 폭력 추론을 접고 언어 비교로 방향 전환
- 연출 의도: 이름과 사건 사이 증거 공백을 구체적으로 보여줌
- 카메라 이유(PF04): 사건 기록칸의 공백을 가까이 보여준 뒤 이름판과의 연결선이 끊기는 변화. HOLD는 빈 칸을 읽는 2초에 한정한다.
- 원본 장면 제약: 요일명 설명판 옆 사건 기록 칸을 비워 두고 연결선을 끊음. 전쟁 장면·피·시체 없음.
- 공개 순서/보류: 실제 사건 증거칸의 공백이 설명보다 먼저
- 근거 ID: F-02, LIMIT-01

## 04 Timeline / Narration

부모 단위 계획 `01:03.0–01:12.0`. 낭독 추정 8.0초, **TTS 실측 미생성/미확인(null)**. 속도 1.0×. 컷 경계·모션 비트·종료는 실측 뒤 다시 맞춘다.

> 그렇다고 화요일마다 전쟁이 벌어졌다는 뜻일까요? 요일의 이름만으로, 실제 사건을 말할 수는 없습니다.

계획 오디오 `03_tts/P2_S1_Cut05.mp3`. 위 문장 그대로 한 부모 MP3를 유지한다. A/B 분할이 있어도 별도 TTS를 만들지 않으며 의미가 완결되는 단어 구간은 실측 정렬로 결정한다.

|시각 샷|계획 구간|사용 길이|부모 내 구간|
|---|---|---:|---|
|`P2_S1_Cut05`|01:03.0–01:12.0|9초|0.0–9.0초|

생성 길이/도구/모델은 미선택(null). 머리·꼬리 핸들 각 0.3초는 계획 여유이며 도구의 실제 지원 길이가 아니다. 위 시간은 사용 구간; 생성 길이와 동일하다고 가정하지 않는다.

## 05 컷별 상세 제작 시트

<a id="p2_s1_cut05"></a>

### P2_S1_Cut05 — 이름은 전쟁 기록이 아니다

빈 사건 기록 칸과 끊긴 연결선으로 추론의 한계를 드러낸다. 요일명으로 전쟁을 증명할 수 없다는 뜻이며 역사 전체의 전쟁 부재를 뜻하지 않는다.

**IMAGE PROMPT — English / GPT ENTRY image candidate**

```text
Horizontal 16:9 ENTRY image, generation target 1536x864, composed for a 1920x1080 edit. SCENE PURPOSE: The approved factual/narrative event is specified in the accompanying story sheet; the English geometry below expresses that approved scene without adding claims. Two modern explanatory fields sit on the same grounded blue-gray board: one blank weekday-name plate on the left and one conspicuously empty event-record field on the right. A thin connector between them is prepared with a clear central gap, currently emphasized only faintly. Frame close on the empty record field, retaining the left nameplate edge as context. These are modern editorial diagram objects, with no manuscript realism. Deep blue negative space and restrained amber edge light direct attention to the absence. The record field contains no scene, silhouettes or hidden battle imagery. CONTINUITY: The phone, desk, uninscribed tablet and card geometry described here are candidate appearance specifications; use their actual manager-approved reference anchors once bound. Use user board panel(s) B only for composition, palette, shape and transition ideas, transformed visibly into illustrated graphic fantasy. All required labels listed in metadata are composited later as modern explanatory text. NEGATIVE: No battle montage, smoke, screams, bodies, red blood effects, violence silhouettes or visual claim that no wars ever occurred. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.

Stylized cinematic history-fantasy graphic animation, bold illustrated forms and sculptural textures, dark moody atmosphere, consistent recurring visual motifs and prop shapes, kinetic-camera-ready depth, muted color palette with deep blues and burnt orange accents, clear focal hierarchy, high-detail illustrated finish, horizontal 16:9 composition.
```

**I2V MOTION GUIDE — English / STORY · FRAME · MOTION · EXIT**

```text
STORY: Two modern explanatory fields sit on the same grounded blue-gray board: one blank weekday-name plate on the left and one conspicuously empty event-record field on the right. Communicate the event and factual limit stated in the parent story sheet; this proposed subshot adds no narration or historical claim.
FRAME: Future production requirement, after prior media exists and passes Agent1 review: use the previous shot's actual EDITED use-exit frame as START, with exact object geometry, desk angle and light direction. The prose ENTRY specification below is a review target and may not replace that continuity reference. The illustrated ENTRY state in the image prompt is a CANDIDATE description, not an existing approved asset. In future production retain horizontal 16:9, all object counts and visible drawing language.
MOTION: 0.0–1.0s: enter the empty record field and allow the viewer to inspect its absence. 1.0–5.3s: pull back gently to show the nameplate and event field in one frame. At 5.5s accentuate the predesigned connector gap through an editorial line cue, making the missing inference explicit. 5.5–9.0s: hold the two fields readable with small parallax, then settle toward the desk edge for the return to the phone. The empty field remains empty throughout. Timing values are proposed EDITED-use seconds at 1.0x narration, not measured TTS or provider generation length.
EXIT: Maintain a stable rectangular plate and desk plane; yield a clean match to the physical smartphone in cut2_6. Extract the actual edited use-exit at the chosen handoff timestamp, not the provider's final generation frame. Render no inter-shot fades, wipes or typography mutations inside I2V; planned UI/text/symbol layers are assembled in editing.
NEGATIVE: No battle montage, smoke, screams, bodies, red blood effects, violence silhouettes or visual claim that no wars ever occurred. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.
```

**References / continuity**

- A–D 참조 범위: `B의 현대 설명판` — 구도·색감·형태·전환 아이디어만. 최종 스타일 타깃은 비실사 그래픽 판타지.
- 실제 사용자 보드: `D:\컴폴더\다운로드\파트 A,B,C,D기준 보드.png` / `sha256:003c7796688e44e7d1171254e2fc5f049e07031d4d348a3fb86241618d2ebf4c`. 이 원본은 master board 승인이나 실사 스타일 승인을 뜻하지 않는다. 추출 패널 경로는 미생성·미승인 placeholder이고 승인 외형 앵커 ID는 아직 없다. 후보 소품 설명을 승인 Reference library 항목으로 취급하지 않는다.
- 연결 유형 `CONTINUATION` / 이전 샷 `P2_S1_Cut04`. 실제 **편집 사용 종료 프레임**은 미생성(null). CONTINUATION은 해당 프레임 검수 뒤 순차 연결한다.
- ENTRY 텍스트와 예시 경로는 검토 사양이다. 실제 생성 전 manager가 승인한 이미지·정확한 참조 인벤토리·현재 provenance를 결합한다.

**Edit & Audio / QC**

- 후보 입력 전환: `hard_cut` 0초. 문자·기하 중첩 방지를 위한 가이드 기본 0.3초 디졸브의 명시적 예외.
- 합성 글자/기호: 요일명 / 사건 기록 / 이름만으로 입증 불가. 이미지·I2V가 생성하는 글자가 아니라 편집층.
- SFX: 5.5초 선 끊김에 작은 건조한 클릭; 공포음 없음.
- BGM: 가사 없는 낮은 앰비언트·그래픽 리듬; 나레이션보다 낮게. 컷 사이 음악은 이어간다.
- 나레이션 자막은 단어 정렬 실측 뒤 별도 편집층에 합성. SHORTFORM 고정 헤더·중앙 띠 규칙 없음.
- 검수할 항목: 부모 서사·근거·공개 시점, 물체 수/모양, 스타일, 시작/사용 종료 인계, 화면 문자 정확성, TTS와 사용 길이, 이전·다음 샷 연속성. 현재 QC는 후보 자체 점검이며 승인 없음.

**06 Asset filename / matching — 계획 경로, 파일 없음**

|종류|경로|
|---|---|
|이미지 1안|`05_images/candidates/P2_S1_Cut05_1.png`|
|I2V 1안|`06_clips/generated/P2_S1_Cut05_1.mp4`|
|부모 TTS|`03_tts/P2_S1_Cut05.mp3`|
|실제 사용 종료 프레임|`06_clips/used_exits/P2_S1_Cut05_use_exit.png`|
|후보 메타데이터|`04_visual_identity/prompt-review-v1/P2_S1_Cut05.json`|

## Provenance / approval boundary

`r04 / SG01 / VS03 / PF04 / GIPC01 / SDL-weekday-roman-gods-v1-r04 / MSTG-weekday-roman-gods-v1-01`에 묶인 검토 후보. 원본 파일 바이트 해시는 [provenance-v1.json](provenance-v1.json)에 보존한다. 소스의 선언 해시는 바이트 해시와 구별한다. script, scene graph, development lock, project.db는 이 패키지로 바꾸지 않았다.

시각 분할을 생산에 적용할지와 실제 TTS 길이에 따른 변경 범위는 Agent1이 판단한다. 원본 의미·시간 가정·Scene graph를 바꾸는 결정이면 재검토/잠금·downstream invalidation 절차를 따른다. 이 문서는 생성 작업 지시나 승인 게이트가 아니다.
