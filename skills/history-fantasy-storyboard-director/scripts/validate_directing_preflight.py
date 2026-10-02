#!/usr/bin/env python3
import json, sys

OVERALL = {"PASS", "REVISION_REQUIRED", "BLOCKED"}
TRI = {"PASS", "WARN", "FAIL"}
RISK = {"LOW", "MEDIUM", "HIGH"}
ROUTE = {"NONE", "WRITER", "DIRECTOR", "RESEARCH"}
SEQ_ROUTE = {"NONE", "WRITER", "DIRECTOR"}
VISUAL = {"OBJECT", "PLACE", "ACTION", "COMPARISON", "CHANGE", "ABSENCE", "DOCUMENTED_DIAGRAM", "BRIDGE_ONLY"}
ATTENTION = {"REVEAL", "ACTION", "PARALLAX", "FOCUS_SHIFT", "SPATIAL_DISCOVERY", "QUESTION", "REORIENTATION", "HOLD"}
FORBIDDEN = {"final_image_prompt", "start_target_image_job", "final_i2v_prompt", "final_tts"}

def fail(msg):
    print(f"BLOCKED: {msg}")
    sys.exit(1)

def req(obj, key):
    if key not in obj or obj[key] in (None, "", []):
        fail(f"missing/non-empty required field: {key}")
    return obj[key]

def walk_keys(obj, path="root"):
    found = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            kp = f"{path}.{k}"
            if str(k).lower() in FORBIDDEN:
                found.append(kp)
            found.extend(walk_keys(v, kp))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            found.extend(walk_keys(v, f"{path}[{i}]"))
    return found

def main(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    req(data, "preflight_revision")
    req(data, "script_revision")
    req(data, "input_script_hash")
    req(data, "narrative_spine")
    overall = req(data, "overall_status")
    if overall not in OVERALL:
        fail(f"invalid overall_status: {overall}")

    forbidden = walk_keys(data)
    if forbidden:
        fail(f"preflight contains prohibited production output: {forbidden}")

    reviews = req(data, "unit_reviews")
    revisions = 0
    for r in reviews:
        uid = req(r, "unit_id")
        duration = float(req(r, "estimated_tts_duration_sec"))
        if duration <= 0:
            fail(f"{uid}: estimated_tts_duration_sec must be > 0")

        info = int(req(r, "information_unit_count"))
        budget = int(req(r, "visual_event_budget"))
        if info <= 0 or budget <= 0:
            fail(f"{uid}: information/event counts must be > 0")

        for k in ["visual_feasibility", "attention_feasibility", "duration_fit", "transition_fit"]:
            if req(r, k) not in TRI:
                fail(f"{uid}: invalid {k}")
        for k in ["repetition_risk", "abstraction_risk"]:
            if req(r, k) not in RISK:
                fail(f"{uid}: invalid {k}")

        req(r, "camera_reason")
        if req(r, "visual_mode_candidate") not in VISUAL:
            fail(f"{uid}: invalid visual_mode_candidate")

        attention = req(r, "attention_event")
        if not isinstance(attention, dict) or req(attention, "type") not in ATTENTION:
            fail(f"{uid}: invalid attention_event")
        first = float(req(attention, "target_time_sec"))
        if first < 0:
            fail(f"{uid}: attention target must be >= 0")
        if first > 4.0 and not str(r.get("attention_timing_exception", "")).strip():
            fail(f"{uid}: first attention target >4.0s without exception")

        secondary = r.get("secondary_attention_event", {})
        if duration >= 8.0:
            if not isinstance(secondary, dict):
                fail(f"{uid}: secondary_attention_event must be object")
            if secondary.get("required") is True:
                st = secondary.get("target_time_sec")
                if st is None or not (4.0 <= float(st) <= 6.5):
                    fail(f"{uid}: secondary attention target must be 4.0-6.5s")
            elif not str(secondary.get("exception_reason", "")).strip():
                fail(f"{uid}: >=8s unit requires secondary attention or exception")

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

    seqs = req(data, "sequence_reviews")
    seq_revisions = 0
    for b in seqs:
        bid = req(b, "block_id")
        if float(req(b, "duration_sec")) <= 0:
            fail(f"{bid}: duration_sec must be > 0")
        motif = int(req(b, "consecutive_same_explanatory_motif_max"))
        scale = int(req(b, "consecutive_same_scale_intent_max"))
        static = float(req(b, "max_static_information_run_sec"))
        abstract = int(req(b, "max_consecutive_abstract_units"))
        change = b.get("has_meaningful_attention_change")
        if not isinstance(change, bool):
            fail(f"{bid}: has_meaningful_attention_change must be boolean")

        risk = motif >= 3 or scale >= 3 or static > 12.0 or abstract >= 2 or not change
        exc = str(b.get("exception_justification", "")).strip()
        required = b.get("revision_required")
        if not isinstance(required, bool):
            fail(f"{bid}: revision_required must be boolean")
        route = req(b, "revision_route")
        if route not in SEQ_ROUTE:
            fail(f"{bid}: invalid revision_route")
        if risk and not exc and not required:
            fail(f"{bid}: sequence hard-gate risk requires revision or explicit exception")
        if required:
            seq_revisions += 1
            if route == "NONE":
                fail(f"{bid}: revision_required cannot route to NONE")
            req(b, "revision_reason")

    if overall == "PASS":
        if revisions or seq_revisions:
            fail("overall PASS cannot contain revision_required unit/sequence reviews")
        if any(r[k] == "FAIL" for r in reviews for k in ["visual_feasibility", "attention_feasibility", "duration_fit", "transition_fit"]):
            fail("overall PASS cannot contain FAIL unit gates")
    if overall == "REVISION_REQUIRED" and (revisions + seq_revisions) == 0:
        fail("REVISION_REQUIRED requires at least one revision_required unit or sequence block")

    print(f"PASS: directing preflight units={len(reviews)} blocks={len(seqs)} overall={overall}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: validate_directing_preflight.py preflight.json")
        sys.exit(2)
    main(sys.argv[1])
