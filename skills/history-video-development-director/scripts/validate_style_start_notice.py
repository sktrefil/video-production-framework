#!/usr/bin/env python3
import json, sys

REQUIRED_PROHIBITED = {
    "PHOTOREALISTIC",
    "LIVE_ACTION",
    "DOCUMENTARY_REENACTMENT",
    "HYPERREAL",
    "REALISTIC_CINEMATIC_RECONSTRUCTION",
}
REQUIRED_CAMERA_HINTS = {
    "kinetic camera motion",
    "foreground parallax",
    "scale shifts",
    "spatial traversal",
    "arc/orbit",
    "graphic match",
    "speed contrast",
}

def fail(msg):
    print(f"BLOCKED_STYLE_NOTICE: {msg}")
    raise SystemExit(1)

def req(d,k):
    if k not in d or d[k] in (None,"",[]):
        fail(f"missing/non-empty required field: {k}")
    return d[k]

def main(path):
    with open(path,encoding="utf-8") as f:
        d=json.load(f)

    req(d,"notice_id")
    req(d,"project_id")
    req(d,"video_title_or_topic")

    if req(d,"style_mode")!="NON_REALISTIC_STYLIZED":
        fail("style_mode must be NON_REALISTIC_STYLIZED")

    visual=str(req(d,"visual_language")).lower()
    if "styl" not in visual and "graphic" not in visual:
        fail("visual_language must explicitly describe stylized/graphic visual language")

    cams=req(d,"camera_language")
    if not isinstance(cams,list):
        fail("camera_language must be a list")
    camset={str(x).strip().lower() for x in cams}
    if len(camset & REQUIRED_CAMERA_HINTS) < 4:
        fail("camera_language must carry at least four kinetic directing anchors")

    prohibited={str(x).strip().upper() for x in req(d,"prohibited_styles")}
    missing=sorted(REQUIRED_PROHIBITED-prohibited)
    if missing:
        fail("missing prohibited styles: "+", ".join(missing))

    ep=str(req(d,"evidence_policy")).lower()
    if not any(x in ep for x in ["stylize","abstract","silhouette","editorial"]):
        fail("evidence_policy must describe uncertainty stylization")

    notice=str(req(d,"user_visible_notice_ko"))
    for token in ["비실사","실사","카메라"]:
        if token not in notice:
            fail(f"user_visible_notice_ko missing token: {token}")

    if d.get("user_notice_rendered") is not True:
        fail("user_notice_rendered must be true")
    if d.get("status")!="DECLARED":
        fail("status must be DECLARED")

    print(f"PASS: STYLE_START_NOTICE {d['notice_id']}")

if __name__=="__main__":
    if len(sys.argv)!=2:
        print("usage: validate_style_start_notice.py notice.json")
        raise SystemExit(2)
    main(sys.argv[1])
