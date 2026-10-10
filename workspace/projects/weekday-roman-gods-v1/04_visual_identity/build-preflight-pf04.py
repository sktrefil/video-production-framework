import hashlib
import json
from pathlib import Path

base=Path(__file__).resolve().parent
load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
previous=load(base.parent/'02_script/script-draft-r03.json')
current=load(base.parent/'02_script/script-draft-r04.json')
allowed={'script_revision','script_hash','revision_log','narrative_spine'}
assert set(previous)==set(current)
assert all(previous[k]==current[k] for k in set(previous)-allowed), 'Unexpected substantive field change'
assert previous['units']==current['units'] and len(current['units'])==19
assert current['script_hash']=='sha256:61421546ff99a12f35515d55b460b7fd51752c6ba3e3407b835979d57a93f68c'
pf=load(base/'directing-preflight-pf03.yaml')
vs=load(base/'visual-skeleton-vs02.json')
qc=load(base/'sequence-qc-sqc02.json')
assert pf['overall_status']==vs['status']==qc['status']=='PASS'
assert pf['input_script_hash']==vs['input_script_hash']==qc['input_script_hash']==previous['script_hash']
review={
 'previous_script_revision':'r03','previous_input_script_hash':previous['script_hash'],
 'current_script_revision':'r04','current_input_script_hash':current['script_hash'],
 'content_equality':'PASS_FOR_ALL_UNITS',
 'comparison_scope':'All fields unchanged except script_revision, script_hash, revision_log and narrative_spine; all 19 units identical including narration, timing, visual directing, attention events and evidence/guardrails.',
 'spine_change_assessment':'PASS: corrected spine distinguishes shared seven-day structure from different language name traditions and explicitly avoids a direct Roman-to-Korean genealogy. Existing units already use comparative modern explanatory space without historical transmission arrows; camera, sequence, event density and factual guardrails remain compatible.',
 'previous_narrative_spine':previous['narrative_spine'],
 'current_narrative_spine':current['narrative_spine'],
 'reuse_basis':'Substantive unit directing review retained only after identical-unit verification and explicit corrected-spine review. Rebound all artifacts to the R04 candidate.',
}
pf.update(preflight_revision='PF04',script_revision='r04',input_script_hash=current['script_hash'],narrative_spine=current['narrative_spine'],substantive_review_equality=review)
vs.update(visual_skeleton_revision='VS03',script_revision='r04',input_script_hash=current['script_hash'],preflight_revision='PF04',substantive_review_equality=review,narrative_spine=current['narrative_spine'])
vs.pop('visual_skeleton_hash')
vs.pop('hash_basis')
vs['visual_skeleton_hash']='sha256:'+hashlib.sha256(json.dumps(vs,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')).hexdigest()
vs['hash_basis']='UTF-8 canonical JSON with sorted keys and compact separators, excluding visual_skeleton_hash and hash_basis.'
qc.update(sequence_qc_revision='SQC03',script_revision='r04',input_script_hash=current['script_hash'],preflight_revision='PF04',visual_skeleton_revision='VS03',visual_skeleton_hash=vs['visual_skeleton_hash'],substantive_review_equality=review)
for filename,obj in [('directing-preflight-pf04.yaml',pf),('visual-skeleton-vs03.json',vs),('sequence-qc-sqc03.json',qc)]:
    (base/filename).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
ids=[u['unit_id'] for u in current['units']]
assert ids==[u['unit_id'] for u in pf['unit_reviews']]==[u['unit_id'] for u in vs['units']]
assert all(u['style_mode']=='NON_REALISTIC_STYLIZED' for u in vs['units'])
assert pf['input_script_hash']==vs['input_script_hash']==qc['input_script_hash']==current['script_hash']
assert all(not x['revision_required'] for x in pf['unit_reviews']+pf['sequence_reviews'])
assert len(qc['blocks'])==7 and qc['unresolved_revision_count']==0
hash_input={k:v for k,v in vs.items() if k not in {'visual_skeleton_hash','hash_basis'}}
assert vs['visual_skeleton_hash']=='sha256:'+hashlib.sha256(json.dumps(hash_input,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')).hexdigest()
print('PASS: R03/R04 unit equality, corrected narrative spine review, 19 units, 7 blocks, strict R04 provenance and VS03 hash')
print('VS03 '+vs['visual_skeleton_hash'])
