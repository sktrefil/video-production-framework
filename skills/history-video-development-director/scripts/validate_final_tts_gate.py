#!/usr/bin/env python3
import json, sys

def fail(msg):
    print(f"BLOCKED_STALE_PROVENANCE: {msg}")
    sys.exit(1)

def req(obj, key):
    if key not in obj or obj[key] in (None, "", []):
        fail(f"missing/non-empty required field: {key}")
    return obj[key]

def same(label, *values):
    if len(set(values)) != 1:
        fail(f"{label} mismatch: {values}")

def main(path):
    with open(path, encoding="utf-8") as f:
        d = json.load(f)

    req(d, "gate_id")
    req(d, "script_directing_lock_id")
    lock = req(d, "lock")
    script = req(d, "current_script")
    pre = req(d, "current_preflight")
    vis = req(d, "current_visual_skeleton")
    mgr = req(d, "manager_story_gate")

    for obj, keys in [
        (lock, ["script_revision","script_hash","preflight_revision","preflight_script_revision","preflight_input_script_hash",
                "visual_skeleton_revision","visual_skeleton_hash","visual_skeleton_script_revision",
                "visual_skeleton_input_script_hash","locked_unit_ids","fact_guardrail_ids"]),
        (script, ["revision","hash","unit_ids","fact_guardrail_ids"]),
        (pre, ["revision","input_script_revision","input_script_hash","status"]),
        (vis, ["revision","hash","input_script_revision","input_script_hash","status"]),
        (mgr, ["status","approved_script_revision","approved_script_hash","approved_scene_graph_revision","approved_scene_graph_hash"])
    ]:
        for key in keys:
            req(obj, key)

    same("script revision",
         lock["script_revision"], lock["preflight_script_revision"], lock["visual_skeleton_script_revision"],
         script["revision"], pre["input_script_revision"], vis["input_script_revision"], mgr["approved_script_revision"])
    same("script hash",
         lock["script_hash"], lock["preflight_input_script_hash"], lock["visual_skeleton_input_script_hash"],
         script["hash"], pre["input_script_hash"], vis["input_script_hash"], mgr["approved_script_hash"])
    same("preflight revision", lock["preflight_revision"], pre["revision"])
    same("visual skeleton revision", lock["visual_skeleton_revision"], vis["revision"])
    same("visual skeleton hash", lock["visual_skeleton_hash"], vis["hash"])

    if lock["locked_unit_ids"] != script["unit_ids"]:
        fail("current unit order/set differs from locked unit ids")
    if sorted(lock["fact_guardrail_ids"]) != sorted(script["fact_guardrail_ids"]):
        fail("current fact guardrails differ from lock")

    if pre["status"] != "PASS":
        fail("current preflight status must be PASS")
    if vis["status"] != "PASS":
        fail("current visual skeleton status must be PASS")
    if mgr["status"] != "PASS":
        fail("Agent1 manager Story Gate must be PASS")
    if d.get("final_tts_generated") is not False:
        fail("FINAL TTS already exists or state is unknown")

    print(f"PASS: FINAL_TTS_GATE {d['gate_id']} lock={d['script_directing_lock_id']}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: validate_final_tts_gate.py gate.json")
        sys.exit(2)
    main(sys.argv[1])
