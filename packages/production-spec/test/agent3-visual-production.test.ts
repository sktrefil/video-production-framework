import assert from "node:assert/strict";
import test from "node:test";
import {
  compileAgent3Prompts,
  validateClipStateBindings,
  validatePromptBundle,
  validateSceneVisualDocument,
  validateStateImageDocument,
  validateStateSceneBindings,
  type ClipProductionDocument,
  type SceneVisualDocument,
  type StateImageDocument
} from "../src/index.js";

const visual: SceneVisualDocument = {
  schema_version: "1.0",
  project_id: "p1",
  visual_bible: {
    resource_id: "HISTORY_MYSTERY_VISUAL_BIBLE",
    version: "1.2.0",
    content_hash: "sha256:" + "a".repeat(64)
  },
  scenes: [{
    scene_id: "SCENE_01",
    story_role: "HOOK",
    factuality_mode: "HISTORICAL_RECONSTRUCTION",
    fact_refs: [],
    narrative_purpose_ko: "기록이 끊기는 미스터리를 제기한다.",
    narrative_purpose_en: "",
    visual_intent_ko: "실종 자체가 아니라 마지막으로 확인되는 기록의 분위기를 보여준다.",
    visual_intent_en: "Show the last traceable record rather than a literal disappearance.",
    environment_ko: "고대 요새의 흐린 새벽",
    environment_en: "A Roman fort at overcast dawn",
    subject_ko: "멀리 이동하는 군단",
    subject_en: "A distant marching legion",
    action_ko: "행렬이 안개 속으로 점차 가려진다.",
    action_en: "The column becomes gradually obscured by weather.",
    evidence_constraints: [],
    uncertainty_handling_ko: "직접적인 소멸 장면은 만들지 않는다.",
    uncertainty_handling_en: "Do not depict a literal disappearance.",
    forbidden_visual_claims: ["magical disappearance"],
    continuity: {
      character_identity: [],
      environment_identity: ["stone fort", "ravine"],
      lighting_direction: "soft side light",
      color_language: "cool storm blue with restrained earth tones",
      weather: "rain mist",
      movement_direction: "forward into depth",
      screen_direction: "LEFT_TO_RIGHT",
      camera_energy: "RESTRAINED",
      visual_motif: ["mist", "stone"]
    },
    handoff: {
      entry_anchor: "marching line",
      exit_anchor: "dense mist",
      preserve_elements: ["screen direction", "mist", "stone geometry"],
      next_cut_intent: "allow the next shot to inherit the fog axis"
    }
  }]
};

const states: StateImageDocument = {
  schema_version: "1.0",
  project_id: "p1",
  state_images: [
    {
      state_image_id: "IMG_01_ENTRY",
      scene_id: "SCENE_01",
      beat_id: "BEAT_01",
      role: "ENTRY",
      sequence_order: 1,
      visual_goal_ko: "행렬이 아직 명확히 보인다.",
      visual_goal_en: "The marching column remains readable.",
      composition_ko: "중경 행렬과 전경 암석, 원경 안개",
      composition_en: "Foreground rock, midground column, distant mist",
      subject_state_ko: "규율 있게 전진하는 병사들",
      subject_state_en: "A disciplined distant column",
      environment_state_ko: "비에 젖은 협곡",
      environment_state_en: "Rain-soaked ravine",
      motion_vector_ko: "화면 왼쪽에서 오른쪽 깊이 방향",
      motion_vector_en: "Left-to-right movement into depth",
      handoff_anchor: "marching line",
      continuity_refs: ["screen direction", "mist density"],
      factual_constraints: [],
      avoidances: ["readable inscription", "magic effect"]
    },
    {
      state_image_id: "IMG_01_TARGET",
      scene_id: "SCENE_01",
      beat_id: "BEAT_01",
      role: "TARGET",
      sequence_order: 2,
      visual_goal_ko: "행렬이 날씨에 가려지지만 소멸하지 않는다.",
      visual_goal_en: "Weather obscures the column without a disappearance event.",
      composition_ko: "동일 축에서 안개가 더 짙어진 상태",
      composition_en: "Same axis with denser mist",
      subject_state_ko: "희미하게 남아 있는 행렬 실루엣",
      subject_state_en: "Faint remaining column silhouettes",
      environment_state_ko: "짙어진 비안개",
      environment_state_en: "Thickened rain mist",
      motion_vector_ko: "같은 진행 방향 유지",
      motion_vector_en: "Preserve the same travel direction",
      handoff_anchor: "dense mist",
      continuity_refs: ["screen direction", "stone geometry"],
      factual_constraints: [],
      avoidances: ["teleportation", "magic effect"]
    }
  ]
};

const clips: ClipProductionDocument = {
  schema_version: "1.0",
  project_id: "p1",
  clips: [{
    scene_id: "SCENE_01",
    clip_id: "CLIP_01",
    editorial_duration_sec: 4,
    generation_duration_sec: null,
    mandatory_core_points: [{
      id: "CP_01",
      description_ko: "행렬이 안개에 가려진다.",
      description_en: "The column becomes obscured by mist.",
      window_start_sec: 0.4,
      window_end_sec: 2
    }],
    narrative_deadline_sec: 2.6,
    target_state_deadline_sec: 3.2,
    start_handle_sec: 0.2,
    end_hold_sec: 0.8,
    safe_trim_start_sec: 4,
    camera: {
      purpose: "LOSE_SIGHT",
      movement: "LATERAL_TRACK",
      shot_size_start: "WIDE",
      shot_size_end: "WIDE",
      movement_curve: "HOLD_MOVE_SETTLE"
    },
    state_images: {
      entry: "IMG_01_ENTRY",
      mid: null,
      target: "IMG_01_TARGET"
    },
    transition_in: "HARD_CUT",
    transition_out: "ENVIRONMENT_OCCLUSION"
  }]
};

test("Agent3 visual, state and clip-state contracts validate", () => {
  const visualResult = validateSceneVisualDocument(visual, {
    projectId: "p1",
    sceneIds: ["SCENE_01"],
    storyRoles: new Map([["SCENE_01", "HOOK"]]),
    visualBible: visual.visual_bible
  });
  assert.equal(visualResult.valid, true);

  const stateResult = validateStateImageDocument(states, {
    projectId: "p1",
    sceneIds: ["SCENE_01"],
    beatIdsByScene: new Map([["SCENE_01", ["BEAT_01"]]])
  });
  assert.equal(stateResult.valid, true);

  const stateBinding = validateStateSceneBindings(states, visual);
  assert.equal(stateBinding.valid, true);

  const binding = validateClipStateBindings(clips, states);
  assert.equal(binding.valid, true);
});

test("Agent3 prompt compiler preserves clip timing and state references", () => {
  const prompts = compileAgent3Prompts({
    projectId: "p1",
    visualBibleSummary: "Evidence-led cinematic historical reconstruction.",
    sceneVisual: visual,
    states,
    clips
  });

  const checked = validatePromptBundle(prompts, {
    projectId: "p1",
    stateImageIds: states.state_images.map(item => item.state_image_id),
    clipIds: clips.clips.map(item => item.clip_id)
  });
  assert.equal(checked.valid, true);
  assert.equal(prompts.video_prompts[0]?.entry_state_image_id, "IMG_01_ENTRY");
  assert.equal(prompts.video_prompts[0]?.target_state_image_id, "IMG_01_TARGET");
  assert.equal(prompts.video_prompts[0]?.narrative_deadline_sec, 2.6);
  assert.equal(prompts.video_prompts[0]?.safe_trim_start_sec, 4);
  assert.match(prompts.video_prompts[0]?.provider_prompt_en ?? "", /safe disposable continuation/);
  assert.match(prompts.image_prompts[0]?.negative_prompt_en ?? "", /readable generated text/);
});

test("Agent3 state validation rejects missing TARGET state", () => {
  const invalid = {
    ...states,
    state_images: states.state_images.filter(item => item.role !== "TARGET")
  };
  const checked = validateStateImageDocument(invalid, {
    projectId: "p1",
    sceneIds: ["SCENE_01"],
    beatIdsByScene: new Map([["SCENE_01", ["BEAT_01"]]])
  });
  assert.equal(checked.valid, false);
  assert.ok(checked.errors.some(issue => issue.code === "TARGET_STATE_COUNT_INVALID"));
});


test("Agent3 rejects a TARGET state that breaks the Scene exit handoff anchor", () => {
  const invalid = structuredClone(states);
  invalid.state_images[1]!.handoff_anchor = "different anchor";
  const checked = validateStateSceneBindings(invalid, visual);
  assert.equal(checked.valid, false);
  assert.ok(checked.errors.some(issue => issue.code === "TARGET_HANDOFF_ANCHOR_MISMATCH"));
});

test("Agent3 warns on three repeated shot patterns and blocks four", () => {
  const repeated = structuredClone(clips);
  repeated.clips = Array.from({ length: 4 }, (_, index) => ({
    ...structuredClone(clips.clips[0]!),
    clip_id: "CLIP_" + String(index + 1).padStart(2, "0")
  }));
  const checked = validateClipStateBindings(repeated, states);
  assert.equal(checked.valid, false);
  assert.ok(checked.warnings.some(issue => issue.code === "REPEATED_SHOT_SIZE"));
  assert.ok(checked.errors.some(issue => issue.code === "SHOT_SIZE_RHYTHM_REPETITION"));
});
