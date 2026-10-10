from __future__ import annotations

import json
import math
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_ROOT = ROOT / "output" / "db-cooper-v3"
PLAN_PATH = DB_ROOT / "storyboard-lock-v1" / "chain-plan.json"
CANONICAL = DB_ROOT / "canonical-workspace" / "projects" / "db_cooper_1971_4m30_v3" / "03_tts"
REVIEW = DB_ROOT / "review" / "remotion-cl01-16-v1"
PUBLIC = ROOT / "public" / "db-cooper-review" / "cl01-16-v1"
FPS = 30


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def frames(seconds: float) -> int:
    return round(seconds * FPS)


def split_subtitle(chars: list[str], starts: list[float], ends: list[float], start: float, end: float):
    indexes = [i for i, (a, b) in enumerate(zip(starts, ends)) if b > start + 1e-4 and a < end - 1e-4]
    if not indexes:
        return []
    raw = [(i, chars[i]) for i in indexes]
    groups: list[list[tuple[int, str]]] = []
    cursor = 0
    punctuation = "。！？!?\n"
    while cursor < len(raw):
        limit = min(len(raw), cursor + 34)
        punct_at = next((j for j in range(cursor, limit) if raw[j][1] in punctuation), None)
        if punct_at is not None:
            stop = punct_at + 1
        else:
            stop = limit
            # Prefer a word boundary near the limit. If a punctuation mark is
            # just beyond it, keep the full short phrase together.
            next_punct = next((j for j in range(limit, min(len(raw), limit + 9)) if raw[j][1] in punctuation), None)
            if next_punct is not None:
                stop = next_punct + 1
            else:
                space_at = next((j for j in range(limit - 1, max(cursor + 18, limit - 10), -1) if raw[j][1].isspace()), None)
                if space_at is not None:
                    stop = space_at + 1
        groups.append(raw[cursor:stop])
        cursor = stop

    cues = []
    for group in groups:
        text = "".join(ch for _, ch in group).replace("\n", " ").strip()
        text = " ".join(text.split())
        if not text:
            continue
        first, last = group[0][0], group[-1][0]
        cue_start = max(start, starts[first])
        cue_end = min(end, ends[last])
        if cue_end <= cue_start:
            continue
        cues.append((text, cue_start, cue_end))
    return cues


def main():
    plan = read_json(PLAN_PATH)
    shots = plan["shots"][:16]
    if len(shots) != 16 or [s["id"] for s in shots] != [f"CL{i:02d}" for i in range(1, 17)]:
        raise SystemExit("Expected a contiguous CL01–CL16 chain in chain-plan.json")
    total_seconds = shots[-1]["timeline_end"]
    if total_seconds != 148:
        raise SystemExit(f"Expected a 148-second CL01–CL16 timeline, got {total_seconds}")

    REVIEW.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    tracks = [
        {"id": "V1", "type": "VIDEO", "name": "CL01–CL16 영상", "enabled": True, "locked": False, "order": 0},
        {"id": "G1", "type": "GRAPHIC", "name": "그래픽", "enabled": True, "locked": False, "order": 1},
        {"id": "T1", "type": "TEXT", "name": "자막", "enabled": True, "locked": False, "order": 2},
        {"id": "T2", "type": "TEXT", "name": "텍스트", "enabled": True, "locked": False, "order": 3},
        {"id": "A1", "type": "AUDIO", "name": "FINAL TTS (샷별 분할)", "enabled": True, "locked": False, "order": 4},
        {"id": "A2", "type": "AUDIO", "name": "클립 효과음", "enabled": True, "locked": False, "order": 5},
        {"id": "A3", "type": "AUDIO", "name": "BGM", "enabled": False, "locked": False, "order": 6},
        {"id": "A4", "type": "AUDIO", "name": "추가 효과음", "enabled": False, "locked": False, "order": 7},
    ]
    items = []
    alignment_by_scene = {}
    scene_index = {f"SC{i:02d}": i for i in range(1, 8)}

    for shot in shots:
        num = int(shot["id"][2:])
        source = DB_ROOT / "storyboard-lock-v1" / "clips" / f"CL{num:02d}.mp4"
        if not source.is_file():
            raise SystemExit(f"Missing video: {source}")
        public_video = PUBLIC / source.name
        shutil.copy2(source, public_video)
        duration = frames(shot["keep_seconds"])
        start_frame = frames(shot["timeline_start"])
        items.append({
            "id": f"video-CL{num:02d}", "type": "VIDEO", "trackId": "V1",
            "timelineStartFrame": start_frame, "durationInFrames": duration,
            "enabled": True, "locked": False,
            "src": f"db-cooper-review/cl01-16-v1/{source.name}",
            "sourceStartFrame": 0, "sourceDurationInFrames": duration,
            "sourceAssetDurationInFrames": frames(10), "playbackRate": 1,
            "loop": False, "volume": 1, "x": 0, "y": 0, "scale": 1,
            "rotation": 0, "opacity": 1, "fit": "cover", "transitionInFrames": 0,
            "sourceUsagePolicy": "QC_TRIM",
        })
        items.append({
            "id": f"clip-audio-CL{num:02d}", "type": "CLIP_AUDIO", "trackId": "A2",
            "timelineStartFrame": start_frame, "durationInFrames": duration,
            "enabled": True, "locked": False,
            "src": f"db-cooper-review/cl01-16-v1/{source.name}",
            "sourceStartFrame": 0, "sourceDurationInFrames": duration,
            "sourceAssetDurationInFrames": frames(10), "volume": 0.28,
            "muted": False, "fadeInFrames": 0, "fadeOutFrames": 0, "loop": False,
        })

        scene = shot["scene"]
        if scene not in alignment_by_scene:
            sec_no = scene_index[scene]
            alignment = read_json(CANONICAL / "alignment" / f"section_{sec_no:03d}.json")
            audio = CANONICAL / "sections" / f"section_{sec_no:03d}.mp3"
            if not audio.is_file():
                raise SystemExit(f"Missing FINAL TTS: {audio}")
            public_audio = PUBLIC / audio.name
            shutil.copy2(audio, public_audio)
            alignment_by_scene[scene] = (alignment, f"db-cooper-review/cl01-16-v1/{audio.name}")
        alignment, audio_src = alignment_by_scene[scene]
        chars = alignment["characters"]
        char_starts = alignment["character_start_times_seconds"]
        char_ends = alignment["character_end_times_seconds"]
        window = shot["final_tts_scene_audio_window"]
        audio_start = window["scene_audio_start_seconds"]
        audio_end = window["scene_audio_end_seconds"]
        timeline_voice_start = shot["timeline_start"] + shot["voice_slot_relative"]["start"]
        audio_duration = audio_end - audio_start
        if abs(audio_duration - (shot["voice_slot_relative"]["end"] - shot["voice_slot_relative"]["start"])) > 0.08:
            raise SystemExit(f"TTS window/voice slot mismatch for {shot['id']}: {audio_duration:.3f}s")
        tts_id = f"tts-{shot['id']}"
        items.append({
            "id": tts_id, "type": "TTS", "trackId": "A1",
            "timelineStartFrame": frames(timeline_voice_start), "durationInFrames": frames(audio_duration),
            "enabled": True, "locked": False, "src": audio_src,
            "sourceStartFrame": frames(audio_start), "sourceDurationInFrames": frames(audio_duration),
            "sourceAssetDurationInFrames": frames(len(char_starts) and char_ends[-1]),
            "volume": 1, "muted": False, "fadeInFrames": 0, "fadeOutFrames": 0, "loop": False,
        })

        for cue_no, (text, cue_start, cue_end) in enumerate(split_subtitle(chars, char_starts, char_ends, audio_start, audio_end), 1):
            items.append({
                "id": f"subtitle-{shot['id']}-{cue_no:02d}", "type": "SUBTITLE", "trackId": "T1",
                "timelineStartFrame": frames(timeline_voice_start + cue_start - audio_start),
                "durationInFrames": max(1, frames(cue_end - cue_start)),
                "enabled": True, "locked": False, "text": text,
                "x": 960, "y": 990, "width": 1600, "fontFamily": "Noto Sans CJK KR, sans-serif",
                "fontSize": 48, "fontWeight": 700, "color": "#ffffff", "strokeColor": "#000000",
                "strokeWidth": 3, "textAlign": "center", "lineHeight": 1.2, "maxLines": 2,
                "backgroundEnabled": True, "backgroundColor": "#000000", "backgroundOpacity": 0.48,
                "generationSource": "SCRIPT_TTS_ALIGN", "generatedFromTtsIds": [tts_id],
            })

    project = {
        "schemaVersion": 1,
        "project": {"id": "db-cooper-cl01-16-review-v1", "name": "D.B. Cooper CL01–CL16 TTS + 자막 검토", "fps": FPS, "width": 1920, "height": 1080, "durationInFrames": frames(total_seconds)},
        "tracks": tracks,
        "items": items,
        "settings": {"snapEnabled": True, "snapToleranceFrames": 4, "timelineZoom": 0.7, "masterVolume": 1, "clipAudioMasterVolume": 1, "forcedEndFrame": frames(total_seconds)},
    }
    project_path = REVIEW / "edit_project.json"
    props_path = REVIEW / "remotion-props.json"
    project_path.write_text(json.dumps(project, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    props_path.write_text(json.dumps({"project": project}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = {
        "status": "REVIEW_READY_NONCANONICAL",
        "project": str(project_path.relative_to(ROOT)).replace("\\", "/"),
        "remotion_props": str(props_path.relative_to(ROOT)).replace("\\", "/"),
        "timeline_seconds": total_seconds,
        "timeline_frames": frames(total_seconds),
        "fps": FPS,
        "video_clips": 16,
        "tts_segments": 16,
        "subtitle_cues": sum(item["type"] == "SUBTITLE" for item in items),
        "final_tts_source": "canonical FINAL segmented TTS + character alignments",
        "canonical_project_db_modified": False,
        "clips_are_review_copies": True,
    }
    (REVIEW / "review-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
