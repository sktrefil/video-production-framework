#!/usr/bin/env python3
import sys, json, pathlib

ALLOWED_TENSION = {"BUILD","HOLD","RELEASE","REVEAL","REDIRECT","HANDOFF"}
MAX_PHASES = {7: 3, 12: 5, 15: 5}

def max_phases_for(duration):
    if duration <= 7:
        return 3
    if duration <= 12:
        return 5
    return 5

def main():
    if len(sys.argv) != 2:
        print("usage: validate_attention_gate.py <clip.json>")
        return 2

    p = pathlib.Path(sys.argv[1])
    if not p.exists():
        print(f"ERROR: not found: {p}")
        return 2

    d = json.loads(p.read_text(encoding="utf-8"))
    errors = []
    warnings = []

    try:
        dur = float(d.get("duration", 0))
    except Exception:
        dur = 0
    if dur <= 0:
        errors.append("duration must be > 0")
    if dur > 15:
        warnings.append("duration exceeds recommended <=15s clip limit")

    tension = str(d.get("tension_function","")).strip().upper()
    if tension and tension not in ALLOWED_TENSION:
        errors.append(f"invalid tension_function: {tension}")

    events = d.get("attention_events", [])
    if not isinstance(events, list):
        errors.append("attention_events must be a list")
        events = []

    times = []
    event_types = []
    for e in events:
        if not isinstance(e, dict) or "time" not in e:
            continue
        try:
            times.append(float(e["time"]))
            event_types.append(str(e.get("type","")).strip().lower())
        except Exception:
            errors.append(f"invalid attention event time: {e}")

    times = sorted(times)

    if dur >= 4 and (not times or times[0] > 4.0):
        errors.append("no attention event within first 4s")

    if dur >= 8 and not any(4.0 <= t <= 6.5 for t in times):
        errors.append("8s+ clip lacks a second attention event around 4-6.5s")

    # Repeated same-type attention events can feel mechanically repetitive
    if dur >= 8 and len(event_types) >= 2 and len(set(t for t in event_types if t)) == 1:
        warnings.append("attention events repeat the same type; vary reveal/focus/parallax/action when possible")

    phases = d.get("camera_phases", [])
    if phases is None:
        phases = []
    if not isinstance(phases, list):
        errors.append("camera_phases must be a list")
        phases = []

    max_allowed = max_phases_for(dur if dur > 0 else 0)
    if len(phases) > max_allowed:
        errors.append(f"camera_phases too complex: {len(phases)} > {max_allowed} for {dur:g}s clip")

    # Require phase presence for longer clips
    if dur >= 4 and len(phases) == 0:
        errors.append("camera_phases required for clips >=4s")

    # Primary + secondary move complexity
    primary = str(d.get("primary_camera_move","")).strip()
    secondary = d.get("secondary_camera_moves", [])
    if isinstance(secondary, str):
        secondary = [secondary] if secondary.strip() else []
    if not isinstance(secondary, list):
        errors.append("secondary_camera_moves must be a list or string")
        secondary = []

    if len(secondary) > 1:
        errors.append("camera complexity limit exceeded: max 1 secondary camera adjustment")

    combined = " ".join([primary] + [str(x) for x in secondary]).lower()
    major_moves = sum(word in combined for word in ["pan", "tilt", "dolly", "track", "orbit", "zoom", "crane"])
    if major_moves >= 3:
        errors.append("camera move stack is over-complex; use 1 primary move + at most 1 secondary adjustment")

    if errors:
        print("BLOCKED:")
        for r in errors:
            print("-", r)
        if warnings:
            print("WARNINGS:")
            for w in warnings:
                print("-", w)
        return 1

    if warnings:
        print("PASS_WITH_WARNINGS:")
        for w in warnings:
            print("-", w)
        return 0

    print("PASS: attention and camera complexity gates")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
