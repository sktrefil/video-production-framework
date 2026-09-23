import assert from "node:assert/strict";
import test from "node:test";
import type { ClipProductionSpec } from "../src/clip-production-spec.js";
import { maxCorePointsForDuration, validateClipProductionSpec, validateClipProductionSpecs } from "../src/clip-production-validator.js";
import { validateGenerationReady } from "../src/generation-ready-validator.js";

function clip(): ClipProductionSpec {
  return {
    scene_id: "SCENE_04", clip_id: "CLIP_04A", editorial_duration_sec: 5,
    generation_duration_sec: null,
    mandatory_core_points: [
      { id: "CP01", description_ko: "군단이 보인다", description_en: "The legion is visible.", window_start_sec: 0.4, window_end_sec: 1.8 },
      { id: "CP02", description_ko: "건설이 보인다", description_en: "Construction is visible.", window_start_sec: 1.8, window_end_sec: 3.6 }
    ],
    narrative_deadline_sec: 4, target_state_deadline_sec: 4.3,
    start_handle_sec: 0.4, end_hold_sec: 0.7, safe_trim_start_sec: 5,
    camera: { purpose: "DISCOVER", movement: "LATERAL_TRACK_WITH_SUBTLE_PUSH", shot_size_start: "WIDE", shot_size_end: "MEDIUM_WIDE", movement_curve: "HOLD_MOVE_SETTLE" },
    state_images: { entry: "IMG_04_01", mid: null, target: "IMG_04_02" },
    transition_in: "HARD_CUT", transition_out: "MATCH_CUT", ready_for_generation: false
  };
}

test("five second clip with two points is ready independent of caller's false flag", () => {
  const input = clip();
  const before = structuredClone(input);
  assert.deepEqual(validateClipProductionSpec(input, { sceneIds: ["SCENE_04"] }), {
    valid: true, ready_for_generation: true, errors: [], warnings: []
  });
  assert.deepEqual(input, before);
});

test("generation duration never expands the editorial narrative budget", () => {
  const input = { ...clip(), generation_duration_sec: 10 };
  assert.equal(validateClipProductionSpec(input).valid, true);
  input.mandatory_core_points[1]!.window_end_sec = 7;
  assert.ok(validateClipProductionSpec(input).errors.some(issue => issue.code === "CORE_POINT_OUTSIDE_EDITORIAL_DURATION"));
});

test("duration policy assigns conservative inclusive boundaries", () => {
  for (const [duration, maximum] of [[0, 0], [0.1, 1], [3, 1], [3.01, 2], [5, 2], [5.01, 3], [8, 3], [10, 3], [10.01, 0], [Infinity, 0], [NaN, 0]]) {
    assert.equal(maxCorePointsForDuration(duration!), maximum);
  }
});

const invalidCases: { name: string; code: string; change: (input: any) => void }[] = [
  { name: "4.5 second clip overloaded by three core points", code: "CORE_POINT_OVERLOAD", change: input => {
    input.editorial_duration_sec = 4.5;
    input.mandatory_core_points.push({ ...input.mandatory_core_points[1], id: "CP03" });
  } },
  { name: "narrative deadline beyond editorial duration", code: "NARRATIVE_DEADLINE_OUT_OF_RANGE", change: input => { input.narrative_deadline_sec = 5.1; } },
  { name: "narrative deadline equals editorial duration", code: "NARRATIVE_DEADLINE_OUT_OF_RANGE", change: input => { input.narrative_deadline_sec = 5; } },
  { name: "target deadline equals editorial duration", code: "TARGET_STATE_DEADLINE_OUT_OF_RANGE", change: input => { input.target_state_deadline_sec = 5; } },
  { name: "camera purpose absent", code: "MISSING_CAMERA_FIELD", change: input => { delete input.camera.purpose; } },
  { name: "camera movement absent", code: "MISSING_CAMERA_FIELD", change: input => { delete input.camera.movement; } },
  { name: "camera movement curve absent", code: "MISSING_CAMERA_FIELD", change: input => { delete input.camera.movement_curve; } },
  { name: "unsupported camera enum", code: "INVALID_CAMERA_FIELD", change: input => { input.camera.purpose = "DYNAMIC"; } },
  { name: "target image absent", code: "MISSING_STATE_IMAGE", change: input => { delete input.state_images.target; } },
  { name: "entry image absent", code: "MISSING_STATE_IMAGE", change: input => { delete input.state_images.entry; } },
  { name: "core point window exceeds editorial end", code: "CORE_POINT_OUTSIDE_EDITORIAL_DURATION", change: input => {
    input.mandatory_core_points[1].window_start_sec = 4;
    input.mandatory_core_points[1].window_end_sec = 5.5;
  } },
  { name: "core point finishes after narrative deadline", code: "CORE_POINT_AFTER_NARRATIVE_DEADLINE", change: input => { input.mandatory_core_points[1].window_end_sec = 4.1; } },
  { name: "overlapping core point windows", code: "CORE_POINT_WINDOW_OVERLAP", change: input => { input.mandatory_core_points[1].window_start_sec = 1.7; } },
  { name: "zero length window", code: "INVALID_CORE_POINT_WINDOW", change: input => { input.mandatory_core_points[1].window_end_sec = 1.8; } },
  { name: "negative timing", code: "NEGATIVE_TIMING", change: input => { input.start_handle_sec = -0.1; } },
  { name: "nonfinite timing", code: "MISSING_OR_INVALID_TIMING", change: input => { input.narrative_deadline_sec = Infinity; } },
  { name: "missing editorial duration", code: "MISSING_OR_INVALID_TIMING", change: input => { delete input.editorial_duration_sec; } },
  { name: "missing core points", code: "MISSING_MANDATORY_CORE_POINT", change: input => { input.mandatory_core_points = []; } },
  { name: "duplicate core point identity", code: "DUPLICATE_CORE_POINT_ID", change: input => { input.mandatory_core_points[1].id = "CP01"; } },
  { name: "missing core point description", code: "MISSING_CORE_POINT_DESCRIPTION", change: input => { input.mandatory_core_points[1].description_ko = " "; input.mandatory_core_points[1].description_en = ""; } },
  { name: "unsafe trim", code: "UNSAFE_TRIM_START", change: input => { input.safe_trim_start_sec = 4.9; } },
  { name: "short provider footage", code: "GENERATION_DURATION_TOO_SHORT", change: input => { input.generation_duration_sec = 4; } },
  { name: "target state precedes narrative deadline", code: "INVALID_DEADLINE_ORDER", change: input => { input.target_state_deadline_sec = 3.8; } },
  { name: "hold begins before target state", code: "END_HOLD_OVERLAPS_TARGET_STATE", change: input => { input.end_hold_sec = 1; } },
  { name: "core point appears during handle", code: "CORE_POINT_OVERLAPS_START_HANDLE", change: input => { input.mandatory_core_points[0].window_start_sec = 0.2; } },
  { name: "over ten seconds requires splitting", code: "CLIP_SPLIT_REQUIRED", change: input => { input.editorial_duration_sec = 10.1; input.safe_trim_start_sec = 10.1; } }
];

for (const item of invalidCases) {
  test(item.name, () => {
    const input = clip();
    item.change(input);
    input.ready_for_generation = true;
    const checked = validateClipProductionSpec(input);
    assert.equal(checked.valid, false);
    assert.equal(checked.ready_for_generation, false);
    assert.ok(checked.errors.some(issue => issue.code === item.code), JSON.stringify(checked));
  });
}

test("arbitrary JSON fails structurally without throwing", () => {
  for (const input of [null, [], 3, "ready", {}, { camera: [], state_images: [], mandatory_core_points: [null] }]) {
    assert.equal(validateClipProductionSpec(input).ready_for_generation, false);
  }
});

test("batch checks actual TTS rather than the estimated duration and supports clip splitting", () => {
  const first = clip();
  const second = { ...clip(), clip_id: "CLIP_04B", state_images: { entry: "IMG_04_02", mid: null, target: "IMG_04_03" } };
  const context = { sceneTimings: [{ scene_id: "SCENE_04", estimated_duration_sec: 5, tts: { duration_sec: 10 } }] };
  assert.equal(validateGenerationReady([first, second], context).ready_for_generation, true);
  assert.ok(validateGenerationReady([first], context).errors.some(issue => issue.code === "CLIP_TTS_DURATION_MISMATCH"));
  assert.ok(validateGenerationReady([first], { sceneTimings: [{ scene_id: "SCENE_04", tts: null }] }).errors.some(issue => issue.code === "ACTUAL_TTS_REQUIRED"));
});

test("batch rejects empty, duplicate, unknown-scene, and missing-scene plans", () => {
  assert.equal(validateGenerationReady([]).ready_for_generation, false);
  assert.ok(validateClipProductionSpecs([clip(), clip()]).errors.some(issue => issue.code === "DUPLICATE_CLIP_ID"));
  assert.ok(validateClipProductionSpecs([clip()], { sceneIds: ["SCENE_OTHER"] }).errors.some(issue => issue.code === "INVALID_SCENE_CLIP_RELATION"));
  assert.ok(validateClipProductionSpecs([clip()], { sceneTimings: [
    { scene_id: "SCENE_04", tts: { duration_sec: 5 } }, { scene_id: "SCENE_05", tts: { duration_sec: 5 } }
  ] }).errors.some(issue => issue.code === "SCENE_CLIP_REQUIRED"));
});

test("clip document validates envelope and ignores spoofed readiness", () => {
  const document = { schema_version: "1.0", project_id: "project", clips: [clip()], ready_for_generation: true };
  assert.equal(validateGenerationReady(document).ready_for_generation, true);
  assert.equal(validateGenerationReady({ ...document, schema_version: "2.0" }).ready_for_generation, false);
  assert.equal(validateGenerationReady({ ...document, project_id: "" }).ready_for_generation, false);
  assert.equal(validateGenerationReady({ ...document, clips: [{ ready_for_generation: true }] }).ready_for_generation, false);
});
