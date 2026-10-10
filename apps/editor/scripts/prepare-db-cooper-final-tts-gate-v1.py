"""Build the required FINAL TTS gate from current locked files and canonical DB."""

import hashlib
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "output/db-cooper-v3/review"
PROJECT = ROOT / "output/db-cooper-v3/canonical-workspace/projects/db_cooper_1971_4m30_v3"


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


lock = load(REVIEW / "script-directing-lock-v2.json")
manager = load(REVIEW / "manager-story-gate-v1.json")
scenes = load(REVIEW / "scene-graph-candidate-v4.json")
skeleton = load(REVIEW / "visual-skeleton-v1.json")
script_file = PROJECT / "DB_Cooper_4min30_script_v3.md"
preflight_file = REVIEW / "directing-preflight-sequence-qc-v3.md"
skeleton_file = REVIEW / "visual-skeleton-v1.json"
scene_file = REVIEW / "scene-graph-candidate-v4.json"
db = sqlite3.connect(f"file:{(PROJECT / 'project.db').as_posix()}?mode=ro", uri=True)
db.row_factory = sqlite3.Row
approved = db.execute(
    "SELECT s.id, s.revision, s.body FROM scripts s JOIN approval_records a "
    "ON a.target_type='SCRIPT' AND a.target_id=s.id AND a.target_revision=s.revision "
    "AND a.approval_state='HUMAN_APPROVED' WHERE s.project_id=? AND s.kind='FINAL' "
    "AND s.lifecycle_status='ACTIVE'", (lock["project_id"],)).fetchall()
if len(approved) != 1 or approved[0]["body"] != script_file.read_text(encoding="utf-8"):
    raise RuntimeError("Canonical approved FINAL script mismatch")
tts_count = db.execute(
    "SELECT COUNT(*) FROM tts_generation_results WHERE project_id=? AND lifecycle_status='ACTIVE'",
    (lock["project_id"],)).fetchone()[0]
scene_approval_count = db.execute(
    "SELECT COUNT(*) FROM scenes s JOIN approval_records a ON a.target_type='SCENE' "
    "AND a.target_id=s.id AND a.target_revision=s.revision AND a.approval_state='HUMAN_APPROVED' "
    "WHERE s.project_id=? AND s.lifecycle_status='ACTIVE' AND s.stale=0",
    (lock["project_id"],)).fetchone()[0]
db.close()
if tts_count or scene_approval_count != 7:
    raise RuntimeError("FINAL TTS exists or approved Scene set is incomplete")
if not (sha(script_file) == lock["script_hash"] == manager["canonical_script"]["sha256"]):
    raise RuntimeError("Locked/manager/current script hash mismatch")
if not (sha(preflight_file) == lock["preflight_hash"] and
        sha(skeleton_file) == lock["visual_skeleton_hash"] and
        sha(scene_file) == lock["scene_graph_hash"]):
    raise RuntimeError("Preflight, skeleton, or Scene graph hash mismatch")
if [scene["scene_id"] for scene in scenes["scenes"]] != lock["locked_unit_ids"]:
    raise RuntimeError("Scene unit order mismatch")
if skeleton["scene_ids"] != lock["locked_unit_ids"]:
    raise RuntimeError("Visual skeleton unit order mismatch")
if manager["manager_story_gate"] != "PASS" or manager["canonical_scenes"] != 7:
    raise RuntimeError("Manager Story Gate is not PASS")

gate = {
    "gate_id": "FTG-db_cooper_1971_4m30_v3-r1",
    "script_directing_lock_id": lock["lock_id"],
    "lock": {
        "script_revision": lock["script_revision"], "script_hash": lock["script_hash"],
        "preflight_revision": lock["preflight_revision"],
        "preflight_script_revision": lock["preflight_script_revision"],
        "preflight_input_script_hash": lock["preflight_input_script_hash"],
        "visual_skeleton_revision": lock["visual_skeleton_revision"],
        "visual_skeleton_hash": lock["visual_skeleton_hash"],
        "visual_skeleton_script_revision": lock["visual_skeleton_script_revision"],
        "visual_skeleton_input_script_hash": lock["visual_skeleton_input_script_hash"],
        "locked_unit_ids": lock["locked_unit_ids"],
        "fact_guardrail_ids": lock["fact_guardrail_ids"],
    },
    "current_script": {
        "revision": lock["script_revision"], "hash": sha(script_file),
        "canonical_script_id": approved[0]["id"], "canonical_script_revision": approved[0]["revision"],
        "unit_ids": [scene["scene_id"] for scene in scenes["scenes"]],
        "fact_guardrail_ids": lock["fact_guardrail_ids"],
    },
    "current_preflight": {
        "revision": lock["preflight_revision"], "input_script_revision": lock["preflight_script_revision"],
        "input_script_hash": lock["preflight_input_script_hash"], "status": "PASS",
    },
    "current_visual_skeleton": {
        "revision": skeleton["revision"], "hash": sha(skeleton_file),
        "input_script_revision": skeleton["script_revision"],
        "input_script_hash": skeleton["input_script_sha256"], "status": "PASS",
    },
    "manager_story_gate": {
        "status": "PASS", "approved_script_revision": lock["script_revision"],
        "approved_script_hash": manager["canonical_script"]["sha256"],
        "approved_scene_graph_revision": lock["scene_graph_revision"],
        "approved_scene_graph_hash": lock["scene_graph_hash"],
        "canonical_scene_approval_ids": [scene["approval_id"] for scene in manager["scene_mapping"]],
    },
    "final_tts_generated": False,
}
out = REVIEW / "final-tts-gate-v1.json"
out.write_text(json.dumps(gate, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(out)
