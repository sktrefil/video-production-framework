#!/usr/bin/env python3
import sys, re, pathlib

REQUIRED_NONEMPTY = [
    "vb_id",
    "story_event",
    "duration_target",
    "clip_structure_mode",
    "tension_function",
    "camera_intent",
    "camera_path",
    "entry_state",
    "exit_state",
    "continuity_mode",
    "next_handoff",
]

ENUMS = {
    "clip_structure_mode": {"SINGLE_IMAGE", "START_TARGET", "CONTINUATION"},
    "tension_function": {"BUILD", "HOLD", "RELEASE", "REVEAL", "REDIRECT", "HANDOFF"},
    "continuity_mode": {"BIBLE_MATCH", "EXIT_MATCH", "CONTINUATION", "STORY_CUT"},
}

LIST_FIELDS = ["fact_lock", "fantasy_allowed", "invention_prohibited"]

def get_scalar(txt, key):
    m = re.search(rf"(?m)^\s*{re.escape(key)}\s*:\s*(.*?)\s*$", txt)
    return None if not m else m.group(1).strip()

def normalize_scalar(v):
    if v is None:
        return None
    return v.strip().strip('"').strip("'").strip()

def has_meaningful_value(v):
    if v is None:
        return False
    n = normalize_scalar(v)
    return bool(n) and n not in {"[]", "{}", "null", "None", "~"}

def parse_duration_seconds(v):
    if not v:
        return None
    s = normalize_scalar(v).lower()
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds|초)?", s)
    return float(m.group(1)) if m else None

def main():
    if len(sys.argv) != 2:
        print("usage: validate_storyboard_contract.py <markdown-or-yaml-file>")
        return 2

    p = pathlib.Path(sys.argv[1])
    if not p.exists():
        print(f"ERROR: not found: {p}")
        return 2

    txt = p.read_text(encoding="utf-8")
    errors = []
    warnings = []

    # Required + non-empty
    for key in REQUIRED_NONEMPTY:
        raw = get_scalar(txt, key)
        if not has_meaningful_value(raw):
            errors.append(f"{key}: missing or empty")

    # Enums
    for key, allowed in ENUMS.items():
        raw = get_scalar(txt, key)
        if has_meaningful_value(raw):
            v = normalize_scalar(raw)
            if v not in allowed:
                errors.append(f"{key}: invalid value '{v}' (allowed: {', '.join(sorted(allowed))})")

    # Duration
    dur_raw = get_scalar(txt, "duration_target")
    if has_meaningful_value(dur_raw):
        dur = parse_duration_seconds(dur_raw)
        if dur is None or dur <= 0:
            errors.append("duration_target: must contain a positive duration")
        elif dur > 15:
            warnings.append("duration_target: exceeds recommended <=15s clip limit")

    # START_TARGET requires target state
    mode = normalize_scalar(get_scalar(txt, "clip_structure_mode")) if get_scalar(txt, "clip_structure_mode") else None
    if mode == "START_TARGET":
        if not has_meaningful_value(get_scalar(txt, "target_state")):
            errors.append("target_state: required for START_TARGET")
        if not has_meaningful_value(get_scalar(txt, "key_event")):
            errors.append("key_event: required for START_TARGET")

    # CONTINUATION requires continuity handoff / energy
    if mode == "CONTINUATION":
        for key in ("camera_energy_in", "motion_vector_in"):
            if not has_meaningful_value(get_scalar(txt, key)):
                errors.append(f"{key}: required for CONTINUATION")

    # Non-STORY_CUT should have explicit handoff
    continuity_mode = normalize_scalar(get_scalar(txt, "continuity_mode")) if get_scalar(txt, "continuity_mode") else None
    if continuity_mode and continuity_mode != "STORY_CUT":
        if not has_meaningful_value(get_scalar(txt, "next_handoff")):
            errors.append("next_handoff: required for non-STORY_CUT continuity")

    # Camera intent/path should not be generic placeholders
    for key in ("camera_intent", "camera_path"):
        v = normalize_scalar(get_scalar(txt, key) or "")
        if v.lower() in {"tbd", "todo", "none", "n/a", "na", "smooth", "smooth transition"}:
            errors.append(f"{key}: placeholder/generic value is not allowed")

    # Warn if factual boundary sections are absent entirely
    for key in LIST_FIELDS:
        if not re.search(rf"(?m)^\s*{re.escape(key)}\s*:", txt):
            warnings.append(f"{key}: field not found")

    if errors:
        print("BLOCKED:")
        for e in errors:
            print("-", e)
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

    print("PASS: storyboard contract structure and values")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
