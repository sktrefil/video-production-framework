"""Lock the 30-shot directing package to canonical FINAL TTS without creating media."""

import hashlib
import json
import shutil
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "output/db-cooper-v3"
REVIEW = BASE / "review"
PROJECT = BASE / "canonical-workspace/projects/db_cooper_1971_4m30_v3"
DEST = BASE / "storyboard-lock-v1"


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compact(text):
    return "".join(text.split())


def write_once(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = content.encode("utf-8") if isinstance(content, str) else content
    if path.exists():
        if path.read_bytes() != data:
            raise RuntimeError(f"Existing locked package file differs: {path}")
        return
    path.write_bytes(data)


def json_once(path, value):
    write_once(path, json.dumps(value, ensure_ascii=False, indent=2) + "\n")


lock = load(REVIEW / "script-directing-lock-v2.json")
gate = load(REVIEW / "manager-story-gate-v1.json")
registration = load(REVIEW / "final-tts-reuse-registration-v1.json")
manifest = load(REVIEW / "shot-manifest-candidate-v5.json")
directing = load(REVIEW / "270s-motion-sound-replan-v3.json")
old_plan = load(BASE / "chain-plan.json")
tts_manifest = load(PROJECT / "03_tts/narration_manifest.json")
db = sqlite3.connect(f"file:{(PROJECT / 'project.db').as_posix()}?mode=ro", uri=True)
db.row_factory = sqlite3.Row
tts_result = db.execute(
    "SELECT id, plan_id, plan_revision, source_script_sha256, sections_json, total_audio_duration_ms "
    "FROM tts_generation_results WHERE project_id=? AND lifecycle_status='ACTIVE'",
    (lock["project_id"],)).fetchone()
tts_plan = db.execute(
    "SELECT id, revision, status, source_script_sha256, sections_json "
    "FROM tts_generation_plans WHERE project_id=? AND lifecycle_status='ACTIVE'",
    (lock["project_id"],)).fetchone()
db.close()
if not tts_result or not tts_plan or tts_plan["status"] != "COMPLETE":
    raise RuntimeError("Canonical FINAL TTS is incomplete")
if tts_result["id"] != registration["resultId"] or tts_result["plan_id"] != tts_plan["id"]:
    raise RuntimeError("FINAL TTS registration provenance mismatch")
if tts_result["plan_revision"] != tts_plan["revision"]:
    raise RuntimeError("FINAL TTS plan revision mismatch")
if tts_result["source_script_sha256"] != lock["script_hash"] or gate["manager_story_gate"] != "PASS":
    raise RuntimeError("Script or manager gate mismatch")
if sha(REVIEW / "shot-manifest-candidate-v5.json") != lock["shot_manifest_hash"] or \
   sha(REVIEW / "270s-motion-sound-replan-v3.json") != lock["directing_plan_hash"]:
    raise RuntimeError("Directing source hash changed")
if len(manifest["shots"]) != len(directing["shots"]) != 30:
    raise RuntimeError("30-shot package required")
if len(manifest["shots"]) != 30 or len(directing["shots"]) != 30:
    raise RuntimeError("30-shot package required")
sections = json.loads(tts_plan["sections_json"])
results = json.loads(tts_result["sections_json"])
if len(sections) != 7 or len(results) != 7 or len(tts_manifest["sections"]) != 7:
    raise RuntimeError("Seven-section FINAL TTS required")

board_items = old_plan["boards"]
for board in board_items.values():
    if sha(BASE / board["path"]) != board["sha256"]:
        raise RuntimeError("Board image hash mismatch")
    target = DEST / board["path"]
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        shutil.copy2(BASE / board["path"], target)
    if sha(target) != board["sha256"]:
        raise RuntimeError("Copied board hash mismatch")
for key, value in old_plan["input_hashes"].items():
    name = {"manifest": "DB_Cooper_v3_Codex_Shot_Manifest.json",
            "script": "DB_Cooper_4min30_script_v3.txt",
            "tts": "DB_Cooper_4min30_script_v3_TTS.txt",
            "bible": "D.B.COOPER 마스터 보드 v3.1_VISUAL_BIBLE_LOCK.md"}[key]
    source, target = BASE / "inputs" / name, DEST / "inputs" / name
    if sha(source) != value:
        raise RuntimeError(f"Input snapshot hash mismatch: {name}")
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        shutil.copy2(source, target)
    if sha(target) != value:
        raise RuntimeError(f"Copied input hash mismatch: {name}")

plan = {
    "schema": "db-cooper-final-tts-shot-chain.v1",
    "project_id": lock["project_id"],
    "status": "DIRECTING_DESIGN_LOCKED_PRODUCTION_HOLD",
    "canonical_approval": False,
    "script_directing_lock": lock["lock_id"],
    "manager_story_gate": "PASS",
    "final_tts_allowed": True,
    "tts_timing_verified": True,
    "final_tts_plan_id": tts_plan["id"],
    "final_tts_plan_revision": tts_plan["revision"],
    "final_tts_result_id": tts_result["id"],
    "final_tts_manifest_sha256": sha(PROJECT / "03_tts/narration_manifest.json"),
    "final_tts_total_audio_duration_ms": tts_result["total_audio_duration_ms"],
    "approved_script_sha256": lock["script_hash"],
    "scene_graph_sha256": lock["scene_graph_hash"],
    "shot_manifest_sha256": lock["shot_manifest_hash"],
    "directing_plan_sha256": lock["directing_plan_hash"],
    "source_manifest_sha256": old_plan["source_manifest_sha256"],
    "input_hashes": old_plan["input_hashes"],
    "boards": board_items,
    "target_duration_seconds": 270,
    "editor_fps": 30,
    "source_clip_count": 30,
    "source_total_seconds": 300,
    "editor_keep_total_seconds": 270,
    "shot_plan_revision": "storyboard-lock-v1-final-tts-aligned",
    "production_hold_reasons": ["CURRENT_CI_EVIDENCE_NOT_GREEN_FOR_REAL_PILOT",
                                "NO_APPROVED_CL01_IMAGE_OR_VIDEO_MEDIA"],
    "shots": [],
}

scene_shots = {}
for shot in manifest["shots"]:
    scene_shots.setdefault(shot["scene"], []).append(shot)
final_durations = {}
for scene_index, (section, section_result) in enumerate(zip(sections, results), 1):
    scene_id = f"SC{scene_index:02d}"
    if section["sceneIds"] != [gate["scene_mapping"][scene_index - 1]["canonical_scene_id"]] or \
       section_result["sceneIds"] != section["sceneIds"]:
        raise RuntimeError(f"Canonical Scene mapping mismatch: {scene_id}")
    align_path = PROJECT / section_result["characterAlignmentRelativePath"]
    if sha(align_path) != section_result["characterAlignmentSha256"]:
        raise RuntimeError(f"FINAL TTS alignment hash mismatch: {scene_id}")
    alignment = load(align_path)
    chars = alignment["characters"]
    if "".join(chars) != section["text"]:
        raise RuntimeError(f"FINAL TTS alignment text mismatch: {scene_id}")
    spoken = [(char, start, end) for char, start, end in zip(
        chars, alignment["character_start_times_seconds"], alignment["character_end_times_seconds"])
        if not char.isspace()]
    if "".join(char for char, _, _ in spoken) != compact("".join(
            shot["tts"] for shot in scene_shots[scene_id])):
        raise RuntimeError(f"FINAL TTS differs from shot narration: {scene_id}")
    cursor = 0
    for shot in scene_shots[scene_id]:
        target = compact(shot["tts"])
        chunk = spoken[cursor:cursor + len(target)]
        if "".join(char for char, _, _ in chunk) != target:
            raise RuntimeError(f"Shot text alignment mismatch: {shot['id']}")
        final_durations[shot["id"]] = {
            "scene_audio_start_seconds": round(chunk[0][1], 3),
            "scene_audio_end_seconds": round(chunk[-1][2], 3),
            "spoken_window_seconds": round(chunk[-1][2] - chunk[0][1], 3),
        }
        cursor += len(target)
    if cursor != len(spoken):
        raise RuntimeError(f"Scene has unused spoken characters: {scene_id}")

def header(shot):
    lines = [
        f"D.B. COOPER | {shot['id']} | {shot['scene']} | STORYBOARD LOCK v1",
        "NON_REALISTIC_STYLIZED hand-drawn 2D ink noir. Horizontal 16:9, 1536x864 image target, 1920x1080 editorial delivery.",
        "Use the boards as style, motion, and scene geometry references. Do not copy board panels or their text into a frame.",
    ]
    lines.extend(f"{key}: {board['path']} | sha256:{board['sha256']}" for key, board in board_items.items())
    lines.extend([f"CONTINUITY: {', '.join(shot['reference_locks'])}",
                  f"FACT GUARD: {shot['fact_guard']}",
                  "No photorealism, live-action, documentary reenactment, glossy 3D, subtitles, watermarks, or invented historical writing.",
                  ""])
    return "\n".join(lines)


for index, (shot, directed, baseline) in enumerate(zip(manifest["shots"], directing["shots"], old_plan["shots"])):
    shot_id = f"CL{index + 1:02d}"
    if shot["id"] != shot_id or directed["id"] != shot_id or baseline["id"] != shot_id:
        raise RuntimeError(f"Shot order mismatch: {shot_id}")
    if (shot["timeline_start"], shot["timeline_end"], shot["keep_seconds"]) != \
       (directed["timeline_start"], directed["timeline_end"], directed["used_seconds"]):
        raise RuntimeError(f"Timeline mismatch: {shot_id}")
    if shot["timeline_end"] - shot["timeline_start"] != shot["keep_seconds"]:
        raise RuntimeError(f"Timeline gap/overlap: {shot_id}")
    speech = final_durations[shot_id]
    voice_start = directed["voice_slot_relative"]["start"]
    voice_end = round(voice_start + speech["spoken_window_seconds"], 3)
    if voice_end > shot["keep_seconds"] - 0.2:
        raise RuntimeError(f"FINAL TTS exceeds used shot window: {shot_id}")
    binding = dict(baseline["start_binding"])
    reference_dependency = None
    if shot_id == "CL29":
        binding = {"kind": "GENERATE_START", "source_clip": None}
        reference_dependency = {
            "source_clip": "CL01", "frame_window_seconds": [6, 8],
            "rule": "Use a reviewed stair-reveal frame for geometry only; never use CL01's black 10-second used exit as the START.",
        }
    if shot_id == "CL01" and ("검은" not in shot["target"] or shot["image_mode"] != "START_TARGET"):
        raise RuntimeError("CL01 final target is not the revised black stairwell state")
    stem = f"{shot_id}_v2"
    start_prompt = f"prompts/{stem}_START.prompt.txt" if binding["kind"] == "GENERATE_START" else None
    end_prompt = f"prompts/{stem}_END.prompt.txt" if shot["image_mode"] == "START_TARGET" else None
    video_prompt = f"prompts/{stem}_VIDEO.prompt.txt"
    start_asset = f"assets/{shot_id}_START.png"
    end_asset = f"assets/{shot_id}_END_TARGET.png" if end_prompt else None
    video_asset = f"clips/{shot_id}.mp4"
    if start_prompt:
        extra = ("CL29: attach a reviewed CL01 frame from 6-8 seconds as geometry reference only; generate an independent wide START. Do not use the black 10-second EXIT.\n"
                 if shot_id == "CL29" else "")
        write_once(DEST / start_prompt, header(shot) + extra +
                   f"Create one START image for {shot_id}.\nSTORY: {shot['story']}\nSTART FRAME: {shot['start']}\n" +
                   f"FUTURE CAMERA SPACE: {shot['camera']}\nREVEAL TO RESERVE: {shot['key_event']}\n" +
                   "Keep the revealed state out of the START composition. One frame, one information state.\n")
    if end_prompt:
        cl01 = ("For CL01, this is the 10-second dark stairwell occlusion, not the 6-8 second stair-reveal frame. "
                "Keep only a narrow hint of the same stair rails and ink edges to preserve spatial continuity; the center is near-black.\n"
                if shot_id == "CL01" else "")
        write_once(DEST / end_prompt, header(shot) + cl01 +
                   f"Create one END/TARGET image for {shot_id}, using its reviewed START as the primary image reference.\n" +
                   f"START STATE: {shot['start']}\nCAMERA PATH: {shot['camera']}\n" +
                   f"TARGET STATE AT USED EXIT: {shot['target']}\nEXIT: {shot['exit']}\n" +
                   "Preserve the same object geometry, camera axis, light family and palette. This target is not proof of an actual generated-video exit.\n")
    write_once(DEST / video_prompt, header(shot) +
               f"Create one {shot['source_seconds']}-second 16:9 animated clip for {shot_id}. " +
               f"Editor uses {shot['keep_seconds']} seconds at timeline {shot['timeline_start']}-{shot['timeline_end']} seconds.\n" +
               f"START: {start_asset} ({binding['kind']}{' from '+binding['source_clip'] if binding['source_clip'] else ''}).\n" +
               f"END/TARGET: {end_asset or 'No separate END image; use the motion target in text.'}\n" +
               f"ACTION: {shot['subject_motion']}\nCAMERA: {shot['camera']}\nENVIRONMENT: {shot['environment_motion']}\n" +
               f"REVEAL: {shot['key_event']}\nUSED EXIT: {shot['exit']}\n" +
               f"VOICE SLOT IN USED CLIP: {voice_start:.3f}-{voice_end:.3f}s; narration: {shot['tts']}\n" +
               f"SOUND DESIGN: {directed['sound']}\nHANDOFF: {shot['transition']}\n" +
               "Preserve continuous object geometry and one dominant camera path. Do not invent a witnessed jump or landing. " +
               "Review the actual used exit frame before creating a dependent START.\n")
    job = {
        "id": shot_id, "scene": shot["scene"], "ordinal": index + 1,
        "timeline_start": shot["timeline_start"], "timeline_end": shot["timeline_end"],
        "source_seconds": shot["source_seconds"], "keep_seconds": shot["keep_seconds"],
        "image_mode": shot["image_mode"], "transition": shot["transition"],
        "start_binding": binding, "reference_dependency": reference_dependency,
        "start_asset": start_asset, "end_target_asset": end_asset, "video_asset": video_asset,
        "prompts": {"start": start_prompt, "end": end_prompt, "video": video_prompt},
        "reference_locks": shot["reference_locks"], "fact_class": shot["fact_class"],
        "state": "DESIGN_LOCKED_MEDIA_NOT_GENERATED",
        "story": shot["story"], "action": shot["subject_motion"],
        "camera": shot["camera"], "reveal": shot["key_event"],
        "exit": shot["exit"], "sound": directed["sound"],
        "narrator_text": shot["tts"],
        "final_tts_scene_audio_window": speech,
        "voice_slot_relative": {"start": voice_start, "end": voice_end},
        "voice_slot_timeline": {"start": round(shot["timeline_start"] + voice_start, 3),
                                "end": round(shot["timeline_start"] + voice_end, 3)},
        "pre_voice_seconds": voice_start,
        "post_voice_seconds": round(shot["keep_seconds"] - voice_end, 3),
        "nonvoice_seconds": round(shot["keep_seconds"] - speech["spoken_window_seconds"], 3),
    }
    plan["shots"].append(job)
    json_once(DEST / "jobs" / f"{shot_id}.json", job)

if sum(shot["keep_seconds"] for shot in plan["shots"]) != 270 or \
   plan["shots"][-1]["timeline_end"] != 270:
    raise RuntimeError("270-second 30-shot timeline mismatch")
json_once(DEST / "chain-plan.json", plan)

lines = ["# D.B. Cooper — FINAL TTS 기준 30샷 콘티·연결 잠금 v1", "",
         "상태: **연출 설계 잠금 / 실제 미디어 제작 보류**. FINAL TTS 7개 섹션과 30샷의 대사 창을 대조했다.",
         "실제 이미지·영상 품질 및 마지막 사용 프레임은 아직 승인되지 않았다.", "",
         f"- 잠금: `{lock['lock_id']}` · 관리자 Story Gate PASS",
         f"- FINAL TTS: plan `{tts_plan['id']}` rev {tts_plan['revision']} · result `{tts_result['id']}` · {tts_result['total_audio_duration_ms']/1000:.3f}초",
         "- 화면: 30샷 × 생성 10초 = 원본 300초, 편집 사용 합계 270초", "- 화풍: NON_REALISTIC_STYLIZED 2D 잉크 누아르, 16:9", "",
         "## 제작 순서", "",
         "1. CL01 START 이미지 생성·눈으로 검토. 727의 후방 3/4 원경과 꼬리 아래 공간을 확인한다.",
         "2. CL01 END/TARGET 이미지 생성·검토. 10초 검은 계단 내부 차폐를 목표로 한다. 6~8초 열린 계단 프레임과 혼동하지 않는다.",
         "3. CL01 VIDEO 프롬프트로 10초를 생성한다. 6~8초 계단 구조 공개, 8~10초 검은 내부 진입, 직접 점프 묘사 금지를 실제 영상에서 확인한다.",
         "4. 채택된 CL01의 실제 사용 종료 프레임을 추출하고, CL02는 시간 점프이므로 독립 START로 제작한다.",
         "5. 이후 모든 클립에서 같은 동기화 명령을 사용한다. 파생 START는 검토된 실제 사용 종료 프레임에서만 연결한다.",
         "6. CL29는 CL01 6~8초 공개 프레임을 구조 참고로 사용하는 독립 START다. CL01의 검은 10초 EXIT을 복사하지 않는다.", "",
         "```powershell", "node scripts/db-cooper-chain.mjs status --output-dir output/db-cooper-v3/storyboard-lock-v1",
         "node scripts/db-cooper-chain.mjs sync --output-dir output/db-cooper-v3/storyboard-lock-v1", "```", "",
         "## 30샷 연결표", "", "| 샷 | 화면 시간 | 음성 사용 구간 | START | END | 다음 연결 |", "| --- | --- | --- | --- | --- | --- |"]
for shot in plan["shots"]:
    binding = shot["start_binding"]
    start = binding["kind"] if not binding["source_clip"] else f"{binding['kind']}:{binding['source_clip']}"
    lines.append(f"| {shot['id']} | {shot['timeline_start']}–{shot['timeline_end']}초 | "
                 f"{shot['voice_slot_relative']['start']:.3f}–{shot['voice_slot_relative']['end']:.3f}초 | "
                 f"{start} | {'TARGET' if shot['end_target_asset'] else '없음'} | {shot['transition']} |")
lines.extend(["", "## 제작 게이트", "",
              "현재 프로젝트 preflight는 저장소 `.env`를 읽어 PASS지만, 현재 checkout의 전체 typecheck·build·tests·LONGFORM E2E·pilot-readiness CI 증빙은 이 패키지에서 아직 확인되지 않았다.",
              "따라서 이 파일은 설계 잠금이며 실제 CL01 이미지·영상 생성의 관리자 제작 승인 기록이 아니다.",
              "사람의 TTS 청취 QC도 아직 기록되지 않았다. 실제 미디어 결과가 생기면 Agent1이 이미지·연결·사용 구간을 다시 검수한다.", ""])
write_once(DEST / "README.md", "\n".join(lines))
for folder in ("assets", "clips", "exits", "evidence"):
    (DEST / folder).mkdir(parents=True, exist_ok=True)
print(f"LOCKED DESIGN PACKAGE: {DEST}; shots=30; final TTS={tts_result['total_audio_duration_ms']/1000:.3f}s")
