#!/usr/bin/env python3
import json, sys

ALLOWED_STATUS = {
    "DRAFT_READY_FOR_PREFLIGHT", "REVISION_REQUIRED",
    "CANDIDATE_READY_FOR_LOCK_REVIEW", "BLOCKED_RESEARCH"
}
ALLOWED_FUNCTION = {
    "HOOK", "DISCOVERY", "DEEPENING", "REVERSAL", "SYNTHESIS", "RESIDUAL_QUESTION", "BRIDGE"
}
ALLOWED_VISUAL = {
    "OBJECT", "PLACE", "ACTION", "COMPARISON", "CHANGE", "ABSENCE", "DOCUMENTED_DIAGRAM", "BRIDGE_ONLY"
}
ALLOWED_RISK = {"LOW", "MEDIUM", "HIGH"}
ALLOWED_PREFLIGHT = {"NOT_REVIEWED", "PASS", "REVISION_REQUIRED"}
ALLOWED_ATTENTION = {
    "REVEAL", "ACTION", "PARALLAX", "FOCUS_SHIFT", "SPATIAL_DISCOVERY", "QUESTION", "REORIENTATION", "HOLD"
}

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

    req(data, "script_revision")
    req(data, "script_hash")
    req(data, "narrative_spine")
    req(data, "fact_guardrail_ids")
    status = req(data, "status")
    if status not in ALLOWED_STATUS:
        fail(f"invalid status: {status}")

    units = req(data, "units")
    if not isinstance(units, list):
        fail("units must be a list")

    seen = set()
    unresolved = 0
    for unit in units:
        uid = req(unit, "unit_id")
        if uid in seen:
            fail(f"duplicate unit_id: {uid}")
        seen.add(uid)

        if req(unit, "story_function") not in ALLOWED_FUNCTION:
            fail(f"{uid}: invalid story_function")
        req(unit, "evidence_ids")
        req(unit, "tts_text")

        duration = float(req(unit, "estimated_duration_sec"))
        if duration <= 0:
            fail(f"{uid}: estimated_duration_sec must be > 0")

        info_count = int(req(unit, "information_unit_count"))
        event_budget = int(req(unit, "visual_event_budget"))
        if info_count <= 0 or event_budget <= 0:
            fail(f"{uid}: information/event counts must be > 0")
        if info_count > event_budget + 1 and not str(unit.get("compression_justification", "")).strip():
            fail(f"{uid}: information units exceed visual-event budget without justification")

        ve = req(unit, "visualizable_event")
        if not isinstance(ve, dict) or req(ve, "type") not in ALLOWED_VISUAL:
            fail(f"{uid}: invalid visualizable_event")
        req(ve, "description")
        req(unit, "directing_intent")

        attention = req(unit, "attention_event")
        if not isinstance(attention, dict) or req(attention, "type") not in ALLOWED_ATTENTION:
            fail(f"{uid}: invalid attention_event")
        first_time = float(req(attention, "target_time_sec"))
        if first_time < 0:
            fail(f"{uid}: attention target time must be >= 0")
        if first_time > 4.0 and not str(unit.get("attention_timing_exception", "")).strip():
            fail(f"{uid}: first meaningful attention event must target <=4.0s or provide exception")

        secondary = unit.get("secondary_attention_event", {})
        if duration >= 8.0:
            if not isinstance(secondary, dict):
                fail(f"{uid}: secondary_attention_event must be an object")
            required = secondary.get("required")
            if required is True:
                st = secondary.get("target_time_sec")
                if st is None or not (4.0 <= float(st) <= 6.5):
                    fail(f"{uid}: secondary attention target must be 4.0-6.5s")
            elif not str(secondary.get("exception_reason", "")).strip():
                fail(f"{uid}: >=8s unit requires secondary attention event or explicit exception")

        req(unit, "reveal_policy")
        req(unit, "transition_intent")
        if req(unit, "abstraction_risk") not in ALLOWED_RISK:
            fail(f"{uid}: invalid abstraction_risk")

        ps = req(unit, "preflight_status")
        if ps not in ALLOWED_PREFLIGHT:
            fail(f"{uid}: invalid preflight_status")
        if ps == "REVISION_REQUIRED":
            unresolved += 1
            req(unit, "revision_reason")

    if status == "CANDIDATE_READY_FOR_LOCK_REVIEW":
        if unresolved:
            fail("candidate cannot contain unresolved preflight revisions")
        if any(u.get("preflight_status") != "PASS" for u in units):
            fail("candidate requires PASS for every unit preflight_status")
        fq = req(data, "final_quarter_qc")
        if fq.get("theme_spine_recovered") is not True:
            fail("final quarter must recover theme/narrative spine")
        if fq.get("meaning_expansion_present") is not True:
            fail("final quarter must include meaning expansion")
        if fq.get("result_listing_only") is not False:
            fail("final quarter cannot collapse into result listing")

    if data.get("final_tts_generated") is True:
        fail("script-development package cannot mark FINAL TTS as generated")

    print(f"PASS: script development contract units={len(units)} status={status}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: validate_script_development.py package.json")
        sys.exit(2)
    main(sys.argv[1])
