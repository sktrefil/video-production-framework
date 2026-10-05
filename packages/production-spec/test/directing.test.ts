import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  validateClipProductionSpecs, validateClipStateBindings, requiredImageStateIds, compileAgent3Prompts,
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

test("v2 rejects positive instructions to render readable labels, dates or maps", () => {
  for (const mutation of [
    (c:any) => { c.directing.reveal.en = "Display a readable site name label as the cave appears."; },
    (c:any) => { c.directing.start.en = "Show a map with site markers for the two locations."; },
    (c:any) => { c.directing.end.ko = "화면에 지명과 날짜를 읽히게 표시한다."; }
  ]) {
    const invalid = fixture();
    mutation(invalid.clips[0]);
    const checked = validateClipProductionSpecs(invalid, context);
    assert.ok(
      checked.errors.some(issue => issue.code === "DIRECTING_READABLE_TEXT_OR_MAP_FORBIDDEN")
    );
  }
});

test("all production fields reject positive text/map directives and allow negative constraints", () => {
  const positives = ["Display a readable site name label.", "Show a map with site markers.",
    "Typeset the date 40,000 BP.", "Render the location name on screen.",
    "화면에 지명과 날짜를 읽히게 표시한다.", "지도에 사이트 마커를 표시한다.",
    "Do not show labels, but show a map.", "Avoid captions; render the date."];
  const negatives = ["Do not display readable labels.", "No map or generated text.",
    "Avoid readable dates and captions.", "Never show a map.", "지명과 날짜를 표시하지 않는다."];
  for (const field of ["story", "action", "space", "start", "subject_motion", "camera_path", "reveal", "end", "handoff"] as const) {
    for (const language of ["en", "ko"] as const) for (const value of [...positives, ...negatives]) {
      const doc = fixture();
      doc.clips[0]!.directing![field][language] = value;
      const errors = validateClipProductionSpecs(doc, context).errors;
      assert.equal(errors.some(issue => issue.code === "DIRECTING_READABLE_TEXT_OR_MAP_FORBIDDEN"), positives.includes(value), field + ": " + value);
    }
  }
  const doc = fixture();
  doc.clips[0]!.directing!.risk.en = "Readable labels and maps are forbidden.";
  doc.clips[0]!.directing!.fallback.en = "Avoid dates and captions.";
  assert.equal(validateClipProductionSpecs(doc, context).valid, true);
});

test("SC02/SC06 stale provisional geography never enters v2 production prompts", () => {
  for (const sceneId of ["SC02", "SC06"]) {
    const clips = fixture();
    const clip = clips.clips[0]!;
    clip.scene_id = sceneId;
    clip.directing!.space.en = "Limestone cave and terrain separation, no map.";
    const states = {state_images: [clip.state_images.entry, clip.state_images.target].map(id => ({
      state_image_id: id, scene_id: sceneId, visual_goal: "Europe map with site markers",
      composition: "readable location name", subject_state: "Show the date", environment_state: "location comparison map"
    }))} as unknown as StateImageDocument;
    const before = structuredClone(states);
    const input = {projectId: clips.project_id, visualBibleSummary: "", sceneVisual: {scenes:[{scene_id:sceneId}]} as SceneVisualDocument, states, clips};
    const bundle = compileAgent3Prompts(input);
    for (const prompt of [...bundle.image_prompts, ...bundle.video_prompts]) {
      assert.doesNotMatch(prompt.provider_prompt_en, /Europe map|site marker|readable location name|Show the date/iu);
    }
    assert.deepEqual(states, before);
    assert.equal(bundle.video_prompts[0]!.target_state_image_id, clip.state_images.target);
    clip.directing!.reveal.en = "Show a map with site markers.";
    assert.throws(() => compileAgent3Prompts(input), /DIRECTING_READABLE_TEXT_OR_MAP_FORBIDDEN/);
  }
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


function boundaryFixture() {
  const clips = fixture();
  const first = clips.clips[0]!;
  first.directing!.transition_in = "FRESH_START";
  const next = structuredClone(first);
  next.clip_id = "CLIP_01B";
  next.state_images = { entry: "FRESH_START", mid: null, target: "FINAL" };
  next.directing!.timeline_start_sec = 5;
  next.directing!.timeline_end_sec = 10;
  next.directing!.start = { ko: "? ??? ?? ?? ??", en: "Independent start from the new angle." };
  clips.clips.push(next);
  const states = { state_images: [first.state_images.entry, first.state_images.target, "FRESH_START", "FINAL"].map((id, i) => ({
    state_image_id: id, scene_id: first.scene_id, sequence_order: i + 1,
    role: i === 0 ? "ENTRY" : i === 3 ? "TARGET" : "MID"
  })) } as StateImageDocument;
  const sceneVisual = { scenes: [{ scene_id: first.scene_id }] } as SceneVisualDocument;
  return { clips, states, sceneVisual, next, first };
}

test("v2 fresh cuts bind separate T050 MID STARTs and compile their own images", () => {
  for (const transition of ["STORY_CUT", "ANGLE_CHANGE", "FRESH_START"] as const) {
    for (const mode of ["START_ONLY", "START_END"] as const) {
      const x = boundaryFixture();
      x.next.directing!.transition_in = transition;
      x.next.directing!.image_mode = mode;
      assert.equal(validateClipStateBindings(x.clips, x.states).valid, true);
      const bundle = compileAgent3Prompts({ ...x, projectId: "roman_ix_001", visualBibleSummary: "" });
      const start = bundle.image_prompts.find(p => p.state_image_id === "FRESH_START")!;
      assert.match(start.provider_prompt_en, /Independent start from the new angle/);
      assert.equal(start.directing, x.next.directing);
      assert.equal(bundle.image_prompts.some(p => p.state_image_id === "FINAL"), mode === "START_END");
      assert.match(bundle.video_prompts[1]!.provider_prompt_en, /without inheriting/);
    }
  }
});

test("v2 continuation requires exact adjacent binding and actual previous frame mode", () => {
  const x = boundaryFixture();
  x.next.directing!.transition_in = "CONTINUATION";
  x.next.directing!.image_mode = "PREVIOUS_END_FRAME";
  x.next.directing!.previous_clip_id = x.first.clip_id;
  x.next.directing!.continuation = { ko: "?? ??? ?? ?? ??", en: "Maintain direction and action phase." };
  assert.ok(validateClipStateBindings(x.clips, x.states).errors.some(e => e.code === "WITHIN_SCENE_STATE_HANDOFF_MISMATCH"));
  assert.ok(validateClipProductionSpecs(x.clips).errors.some(e => e.code === "WITHIN_SCENE_STATE_HANDOFF_MISMATCH"));
  assert.throws(() => compileAgent3Prompts({ ...x, projectId: "roman_ix_001", visualBibleSummary: "" }), /WITHIN_SCENE_STATE_HANDOFF_MISMATCH/);
  x.next.state_images.entry = x.first.state_images.target;
  assert.equal(validateClipStateBindings(x.clips, x.states).valid, true);
  assert.deepEqual(requiredImageStateIds(x.clips), [x.first.state_images.entry]);
  const bundle = compileAgent3Prompts({ ...x, projectId: "roman_ix_001", visualBibleSummary: "" });
  assert.match(bundle.video_prompts[1]!.provider_prompt_en, /actual used-range end frame/);
  x.next.directing!.previous_clip_id = "NOT_ADJACENT";
  assert.ok(validateClipStateBindings(x.clips, x.states).errors.some(e => e.code === "PREVIOUS_CLIP_INVALID"));
  x.next.directing!.previous_clip_id = x.first.clip_id;
  x.first.scene_id = "OTHER_SCENE";
  assert.ok(validateClipStateBindings(x.clips, x.states).errors.some(e => e.code === "PREVIOUS_CLIP_INVALID"));
  x.clips.clips = [x.next];
  assert.ok(validateClipStateBindings(x.clips, x.states).errors.some(e => e.code === "PREVIOUS_CLIP_INVALID"));
});

test("invalid modes, absent states, reversed fresh order and legacy discontinuity fail closed", () => {
  for (const mutate of [
    (x: ReturnType<typeof boundaryFixture>) => { x.next.directing!.image_mode = "PREVIOUS_END_FRAME"; },
    (x: ReturnType<typeof boundaryFixture>) => { x.next.directing!.transition_in = "CONTINUATION"; },
    (x: ReturnType<typeof boundaryFixture>) => { x.next.state_images.entry = "UNKNOWN"; },
    (x: ReturnType<typeof boundaryFixture>) => { x.states.state_images[2]!.sequence_order = 1; },
    (x: ReturnType<typeof boundaryFixture>) => { delete x.next.directing!.transition_in; },
    (x: ReturnType<typeof boundaryFixture>) => { delete x.next.directing; }
  ]) {
    const x = boundaryFixture(); mutate(x);
    assert.equal(validateClipStateBindings(x.clips, x.states).valid, false);
  }
  const x = boundaryFixture();
  x.next.state_images.entry = x.first.state_images.target;
  delete x.next.directing!.transition_in;
  assert.equal(validateClipStateBindings(x.clips, x.states).valid, true, "persisted v2 retains exact chaining");
  delete x.first.directing; delete x.next.directing;
  assert.equal(validateClipStateBindings(x.clips, x.states).valid, true, "legacy chain remains valid");
});
