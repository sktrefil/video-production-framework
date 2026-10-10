import hashlib
import json
from pathlib import Path

base = Path(__file__).resolve().parent
script = json.loads((base.parent / '02_script/script-draft-r02.json').read_text(encoding='utf-8-sig'))
pf = json.loads((base / 'directing-preflight-pf01.yaml').read_text(encoding='utf-8'))
for u in script['units']:
    for text in [u['visualizable_event']['description'], u['directing_intent'], u['reveal_policy'], u['transition_intent']]:
        if '??' in text:
            raise ValueError(f"Unreadable directing source in {u['unit_id']}: restore UTF-8 source before PF02")

revised = {
 'cut2_3': '문서 물체 한 장에서 책상 위 여러 문서 층으로 후퇴. 1초 한 칸 등장, 5.5초 여러 자료 발견으로 점진적 사용을 설명하며 실제 전파 지도는 피함.',
 'cut2_6': 'A 스마트폰 몸체와 책상으로 복귀한 뒤 페이지가 옆으로 넘어감. 1초 물체 위치 발견, 5초 Friday 칸 공개로 세 번째 설명판 반복을 중단.',
 'cut3_3': '분리된 라틴어/영어 종이 카드의 가장자리를 1초에 읽히고 5.5초 카드의 겹침으로 같은 요일 위치를 확인. 10초부터 스마트폰 몸체와 책상으로 단일 후퇴. 일곱 칸 색판 교체 반복을 제거.',
 'cut4_1': '책상 세부의 언어 카드를 순차 강조하는 첫 읽기 상태 뒤 5.5초 달력 카드/스마트폰 전체로 확대하는 둘째 상태. 8.5초 공통 위치의 빛으로 회수. 네 보드 동시 몽타주 제거.',
 'cut4_2': '현대 책상 위 동등한 크기의 언어 자료 카드. 1초 한 카드에서 5.5초 다른 카드로 가로 공간 이동하고 9초 스마트폰 발견. 실제 자료 위치를 따라 단일 가로 이동하며 계보 화살표 없이 기원 단정의 한계를 표현.',
}
pf.update(preflight_revision='PF02',script_revision=script['script_revision'],
          input_script_hash=script['script_hash'],overall_status='PASS')
by_id={u['unit_id']:u for u in script['units']}
for r in pf['unit_reviews']:
    u=by_id[r['unit_id']]
    r['visual_mode_candidate']=u['visualizable_event']['type']
    r['hold_back']=u['reveal_policy']
    r['handoff_candidate']=u['transition_intent']
    r['revision_required']=False
    r['revision_route']='NONE'
    r['revision_reason']=''
    r['visual_feasibility']=r['attention_feasibility']=r['duration_fit']=r['transition_fit']='PASS'
    if u['unit_id'] in revised:
        r['camera_reason']=revised[u['unit_id']]
        r['reveal_candidate']=u['visualizable_event']['description']
        r['review_note']='PF01 수정 해소: '+revised[u['unit_id']]
        r['repetition_risk']='LOW'
    else:
        r['review_note']='R01에서 통과한 정보 의미·연출 연결을 R02에서 유지함.'

rhythm=[
 (2,2,3,1,'스마트폰 디테일→석판→큰 달. 1초 내 아이콘/기호 공개와 사각 형태 전달이 장면 질문에 연결됨.'),
 (2,2,4,1,'달밤 장소에서 두 언어 비교로 이동한 뒤 cut2_3 문서 물체로 접지. 문서 근접/책상 전체의 스케일 확장이 설명판 연속을 끊음.'),
 (2,2,5,1,'문서 전체→붉은 화성 원반→비어 있는 사건칸→스마트폰 페이지. 카드 비교와 증거 공백은 기능이 다르고 끝에 위치/물체 행동 변경.'),
 (2,2,4,1,'스마트폰 페이지 이후 금성 원반의 뒤편 발견, 이어 두 행 영어 비교를 안정적으로 읽힘. 이동/정착의 속도 대비가 두 어원 정보 밀도를 조절.'),
 (2,2,5,1,'cut3_3은 종이 카드의 겹침 행동으로 시작하여 10초부터 스마트폰 몸체와 책상으로 재접지. cut3_4는 같은 물체 안에서 해·달 2개와 다섯 천체군을 순차 공개해 과도한 텍스트 누적을 피함.'),
 (2,2,5,1,'한국어 설명→카드 책상 세부/스마트폰 전체의 두 상태 종합→다른 카드들의 위치 발견. 네 보드 회수 제거와 물체 접지로 모티프 3회/추상 2회 연속을 피함. 후퇴 뒤 가로 이동으로 이동 방향 변화도 확보.'),
 (2,2,5,1,'책상 자료에서 석판/스마트폰 형태를 대응하고 10초 후 일상 책상 확대. 마지막 달빛→다음 칸 이동 뒤 질문/잔향 여백. 마지막 낭독 종료 확인을 페이드 조건으로 보존.'),
]
for b,values in zip(pf['sequence_reviews'],rhythm):
    motif,scale,static,abstract,note=values
    b.update(consecutive_same_explanatory_motif_max=motif,
             consecutive_same_scale_intent_max=scale,max_static_information_run_sec=static,
             max_consecutive_abstract_units=abstract,revision_required=False,
             revision_route='NONE',revision_reason='',review_note=note)
pf['revision_summary']={'route':'NONE','cut_ids':[], 'resolved_pf01_cut_ids':list(revised),
 'script_meaning_change_required':False,'research_change_required':False,
 'next_step':'VISUAL_SKELETON 및 SEQUENCE_QC 결과를 Agent1이 독립 검토하여 개발 잠금 후보에 연결.'}
pf['production_limitations']=[
 '카메라와 정보 사건의 실행 가능성 검토이며 생성 이미지/영상 QC는 아직 수행되지 않음.',
 '낭독 길이는 추정값. FINAL TTS 승인 이후 실측에 따라 같은 의미/순서 내 타이밍을 검증해야 함.',
 '실제 제작 시 정확한 글자는 별도 그래픽 합성; 생성된 임의 라틴 비문을 사료로 사용하지 않음.'
]
(base/'directing-preflight-pf02.yaml').write_text(json.dumps(pf,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

scales={
 'cut1_1':'책상 미디엄→아이콘 디테일','cut1_2':'화면 디테일 내 세 칸 순차 시선 이동',
 'cut1_3':'사각 면 디테일→석판 미디엄','cut1_4':'석판 미디엄 내 기호/설명판',
 'cut1_5':'빛 틈 디테일→달/콜로세움 익스트림 와이드',
 'cut2_1':'아치 미디엄→달 클로즈','cut2_2':'좌우 설명카드 미디엄 비교',
 'cut2_3':'문서 한 칸 디테일→책상 전체 와이드','cut2_4':'화성 클로즈→뒤 이름판 미디엄',
 'cut2_5':'사건칸 디테일→끊긴 연결선 미디엄','cut2_6':'책상 스마트폰 미디엄→페이지 디테일',
 'cut3_1':'금성 클로즈→옆 라틴 판 미디엄','cut3_2':'안정된 비교판 미디엄; 두 행 순차 읽기',
 'cut3_3':'종이 카드 가장자리 디테일→카드 겹침→스마트폰 몸체와 책상 미디엄',
 'cut3_4':'스마트폰 화면 미디엄→해/달 및 다섯 칸의 세부',
 'cut4_1':'책상 언어 카드 세부→달력 카드/스마트폰 전체 미디엄',
 'cut4_2':'동등한 카드들의 미디엄; 한 카드→다른 카드→스마트폰 가로 이동',
 'cut4_3':'석판/스마트폰 사각 디테일→책상 와이드',
 'cut4_4':'달빛 미디엄→다음 칸 디테일→질문 여백',
}
units=[]
for u in script['units']:
    units.append({
      'unit_id':u['unit_id'],'part_id':u['part_id'],'style_mode':'NON_REALISTIC_STYLIZED',
      'story_event':next(r['story_event'] for r in pf['unit_reviews'] if r['unit_id']==u['unit_id']),
      'expected_duration_band_sec':{'speech_estimate':u['estimated_duration_sec'],'timeline_window':u['end_sec']-u['start_sec']},
      'timeline_start_sec':u['start_sec'],'timeline_end_sec':u['end_sec'],
      'visual_mode':u['visualizable_event']['type'],'scale_intent':scales[u['unit_id']],
      'attention_event':u['attention_event'],'secondary_attention_event':u['secondary_attention_event'],
      'transition_handoff_intent':u['transition_intent'],
      'abstraction_handling':'그려진 물체·문서·건물 실루엣과 현대 설명 공간. 신 얼굴·고대 실내·전쟁 사건·비문·전래 지도는 임의 복원하지 않음. 문자 합성은 현대 비교 자료임을 명시.',
      'evidence_ids':u['evidence_ids'],'visual_note':u['visualizable_event']['description'],
    })
skeleton={
 'project_id':script['project_id'],'visual_skeleton_revision':'VS01','mode':'VISUAL_SKELETON',
 'script_revision':script['script_revision'],'input_script_hash':script['script_hash'],
 'preflight_revision':'PF02','style_mode':'NON_REALISTIC_STYLIZED',
 'status':'PASS','canvas':script['canvas'],'target_duration_sec':180,'units':units,
 'fact_guardrail_ids':script['fact_guardrail_ids'],'final_tts_generated':False,
 'scope':'경량 연출 검토 후보. 최종 이미지/비디오 생성 지시 또는 프로젝트 승인 상태가 아님.'
}
canonical=json.dumps(skeleton,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
skeleton['visual_skeleton_hash']='sha256:'+hashlib.sha256(canonical).hexdigest()
skeleton['hash_basis']='UTF-8 canonical JSON with sorted keys and compact separators, excluding visual_skeleton_hash and hash_basis.'
(base/'visual-skeleton-vs01.json').write_text(json.dumps(skeleton,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
qc={
 'project_id':script['project_id'],'sequence_qc_revision':'SQC01','status':'PASS',
 'script_revision':script['script_revision'],'input_script_hash':script['script_hash'],
 'preflight_revision':'PF02','visual_skeleton_revision':'VS01','visual_skeleton_hash':skeleton['visual_skeleton_hash'],
 'style_mode':'NON_REALISTIC_STYLIZED','blocks':pf['sequence_reviews'],
 'style_qc':'PASS: 평면 음영, 석판/문서의 도형화, 달/콜로세움 실루엣, 현대 비교 설명판. 사진 재현 외관을 최종 화면에 계승하지 않음.',
 'kinetic_qc':'PASS: 형태 대응, 빛 틈 통과, 문서/책상의 스케일 확장, 물체 페이지 이동, 의미 있는 초점 전환을 번갈아 사용. 전편 동일한 느린 접근을 피함.',
 'evidence_bridge_qc':'PASS: 달의 공통 의미→화성과 사건 추론의 한계→라틴/영어→한국어→같은 일곱 칸/다른 이름 회수. 가상의 폭력으로 설명을 연결하지 않음.',
 'tts_density_qc':'PASS_FOR_ESTIMATED_TIMING: 컷당 정보 단위 최대2개, 시각 사건2–3회. 긴 15초 구간은 10초 시점 세 번째 변화를 포함. 실측 음성은 이후 확인.',
 'unresolved_revision_count':0,'production_state_mutated':False,
}
(base/'sequence-qc-sqc01.json').write_text(json.dumps(qc,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('PF02 PASS; VS01 '+skeleton['visual_skeleton_hash']+'; SQC01 PASS')
