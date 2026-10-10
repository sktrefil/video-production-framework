#!/usr/bin/env python3
"""Build a noncanonical 270-second timing preview from aligned Scene TTS.

The screen is an editorial cue card, not a generated scene or final visual QC.
No project.db or FINAL TTS state is changed.
"""

import argparse
import hashlib
import json
import subprocess
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "output" / "db-cooper-v3"
SOURCE = PROJECT / "tts-preview-v1"
SAMPLE_RATE = 48000
FRAME_RATE = 24
SIZE = (1920, 1080)
FONT_FILE = Path("C:/Windows/Fonts/malgun.ttf")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(command):
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(result.stderr.decode("utf-8", "replace")[-4000:])
    return result.stdout


def font(size):
    return ImageFont.truetype(str(FONT_FILE), size)


def wrapped(draw, text, x, y, width, text_font, color, leading=15, limit=4):
    lines = []
    current = ""
    for word in str(text).split(" "):
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=text_font) <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    for line in lines[:limit]:
        draw.text((x, y), line, font=text_font, fill=color)
        y += text_font.size + leading
    return y


def cue_card(shot, phase, index, path):
    image = Image.new("RGB", SIZE, "#07131d")
    draw = ImageDraw.Draw(image)
    accent = "#c39650"
    white = "#f2eee4"
    muted = "#a9b7c0"
    draw.rectangle((0, 0, 26, SIZE[1]), fill=accent)
    draw.text((100, 70), "D.B. COOPER  |  270s TIMING PREVIEW", font=font(40), fill=accent)
    draw.text((100, 145), f"{shot['scene_id']}  /  {shot['id']}   {shot['title']}", font=font(56), fill=white)
    draw.text((100, 230), f"{shot['timeline_start']}–{shot['timeline_end']}s  |  SHOT {index:02d}/30  |  {phase['label']}", font=font(36), fill=muted)
    draw.line((100, 300, 1820, 300), fill="#50616c", width=3)
    draw.text((100, 340), "화면 행동", font=font(35), fill=accent)
    y = wrapped(draw, phase["action"], 100, 395, 1700, font(53), white, limit=3)
    draw.text((100, max(y + 45, 620)), "새로 알게 되는 것", font=font(35), fill=accent)
    wrapped(draw, shot["viewer_gain"], 100, max(y + 100, 675), 1700, font(43), white, limit=2)
    draw.rectangle((95, 835, 1825, 967), outline="#50616c", width=3)
    draw.text((120, 848), "음향 큐", font=font(32), fill=accent)
    wrapped(draw, shot["sound"], 305, 848, 1480, font(34), muted, leading=4, limit=2)
    draw.text((100, 1015), "검토용 화면 · 미제작 효과음은 글자로만 표시 · 최종 영상 아님", font=font(28), fill="#8195a2")
    image.save(path, optimize=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--revision", choices=("v1", "v2", "v3"), default="v1")
    args = parser.parse_args()
    plan_file = PROJECT / "review" / f"270s-motion-sound-replan-{args.revision}.json"
    out = PROJECT / "review" / f"270s-connected-preview-{args.revision}"
    if not FONT_FILE.is_file():
        raise RuntimeError(f"Korean font missing: {FONT_FILE}")
    plan = json.loads(plan_file.read_text(encoding="utf-8"))
    preview = json.loads((SOURCE / "preview-plan.json").read_text(encoding="utf-8"))
    if plan["status"] != "DIRECTING_CANDIDATE_NOT_APPROVED" or len(plan["shots"]) != 30:
        raise RuntimeError("Unexpected timing plan")
    if preview["source_manifest_sha256"] != plan["source_manifest_sha256"]:
        raise RuntimeError("Manifest provenance mismatch")
    if digest(SOURCE / "timing-report.json") != plan["source_timing_report_sha256"]:
        raise RuntimeError("Timing report changed")
    if out.exists():
        raise RuntimeError(f"Preview revision already exists: {out}")
    out.mkdir(parents=True)
    cards = out / "cards"
    cards.mkdir()
    scene_map = {scene["id"]: scene for scene in preview["scenes"]}
    raw = bytearray(round(plan["target_seconds"] * SAMPLE_RATE) * 2)
    placed = []
    concat = ["ffconcat version 1.0"]
    card_number = 0
    last_card = None

    for index, shot in enumerate(plan["shots"], 1):
        scene = scene_map[shot["scene_id"]]
        scene_shots = scene["shots"]
        position = next(i for i, item in enumerate(scene_shots) if item["shot_id"] == shot["id"])
        alignment_path = SOURCE / scene["alignment"]
        alignment = json.loads(alignment_path.read_text(encoding="utf-8"))
        if "".join(alignment["characters"]) != scene["text"]:
            raise RuntimeError(f"Alignment text mismatch: {scene['id']}")
        raw_start = float(alignment["character_start_times_seconds"][scene_shots[position]["start_character"]])
        if position + 1 < len(scene_shots):
            raw_end = float(alignment["character_start_times_seconds"][scene_shots[position + 1]["start_character"]])
        else:
            raw_end = max(map(float, alignment["character_end_times_seconds"]))
        if raw_end <= raw_start:
            raise RuntimeError(f"Invalid alignment range: {shot['id']}")
        audio_path = SOURCE / scene["audio"]
        pcm = run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(audio_path),
            "-af", f"atrim=start={raw_start:.6f}:end={raw_end:.6f},asetpts=PTS-STARTPTS,atempo=1.1,aresample={SAMPLE_RATE}",
            "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "s16le", "pipe:1",
        ])
        actual_seconds = len(pcm) / 2 / SAMPLE_RATE
        intended_seconds = shot["preview_voice_at_1p1_seconds"]
        if abs(actual_seconds - intended_seconds) > .12:
            raise RuntimeError(f"Voice duration mismatch {shot['id']}: {actual_seconds:.3f} vs {intended_seconds:.3f}")
        destination = round(shot["voice_slot_timeline"]["start"] * SAMPLE_RATE) * 2
        used_end = round(shot["timeline_end"] * SAMPLE_RATE) * 2
        if destination + len(pcm) > used_end:
            raise RuntimeError(f"Voice runs past used clip {shot['id']}")
        raw[destination:destination + len(pcm)] = pcm
        placed.append({"id": shot["id"], "scene_id": shot["scene_id"], "timeline_start": shot["timeline_start"],
                       "voice_start": shot["voice_slot_timeline"]["start"], "voice_actual_seconds": round(actual_seconds, 3),
                       "voice_end_actual": round(shot["voice_slot_timeline"]["start"] + actual_seconds, 3),
                       "raw_source_start": round(raw_start, 3), "raw_source_end": round(raw_end, 3),
                       "raw_audio_sha256": digest(audio_path), "alignment_sha256": digest(alignment_path)})
        phases = [
            {"label": "행동 → 내레이션", "action": shot["before_voice"], "seconds": shot["pre_voice_seconds"]},
            {"label": "내레이션 + 행동", "action": shot["during_voice"], "seconds": round(shot["voice_slot_relative"]["end"] - shot["voice_slot_relative"]["start"], 3)},
            {"label": "행동 → 다음 컷", "action": shot["after_voice"], "seconds": shot["post_voice_seconds"]},
        ]
        if abs(sum(part["seconds"] for part in phases) - shot["used_seconds"]) > .002:
            raise RuntimeError(f"Phase durations mismatch: {shot['id']}")
        for part_index, phase in enumerate(phases, 1):
            if phase["seconds"] < .04:
                continue
            card_number += 1
            card = cards / f"{card_number:03d}_{shot['id']}_{part_index}.png"
            cue_card(shot, phase, index, card)
            concat += [f"file '{card.as_posix()}'", f"duration {phase['seconds']:.3f}"]
            last_card = card
    concat.append(f"file '{last_card.as_posix()}'")
    concat_path = out / "cards.ffconcat"
    concat_path.write_text("\n".join(concat) + "\n", encoding="utf-8")
    wav_path = out / "preview-voice-timeline.wav"
    with wave.open(str(wav_path), "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(SAMPLE_RATE)
        stream.writeframes(raw)
    mp4_path = out / "db-cooper-270s-timing-preview.mp4"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-safe", "0", "-i", str(concat_path),
         "-i", str(wav_path), "-t", "270", "-r", str(FRAME_RATE), "-c:v", "libx264",
         "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
         "-movflags", "+faststart", str(mp4_path)])
    report = {"schema": "db-cooper-270s-connected-preview.v1", "status": "EDITORIAL_TIMING_PREVIEW_NOT_FINAL",
              "plan_sha256": digest(plan_file), "preview_plan_sha256": digest(SOURCE / "preview-plan.json"),
              "target_seconds": 270, "cards": card_number, "shots": placed,
              "wav_sha256": digest(wav_path), "mp4_sha256": digest(mp4_path),
              "limitations": ["Cue cards indicate intended actions; no generated action footage is present.",
                              "Sound effects and music are written cues only; the preview audio contains narration and silence.",
                              "This does not establish visual continuity, actual camera motion, or canonical approval."]}
    (out / "render-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"READY: {mp4_path}")
    print(f"Shots: {len(placed)}; cue cards: {card_number}; duration target: 270s")


if __name__ == "__main__":
    main()
