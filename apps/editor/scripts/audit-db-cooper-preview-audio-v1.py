"""Verify whether existing D.B. Cooper preview sections can be reused as FINAL TTS."""

import array
import hashlib
import json
import math
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "output/db-cooper-v3"
PREVIEW = BASE / "tts-preview-v1"
REVIEW = BASE / "review"


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compact(text):
    return "".join(text.split())


def probe(path):
    command = ["ffprobe", "-v", "error", "-show_entries",
               "format=duration:stream=codec_name,sample_rate,channels", "-of", "json", str(path)]
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def signal_metrics(path):
    command = ["ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", "16000", "pipe:1"]
    data = subprocess.run(command, check=True, capture_output=True).stdout
    samples = array.array("h")
    samples.frombytes(data)
    if not samples:
        raise RuntimeError(f"No decoded samples: {path}")
    peak = max(abs(value) for value in samples)
    rms = math.sqrt(sum(value * value for value in samples) / len(samples))
    clipped = sum(abs(value) >= 32760 for value in samples)
    return {"peak_dbfs": round(20 * math.log10(max(peak, 1) / 32768), 2),
            "rms_dbfs": round(20 * math.log10(max(rms, 1) / 32768), 2),
            "clipped_sample_fraction": round(clipped / len(samples), 6)}


plan = load(PREVIEW / "preview-plan.json")
approved = load(REVIEW / "story-gate-plan-v1.json")["scenes"]["scenes"]
timing = load(PREVIEW / "timing-report.json")
if len(plan["scenes"]) != len(approved) != 7:
    raise RuntimeError("Seven-section comparison required")
if len(plan["scenes"]) != 7 or len(approved) != 7:
    raise RuntimeError("Seven-section comparison required")

rows = []
voice_profiles = []
for section, scene, measured in zip(plan["scenes"], approved, timing["scenes"]):
    scene_id = section["id"]
    checks = {}

    def check(name, condition):
        checks[name] = bool(condition)

    audio = PREVIEW / section["audio"]
    playback = PREVIEW / section["playback_1p1"]
    alignment_path = PREVIEW / section["alignment"]
    result = load(PREVIEW / section["result"])
    job = load(PREVIEW / section["job"])
    alignment = load(alignment_path)
    voice = load(PREVIEW / "03_tts" / "voice" / f"{scene_id}.json")
    voice_profiles.append({key: value for key, value in voice.items() if key != "voiceId"})
    audio_meta = probe(audio)
    playback_meta = probe(playback)
    outputs = {item["role"]: item for item in result["outputs"]}
    a = outputs["narration_section_001"]
    t = outputs["character_alignment_section_001"]
    raw_duration = float(audio_meta["format"]["duration"])
    playback_duration = float(playback_meta["format"]["duration"])
    starts = alignment["character_start_times_seconds"]
    ends = alignment["character_end_times_seconds"]
    chars = alignment["characters"]
    check("approved_narration_text", compact(section["text"]) == compact(scene["scriptSegment"]))
    check("source_text_hash", hashlib.sha256(section["text"].encode()).hexdigest() == section["text_sha256"])
    check("provider_complete", result["status"] == "COMPLETE" and len(result["providerRequestIds"]) == 1)
    check("same_scene_order", scene_id == scene["key"] == measured["scene_id"])
    check("audio_hash", sha(audio) == a["sha256"] == measured["audio_sha256"])
    check("alignment_hash", sha(alignment_path) == t["sha256"] == measured["alignment_sha256"])
    check("alignment_text", "".join(chars) == section["text"])
    check("alignment_timing", len(chars) == len(starts) == len(ends) and starts[0] >= 0 and
          all(0 <= start <= end <= raw_duration + 0.1 for start, end in zip(starts, ends)) and
          all(starts[i] >= starts[i - 1] for i in range(1, len(starts))))
    check("audio_format", audio_meta["streams"][0]["codec_name"] == "mp3" and
          audio_meta["streams"][0]["sample_rate"] == "44100")
    check("duration_matches_provider", abs(raw_duration * 1000 - a["durationMs"]) <= 80)
    check("playback_speed_1p1", abs(playback_duration - raw_duration / 1.1) <= 0.15)
    check("fits_scene", playback_duration < section["planned_seconds"])
    check("voice_preset", job["input"]["plan"]["voicePreset"] == "HISTORY_MYSTERY_LONGFORM" and
          voice["voicePreset"] == "HISTORY_MYSTERY_LONGFORM" and voice["modelId"] == "eleven_v3")
    signal = signal_metrics(playback)
    check("audio_signal", signal["rms_dbfs"] > -40 and signal["peak_dbfs"] < 0 and
          signal["clipped_sample_fraction"] < 0.0001)
    rows.append({"scene_id": scene_id, "decision": "REUSE" if all(checks.values()) else "REGENERATE",
                 "failed_checks": [name for name, passed in checks.items() if not passed],
                 "checks": checks, "source_audio_sha256": sha(audio),
                 "playback_audio_sha256": sha(playback),
                 "raw_duration_seconds": round(raw_duration, 3),
                 "playback_duration_seconds": round(playback_duration, 3),
                 "planned_scene_seconds": section["planned_seconds"],
                 "provider_request_ids": result["providerRequestIds"],
                 "signal": signal})

voice_consistent = all(profile == voice_profiles[0] for profile in voice_profiles)
if not voice_consistent:
    for row in rows:
        row["decision"] = "REGENERATE"
        row["failed_checks"].append("voice_profile_consistency")

report = {
    "schema": "db-cooper-existing-audio-reuse-qc.v1",
    "scope": "technical_provenance_text_alignment_codec_duration_signal",
    "human_listening_qc": "NOT_PERFORMED",
    "source_plan_status": plan["status"],
    "approved_final_script_sha256": load(REVIEW / "manager-story-gate-v1.json")["canonical_script"]["sha256"],
    "voice_profile_consistent": voice_consistent,
    "reuse_count": sum(row["decision"] == "REUSE" for row in rows),
    "regenerate_scene_ids": [row["scene_id"] for row in rows if row["decision"] == "REGENERATE"],
    "scenes": rows,
}
out = REVIEW / "existing-audio-reuse-qc-v1.json"
out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"REUSE {report['reuse_count']}/7; REGENERATE {report['regenerate_scene_ids']}")
for row in rows:
    print(row["scene_id"], row["decision"], row["failed_checks"], row["signal"])
