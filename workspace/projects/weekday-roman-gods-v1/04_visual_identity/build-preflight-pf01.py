import json
from pathlib import Path

base = Path(__file__).resolve().parent
script = json.loads((base.parent / '02_script/script-draft-r01.json').read_text(encoding='utf-8-sig'))

# Advisory observations, not production camera/image contracts.
notes = {
 'cut1_1': ('책상 전경에서 달력 아이콘을 발견', '아이콘 크기 대비를 읽히는 단일 사선 접근. 스마트폰 측면과 책상 모서리를 깊이 단서로 쓴다.', '아이콘이 1초에 켜지는 순간', '같은 화면의 월·화·금 세 칸으로 시선 전달', 'LOW', ''),
 'cut1_2': ('세 요일의 어원 질문', '좌우 문자 칸을 한 방향으로 훑되 세 번의 줌을 반복하지 않는다.', '월·화·금 강조색이 순서대로 이동', '사각 화면 가장자리를 다음 석판 테두리에 대응', 'LOW', ''),
 'cut1_3': ('현재 화면에서 과거를 설명하는 프레임으로 전환', '한 번의 축 방향 접근과 종이 면의 펼침. 스마트폰을 돌로 물리적으로 녹이는 사실적 모핑은 피한다.', '1.2초에 사각 면이 분리되어 석판으로 정렬', '석판 앞 별도 현대 설명판에 이동', 'LOW', ''),
 'cut1_4': ('달·화성·금성과 라틴 요일명 관계', '단일 가로 트래킹으로 기호부터 읽힌다. 라틴어 세 줄을 동시에 암기시키지 않는다.', '달·행성 세 기호를 먼저 공개', '금성 옆 빛 틈을 다음 공간 입구로 전달', 'MEDIUM', ''),
 'cut1_5': ('같은 신명인가라는 질문에서 달밤 공간으로 확대', 'C의 밝은 틈을 한 번 통과한 뒤 D 실루엣의 큰 스케일로 감속한다. 광원과 입구를 겹쳐 통로를 읽힌다.', '1.5초에 틈 너머 초승달 발견', '초승달 위치와 은빛을 cut2_1에 유지', 'LOW', ''),
 'cut2_1': ('달의 날과 루나의 연결', '전경 아치와 후경 달 사이의 짧은 수직 시선 이동. 달을 실제 고대 특정 관측 현상으로 주장하지 않는다.', '1초 달 공개, 5초 설명판 이름 공개', '달 실루엣을 Monday 글자의 왼쪽 기호로 전달', 'LOW', ''),
 'cut2_2': ('라틴과 영어가 같은 달 의미를 공유', '동일 크기 두 판 사이의 한 번의 가로 이동. 전달 화살표로 실제 문화 전파 경로를 단정하지 않는다.', '1.5초 Monday 공개, 5초 달 기호로 두 의미 비교', '카드 외곽을 다음 문서 층의 모서리로 전달', 'MEDIUM', ''),
 'cut2_3': ('행성 주간의 점진적 정착', '문서의 한 칸에서 전체 문서로 후퇴하여 적용 범위가 늘어남을 읽히는 스케일 변화가 필요하다.', '1초 한 문서의 칸 등장, 5.5초 서로 다른 문서 면의 칸 발견', '문서의 붉은 빈 칸을 화성 원반으로 연결', 'HIGH', '추상 설명판이 연속된다. 도식 전체를 띄우지 말고 그려진 문서 물체 한 장의 모서리에서 시작해 5.5초에 책상 위 여러 문서 층이 발견되게 명시한다. 실제 유물 복제나 경로지도는 쓰지 않는다.'),
 'cut2_4': ('마르스와 화성의 날', '화성 원반에서 현대 이름판으로 초점 이동. 카메라 아크는 원반 뒤 이름 발견에만 쓰고 갑옷·창의 사실 복원은 제외한다.', '1초 원반 공개, 5초 마르티스 이름으로 초점 이동', '요일명 사각 카드를 증거 한계 설명 공간에 전달', 'MEDIUM', ''),
 'cut2_5': ('요일명으로 실제 전쟁을 증명할 수 없음', '사건 기록칸의 공백을 가까이 보여준 뒤 이름판과의 연결선이 끊기는 변화. HOLD는 빈 칸을 읽는 2초에 한정한다.', '1초 비어 있는 사건칸, 5.5초 연결선 단절', '끊긴 선을 접고 현대 달력 페이지로 복귀', 'MEDIUM', ''),
 'cut2_6': ('전쟁이 아닌 언어 비교로 질문 전환', '석판 문자판의 추가 펼침 대신 A 스마트폰의 페이지 전환으로 물체 접지와 위치 변경이 필요하다.', '1초 스마트폰 몸체 발견, 5초 Friday 비교 칸이 열림', 'Friday 칸의 호박색을 금성 원반에 전달', 'HIGH', 'cut2_4와 cut2_5 뒤에도 설명판을 또 펼치면 같은 도구가 3회 이어진다. A 스마트폰 전체가 책상에 놓인 프레임으로 돌아와 화면 페이지를 옆으로 넘기는 물체 행동을 명시한다.'),
 'cut3_1': ('비너스와 금성의 라틴 금요일', '금성 원반 뒤 설명판을 옆으로 드러내는 짧은 아크. 화성 비교의 붉은 전면 병치와 구별되는 뒤편 발견 구도.', '1초 금성 원반, 5.5초 베네리스 설명판', '라틴 설명판의 가로 기준선만 영어 비교 화면으로 유지', 'LOW', ''),
 'cut3_2': ('영어 Tuesday와 Friday의 다른 신명', '두 행을 한 행씩 차례로 읽고 카메라는 정지에 가까운 짧은 시선 이동만 사용. 로마 신을 게르만 신으로 모핑하지 않는다.', '1.5초 Tuesday/Tiw, 5.5초 Friday/Frigg', '두 행의 이름을 접고 일곱 칸 구조만 유지', 'MEDIUM', ''),
 'cut3_3': ('같은 주간 구조에 다른 명칭', '1초 구조 유지, 5.5초 이름 변화, 10초 일상 스마트폰 재접지. 15초 내 카메라의 주요 이동은 단일 후퇴로 제한한다.', '일곱 칸 틀과 바뀌는 이름의 분리', 'A 화면의 한자 요일로 이동', 'HIGH', '10초 스마트폰 재접속을 단순 아이콘 표시로 끝내지 않는다. 10–15초는 실제 형태가 읽히는 스타일화된 스마트폰 몸체와 책상 모서리까지 보여 추상 연속을 끊는다. 이름판 교체는 고정 카메라 그래픽 레이어로 처리하고 카메라는 단일 후퇴만 수행한다.'),
 'cut3_4': ('한국어 해·달 및 오행 천체 표기', '스마트폰 화면의 해·달 두 칸에서 나머지 다섯 칸으로 한 번 가로 탐색. 다섯 칸을 한꺼번에 신 얼굴과 대응시키지 않는다.', '1초 해·달, 5초 다섯 칸, 10초 한국어 표기의 의미', '전체 달력 틀을 유지한 상태에서 언어층 비교', 'MEDIUM', ''),
 'cut4_1': ('같은 일곱 칸과 서로 다른 이름 종합', '카메라를 안정시키고 언어층만 순차 교체. 빠른 네 보드 회수까지 넣으면 정보 세 층과 시각 모티프 네 개가 경쟁한다.', '1초 첫 층, 5.5초 마지막 층, 8.5초 공통 일곱 칸', '책상 위 비교 자료라는 위치로 내려앉음', 'HIGH', 'A/B/C/D 네 장을 같은 프레임에 빠르게 회수하는 지시를 제거한다. A 스마트폰 달력과 그 위에 교체되는 세 언어의 설명층 두 상태만 사용한다. 8.5초에는 이름층을 접고 일곱 칸만 남겨 정보 예산 3회를 넘기지 않는다.'),
 'cut4_2': ('로마 단일 기원 단정의 한계', '추상 우주 고리 대신 한 자료 물체에서 책상 전체 자료로 넓히는 단일 후퇴. 서로를 연결하는 계보 화살표는 쓰지 않는다.', '1초 로마 카드, 5.5초 다른 언어 자료, 9초 스마트폰 위치 발견', 'B 석판 카드의 직사각형을 A 스마트폰에 매치', 'HIGH', 'cut3_4와 cut4_1 뒤에 또 이름 고리가 나오면 추상 단위 3회다. 스타일화된 책상 위에 로마 설명카드와 다른 언어 설명카드를 동등한 크기로 놓고 단일 후퇴로 여럿을 발견한다. 실제 전래 자료인 듯 보이지 않게 현대 비교 자료임을 분명히 한다.'),
 'cut4_3': ('오프닝 스마트폰의 새로운 의미', 'B에서 A로 그래픽 매치 후 책상 전체로 단일 후퇴. 한국어 글자는 유지하고 천체 기호를 별도 설명층으로 놓는다.', '1초 스마트폰 매치, 5.5초 의미층 발견, 10초 책상 전체', '달빛 반사색을 다음 달 실루엣의 빛으로 전달', 'LOW', ''),
 'cut4_4': ('다음 요일로 넘어가며 관객의 질문 남김', '달 실루엣에서 달력 칸의 이동을 읽힌 뒤 별빛으로 여백을 넓힌다. 179초 페이드는 마지막 낭독 종료 후에만 시작한다.', '1초 달, 5.5초 다음 칸, 9초 질문 여백', '180초까지 잔향을 확보하고 흑화 완료', 'LOW', ''),
}

reviews=[]
for u in script['units']:
    event, camera, reveal, handoff, repetition, revision = notes[u['unit_id']]
    r={
      'unit_id':u['unit_id'], 'story_event':event,
      'timeline_start_sec':u['start_sec'], 'timeline_end_sec':u['end_sec'],
      'estimated_tts_duration_sec':u['estimated_duration_sec'],
      'information_unit_count':u['information_unit_count'], 'visual_event_budget':u['visual_event_budget'],
      'visual_feasibility':'WARN' if revision else 'PASS',
      'attention_feasibility':'WARN' if revision else 'PASS',
      'duration_fit':'PASS', 'transition_fit':'WARN' if revision else 'PASS',
      'repetition_risk':repetition, 'abstraction_risk':u['abstraction_risk'],
      'camera_reason':camera, 'visual_mode_candidate':u['visualizable_event']['type'],
      'attention_event':u['attention_event'], 'attention_timing_exception':'',
      'secondary_attention_event':dict(u['secondary_attention_event'],exception_reason=''),
      'hold_back':u['reveal_policy'], 'reveal_candidate':reveal, 'handoff_candidate':handoff,
      'revision_required':bool(revision), 'revision_route':'DIRECTOR' if revision else 'NONE',
      'revision_reason':revision,
      'timing_basis':'낭독 추정치; 실제 TTS 실측 후 승인 시간창 내 재검증',
      'style_mode':'NON_REALISTIC_STYLIZED',
    }
    if 'tertiary_attention_event' in u:
        r['tertiary_attention_event']=u['tertiary_attention_event']
    reviews.append(r)

blocks=[
 ('B01',0,25,['cut1_1','cut1_2','cut1_3','cut1_4','cut1_5'],2,2,3,1,False,'스마트폰 세부→석판→큰 달의 세 스케일. 같은 사각 틀은 형태 전달이고 읽는 정보가 달라 반복 예외 불필요.'),
 ('B02',25,50,['cut1_5','cut2_1','cut2_2','cut2_3'],2,2,4,2,True,'cut2_2 비교와 cut2_3 확산 도식이 연속 추상화. cut2_3에 문서 물체/책상 스케일 접지를 넣어 깨뜨린다.'),
 ('B03',50,75,['cut2_3','cut2_4','cut2_5','cut2_6'],3,3,5,4,True,'확산 도식→행성/이름 병치→증거칸→언어판이 동일 설명 도구다. cut2_3 문서 확대와 cut2_6 스마트폰 페이지 행동으로 모티프와 스케일을 바꾼다.'),
 ('B04',75,100,['cut2_6','cut3_1','cut3_2'],2,2,4,2,True,'언어판과 영어 비교의 반복을 cut2_6 일상 물체로 끊는다. cut3_1은 원반 뒤 이름 발견, cut3_2는 카메라 정지/두 행 읽기로 속도 대비.'),
 ('B05',100,125,['cut3_3','cut3_4'],2,2,5,2,True,'15초 종합과 15초 한국어 설명이 이어짐. cut3_3의 10초부터 책상/스마트폰 몸체를 읽히고 cut3_4 두 그룹을 순차 공개하여 추상 설명을 실제 달력에 접지.'),
 ('B06',125,150,['cut3_4','cut4_1','cut4_2'],3,3,5,3,True,'세 언어층+네 보드 회수+이름 고리는 중복. cut4_1 두 상태와 3회 변화로 축소, cut4_2 동등한 크기의 현대 자료 카드와 책상 공간으로 위치 전환.'),
 ('B07',150,180,['cut4_2','cut4_3','cut4_4'],2,2,5,1,True,'cut4_2를 책상 자료로 수정하면 B→A 매치와 달→다음 칸이 서로 다른 사건으로 연결된다. 낭독 종료 전에 179초 페이드가 시작되지 않도록 오디오 실측 때 확인.'),
]
seq=[]
for bid,start,end,ids,motif,scale,static,abstract,rev,reason in blocks:
    seq.append({'block_id':bid,'start_sec':start,'end_sec':end,'duration_sec':end-start,'unit_ids':ids,
        'consecutive_same_explanatory_motif_max':motif,'consecutive_same_scale_intent_max':scale,
        'max_static_information_run_sec':static,'max_consecutive_abstract_units':abstract,
        'has_meaningful_attention_change':True,'exception_justification':'',
        'revision_required':rev,'revision_route':'DIRECTOR' if rev else 'NONE',
        'revision_reason':reason if rev else '', 'review_note':reason,
        'measurement_basis':'대본/연출 지시 기반 예상 최대값; 영상 실측 QC가 아님'})

report={
 'preflight_revision':'PF01','script_revision':script['script_revision'],
 'input_script_hash':script['script_hash'],'narrative_spine':script['narrative_spine'],
 'mode':'DIRECTING_PREFLIGHT','overall_status':'REVISION_REQUIRED',
 'style_mode':'NON_REALISTIC_STYLIZED', 'style_notice_id':'STYLE-weekday-roman-gods-v1-r1',
 'authority':'skills/history-fantasy-storyboard-director/SKILL.md',
 'schema_source':'skills/history-fantasy-storyboard-director/assets/directing-preflight-template.md',
 'format_note':'JSON is a YAML 1.2 subset; official validator reads JSON syntax.',
 'unit_reviews':reviews,'sequence_reviews':seq,
 'revision_summary':{'route':'DIRECTOR','cut_ids':[r['unit_id'] for r in reviews if r['revision_required']],
   'script_meaning_change_required':False,'research_change_required':False,
   'next_step':'R02에 연출 수정 반영 후 PF02 재검토. 현재 PF01은 승인 근거로 사용할 수 없음.'},
 'prohibited_outputs':['FINAL_IMAGE_PROMPT','START_TARGET_IMAGE_JOB','FINAL_I2V_PROMPT','FINAL_TTS'],
 'production_state_mutated':False,
}
(base/'directing-preflight-pf01.yaml').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f"Wrote PF01: {len(reviews)} cuts; {len(seq)} sequence blocks; {len(report['revision_summary']['cut_ids'])} directing revisions")
