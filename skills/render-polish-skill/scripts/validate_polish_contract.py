#!/usr/bin/env python3
import sys, json, pathlib, subprocess

REQUIRED = [
    "render_polish_job_id","image_job_id","polish_strength",
    "locked_snapshot_before","locked_snapshot_after","polish_delta",
    "visual_hierarchy","lighting_polish","material_polish","clutter_control",
    "color_discipline","motion_support","anatomy_readability","style_alignment",
    "prompt_budget","base_prompt_en","final_prompt_en"
]
SECTIONS = [
    "LOCKED DIRECTING","MUST PRESERVE","VISUAL HIERARCHY","LIGHTING",
    "MATERIAL / DEPTH","COLOR","MOTION SUPPORT","RENDER FINISH","NEGATIVE CONSTRAINTS"
]

def nonempty(v):
    if v is None: return False
    if isinstance(v,str): return bool(v.strip())
    if isinstance(v,(list,dict)): return len(v)>0
    return True

def main():
    if len(sys.argv) != 2:
        print("usage: validate_polish_contract.py <job.json>")
        return 2
    p = pathlib.Path(sys.argv[1])
    if not p.exists():
        print(f"ERROR: not found: {p}")
        return 2

    d = json.loads(p.read_text(encoding="utf-8"))
    errors=[]; warnings=[]

    mode=str(d.get("workflow_mode","LEGACY")).upper()
    style_mode=str(d.get("style_mode","")).upper()
    if mode=="INTEGRATED" and style_mode!="NON_REALISTIC_STYLIZED":
        errors.append("style_mode: INTEGRATED workflow requires NON_REALISTIC_STYLIZED")
    forbidden_style_terms=[
        "photorealistic","photo-realistic","hyperrealistic","hyper-realistic",
        "ultra-realistic","live-action","documentary reenactment",
        "realistic cinematic reconstruction","looks like a real photograph"
    ]
    negation_markers=[
        "no ","not ","non-photoreal","non realistic","non-realistic",
        "prohibited","forbidden","avoid ","negative constraints"
    ]
    prompt_lines=[]
    for k in ["base_prompt_en","final_prompt_en"]:
        prompt_lines.extend(str(d.get(k,"")).lower().splitlines())
    for line in prompt_lines:
        if any(term in line for term in forbidden_style_terms) and not any(mark in line for mark in negation_markers):
            errors.append(f"NON_REALISTIC_STYLE_LOCK violation: {line.strip()}")
    if mode not in {"LEGACY","INTEGRATED"}:
        errors.append("workflow_mode: invalid")
    if mode=="INTEGRATED":
        for k in ["script_directing_lock_id","visual_beat_lock_id"]:
            if not nonempty(d.get(k)):
                errors.append(f"{k}: required for INTEGRATED workflow")

    for k in REQUIRED:
        if k not in d or not nonempty(d[k]):
            errors.append(f"{k}: missing or empty")

    strength = str(d.get("polish_strength","")).upper()
    if strength not in {"LIGHT","STANDARD","STRONG"}:
        errors.append("polish_strength: invalid")

    if strength == "STRONG":
        eligibility = d.get("strong_eligibility",{})
        for k in ["P0_directing_lock_pass","P7_motion_support_pass","composition_approved"]:
            if eligibility.get(k) is not True:
                errors.append(f"STRONG requires {k}=true")
        if eligibility.get("people_present") is True and eligibility.get("identity_reference_available") is not True:
            errors.append("STRONG with people requires identity_reference_available=true")

    ms=d.get("motion_support",{})
    if isinstance(ms,dict):
        for k in ["camera_corridor_clear","parallax_source_preserved","negative_space_preserved","exit_readability_preserved"]:
            if ms.get(k) is not True:
                errors.append(f"motion_support.{k}: must be true")
    else:
        errors.append("motion_support must be object")

    ar=d.get("anatomy_readability",{})
    if isinstance(ar,dict):
        if ar.get("identity_preserved") is not True:
            errors.append("anatomy_readability.identity_preserved must be true")
        if ar.get("pose_preserved") is not True:
            errors.append("anatomy_readability.pose_preserved must be true")

    delta=d.get("polish_delta",{})
    if isinstance(delta,dict):
        if not isinstance(delta.get("preserved"),list) or len(delta.get("preserved",[]))==0:
            errors.append("polish_delta.preserved must include protected elements")
    else:
        errors.append("polish_delta must be object")

    prompt=d.get("final_prompt_en","") if isinstance(d.get("final_prompt_en",""),str) else ""
    positions=[]
    for sec in SECTIONS:
        pos=prompt.find(sec)
        if pos<0:
            errors.append(f"final_prompt_en missing section: {sec}")
        positions.append(pos)
    if all(x>=0 for x in positions) and positions != sorted(positions):
        errors.append("final_prompt_en sections out of required order")

    script_dir=pathlib.Path(__file__).parent
    for script in ["validate_locked_fields.py","validate_prompt_budget.py","validate_continuity_color.py"]:
        cp=subprocess.run([sys.executable,str(script_dir/script),str(p)],capture_output=True,text=True)
        if cp.returncode!=0:
            errors.append(f"{script}: {cp.stdout.strip() or cp.stderr.strip()}")
        elif "PASS_WITH_WARNINGS" in cp.stdout:
            warnings.append(f"{script}: {cp.stdout.strip()}")

    if errors:
        print("BLOCKED:")
        for e in errors: print("-",e)
        if warnings:
            print("WARNINGS:")
            for w in warnings: print("-",w)
        return 1
    if warnings:
        print("PASS_WITH_WARNINGS:")
        for w in warnings: print("-",w)
        return 0
    print(f"PASS: render polish contract workflow_mode={mode}")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
