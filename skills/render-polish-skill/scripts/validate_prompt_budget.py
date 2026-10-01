#!/usr/bin/env python3
import sys, json, pathlib

LIMITS = {"LIGHT":0.20, "STANDARD":0.35, "STRONG":0.40}

def main():
    if len(sys.argv) != 2:
        print("usage: validate_prompt_budget.py <job.json>")
        return 2

    p = pathlib.Path(sys.argv[1])
    if not p.exists():
        print(f"ERROR: not found: {p}")
        return 2

    d = json.loads(p.read_text(encoding="utf-8"))
    strength = str(d.get("polish_strength","")).upper()
    if strength not in LIMITS:
        print(f"BLOCKED: invalid polish_strength '{strength}'")
        return 1

    base = d.get("base_prompt_en","")
    final = d.get("final_prompt_en","")
    if not isinstance(base,str) or not base.strip():
        print("BLOCKED: base_prompt_en missing")
        return 1
    if not isinstance(final,str) or not final.strip():
        print("BLOCKED: final_prompt_en missing")
        return 1

    # Prefer explicit delta if present; otherwise approximate added text length.
    pb = d.get("prompt_budget", {}) if isinstance(d.get("prompt_budget",{}), dict) else {}
    explicit_added = pb.get("polish_added_chars")
    base_len = len(base)
    if explicit_added is None:
        added = max(0, len(final)-base_len)
    else:
        try:
            added = int(explicit_added)
        except Exception:
            print("BLOCKED: polish_added_chars must be integer")
            return 1

    ratio = added/base_len if base_len else 999
    limit = LIMITS[strength]

    # severe overflow: > max(limit + .10, .50)
    hard = max(limit + 0.10, 0.50)
    if ratio > hard:
        print(f"BLOCKED: prompt budget severe overflow ratio={ratio:.3f} limit={limit:.2f}")
        return 1
    if ratio > limit:
        print(f"PASS_WITH_WARNINGS: prompt budget ratio={ratio:.3f} exceeds target={limit:.2f}")
        return 0

    dup = pb.get("duplicate_instruction_count",0)
    try:
        dup = int(dup)
    except Exception:
        dup = 0

    if dup > 3:
        print(f"PASS_WITH_WARNINGS: duplicate_instruction_count={dup}")
        return 0

    print(f"PASS: prompt budget ratio={ratio:.3f} target<={limit:.2f}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
