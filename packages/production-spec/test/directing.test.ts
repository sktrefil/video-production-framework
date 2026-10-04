import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  validateClipProductionSpecs, requiredImageStateIds, compileAgent3Prompts,
  validatePromptBundle, validateDirectingVideoReview, DIRECTING_VIDEO_CHECKS,
  type ClipProductionDocument, type DirectingVideoReview, type SceneVisualDocument, type StateImageDocument
} from "../src/index.js";

const fixture = (): ClipProductionDocument => JSON.parse(readFileSync(new URL("../../../examples/production-spec/roman_ix_001/clip_production_spec.json", import.meta.url), "utf8"));
const context = { requireDirecting: true, sceneTimings: [{scene_id:"SCENE_01", tts:{start_sec:0,end_sec:5,duration_sec:5}}] };

test("v2 distinguishes measured timeline, source trim, generation length and early reveal", () => {
  const doc = fixture();
  assert.equal(validateClipProductionSpecs(doc, context).valid, true);
  assert.equal(doc.clips[0]!.directing!.source_in_sec, 1);
  assert.equal(doc.clips[0]!.generation_provider, "GEMINI");
  assert.equal(doc.clips[0]!.generation_model, "GEMINI_I2V_10S");
  assert.equal(doc.clips[0]!.generation_duration_sec, 10);
  for (const change of [
    (c:any) => { c.directing.reveal_deadline_sec = 4.1; },
    (c:any) => { c.directing.source_out_sec = 11; },
    (c:any) => { c.directing.timeline_start_sec = 1; c.directing.timeline_end_sec = 6; },
    (c:any) => { c.directing.camera_path.en = ""; },
    (c:any) => { c.camera.movement = "STATIC_HOLD"; },
    (c:any) => { c.start_handle_sec = .4; },
    (c:any) => { c.directing.precision_physics_required = true; },
    (c:any) => { delete c.directing; }
  ]) {
    const invalid = fixture(); change(invalid.clips[0]);
    assert.equal(validateClipProductionSpecs(invalid, context).valid, false);
  }
  const legacy = fixture(); delete legacy.clips[0]!.directing;
  assert.equal(validateClipProductionSpecs(legacy).valid, true);
});

test("START_END selects a Flow-capable target instead of direct Gemini", () => {
  const gemini = fixture();
  gemini.clips[0]!.directing!.image_mode = "START_END";
  assert.ok(validateClipProductionSpecs(gemini, {
    ...context,
    requireGenerationTarget: true
  }).errors.some(issue => issue.code === "UNSUPPORTED_GENERATION_IMAGE_MODE"));

  const flow = fixture();
  flow.clips[0]!.directing!.image_mode = "START_END";
  flow.clips[0]!.generation_provider = "GOOGLE_FLOW";
  flow.clips[0]!.generation_model = "VEO_3_1_FAST";
  flow.clips[0]!.generation_duration_sec = 6;
  assert.equal(validateClipProductionSpecs(flow, {
    ...context,
    requireGenerationTarget: true
  }).valid, true);
});

test("end state design survives START_ONLY without requiring an end image file", () => {
  const doc = fixture();
  assert.deepEqual(requiredImageStateIds(doc), ["IMG_01_01"]);
  doc.clips[0]!.directing!.image_mode = "START_END";
  assert.deepEqual(requiredImageStateIds(doc), ["IMG_01_01", "IMG_01_02"]);
  doc.clips[0]!.directing!.image_mode = "PREVIOUS_END_FRAME";
  assert.equal(validateClipProductionSpecs(doc, context).valid, false, "cannot invent a previous adopted clip");
});

test("v2 compiles concise parallel-language direction and planned image coverage", () => {
  const clips = fixture();
  const sceneVisual = {scenes:[{scene_id:"SCENE_01"}]} as SceneVisualDocument;
  const states = {state_images:[{scene_id:"SCENE_01",state_image_id:"IMG_01_01"},{scene_id:"SCENE_01",state_image_id:"IMG_01_02"}]} as StateImageDocument;
  const bundle = compileAgent3Prompts({projectId:"roman_ix_001",visualBibleSummary:"",sceneVisual,states,clips});
  assert.equal(bundle.compiler_version, "DIRECTING_PROMPT_COMPILER_V2");
  assert.equal(bundle.image_prompts.length, 1);
  assert.equal(bundle.video_prompts[0]!.target_state_image_id, "IMG_01_02");
  assert.equal(bundle.video_prompts[0]!.generation_provider, "GEMINI");
  assert.equal(bundle.video_prompts[0]!.generation_model, "GEMINI_I2V_10S");
  assert.equal(bundle.video_prompts[0]!.generation_duration_sec, 10);
  assert.match(bundle.video_prompts[0]!.provider_prompt_en, /Within 3s.*source 1s/);
  assert.ok(bundle.video_prompts[0]!.prompt_ko.includes(clips.clips[0]!.directing!.camera_path.ko));
  assert.doesNotMatch(bundle.image_prompts[0]!.provider_prompt_en, /Global visual grammar|Narrative grammar|STORY/);
  assert.equal(validatePromptBundle(bundle,{stateImageIds:requiredImageStateIds(clips),clipIds:["CLIP_01A"]}).valid,true);
});

test("actual video QC rejects stale footage, late reveals and critical NA despite a claimed pass", () => {
  const card=fixture().clips[0]!.directing!;
  const expected={clipId:"CLIP_01A",clipSha256:"a".repeat(64),directingSha256:"b".repeat(64),card};
  const good:DirectingVideoReview={clip_id:expected.clipId,clip_sha256:expected.clipSha256,directing_sha256:expected.directingSha256,
    reviewed_by:"AGENT1_MANAGER",reviewed_at:"2026-09-27T12:00:00Z",observed_reveal_sec:2.9,observed_motion_start_sec:0,
    checks:Object.fromEntries(DIRECTING_VIDEO_CHECKS.map(key=>[key,{status:"PASS",evidence:"Observed at source 1–6 sec; the rock clears the bend at source 3.9 sec."}])) as DirectingVideoReview["checks"]};
  assert.deepEqual(validateDirectingVideoReview(good,expected),[]);
  assert.ok(validateDirectingVideoReview({...good,clip_sha256:"stale"},expected).length);
  assert.ok(validateDirectingVideoReview({...good,observed_reveal_sec:4},expected).length);
  assert.ok(validateDirectingVideoReview({...good,observed_motion_start_sec:1},expected).length);
  good.checks.camera_path.status="NA";
  assert.ok(validateDirectingVideoReview(good,expected).length);
});
