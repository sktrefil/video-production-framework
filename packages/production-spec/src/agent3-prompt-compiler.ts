import type {
  CameraMovement,
  CameraPurpose,
  MovementCurve,
  ShotSize
} from "./enums.js";
import type { ClipProductionDocument } from "./clip-production-spec.js";
import type {
  ImagePromptPlan,
  PromptBundleDocument,
  SceneVisualDocument,
  StateImageDocument,
  VideoPromptPlan
} from "./agent3-types.js";

function sentence(parts: string[]): string {
  return parts.map(part => part.trim()).filter(Boolean).join(" ");
}

export const GLOBAL_VISUAL_GRAMMAR_EN = [
  "Composition grammar: use cinematic editorial framing with layered depth, generous negative space, restrained subject scale, and clear foreground/midground/background separation.",
  "Narrative grammar: let terrain, traces, silhouettes, weather, light and spatial relationships carry the story instead of explanatory graphics or repeated hero compositions.",
  "Mystery closure grammar: allow ambiguity and partial resolution to coexist; prefer symbolic environmental synthesis over literal spectacle.",
  "Reference policy: these are text-only visual rules. Do not imitate, reconstruct, or reuse the composition of any reference image; each state must be composed from its own approved script and Scene/State intent."
].join(" ");

export const GLOBAL_VISUAL_GRAMMAR_KO = [
  "구도 문법: 시네마틱 편집 구도, 여러 깊이층, 충분한 여백, 절제된 피사체 크기, 전경·중경·배경의 명확한 분리를 사용한다.",
  "서사 문법: 설명용 그래픽이나 반복되는 대표 구도 대신 지형, 흔적, 실루엣, 날씨, 빛, 공간 관계로 이야기를 전달한다.",
  "미스터리 종결 문법: 불확실성과 부분적 결론이 동시에 남도록 하며, 과도한 장관보다 상징적인 환경 종합을 우선한다.",
  "레퍼런스 정책: 이것은 텍스트 시각 규칙이며 어떤 레퍼런스 이미지의 구도도 복제하거나 재구성하지 않는다. 각 상태 이미지는 해당 대본과 승인된 Scene/State 의도에서 새로 구성한다."
].join(" ");

function cameraPhrase(camera: {
  purpose: CameraPurpose;
  movement: CameraMovement;
  shot_size_start: ShotSize;
  shot_size_end: ShotSize;
  movement_curve: MovementCurve;
}): string {
  return "Camera purpose " + camera.purpose +
    "; movement " + camera.movement +
    "; shot size " + camera.shot_size_start + " to " + camera.shot_size_end +
    "; movement curve " + camera.movement_curve + ".";
}

export function compileAgent3Prompts(input: {
  projectId: string;
  visualBibleSummary: string;
  sceneVisual: SceneVisualDocument;
  states: StateImageDocument;
  clips: ClipProductionDocument;
}): PromptBundleDocument {
  const sceneById = new Map(input.sceneVisual.scenes.map(scene => [scene.scene_id, scene]));
  const stateById = new Map(input.states.state_images.map(state => [state.state_image_id, state]));

  const image_prompts: ImagePromptPlan[] = input.states.state_images.map(state => {
    const scene = sceneById.get(state.scene_id);
    if (scene === undefined) throw new Error("Scene Visual missing for " + state.state_image_id + ".");
    const avoid = [...new Set([
      ...scene.forbidden_visual_claims,
      ...state.avoidances,
      "readable generated text",
      "fabricated inscription",
      "unsupported heraldry",
      "watermark",
      "UI",
      "glossy game-render look",
      "direct imitation of any reference image",
      "repeated master composition copied across scenes"
    ])];

    const promptEn = sentence([
      "Historical mystery production keyframe for Scene " + state.scene_id + ", " + state.role + " state.",
      scene.visual_intent_en || scene.visual_intent_ko,
      state.visual_goal_en || state.visual_goal_ko,
      "Environment: " + (state.environment_state_en || state.environment_state_ko) + ".",
      "Subject: " + (state.subject_state_en || state.subject_state_ko) + ".",
      "Composition: " + (state.composition_en || state.composition_ko) + ".",
      "Motion vector: " + (state.motion_vector_en || state.motion_vector_ko) + ".",
      "Handoff anchor: " + state.handoff_anchor + ".",
      "Continuity: " + state.continuity_refs.join("; ") + ".",
      "Factual constraints: " + [...scene.evidence_constraints, ...state.factual_constraints].join("; ") + ".",
      "Visual Bible: " + input.visualBibleSummary + ".",
      "Global visual grammar: " + GLOBAL_VISUAL_GRAMMAR_EN,
      "Video-ready keyframe with separable foreground, central action and distant-world layers, complete physical relationships, and one clear continuable motion vector."
    ]);

    const promptKo = sentence([
      "장면 " + state.scene_id + " " + state.role + " 상태의 역사 미스터리 영상용 키프레임.",
      scene.visual_intent_ko,
      state.visual_goal_ko,
      "환경: " + state.environment_state_ko + ".",
      "대상: " + state.subject_state_ko + ".",
      "구도: " + state.composition_ko + ".",
      "움직임 방향: " + state.motion_vector_ko + ".",
      "다음 컷 연결점: " + state.handoff_anchor + ".",
      "연속성: " + state.continuity_refs.join("; ") + ".",
      "사실 제약: " + [...scene.evidence_constraints, ...state.factual_constraints].join("; ") + ".",
      "글로벌 시각 문법: " + GLOBAL_VISUAL_GRAMMAR_KO
    ]);

    return {
      state_image_id: state.state_image_id,
      scene_id: state.scene_id,
      prompt_ko: promptKo,
      prompt_en: promptEn,
      provider_prompt_en: promptEn,
      negative_prompt_en: avoid.join(", ")
    };
  });

  const video_prompts: VideoPromptPlan[] = input.clips.clips.map(clip => {
    const scene = sceneById.get(clip.scene_id);
    const entry = stateById.get(clip.state_images.entry);
    const target = stateById.get(clip.state_images.target);
    const mid = clip.state_images.mid === null ? null : stateById.get(clip.state_images.mid);
    if (!scene || !entry || !target || (clip.state_images.mid !== null && !mid)) {
      throw new Error("Clip " + clip.clip_id + " references missing Agent3 visual/state inputs.");
    }

    const coreKo = clip.mandatory_core_points
      .map(point => point.window_start_sec.toFixed(2) + "-" + point.window_end_sec.toFixed(2) + "초: " + (point.description_ko || point.description_en))
      .join("; ");
    const coreEn = clip.mandatory_core_points
      .map(point => point.window_start_sec.toFixed(2) + "-" + point.window_end_sec.toFixed(2) + " sec: " + (point.description_en || point.description_ko))
      .join("; ");

    const provider = sentence([
      "Image-to-video clip for Scene " + clip.scene_id + ", Clip " + clip.clip_id + ".",
      "Use " + entry.state_image_id + " as the entry state" +
        (mid ? ", pass through " + mid.state_image_id : "") +
        ", and reach " + target.state_image_id + " by " + clip.target_state_deadline_sec.toFixed(2) + " sec.",
      "Entry state intent: " + (entry.visual_goal_en || entry.visual_goal_ko) + ".",
      ...(mid ? ["Intermediate state intent: " + (mid.visual_goal_en || mid.visual_goal_ko) + "."] : []),
      "Target state intent: " + (target.visual_goal_en || target.visual_goal_ko) + ".",
      "Editorial duration is " + clip.editorial_duration_sec.toFixed(2) +
        " sec. Complete all mandatory narrative action by " + clip.narrative_deadline_sec.toFixed(2) +
        " sec. After " + clip.safe_trim_start_sec.toFixed(2) +
        " sec, only safe disposable continuation is allowed.",
      "Mandatory core points: " + coreEn + ".",
      cameraPhrase(clip.camera),
      "Scene action: " + (scene.action_en || scene.action_ko) + ".",
      "Movement direction: " + scene.continuity.movement_direction +
        "; screen direction " + scene.continuity.screen_direction + ".",
      "Preserve continuity: " + scene.handoff.preserve_elements.join("; ") + ".",
      "Do not introduce new characters, objects, inscriptions, historical claims, magical disappearance, or scene replacement unless explicitly present in the approved scene design.",
      "Keep all required narrative content inside editorial duration; later generated footage must be safe to trim."
    ]);

    const promptKo = sentence([
      "장면 " + clip.scene_id + ", 클립 " + clip.clip_id + " 이미지 투 비디오.",
      entry.state_image_id + "에서 시작" +
        (mid ? ", " + mid.state_image_id + "를 거쳐" : "") +
        " " + clip.target_state_deadline_sec.toFixed(2) + "초까지 " + target.state_image_id + " 상태에 도달.",
      "시작 상태 의도: " + entry.visual_goal_ko + ".",
      ...(mid ? ["중간 상태 의도: " + mid.visual_goal_ko + "."] : []),
      "목표 상태 의도: " + target.visual_goal_ko + ".",
      "편집 사용 구간 " + clip.editorial_duration_sec.toFixed(2) +
        "초, 핵심 서사 완료 시점 " + clip.narrative_deadline_sec.toFixed(2) +
        "초, " + clip.safe_trim_start_sec.toFixed(2) +
        "초 이후는 잘라도 되는 안전 연장 구간.",
      "필수 핵심: " + coreKo + ".",
      "카메라 목적 " + clip.camera.purpose +
        ", 움직임 " + clip.camera.movement +
        ", 샷 " + clip.camera.shot_size_start + "→" + clip.camera.shot_size_end +
        ", 곡선 " + clip.camera.movement_curve + ".",
      "장면 행동: " + scene.action_ko + ".",
      "연속성 유지: " + scene.handoff.preserve_elements.join("; ") + "."
    ]);

    return {
      clip_id: clip.clip_id,
      scene_id: clip.scene_id,
      entry_state_image_id: entry.state_image_id,
      mid_state_image_id: mid?.state_image_id ?? null,
      target_state_image_id: target.state_image_id,
      prompt_ko: promptKo,
      prompt_en: provider,
      provider_prompt_en: provider,
      editorial_duration_sec: clip.editorial_duration_sec,
      narrative_deadline_sec: clip.narrative_deadline_sec,
      target_state_deadline_sec: clip.target_state_deadline_sec,
      safe_trim_start_sec: clip.safe_trim_start_sec
    };
  });

  return {
    schema_version: "1.0",
    project_id: input.projectId,
    compiler_version: "AGENT3_PROMPT_COMPILER_V1",
    image_prompts,
    video_prompts
  };
}
