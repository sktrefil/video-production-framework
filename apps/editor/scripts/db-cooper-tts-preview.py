#!/usr/bin/env python3
"""Create noncanonical, scene-segmented ElevenLabs TTS for D.B. Cooper timing review."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


EDITOR = Path(__file__).resolve().parents[1]
REPO = EDITOR.parents[1]
SOURCE = EDITOR / "output/db-cooper-v3/inputs"
DEFAULT_OUTPUT = EDITOR / "output/db-cooper-v3/tts-preview-v1"
RUNTIME = REPO / "runtimes/elevenlabs/runtime.py"
PROFILE = REPO / "resources/provider-profiles/ELEVENLABS_V3_HISTORY_V1/1.0.0.json"
MANIFEST_NAME = "DB_Cooper_v3_Codex_Shot_Manifest.json"
TTS_NAME = "DB_Cooper_4min30_script_v3_TTS.txt"
SPEED = 1.1


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def compact(value: str) -> str:
    return "".join(value.split())


def write_once(path: Path, value: object) -> None:
    data = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != data:
            raise RuntimeError(f"Existing preview file differs; use a new output revision: {path}")
        return
    path.write_bytes(data)


def read_sources() -> tuple[dict, str, str, str]:
    manifest_bytes = (SOURCE / MANIFEST_NAME).read_bytes()
    tts_bytes = (SOURCE / TTS_NAME).read_bytes()
    manifest = json.loads(manifest_bytes.decode("utf-8"))
    tts = tts_bytes.decode("utf-8")
    if manifest.get("status") != "PRODUCTION_SPEC_CANDIDATE_NOT_QC_APPROVED":
        raise RuntimeError("This preview expects the unapproved v3 manifest; review changed source state.")
    if manifest.get("tts_timing_verified") is not False:
        raise RuntimeError("This preview expects unverified TTS timing; review changed source state.")
    if compact("".join(shot["tts"] for shot in manifest["shots"])) != compact(tts):
        raise RuntimeError("Shot narration differs from the supplied TTS text.")
    return manifest, tts, digest(manifest_bytes), digest(tts_bytes)


def build_preview(output: Path) -> dict:
    manifest, _, manifest_hash, tts_hash = read_sources()
    profile_hash = "sha256:" + digest(PROFILE.read_bytes())
    scenes = []
    for scene in manifest["scenes"]:
        scene_id = scene["id"]
        shots = [shot for shot in manifest["shots"] if shot["scene"] == scene_id]
        if not shots:
            raise RuntimeError(f"Scene has no shots: {scene_id}")
        parts = []
        segments = []
        cursor = 0
        for shot in shots:
            if parts:
                parts.append(" ")
                cursor += 1
            value = shot["tts"]
            parts.append(value)
            segments.append({"shot_id": shot["id"], "start_character": cursor,
                             "end_character": cursor + len(value),
                             "planned_keep_seconds": shot["keep_seconds"]})
            cursor += len(value)
        text = "".join(parts)
        if compact(text) != compact(scene["tts_full"]):
            raise RuntimeError(f"Scene and shot narration differ: {scene_id}")
        if len(text) > 4000:
            raise RuntimeError(f"Scene exceeds provider preview limit: {scene_id}")
        text_hash = digest(text.encode("utf-8"))
        section_id = f"preview-{scene_id}"
        audio_rel = f"03_tts/sections/{scene_id}_raw.mp3"
        alignment_rel = f"03_tts/alignment/{scene_id}.json"
        job = {
            "schemaVersion": 1, "jobId": f"tts-preview-{scene_id}-{text_hash[:12]}",
            "jobRevision": 1, "projectId": manifest["project_id"] + "_preview",
            "provider": "ELEVENLABS", "providerProfileVersion": "1.0.0",
            "jobType": "TTS_GENERATION", "executionMode": "AUTOMATED",
            "attempt": 1, "inputHash": text_hash,
            "secretRequirements": [{"envName": "ELEVENLABS_API_KEY", "required": True}],
            "input": {"schemaVersion": 1,
                      "providerProfile": {"resourceId": "ELEVENLABS_V3_HISTORY_V1",
                                          "version": "1.0.0", "contentHash": profile_hash},
                      "plan": {"id": f"preview-plan-{scene_id}-{text_hash[:12]}", "revision": 1,
                               "sourceScript": {"id": TTS_NAME, "revision": 3, "sha256": tts_hash},
                               "contentFormat": "LONGFORM",
                               "endpoint": "/v1/text-to-speech/{voice_id}/with-timestamps",
                               "modelId": "eleven_v3", "outputFormat": "mp3_44100_128",
                               "voiceIdResolution": "VOICE_PRESET_THEN_ENV",
                               "voiceIdFallbackEnv": "ELEVENLABS_VOICE_ID",
                               "voicePreset": "HISTORY_MYSTERY_LONGFORM",
                               "configuredVoiceSettings": {"stability": 0.62, "similarityBoost": 0.8,
                                                           "style": 0.04, "speed": 1,
                                                           "useSpeakerBoost": True},
                               "effectiveVoiceSettings": {"stability": 0.62, "style": 0.04},
                               "droppedVoiceSettings": ["similarity_boost", "speed", "use_speaker_boost"],
                               "preserveProviderCadence": True,
                               "narrationMode": "SEGMENTED",
                               "chunks": [{"index": 1, "text": text, "textCharacterCount": len(text),
                                           "outputRelativePath": audio_rel, "sectionId": section_id,
                                           "sectionIndex": 1}],
                               "sections": [{"id": section_id, "index": 1,
                                             "sequenceId": f"preview-{scene_id}",
                                             "sceneIds": [scene_id], "text": text,
                                             "textCharacterCount": len(text),
                                             "audioRelativePath": audio_rel,
                                             "characterAlignmentRelativePath": alignment_rel}],
                               "outputPaths": {"narrationManifest": f"03_tts/manifests/{scene_id}.json",
                                               "metadata": f"03_tts/metadata/{scene_id}.json",
                                               "resolvedVoiceProfile": f"03_tts/voice/{scene_id}.json"}}}}
        write_once(output / "jobs" / f"{scene_id}.json", job)
        scenes.append({"id": scene_id, "text_sha256": text_hash, "text": text,
                       "planned_seconds": scene["duration"], "shots": segments,
                       "job": f"jobs/{scene_id}.json",
                       "result": f"results/{scene_id}.json",
                       "audio": audio_rel, "alignment": alignment_rel,
                       "playback_1p1": f"playback/{scene_id}_1p1.mp3"})
    plan = {"schema": "db-cooper-tts-preview.v1", "status": "PREVIEW_ONLY_NOT_FINAL_TTS",
            "project_id": manifest["project_id"], "source_manifest_sha256": manifest_hash,
            "source_tts_sha256": tts_hash, "provider_profile_sha256": profile_hash,
            "playback_speed": SPEED, "scenes": scenes,
            "canonical_approval": False, "project_db_mutated": False}
    write_once(output / "preview-plan.json", plan)
    return plan


def verify_plan(output: Path) -> dict:
    path = output / "preview-plan.json"
    if not path.is_file():
        raise RuntimeError("Preview plan missing. Run 'prepare' first.")
    plan = json.loads(path.read_text(encoding="utf-8"))
    _, _, manifest_hash, tts_hash = read_sources()
    if plan["source_manifest_sha256"] != manifest_hash or plan["source_tts_sha256"] != tts_hash:
        raise RuntimeError("Source text changed. Create a new preview output revision.")
    if plan["provider_profile_sha256"] != "sha256:" + digest(PROFILE.read_bytes()):
        raise RuntimeError("Provider profile changed. Create a new preview output revision.")
    return plan


def configured_names() -> set[str]:
    names = {key for key, value in os.environ.items() if value.strip()}
    for path in (EDITOR / ".env", REPO / ".env"):
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if value.strip().strip("\"'"):
                names.add(key.removeprefix("export ").strip())
        break
    return names


def selected_scenes(plan: dict, scene_id: str | None) -> list[dict]:
    if scene_id is None:
        return plan["scenes"]
    chosen = [scene for scene in plan["scenes"] if scene["id"] == scene_id]
    if not chosen:
        raise RuntimeError(f"Unknown scene: {scene_id}")
    return chosen


def generate(output: Path, plan: dict, scene_id: str | None) -> None:
    names = configured_names()
    if "ELEVENLABS_API_KEY" not in names:
        raise RuntimeError("ELEVENLABS_API_KEY is not configured in environment or repository .env.")
    if not ({"ELEVENLABS_VOICE_ID_HISTORY_MYSTERY_LONGFORM", "ELEVENLABS_VOICE_ID"} & names):
        raise RuntimeError("ElevenLabs LONGFORM voice ID is not configured in environment or repository .env.")
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required to make 1.1x listening copies.")

    def ensure_playback(scene: dict) -> None:
        playback = output / scene["playback_1p1"]
        if playback.is_file():
            return
        playback.parent.mkdir(parents=True, exist_ok=True)
        cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-n", "-i",
               str(output / scene["audio"]), "-filter:a", f"atempo={SPEED}", str(playback)]
        sped = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if sped.returncode or not playback.is_file():
            raise RuntimeError(f"{scene['id']} generated, but 1.1x listening copy failed: {sped.stderr[-500:]}")

    for scene in selected_scenes(plan, scene_id):
        sid = scene["id"]
        result_path = output / scene["result"]
        if result_path.exists():
            result = json.loads(result_path.read_text(encoding="utf-8"))
            if result.get("status") == "COMPLETE" and (output / scene["audio"]).is_file():
                ensure_playback(scene)
                print(f"SKIP {sid}: existing completed preview")
                continue
            raise RuntimeError(f"Existing failed/incomplete result for {sid}; use a new output revision.")
        if (output / scene["audio"]).exists() or (output / scene["alignment"]).exists():
            raise RuntimeError(f"Partial preview assets for {sid}; review them before a new revision.")
        env = os.environ.copy()
        env["VPF_PROJECT_ROOT"] = str(output)
        process = subprocess.run([sys.executable, str(RUNTIME), "--job", str(output / scene["job"])],
                                 cwd=EDITOR, env=env, capture_output=True, text=True,
                                 encoding="utf-8", errors="replace")
        if process.returncode:
            raise RuntimeError(f"Runtime could not start for {sid}: {process.stderr[-500:]}")
        try:
            result = json.loads(process.stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Runtime returned invalid JSON for {sid}: {process.stdout[-500:]}") from exc
        write_once(result_path, result)
        if result.get("status") != "COMPLETE":
            error = result.get("error", {})
            raise RuntimeError(f"{sid} failed ({error.get('code')}): {error.get('detail')}")
        ensure_playback(scene)
        print(f"CREATED {sid}: {scene['audio']} and {scene['playback_1p1']}")


def timing_report(output: Path, plan: dict) -> None:
    items = []
    for scene in plan["scenes"]:
        result_path = output / scene["result"]
        if not result_path.is_file():
            continue
        result = json.loads(result_path.read_text(encoding="utf-8"))
        if result.get("status") != "COMPLETE":
            continue
        alignment = json.loads((output / scene["alignment"]).read_text(encoding="utf-8"))
        starts = alignment["character_start_times_seconds"]
        ends = alignment["character_end_times_seconds"]
        if "".join(alignment["characters"]) != scene["text"] or len(starts) != len(scene["text"]):
            raise RuntimeError(f"Alignment/text mismatch: {scene['id']}")
        shot_rows = []
        for index, shot in enumerate(scene["shots"]):
            start = shot["start_character"]
            next_start = (scene["shots"][index + 1]["start_character"]
                          if index + 1 < len(scene["shots"]) else None)
            raw_start = float(starts[start])
            raw_end = float(starts[next_start]) if next_start is not None else float(max(ends))
            estimate = round((raw_end - raw_start) / SPEED, 3)
            shot_rows.append({"shot_id": shot["shot_id"], "planned_seconds": shot["planned_keep_seconds"],
                              "preview_seconds_at_1p1": estimate,
                              "margin_seconds": round(shot["planned_keep_seconds"] - estimate, 3)})
        raw_scene = round(float(max(ends)), 3)
        items.append({"scene_id": scene["id"], "planned_seconds": scene["planned_seconds"],
                      "raw_preview_seconds": raw_scene,
                      "preview_seconds_at_1p1": round(raw_scene / SPEED, 3),
                      "shots": shot_rows,
                      "audio_sha256": digest((output / scene["audio"]).read_bytes()),
                      "alignment_sha256": digest((output / scene["alignment"]).read_bytes())})
    report = {"schema": "db-cooper-tts-preview-timing.v1", "status": "PREVIEW_TIMING_NOT_FINAL",
              "playback_speed": SPEED, "completed_scene_count": len(items),
              "planned_total_seconds": sum(s["planned_seconds"] for s in plan["scenes"]),
              "preview_total_seconds_at_1p1": round(sum(s["preview_seconds_at_1p1"] for s in items), 3),
              "scenes": items, "canonical_approval": False}
    path = output / "timing-report.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"REPORT {path} ({len(items)}/{len(plan['scenes'])} scenes)")
    for scene in items:
        print(f"{scene['scene_id']}: {scene['preview_seconds_at_1p1']}s preview / {scene['planned_seconds']}s planned")
        for shot in scene["shots"]:
            print(f"  {shot['shot_id']}: {shot['preview_seconds_at_1p1']}s preview / {shot['planned_seconds']}s planned")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["prepare", "check", "generate", "report"])
    parser.add_argument("--scene", help="Generate only one scene, e.g. SC06")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    output = args.output_dir.resolve()
    try:
        if args.mode == "prepare":
            plan = build_preview(output)
            print(f"PREPARED {len(plan['scenes'])} scene preview jobs in {output}")
        else:
            plan = verify_plan(output)
            if args.mode == "check":
                names = configured_names()
                print(f"PLAN OK: {len(plan['scenes'])} scenes; no FINAL TTS or project.db writes")
                print("ElevenLabs API key: " + ("configured" if "ELEVENLABS_API_KEY" in names else "missing"))
                print("LONGFORM voice: " + ("configured" if {"ELEVENLABS_VOICE_ID_HISTORY_MYSTERY_LONGFORM", "ELEVENLABS_VOICE_ID"} & names else "missing"))
                print("ffmpeg: " + ("available" if shutil.which("ffmpeg") else "missing"))
            elif args.mode == "generate":
                generate(output, plan, args.scene)
                timing_report(output, plan)
            else:
                timing_report(output, plan)
        return 0
    except (OSError, KeyError, ValueError, RuntimeError) as exc:
        print(f"TTS PREVIEW ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
