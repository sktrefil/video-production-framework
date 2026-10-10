"""Recheck canonical provenance immediately before final segmented TTS."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "03_tts/final-tts-gate-ftg01.json"


def load(relative: str) -> dict:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(f"BLOCKED_STALE_PROVENANCE: {message}")


def graph_hash(graph: dict) -> str:
    basis = {key: graph[key] for key in ("chapters", "sequences", "scenes")}
    data = json.dumps(basis, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(data).hexdigest()


def main() -> None:
    script = load("02_script/script-draft-r04.json")
    lock = load("02_script/script-directing-lock-sdl-r04.json")
    preflight = load("04_visual_identity/directing-preflight-pf04.yaml")
    visual = load("04_visual_identity/visual-skeleton-vs03.json")
    graph = load("02_script/approved-scene-graph-sg01.json")
    manager = load("02_script/manager-story-gate-mstg01.json")
    units = script["units"]
    unit_ids = [unit["unit_id"] for unit in units]

    require(script["script_hash"] == lock["script_hash"] == manager["approved_script_hash"], "script hashes disagree")
    require(unit_ids == lock["locked_unit_ids"], "locked unit IDs disagree")
    require(graph_hash(graph) == graph["hash"] == manager["approved_scene_graph_hash"], "scene graph hash changed")
    require(manager["status"] == "PASS" and preflight["overall_status"] == "PASS" and visual["status"] == "PASS", "upstream approval missing")
    require(len(units) == len(graph["scenes"]) == 19, "scene count changed")
    require([scene["unitId"] for scene in graph["scenes"]] == unit_ids, "scene order changed")
    require([scene["scriptSegment"] for scene in graph["scenes"]] == [unit["tts_text"] for unit in units], "scene narration changed")
    require(not list((ROOT / "03_tts").rglob("*.mp3")), "TTS MP3 already exists")

    connection = sqlite3.connect(f"file:{ROOT / 'project.db'}?mode=ro", uri=True)
    try:
        row = connection.execute("""
            SELECT s.id, s.revision, s.body
            FROM scripts s JOIN approval_records a
              ON a.project_id=s.project_id AND a.target_type='SCRIPT'
             AND a.target_id=s.id AND a.target_revision=s.revision
            WHERE s.project_id=? AND s.lifecycle_status='ACTIVE'
              AND s.kind='FINAL' AND a.approval_state='HUMAN_APPROVED'
            LIMIT 1
        """, (script["project_id"],)).fetchone()
        require(row is not None, "canonical FINAL script approval missing")
        require(row[1] == 4 and row[0] == manager["approved_script_id"], "canonical script revision/ID changed")
        require(row[2] == "\n".join(unit["tts_text"] for unit in units), "canonical script text changed")
        active_scenes = connection.execute("""
            SELECT id, revision, script_segment, source_script_id, source_script_revision, scene_status
            FROM scenes WHERE project_id=? AND lifecycle_status='ACTIVE'
        """, (script["project_id"],)).fetchall()
        by_id = {scene[0]: scene for scene in active_scenes}
        require(len(active_scenes) == 19, "canonical Scene count changed")
        for scene in graph["scenes"]:
            db_scene = by_id.get(scene["id"])
            require(db_scene is not None, f"canonical Scene missing: {scene['id']}")
            require(
                db_scene[1] == scene["revision"]
                and db_scene[2] == scene["scriptSegment"]
                and db_scene[3] == row[0]
                and db_scene[4] == 4
                and db_scene[5] == "APPROVED",
                f"canonical Scene stale: {scene['id']}",
            )
        media_count = connection.execute(
            "SELECT COUNT(*) FROM media_artifacts WHERE project_id=? AND media_type IN ('AUDIO','TTS')",
            (script["project_id"],),
        ).fetchone()[0]
        require(media_count == 0, "canonical TTS media already exists")
    finally:
        connection.close()

    gate = {
        "gate_id": "FTG-weekday-roman-gods-v1-01",
        "script_directing_lock_id": lock["lock_id"],
        "lock": {key: lock[key] for key in (
            "script_revision", "script_hash", "preflight_revision",
            "preflight_script_revision", "preflight_input_script_hash",
            "visual_skeleton_revision", "visual_skeleton_hash",
            "visual_skeleton_script_revision", "visual_skeleton_input_script_hash",
            "locked_unit_ids", "fact_guardrail_ids",
        )},
        "current_script": {
            "revision": script["script_revision"], "hash": script["script_hash"],
            "unit_ids": unit_ids, "fact_guardrail_ids": script["fact_guardrail_ids"],
        },
        "current_preflight": {
            "revision": preflight["preflight_revision"],
            "input_script_revision": preflight["script_revision"],
            "input_script_hash": preflight["input_script_hash"],
            "status": preflight["overall_status"],
        },
        "current_visual_skeleton": {
            "revision": visual["visual_skeleton_revision"],
            "hash": visual["visual_skeleton_hash"],
            "input_script_revision": visual["script_revision"],
            "input_script_hash": visual["input_script_hash"],
            "status": visual["status"],
        },
        "manager_story_gate": {
            "status": manager["status"],
            "approved_script_revision": manager["approved_script_revision"],
            "approved_script_hash": manager["approved_script_hash"],
            "approved_scene_graph_revision": manager["approved_scene_graph_revision"],
            "approved_scene_graph_hash": manager["approved_scene_graph_hash"],
        },
        "final_tts_generated": False,
        "canonical_db_check": "PASS: active FINAL r04 and all 19 approved Scene revisions match SG01",
    }
    OUT.write_text(json.dumps(gate, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {OUT}")


if __name__ == "__main__":
    main()
