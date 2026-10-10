# P3_S1_Cut01 — 비너스와 금성의 라틴 금요일

**상태: CANDIDATE · 사용자/Agent1 검토용 · 실제 이미지/음성/비디오 없음**

## Identity / Script

- 원본 단위 `cut3_1` → 승인 장면 `sc_f5f4fc4e-194a-449a-9e16-64aa590bbf63`. Part `P3` / Sequence `S1`.
- 서사 사건: 비너스와 금성의 라틴 금요일
- 전후 상태: 컷 cut2_6: Friday 칸의 호박색을 금성 원반에 전달 → 비너스와 금성의 라틴 금요일 → 컷 cut3_1: 라틴 칸을 유지한 채 영어 비교 열을 열기
- 연출 의도: 라틴어 금요일을 다음 반전의 비교 기준으로 확립
- 카메라 이유(PF04): 금성 원반 뒤 설명판을 옆으로 드러내는 짧은 아크. 화성 비교의 붉은 전면 병치와 구별되는 뒤편 발견 구도.
- 원본 장면 제약: 금성 기호와 호박색 원반이 석판 설명판 dies Veneris 옆에 드러남. 궁전·연회·암살 장면 없음.
- 공개 순서/보류: 금성 기호 뒤 라틴 어구
- 근거 ID: F-02

## 04 Timeline / Narration

부모 단위 계획 `01:20.0–01:30.0`. 낭독 추정 9.0초, **TTS 실측 미생성/미확인(null)**. 속도 1.0×. 컷 경계·모션 비트·종료는 실측 뒤 다시 맞춘다.

> 금요일도 보죠. 라틴어 디에스 베네리스는 비너스의 이름과 연결됩니다. 금성의 날이죠. 여기까지는 로마의 이름입니다.

계획 오디오 `03_tts/P3_S1_Cut01.mp3`. 위 문장 그대로 한 부모 MP3를 유지한다. A/B 분할이 있어도 별도 TTS를 만들지 않으며 의미가 완결되는 단어 구간은 실측 정렬로 결정한다.

|시각 샷|계획 구간|사용 길이|부모 내 구간|
|---|---|---:|---|
|`P3_S1_Cut01`|01:20.0–01:30.0|10초|0.0–10.0초|

생성 길이/도구/모델은 미선택(null). 머리·꼬리 핸들 각 0.3초는 계획 여유이며 도구의 실제 지원 길이가 아니다. 위 시간은 사용 구간; 생성 길이와 동일하다고 가정하지 않는다.

## 05 컷별 상세 제작 시트

<a id="p3_s1_cut01"></a>

### P3_S1_Cut01 — 라틴어 금요일과 비너스

금성 기호를 먼저 보여주고 5.5초에 dies Veneris로 초점을 옮긴다. 10초는 낭독 밀도 때문에 유지한 강조 컷이며 실측 뒤 다시 검토한다.

**IMAGE PROMPT — English / GPT ENTRY image candidate**

```text
Horizontal 16:9 ENTRY image, generation target 1536x864, composed for a 1920x1080 edit. SCENE PURPOSE: The approved factual/narrative event is specified in the accompanying story sheet; the English geometry below expresses that approved scene without adding claims. An amber illustrated Venus disc and one simple Venus symbol form the primary foreground subject in a dark blue editorial space. The established uninscribed tablet silhouette and a separate modern blank dies Veneris explanation plate sit farther back to the right. Start close enough that the disc dominates but leave its circular boundary fully visible. Use visibly painted sculptural facets, muted amber highlights and cool blue shade; the plate remains blank until typesetting. Reserve a shallow lateral camera path from disc to label. The symbolism explains a name; it does not depict a goddess, palace or ancient event. CONTINUITY: The phone, desk, uninscribed tablet and card geometry described here are candidate appearance specifications; use their actual manager-approved reference anchors once bound. Use user board panel(s) B, C only for composition, palette, shape and transition ideas, transformed visibly into illustrated graphic fantasy. All required labels listed in metadata are composited later as modern explanatory text. NEGATIVE: No sensual goddess portrait, palace, banquet, assassination, historical rituals, seven-column deity board or photoreal planet rendering. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.

Stylized cinematic history-fantasy graphic animation, bold illustrated forms and sculptural textures, dark moody atmosphere, consistent recurring visual motifs and prop shapes, kinetic-camera-ready depth, muted color palette with deep blues and burnt orange accents, clear focal hierarchy, high-detail illustrated finish, horizontal 16:9 composition.
```

**I2V MOTION GUIDE — English / STORY · FRAME · MOTION · EXIT**

```text
STORY: An amber illustrated Venus disc and one simple Venus symbol form the primary foreground subject in a dark blue editorial space. Communicate the event and factual limit stated in the parent story sheet; this proposed subshot adds no narration or historical claim.
FRAME: Future production requirement: generate and review this shot's START image, then use it only after Agent1 approves it. No approved START image currently exists. For a graphic match, bind the previous actual EDITED use-exit frame once available for shape/direction reference; preserve only the planned match, not a false physical continuity. The illustrated ENTRY state in the image prompt is a CANDIDATE description, not an existing approved asset. In future production retain horizontal 16:9, all object counts and visible drawing language.
MOTION: 0.0–1.0s: match the prior amber cell to a single Venus disc, revealing the disc and its symbolic sign. 1.0–5.3s: travel along a shallow lateral arc to expose the separate modern explanation plate. At 5.5s shift emphasis to dies Veneris. 5.5–9.0s: let the phrase and Venus relationship remain readable with minimal residual parallax. 9.0–10.0s: settle on the plate rectangle for the next English comparison. This 10s use interval is an emphasis exception, not a default pacing rule. Timing values are proposed EDITED-use seconds at 1.0x narration, not measured TTS or provider generation length.
EXIT: Preserve the modern plate format and tablet silhouette; the next cut introduces two different English-name rows rather than deity morphing. Extract the actual edited use-exit at the chosen handoff timestamp, not the provider's final generation frame. Render no inter-shot fades, wipes or typography mutations inside I2V; planned UI/text/symbol layers are assembled in editing.
NEGATIVE: No sensual goddess portrait, palace, banquet, assassination, historical rituals, seven-column deity board or photoreal planet rendering. No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. Keep all exact lettering in a separate modern editorial layer.
```

**References / continuity**

- A–D 참조 범위: `B / C` — 구도·색감·형태·전환 아이디어만. 최종 스타일 타깃은 비실사 그래픽 판타지.
- 실제 사용자 보드: `D:\컴폴더\다운로드\파트 A,B,C,D기준 보드.png` / `sha256:003c7796688e44e7d1171254e2fc5f049e07031d4d348a3fb86241618d2ebf4c`. 이 원본은 master board 승인이나 실사 스타일 승인을 뜻하지 않는다. 추출 패널 경로는 미생성·미승인 placeholder이고 승인 외형 앵커 ID는 아직 없다. 후보 소품 설명을 승인 Reference library 항목으로 취급하지 않는다.
- 연결 유형 `MATCH_TRANSITION` / 이전 샷 `P2_S1_Cut06`. 실제 **편집 사용 종료 프레임**은 미생성(null). CONTINUATION은 해당 프레임 검수 뒤 순차 연결한다.
- ENTRY 텍스트와 예시 경로는 검토 사양이다. 실제 생성 전 manager가 승인한 이미지·정확한 참조 인벤토리·현재 provenance를 결합한다.

**Edit & Audio / QC**

- 후보 입력 전환: `match_cut` 0초. 문자·기하 중첩 방지를 위한 가이드 기본 0.3초 디졸브의 명시적 예외.
- 합성 글자/기호: dies Veneris / Venus / 금성의 날. 이미지·I2V가 생성하는 글자가 아니라 편집층.
- SFX: 밝고 작은 원반 강조음; 과도한 신비 효과 없음.
- BGM: 가사 없는 낮은 앰비언트·그래픽 리듬; 나레이션보다 낮게. 컷 사이 음악은 이어간다.
- 나레이션 자막은 단어 정렬 실측 뒤 별도 편집층에 합성. SHORTFORM 고정 헤더·중앙 띠 규칙 없음.
- 검수할 항목: 부모 서사·근거·공개 시점, 물체 수/모양, 스타일, 시작/사용 종료 인계, 화면 문자 정확성, TTS와 사용 길이, 이전·다음 샷 연속성. 현재 QC는 후보 자체 점검이며 승인 없음.

**06 Asset filename / matching — 계획 경로, 파일 없음**

|종류|경로|
|---|---|
|이미지 1안|`05_images/candidates/P3_S1_Cut01_1.png`|
|I2V 1안|`06_clips/generated/P3_S1_Cut01_1.mp4`|
|부모 TTS|`03_tts/P3_S1_Cut01.mp3`|
|실제 사용 종료 프레임|`06_clips/used_exits/P3_S1_Cut01_use_exit.png`|
|후보 메타데이터|`04_visual_identity/prompt-review-v1/P3_S1_Cut01.json`|

## Provenance / approval boundary

`r04 / SG01 / VS03 / PF04 / GIPC01 / SDL-weekday-roman-gods-v1-r04 / MSTG-weekday-roman-gods-v1-01`에 묶인 검토 후보. 원본 파일 바이트 해시는 [provenance-v1.json](provenance-v1.json)에 보존한다. 소스의 선언 해시는 바이트 해시와 구별한다. script, scene graph, development lock, project.db는 이 패키지로 바꾸지 않았다.

시각 분할을 생산에 적용할지와 실제 TTS 길이에 따른 변경 범위는 Agent1이 판단한다. 원본 의미·시간 가정·Scene graph를 바꾸는 결정이면 재검토/잠금·downstream invalidation 절차를 따른다. 이 문서는 생성 작업 지시나 승인 게이트가 아니다.
