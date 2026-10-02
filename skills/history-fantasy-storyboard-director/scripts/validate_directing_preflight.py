#!/usr/bin/env python3
import json, sys

OVERALL = {"PASS", "REVISION_REQUIRED", "BLOCKED"}
TRI = {"PASS", "WARN", "FAIL"}
RISK = {"LOW", "MEDIUM", "HIGH"}
ROUTE = {"NONE", "WRITER", "DIRECTOR", "RESEARCH"}
VISUAL = {"OBJECT", "PLACE", "ACTION", "COMPARISON", "CHANGE", "ABSENCE", "DOCUMENTED_DIAGRAM", "BRIDGE_ONLY"}
FORBIDDEN = {"final_image_prompt", "start_target_image_job", "final_i2v_prompt", "final_tts"}


def fail(msg):
    print(f"BLOCKED: {msg}")
    sys.exit(1)


def req(obj, key):
    if key not in obj or obj[key] in (None, "", []):
        fail(f"missing/non-empty required field: {key}")
    return obj[key]


def main(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    req(data, "preflight_revision")
    req(data, "script_revision")
    req(data, "narrative_spine")
    overall = req(data, "overall_status")
    if overall not in OVERALL:
        fail(f"invalid overall_status: {overall}")

    lower_keys = {str(k).lower() for k in data.keys()}
    if lower_keys & FORBIDDEN:
        fail(f"preflight contains prohibited production output: {sorted(lower_keys & FORBIDDEN)}")

    reviews = req(data, "unit_reviews")
    revisions = 0
    for r in reviews:
        uid = req(r, "unit_id")
        if float(req(r, "estimated_tts_duration_sec")) <= 0:
            fail(f"{uid}: estimated_tts_duration_sec must be > 0")
        for k in ["visual_feasibility", "attention_feasibility", "duration_fit", "transition_fit"]:
            if req(r, k) not in TRI:
                fail(f"{uid}: invalid {k}")
        for k in ["repetition_risk", "abstraction_risk"]:
            if req(r, k) not in RISK:
                fail(f"{uid}: invalid {k}")
        req(r, "camera_reason")
        if req(r, "visual_mode_candidate") not in VISUAL:
            fail(f"{uid}: invalid visual_mode_candidate")
        req(r, "attention_event_candidate")
        required = r.get("revision_required")
        if not isinstance(required, bool):
            fail(f"{uid}: revision_required must be boolean")
        route = req(r, "revision_route")
        if route not in ROUTE:
            fail(f"{uid}: invalid revision_route")
        if required:
            revisions += 1
            if route == "NONE":
                fail(f"{uid}: revision_required cannot route to NONE")
            req(r, "revision_reason")

    if overall == "PASS" and revisions:
        fail("overall PASS cannot contain revision_required units")
    if overall == "PASS" and any(
        r[k] == "FAIL" for r in reviews for k in ["visual_feasibility", "attention_feasibility", "duration_fit", "transition_fit"]
    ):
        fail("overall PASS cannot contain FAIL unit gates")
    if overall == "REVISION_REQUIRED" and revisions == 0:
        fail("REVISION_REQUIRED requires at least one revision_required unit")

    print(f"PASS: directing preflight units={len(reviews)} overall={overall}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: validate_directing_preflight.py preflight.json")
        sys.exit(2)
    main(sys.argv[1])
