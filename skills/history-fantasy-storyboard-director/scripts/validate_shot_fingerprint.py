#!/usr/bin/env python3
import sys, json, pathlib

FIELDS = [
    "location", "shot_size", "camera_move", "primary_subject",
    "depth_pattern", "visual_motif", "lighting_state", "motion_vector"
]

SOFT_THRESHOLD = 0.75
HARD_THRESHOLD = 0.85

def norm(v):
    return str(v or "").strip().lower()

def sim(a, b):
    compared = 0
    matches = 0
    for f in FIELDS:
        av, bv = norm(a.get(f)), norm(b.get(f))
        if av and bv:
            compared += 1
            matches += int(av == bv)
    return matches / compared if compared else 0.0

def has_override(shot):
    reason = norm(shot.get("repeat_justification"))
    return bool(reason) and reason not in {"none", "n/a", "na", "tbd", "todo"}

def main():
    if len(sys.argv) != 2:
        print("usage: validate_shot_fingerprint.py <fingerprints.json>")
        return 2

    p = pathlib.Path(sys.argv[1])
    if not p.exists():
        print(f"ERROR: not found: {p}")
        return 2

    data = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        print("ERROR: expected JSON array")
        return 2

    hard = []
    soft = []

    for i in range(len(data)):
        for j in range(max(0, i - 3), i):
            s = sim(data[i], data[j])
            if s >= HARD_THRESHOLD:
                if has_override(data[i]):
                    soft.append((i, j, s, f"allowed override: {data[i]['repeat_justification']}"))
                else:
                    hard.append((i, j, s, "high-similarity repetition without justification"))
            elif s >= SOFT_THRESHOLD:
                soft.append((i, j, s, "notable repetition"))

    if hard:
        print("BLOCKED:")
        for i, j, s, msg in hard:
            print(f"- shot {i} resembles shot {j}: similarity={s:.2f} ({msg})")
        if soft:
            print("WARNINGS:")
            for i, j, s, msg in soft:
                print(f"- shot {i} resembles shot {j}: similarity={s:.2f} ({msg})")
        return 1

    if soft:
        print("PASS_WITH_WARNINGS:")
        for i, j, s, msg in soft:
            print(f"- shot {i} resembles shot {j}: similarity={s:.2f} ({msg})")
        return 0

    print("PASS: no problematic shot repetition")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
