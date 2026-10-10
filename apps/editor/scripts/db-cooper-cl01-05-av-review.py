#!/usr/bin/env python3
"""Render a noncanonical D.B. Cooper picture/FINAL TTS timing review.

The source clips and segmented FINAL TTS are read only. Generated clip audio is
muted so narration timing can be checked without unapproved sound design.
"""

import hashlib
import json
import argparse
import subprocess
import wave
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "output" / "db-cooper-v3"
CHAIN = PROJECT / "storyboard-lock-v1"
TTS = PROJECT / "canonical-workspace" / "projects" / "db_cooper_1971_4m30_v3" / "03_tts"
SAMPLE_RATE = 48000


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(result.stderr.decode("utf-8", "replace")[-5000:])
    return result.stdout


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--through", default="CL05", help="last consecutive clip to include, e.g. CL06")
    parser.add_argument("--cl05-retime", action="store_true", help="preview a 1.25x approach and 0.8x reveal on CL05")
    parser.add_argument("--cl01-voice-delay", type=float, default=0.0, help="delay CL01 voice placement without altering FINAL TTS")
    args = parser.parse_args()
    if not 0 <= args.cl01_voice_delay <= 2:
        raise RuntimeError("CL01 voice delay must be between 0 and 2 seconds")
    if not args.through.startswith("CL") or not args.through[2:].isdigit():
        raise RuntimeError("--through must be a clip ID such as CL05")
    shot_count = int(args.through[2:])
    if not 1 <= shot_count <= 30:
        raise RuntimeError("--through must be CL01 through CL30")
    if args.cl05_retime and shot_count < 5:
        raise RuntimeError("CL05 retime needs --through CL05 or later")
    out = PROJECT / "review" / f"cl01-{args.through[2:].lower()}-av-review-v1"
    plan_path = CHAIN / "chain-plan.json"
    manifest_path = TTS / "narration_manifest.json"
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if sha256(manifest_path) != plan["final_tts_manifest_sha256"]:
        raise RuntimeError("FINAL TTS manifest differs from the shot plan")
    sections = {section["sceneId"]: section for section in manifest["sections"]}
    shots = plan["shots"][:shot_count]
    if [shot["id"] for shot in shots] != [f"CL{i:02d}" for i in range(1, shot_count + 1)]:
        raise RuntimeError("Unexpected shot order")
    total_seconds = shots[-1]["timeline_end"]
    out.mkdir(parents=True, exist_ok=True)
    pcm = bytearray(round(total_seconds * SAMPLE_RATE) * 2)
    placements = []
    ffmpeg_inputs = []
    filters = []

    for index, shot in enumerate(shots):
        clip = CHAIN / shot["video_asset"]
        adopted_clip = clip
        if shot["id"] == "CL05" and args.cl05_retime:
            clip = out / "CL05_retime_candidate.mp4"
            run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(adopted_clip),
                "-filter_complex",
                "[0:v]trim=start=0:end=5,setpts=(PTS-STARTPTS)/1.25,fps=30[a];"
                "[0:v]trim=start=5:end=9,setpts=(PTS-STARTPTS)*1.25,fps=30[b];"
                "[a][b]concat=n=2:v=1:a=0[v]",
                "-map", "[v]", "-an", "-t", "9", "-c:v", "libx264", "-preset", "veryfast",
                "-crf", "20", "-pix_fmt", "yuv420p", str(clip),
            ])
        section = sections[shot["scene"]]
        audio = TTS.parent / section["audioRelativePath"]
        if sha256(audio) != section["audioSha256"]:
            raise RuntimeError(f"FINAL TTS audio hash differs: {shot['scene']}")
        source = shot["final_tts_scene_audio_window"]
        slot = shot["voice_slot_timeline"]
        if not clip.is_file():
            raise RuntimeError(f"Missing adopted video: {clip}")
        segment = run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(audio),
            "-af", f"atrim=start={source['scene_audio_start_seconds']:.6f}:end={source['scene_audio_end_seconds']:.6f},asetpts=PTS-STARTPTS,aresample={SAMPLE_RATE}",
            "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "s16le", "pipe:1",
        ])
        voice_start = slot["start"] + (args.cl01_voice_delay if shot["id"] == "CL01" else 0)
        destination = round(voice_start * SAMPLE_RATE) * 2
        shot_end = round(shot["timeline_end"] * SAMPLE_RATE) * 2
        if destination + len(segment) > shot_end:
            raise RuntimeError(f"FINAL voice exceeds used shot: {shot['id']}")
        pcm[destination:destination + len(segment)] = segment
        placements.append({
            "shot": shot["id"], "timeline_start": shot["timeline_start"],
            "keep_seconds": shot["keep_seconds"], "clip_sha256": sha256(clip),
            "adopted_clip_sha256": sha256(adopted_clip),
            "final_tts_scene": shot["scene"], "final_tts_sha256": section["audioSha256"],
            "voice_start": voice_start,
            "voice_end_actual": round(voice_start + len(segment) / (SAMPLE_RATE * 2), 3),
            "voice_end_planned": slot["end"],
        })
        ffmpeg_inputs += ["-i", str(clip)]
        filters.append(
            f"[{index}:v]trim=duration={shot['keep_seconds']},setpts=PTS-STARTPTS,"
            f"fps=30,scale=1280:720:flags=lanczos,format=yuv420p[v{index}]"
        )

    suffix_parts = []
    if args.cl01_voice_delay:
        suffix_parts.append(f"cl01delay{str(args.cl01_voice_delay).replace('.', 'p')}")
    if args.cl05_retime:
        suffix_parts.append("cl05retime")
    suffix = "_" + "_".join(suffix_parts) if suffix_parts else ""
    wav_path = out / f"cl01-{args.through[2:].lower()}-final-tts-only{suffix}.wav"
    with wave.open(str(wav_path), "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(SAMPLE_RATE)
        stream.writeframes(pcm)
    filters.append("".join(f"[v{index}]" for index in range(shot_count)) + f"concat=n={shot_count}:v=1:a=0[vout]")
    video_path = out / f"CL01-{args.through[2:]}_FINAL-TTS{suffix}_review.mp4"
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *ffmpeg_inputs,
        "-i", str(wav_path), "-filter_complex", ";".join(filters),
        "-map", "[vout]", "-map", f"{shot_count}:a:0", "-t", str(total_seconds),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(video_path),
    ])
    report = {
        "status": "NONCANONICAL_AV_TIMING_REVIEW_NOT_APPROVED",
        "cl05_retime_candidate": args.cl05_retime,
        "cl01_voice_delay_seconds": args.cl01_voice_delay,
        "duration_seconds": total_seconds, "frame_rate": 30,
        "video": str(video_path), "video_sha256": sha256(video_path),
        "tts_timeline_sha256": sha256(wav_path),
        "plan_sha256": sha256(plan_path), "final_tts_manifest_sha256": sha256(manifest_path),
        "placements": placements,
        "limitations": [
            "Generated clip audio is muted; only FINAL segmented TTS is heard.",
            "Video source is 24 fps and was sampled to 30 fps for this review.",
            "No sound effects or music are included; no production gate is advanced.",
        ],
    }
    report_name = f"render-report{suffix}.json"
    (out / report_name).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(video_path)
    for placement in placements:
        print(f"{placement['shot']}: {placement['voice_start']:.3f}-{placement['voice_end_actual']:.3f}s")


if __name__ == "__main__":
    main()
