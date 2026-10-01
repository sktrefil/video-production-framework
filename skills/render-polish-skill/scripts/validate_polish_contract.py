#!/usr/bin/env python3
import sys, json, pathlib, subprocess

REQUIRED = [
    "render_polish_job_id",
    "image_job_id",
    "polish_strength",
    "locked_snapshot_before",
    "locked_snapshot_after",
    "polish_delta",
    "visual_hierarchy",
    "lighting_polish",
    "material_polish",
    "clutter_control",
    "color_discipline",
    "motion_support",
    "anatomy_readability",
    "style_alignment",
    "prompt_budget",
    "base_prompt_en",
    "final_prompt_en",
]

SECTIONS = [
    "LOCKED DIRECTING",
    "MUST PRESERVE",
    "VISUAL HIERARCHY",
    "LIGHTING",
    "MATERIAL / DEPTH",
    "COLOR",
    "MOTION SUPPORT",
    "RENDER FINISH",
    "NEGATIVE CONSTRAINTS",
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
    errors=[]
    warnings=[]

    for k in REQUIRED:
        if k not in d or not nonempty(d[k]):
            errors.append(f"{k}: missing or empty")

    strength = str(d.get("polish_strength","")).upper()
    if strength not in {"LIGHT","STANDARD","STRONG"}:
        errors.append("polish_strength: invalid")

    # STRONG eligibility
    if strength == "STRONG":
        eligibility = d.get("strong_eligibility",{})
        for k in ["P0_directing_lock_pass","P7_motion_support_pass","composition_approved"]:
            if eligibility.get(k) is not True:
                errors.append(f"STRONG requires {k}=true")
        # only required if people are present
        if eligibility.get("people_present") is True and eligibility.get("identity_reference_available") is not True:
            errors.append("STRONG with people requires identity_reference_available=true")

    # motion support hard gate
    ms=d.get("motion_support",{})
    if isinstance(ms,dict):
        for k in ["camera_corridor_clear","parallax_source_preserved","negative_space_preserved","exit_readability_preserved"]:
            if ms.get(k) is not True:
                errors.append(f"motion_support.{k}: must be true")
    else:
        errors.append("motion_support must be object")

    # anatomy preservation
    ar=d.get("anatomy_readability",{})
    if isinstance(ar,dict):
        if ar.get("identity_preserved") is not True:
            errors.append("anatomy_readability.identity_preserved must be true")
        if ar.get("pose_preserved") is not True:
            errors.append("anatomy_readability.pose_preserved must be true")

    # polish delta must at least preserve something
    delta=d.get("polish_delta",{})
    if isinstance(delta,dict):
        if not isinstance(delta.get("preserved"),list) or len(delta.get("preserved",[]))==0:
            errors.append("polish_delta.preserved must include protected elements")
    else:
        errors.append("polish_delta must be object")

    # final prompt required section order
    prompt=d.get("final_prompt_en","") if isinstance(d.get("final_prompt_en",""),str) else ""
    positions=[]
    for s in SECTIONS:
        pos=prompt.find(s)
        if pos<0:
            errors.append(f"final_prompt_en missing section: {s}")
        positions.append(pos)
    if all(x>=0 for x in positions) and positions != sorted(positions):
        errors.append("final_prompt_en sections out of required order")

    # call subvalidators
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

    print("PASS: render polish contract")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
