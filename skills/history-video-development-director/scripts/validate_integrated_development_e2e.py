#!/usr/bin/env python3
import json, sys

def fail(msg):
    print(f"BLOCKED_E2E: {msg}")
    sys.exit(1)

def req(o,k):
    if k not in o or o[k] in (None,"",[]):
        fail(f"missing/non-empty required field: {k}")
    return o[k]

def main(path):
    with open(path, encoding="utf-8") as f:
        d=json.load(f)

    if req(d,"workflow_authority")!="history-video-development-director":
        fail("wrong workflow authority")
    if req(d,"approval_authority")!="Agent1":
        fail("wrong approval authority")
    if req(d,"research_lock_status")!="PASS":
        fail("research lock must pass")

    script=req(d,"script")
    pre=req(d,"preflight")
    vis=req(d,"visual_skeleton")
    lock=req(d,"script_directing_lock")
    mgr=req(d,"manager_story_gate")
    ftg=req(d,"final_tts_gate")

    if script.get("status")!="CANDIDATE_READY_FOR_LOCK_REVIEW":
        fail("script candidate not ready")
    if script.get("final_tts_generated") is not False:
        fail("FINAL TTS exists before completed development flow")
    fq=req(script,"final_quarter_qc")
    if fq.get("theme_spine_recovered") is not True or fq.get("meaning_expansion_present") is not True or fq.get("result_listing_only") is not False:
        fail("final quarter QC failed")

    if pre.get("status")!="PASS" or pre.get("sequence_qc_status")!="PASS":
        fail("preflight/sequence QC must pass")
    if vis.get("status")!="PASS":
        fail("visual skeleton must pass")
    if lock.get("status")!="PASS":
        fail("script-directing lock must pass")
    if mgr.get("status")!="PASS":
        fail("manager Story Gate must pass")
    if ftg.get("status")!="PASS":
        fail("FINAL_TTS_GATE must pass")

    revisions=req(d,"revision_history")
    if len(revisions)>3:
        fail("development revision rounds exceed default maximum")
    if any(r.get("status")!="RESOLVED" for r in revisions):
        fail("unresolved development revision remains")

    revisions_seen={script.get("revision"),pre.get("input_script_revision"),vis.get("input_script_revision"),lock.get("script_revision"),mgr.get("approved_script_revision"),ftg.get("script_revision")}
    hashes_seen={script.get("hash"),pre.get("input_script_hash"),vis.get("input_script_hash"),lock.get("script_hash"),mgr.get("approved_script_hash"),ftg.get("script_hash")}
    if len(revisions_seen)!=1:
        fail(f"script revision provenance mismatch: {revisions_seen}")
    if len(hashes_seen)!=1:
        fail(f"script hash provenance mismatch: {hashes_seen}")

    if req(d,"next_allowed_action")!="FINAL_TTS":
        fail("next action must be FINAL_TTS after all gates pass")

    print(f"PASS: integrated development E2E project={d.get('project_id')} revisions={len(revisions)}")

if __name__=="__main__":
    if len(sys.argv)!=2:
        print("usage: validate_integrated_development_e2e.py manifest.json")
        sys.exit(2)
    main(sys.argv[1])
