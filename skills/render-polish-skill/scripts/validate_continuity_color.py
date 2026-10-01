#!/usr/bin/env python3
import sys, json, pathlib

EXPECTED = {
    "EXIT_MATCH":"STRICT",
    "CONTINUATION":"STRICT",
    "BIBLE_MATCH":"MODERATE",
    "STORY_CUT":"FREE",
}

ALLOWED_EXPOSURE = {"LOW","MEDIUM"}
ALLOWED_CONTRAST = {"LOW","MEDIUM"}
ALLOWED_DIRECTION = {"PROHIBITED","LIMITED"}
ALLOWED_TEMP = {"MINIMAL","LIMITED"}

def main():
    if len(sys.argv) != 2:
        print("usage: validate_continuity_color.py <job.json>")
        return 2

    d = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    before = d.get("locked_snapshot_before",{})
    c_mode = str(before.get("continuity_mode","")).upper()

    color = d.get("color_discipline",{})
    if not isinstance(color,dict):
        print("BLOCKED: color_discipline missing")
        return 1

    mode = str(color.get("continuity_mode","")).upper()
    expected = EXPECTED.get(c_mode)
    if expected and mode != expected:
        print(f"BLOCKED: color continuity mode {mode!r} incompatible with {c_mode}; expected {expected}")
        return 1

    lighting = d.get("lighting_polish",{})
    delta = lighting.get("delta_limit",{}) if isinstance(lighting,dict) else {}
    direction = str(delta.get("direction_change","")).upper()

    if c_mode in {"EXIT_MATCH","CONTINUATION"} and direction != "PROHIBITED":
        print("BLOCKED: strict continuity forbids lighting direction change")
        return 1

    if delta:
        exp = str(delta.get("exposure_change","")).upper()
        con = str(delta.get("contrast_change","")).upper()
        temp = str(delta.get("color_temperature_shift","")).upper()
        if exp and exp not in ALLOWED_EXPOSURE:
            print("BLOCKED: invalid exposure_change")
            return 1
        if con and con not in ALLOWED_CONTRAST:
            print("BLOCKED: invalid contrast_change")
            return 1
        if direction and direction not in ALLOWED_DIRECTION:
            print("BLOCKED: invalid direction_change")
            return 1
        if temp and temp not in ALLOWED_TEMP:
            print("BLOCKED: invalid color_temperature_shift")
            return 1

    print("PASS: continuity-safe color and lighting")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
