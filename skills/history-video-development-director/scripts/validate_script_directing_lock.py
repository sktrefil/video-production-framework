#!/usr/bin/env python3
import json, sys

PASS_FIELDS = [
    "script_qc_status", "directing_preflight_status", "visual_skeleton_status",
    "sequence_qc_status", "fact_status"
]


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

    for key in [
        "lock_id", "project_id", "script_revision", "script_hash",
        "preflight_revision", "visual_skeleton_revision", "narrative_spine",
        "locked_unit_ids", "fact_guardrail_ids"
    ]:
        req(data, key)

    for key in PASS_FIELDS:
        if req(data, key) != "PASS":
            fail(f"{key} must be PASS")

    if int(data.get("unresolved_revision_count", -1)) != 0:
        fail("unresolved_revision_count must be 0")
    if data.get("final_tts_generated") is not False:
        fail("FINAL TTS must not exist before development lock")
    if data.get("development_tts_permission") != "GRANTED":
        fail("development_tts_permission must be GRANTED")
    if data.get("canonical_manager_story_gate") not in {"PENDING", "PASS"}:
        fail("canonical_manager_story_gate must be PENDING or PASS")

    print(f"PASS: script-directing lock {data['lock_id']}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: validate_script_directing_lock.py lock.json")
        sys.exit(2)
    main(sys.argv[1])
