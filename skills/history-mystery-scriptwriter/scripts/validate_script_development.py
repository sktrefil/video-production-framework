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
    req(data, "narrative_spine")
    status = req(data, "status")
    if status not in ALLOWED_STATUS:
        fail(f"invalid status: {status}")

    units = req(data, "units")
    if not isinstance(units, list):
        fail("units must be a list")

    seen = set()
    unresolved = 0
    for i, unit in enumerate(units):
        uid = req(unit, "unit_id")
        if uid in seen:
            fail(f"duplicate unit_id: {uid}")
        seen.add(uid)
        if req(unit, "story_function") not in ALLOWED_FUNCTION:
            fail(f"{uid}: invalid story_function")
        req(unit, "evidence_ids")
        req(unit, "tts_text")
        if float(req(unit, "estimated_duration_sec")) <= 0:
            fail(f"{uid}: estimated_duration_sec must be > 0")
        ve = req(unit, "visualizable_event")
        if not isinstance(ve, dict) or req(ve, "type") not in ALLOWED_VISUAL:
            fail(f"{uid}: invalid visualizable_event")
        req(ve, "description")
        req(unit, "directing_intent")
        req(unit, "attention_event")
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

    if status == "CANDIDATE_READY_FOR_LOCK_REVIEW" and unresolved:
        fail("candidate cannot contain unresolved preflight revisions")
    if status == "CANDIDATE_READY_FOR_LOCK_REVIEW" and any(u.get("preflight_status") != "PASS" for u in units):
        fail("candidate requires PASS for every unit preflight_status")

    if data.get("final_tts_generated") is True:
        fail("script-development package cannot mark FINAL TTS as generated")

    print(f"PASS: script development contract units={len(units)} status={status}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: validate_script_development.py package.json")
        sys.exit(2)
    main(sys.argv[1])
