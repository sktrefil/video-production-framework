#!/usr/bin/env python3
import sys, json, pathlib

LOCKED_FIELDS = [
    "fact_lock","story_event","clip_structure_mode","tension_function",
    "shot_size","camera_height","camera_angle","camera_path",
    "camera_speed_profile","entry_state","target_state","exit_state",
    "continuity_mode","primary_action","motion_vector","next_handoff",
    "reference_priority"
]

def main():
    if len(sys.argv) != 2:
        print("usage: validate_locked_fields.py <job.json>")
        return 2

    p = pathlib.Path(sys.argv[1])
    if not p.exists():
        print(f"ERROR: not found: {p}")
        return 2

    d = json.loads(p.read_text(encoding="utf-8"))
    before = d.get("locked_snapshot_before")
    after = d.get("locked_snapshot_after")

    if not isinstance(before, dict) or not isinstance(after, dict):
        print("BLOCKED: locked snapshots missing or invalid")
        return 1

    diffs = []
    missing = []

    for f in LOCKED_FIELDS:
        if f not in before:
            missing.append(f"before.{f}")
        if f not in after:
            missing.append(f"after.{f}")
        if f in before and f in after and before[f] != after[f]:
            diffs.append((f, before[f], after[f]))

    if missing:
        print("BLOCKED: missing locked fields")
        for m in missing:
            print("-", m)
        return 1

    if diffs:
        print("BLOCKED: locked field changes detected")
        for f, a, b in diffs:
            print(f"- {f}: {a!r} -> {b!r}")
        return 1

    print("PASS: locked snapshots are identical")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
