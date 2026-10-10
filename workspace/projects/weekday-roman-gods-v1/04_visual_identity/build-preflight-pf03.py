import hashlib
import json
from pathlib import Path

base=Path(__file__).resolve().parent
load=lambda path:json.loads(path.read_text(encoding='utf-8-sig'))
r02=load(base.parent/'02_script/script-draft-r02.json')
r03=load(base.parent/'02_script/script-draft-r03.json')
allowed_meta={'script_revision','script_hash','status','development_state','script_qc','revision_log'}
assert set(r02)==set(r03), 'Script root schema changed'
for key in set(r02)-allowed_meta-{'units'}:
    assert r02[key]==r03[key], f'Substantive root field changed: {key}'
assert len(r02['units'])==len(r03['units'])==19
for a,b in zip(r02['units'],r03['units']):
    assert set(a)==set(b), 'Unit schema changed'
    assert {k:v for k,v in a.items() if k!='preflight_status'}=={k:v for k,v in b.items() if k!='preflight_status'}, f"Substantive unit changed: {a['unit_id']}"
    assert b['preflight_status']=='PASS'
assert r03['script_hash']=='sha256:eb9c0f7f9fb2816a3cb388cdb93b0380b8028bac029f7dfbc5bda65eb738b46a'

pf=load(base/'directing-preflight-pf02.yaml')
vs=load(base/'visual-skeleton-vs01.json')
qc=load(base/'sequence-qc-sqc01.json')
assert pf['overall_status']==vs['status']==qc['status']=='PASS'
assert pf['input_script_hash']==vs['input_script_hash']==qc['input_script_hash']==r02['script_hash']
assert all(not x['revision_required'] for x in pf['unit_reviews']+pf['sequence_reviews'])
equality={
 'previous_script_revision':'r02','previous_input_script_hash':r02['script_hash'],
 'current_script_revision':'r03','current_input_script_hash':r03['script_hash'],
 'content_equality':'PASS',
 'comparison_scope':'All root fields except declared candidate metadata; all unit fields except preflight_status. Includes narration, evidence, guardrails, unit IDs/order, timeline, directing/visual descriptions and attention events.',
 'reuse_basis':'Completed substantive PF02 review remains applicable because the checked directing content is identical. New revision/hash bindings rebuilt for strict candidate provenance.',
}
pf.update(preflight_revision='PF03',script_revision='r03',input_script_hash=r03['script_hash'],substantive_review_equality=equality)
vs.update(visual_skeleton_revision='VS02',script_revision='r03',input_script_hash=r03['script_hash'],preflight_revision='PF03',substantive_review_equality=equality)
vs.pop('visual_skeleton_hash')
vs.pop('hash_basis')
vs['visual_skeleton_hash']='sha256:'+hashlib.sha256(json.dumps(vs,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')).hexdigest()
vs['hash_basis']='UTF-8 canonical JSON with sorted keys and compact separators, excluding visual_skeleton_hash and hash_basis.'
qc.update(sequence_qc_revision='SQC02',script_revision='r03',input_script_hash=r03['script_hash'],preflight_revision='PF03',visual_skeleton_revision='VS02',visual_skeleton_hash=vs['visual_skeleton_hash'],substantive_review_equality=equality)

for filename,obj in [('directing-preflight-pf03.yaml',pf),('visual-skeleton-vs02.json',vs),('sequence-qc-sqc02.json',qc)]:
    (base/filename).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

ids=[u['unit_id'] for u in r03['units']]
assert ids==[r['unit_id'] for r in pf['unit_reviews']]==[u['unit_id'] for u in vs['units']]
assert pf['input_script_hash']==vs['input_script_hash']==qc['input_script_hash']==r03['script_hash']
assert len(qc['blocks'])==7 and all(not b['revision_required'] for b in qc['blocks'])
assert all(u['style_mode']=='NON_REALISTIC_STYLIZED' for u in vs['units'])
hash_input={k:v for k,v in vs.items() if k not in {'visual_skeleton_hash','hash_basis'}}
assert vs['visual_skeleton_hash']=='sha256:'+hashlib.sha256(json.dumps(hash_input,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')).hexdigest()
print('PASS: R02/R03 substantive equality, 19 units, 7 blocks, strict R03 provenance and VS02 canonical hash')
print('VS02 '+vs['visual_skeleton_hash'])
