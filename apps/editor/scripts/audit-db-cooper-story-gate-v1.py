"""Read-only cross-artifact and canonical DB audit for D.B. Cooper Story Gate."""

import hashlib
import json
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "output" / "db-cooper-v3" / "review"
PROJECT = ROOT / "output" / "db-cooper-v3" / "canonical-workspace" / "projects" / "db_cooper_1971_4m30_v3"
DB = PROJECT / "project.db"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


lock_path = REVIEW / "script-directing-lock-v2.json"
plan_path = REVIEW / "story-gate-plan-v1.json"
scene_path = REVIEW / "scene-graph-candidate-v4.json"
status_path = REVIEW / "story-status-after-gate-v1.json"
lock, plan, source_scenes, status = map(load, (lock_path, plan_path, scene_path, status_path))
script_path = PROJECT / "DB_Cooper_4min30_script_v3.md"
source_script_path = Path("D:/컴폴더/다운로드/DB_Cooper_4min30_script_v3.md")
checks = {}


def check(name: str, condition: bool):
    checks[name] = bool(condition)
    if not condition:
        raise RuntimeError(f"Story Gate audit failed: {name}")


check("lock_validated_revision", lock["lock_id"] == "SDL-db_cooper_1971_4m30_v3-r2")
check("script_sha256_matches_lock_and_source", sha(script_path) == sha(source_script_path) == lock["script_hash"])
check("scene_graph_sha256_matches_lock", sha(scene_path) == lock["scene_graph_hash"])
check("plan_matches_lock", plan["provenance"]["scriptDirectingLockSha256"] == sha(lock_path))
check("plan_script_scene_provenance", plan["provenance"]["scriptSha256"] == sha(script_path)
      and plan["provenance"]["sceneGraphSha256"] == sha(scene_path))
check("script_directing_qc_pass", all(lock[key] == "PASS" for key in (
    "script_qc_status", "directing_preflight_status", "visual_skeleton_status", "sequence_qc_status", "fact_status")))
check("no_unresolved_directing_revisions", lock["unresolved_revision_count"] == 0)
check("canonical_structure_approved", status["structureApproval"]["approvalState"] == "HUMAN_APPROVED")
check("canonical_7_scenes_approved", len(status["scenes"]) == 7 and all(
    scene["sceneStatus"] == "APPROVED" and not scene["stale"] and
    scene["approval"]["approvalState"] == "HUMAN_APPROVED" for scene in status["scenes"]))
check("canonical_1_chapter_7_sequences", len(status["chapters"]) == 1 and len(status["sequences"]) == 7)

conn = sqlite3.connect(f"file:{DB.as_posix()}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
scripts = [dict(row) for row in conn.execute(
    "SELECT id, revision, kind, body, lifecycle_status FROM scripts WHERE project_id = ? AND lifecycle_status = 'ACTIVE'",
    (lock["project_id"],))]
check("one_active_final_script", len(scripts) == 1 and scripts[0]["kind"] == "FINAL")
script = scripts[0]
check("canonical_script_body_matches_locked_source", script["body"] == script_path.read_text(encoding="utf-8"))
approvals = [dict(row) for row in conn.execute(
    "SELECT id, target_type, target_id, target_revision, approval_state, reason, approved_by_id "
    "FROM approval_records WHERE project_id = ? AND approval_state = 'HUMAN_APPROVED'",
    (lock["project_id"],))]
script_approvals = [row for row in approvals if row["target_type"] == "SCRIPT"
                    and row["target_id"] == script["id"] and row["target_revision"] == script["revision"]]
scene_approvals = [row for row in approvals if row["target_type"] == "SCENE"]
structure_approvals = [row for row in approvals if row["target_type"] == "STORY_STRUCTURE"]
check("canonical_final_script_approval", len(script_approvals) == 1 and
      script_approvals[0]["reason"] == "FINAL_SCRIPT_APPROVED")
check("canonical_structure_approval_record", len(structure_approvals) == 1 and
      structure_approvals[0]["id"] == status["structureApproval"]["id"])
check("canonical_scene_approval_records", len(scene_approvals) == 7 and
      {row["id"] for row in scene_approvals} == {scene["approval"]["id"] for scene in status["scenes"]})
check("manager_provenance", all(row["approved_by_id"] == "Agent1-user-directed-2026-10-09" for row in approvals))

status_sequences = {sequence["id"]: sequence for sequence in status["sequences"]}
canonical_order = sorted(status["scenes"], key=lambda scene: status_sequences[scene["sequenceId"]]["displayNumber"])
plan_scenes = plan["scenes"]["scenes"]
check("canonical_scene_order_and_script_segments", all(
    canonical["scriptSegment"] == planned["scriptSegment"] and
    canonical["scriptRef"]["scriptId"] == script["id"] and
    canonical["mustBeSeen"] == source["must_be_seen"]
    for canonical, planned, source in zip(canonical_order, plan_scenes, source_scenes["scenes"])))
check("nonrealistic_style_lock", source_scenes["style_mode"] == "NON_REALISTIC_STYLIZED")
conn.close()

report = {
    "project_id": lock["project_id"],
    "status": "PASS",
    "script_directing_lock": {"id": lock["lock_id"], "path": str(lock_path), "sha256": sha(lock_path)},
    "manager_story_gate": "PASS",
    "canonical_project_db": str(DB),
    "canonical_script": {"id": script["id"], "revision": script["revision"], "sha256": sha(script_path),
                         "approval_id": script_approvals[0]["id"]},
    "canonical_structure_approval_id": structure_approvals[0]["id"],
    "canonical_chapters": len(status["chapters"]),
    "canonical_sequences": len(status["sequences"]),
    "canonical_scenes": len(status["scenes"]),
    "scene_mapping": [
        {"source_scene_id": planned["key"], "canonical_scene_id": canonical["id"],
         "approval_id": canonical["approval"]["id"]}
        for planned, canonical in zip(plan_scenes, canonical_order)
    ],
    "checks": checks,
    "final_tts_status": "PENDING_IMMEDIATE_PRE_GENERATION_VALIDATION",
    "specialist_self_qc": lock["specialist_self_qc"],
    "agent1_override_scope": lock["agent1_override_scope"],
}
output = REVIEW / "manager-story-gate-v1.json"
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
prior_status = load(REVIEW / "gate-status-v6.json")
prior_status.update({
    "report_revision": "review-v7-script-directing-lock-and-canonical-story-gate",
    "development_state": "SCRIPT_DIRECTING_LOCKED_STORY_GATE_APPROVED",
    "script_directing_lock": lock["lock_id"],
    "manager_story_gate": "PASS_CANONICAL_PROJECT_DB",
    "manager_story_gate_report": str(output),
    "canonical_project_db": str(DB),
    "canonical_final_script_id": script["id"],
    "canonical_approved_scene_count": len(status["scenes"]),
    "final_tts_allowed": False,
    "final_tts_gate_status": "PENDING_IMMEDIATE_PRE_GENERATION_VALIDATION",
    "production_approved": False,
    "next_stage": "VALIDATE_FINAL_TTS_GATE_IMMEDIATELY_BEFORE_FINAL_SEGMENTED_TTS_AND_VISUAL_WORK",
})
(REVIEW / "gate-status-v7.json").write_text(
    json.dumps(prior_status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"PASS: Script Directing Lock + canonical Story Gate ({len(checks)} checks, 7 scenes)")
print(output)
