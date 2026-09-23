import assert from "node:assert/strict";
import test from "node:test";
import { createProjectSpec } from "../src/project-spec.js";
import { validateProjectSpec } from "../src/project-validator.js";
import { actualSceneDuration, createSceneTimingDocument, type SceneTimingSpec } from "../src/scene-timing-spec.js";
import { validateSceneTimingSpec, validateSceneTimingDocument } from "../src/scene-timing-validator.js";

function scene(): SceneTimingSpec {
  return {
    scene_id: "SCENE_01", script_ko: "군단이 사라졌을까요?", script_en: "", story_role: "HOOK",
    narrative_purpose_ko: "의문을 제기한다.", narrative_purpose_en: "",
    estimated_duration_sec: 4.8,
    tts: { start_sec: 0, end_sec: 4.6, duration_sec: 4.6 },
    beats: [{ beat_id: "BEAT_01", purpose_ko: "의문 제기", purpose_en: "", start_sec: 0, end_sec: 4.6 }]
  };
}

test("SHORTS defaults and LONGFORM delivery resolution remain separate from format", () => {
  const shorts = createProjectSpec({ project_id: "phase1_shorts", format: "SHORTS", target_duration_sec: 60 });
  assert.deepEqual(shorts.resolution, { width: 1080, height: 1920 });
  assert.equal(shorts.generation_policy.video_engine, "UNDECIDED");
  assert.equal(validateProjectSpec(shorts).valid, true);
  assert.equal(validateProjectSpec(shorts).ready_for_generation, false);
  const longform = createProjectSpec({ project_id: "phase1_longform", format: "LONGFORM", target_duration_sec: 600 });
  assert.deepEqual(longform.resolution, { width: 1920, height: 1080 });
  assert.equal(validateProjectSpec(longform).valid, true);
  longform.resolution = { width: 1080, height: 1920 };
  assert.ok(validateProjectSpec(longform).errors.some(e => e.code === "INVALID_LONGFORM_RESOLUTION"));
});

test("invalid project inputs and disabled manager gates fail without throwing", () => {
  for (const value of [null, [], "project", 7, {}]) assert.equal(validateProjectSpec(value).valid, false);
  const project = createProjectSpec({ project_id: "phase1", format: "SHORTS", target_duration_sec: 60 });
  assert.equal(validateProjectSpec({ ...project, format: "SHORTFORM" }).valid, false);
  assert.equal(validateProjectSpec({ ...project, target_duration_sec: Infinity }).valid, false);
  assert.equal(validateProjectSpec({ ...project, project_id: "../outside" }).valid, false);
  const disabled = { ...project, workflow: { ...project.workflow, agent1_manager_required: false } };
  assert.ok(validateProjectSpec(disabled).errors.some(e => e.code === "REQUIRED_GATE_DISABLED"));
  project.generation_policy.video_engine = "UNKNOWN_PROVIDER";
  assert.ok(validateProjectSpec(project).errors.some(e => e.code === "INVALID_VIDEO_ENGINE"));
});

test("actual TTS duration drives clip planning while preserving estimate", () => {
  const value = scene();
  assert.equal(validateSceneTimingSpec(value).valid, true);
  assert.equal(actualSceneDuration(value), 4.6);
  assert.equal(value.estimated_duration_sec, 4.8);
  value.tts = null;
  assert.equal(actualSceneDuration(value), null);
  assert.ok(validateSceneTimingSpec(value).errors.some(e => e.code === "ACTUAL_TTS_REQUIRED"));
  const draft = validateSceneTimingSpec(value, { requireActualTts: false });
  assert.equal(draft.valid, true);
  assert.equal(draft.ready_for_generation, false);
  assert.equal(draft.warnings[0]?.code, "ACTUAL_TTS_REQUIRED");
});

test("TTS inconsistencies, non-finite values, and invalid roles block story validation", () => {
  const value = scene();
  value.tts = { start_sec: 0, end_sec: 4.6, duration_sec: 8 };
  assert.equal(actualSceneDuration(value), null);
  assert.ok(validateSceneTimingSpec(value).errors.some(e => e.code === "TTS_DURATION_MISMATCH"));
  assert.equal(validateSceneTimingSpec({ ...scene(), story_role: "UNKNOWN" }).valid, false);
  for (const duration of [-1, NaN, Infinity, 0]) {
    assert.equal(validateSceneTimingSpec({ ...scene(), estimated_duration_sec: duration }).valid, false);
    assert.equal(validateSceneTimingSpec({ ...scene(), tts: { start_sec: 0, end_sec: 4.6, duration_sec: duration } }).valid, false);
  }
});

test("beats must remain ordered within the actual global TTS interval", () => {
  const value = scene();
  value.tts = { start_sec: 10, end_sec: 14.6, duration_sec: 4.6 };
  value.beats[0]!.start_sec = 10;
  value.beats[0]!.end_sec = 14.6;
  assert.equal(validateSceneTimingSpec(value).valid, true);
  value.beats[0]!.start_sec = 0;
  assert.ok(validateSceneTimingSpec(value).errors.some(e => e.code === "BEAT_OUTSIDE_TTS"));
  const overlapping = scene();
  overlapping.beats.push({ ...overlapping.beats[0]!, beat_id: "BEAT_02", start_sec: 2 });
  assert.ok(validateSceneTimingSpec(overlapping).errors.some(e => e.code === "BEAT_TIMING_OVERLAP"));
  overlapping.beats[1]!.beat_id = "BEAT_01";
  assert.ok(validateSceneTimingSpec(overlapping).errors.some(e => e.code === "DUPLICATE_BEAT_ID"));
});

test("scene documents preserve input and reject duplicate scenes and overlapping audio", () => {
  const source = scene();
  const doc = createSceneTimingDocument("phase1", [source]);
  assert.equal(validateSceneTimingDocument(doc).valid, true);
  source.script_ko = "changed";
  assert.notEqual(doc.scenes[0]!.script_ko, source.script_ko);
  doc.scenes.push(scene());
  const result = validateSceneTimingDocument(doc);
  assert.ok(result.errors.some(e => e.code === "DUPLICATE_SCENE_ID"));
  assert.ok(result.errors.some(e => e.code === "SCENE_TTS_OVERLAP"));
  assert.equal(result.ready_for_generation, false);
});

test("provenance hashes and revisions are validated when supplied", () => {
  const value = scene();
  value.provenance = { script_id: "script1", script_revision: 1, scene_revision: 1, script_sha256: "a".repeat(64) };
  assert.equal(validateSceneTimingSpec(value).valid, true);
  value.provenance.script_revision = 0;
  value.provenance.script_sha256 = "not-a-hash";
  assert.equal(validateSceneTimingSpec(value).valid, false);
});
