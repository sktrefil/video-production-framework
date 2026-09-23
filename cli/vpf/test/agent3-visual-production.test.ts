import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { Agent3VisualProductionRepository } from "@vpf/storage/agent3-visual-production";
import { ProductionSpecRepository } from "@vpf/storage/production-spec";
import { Agent1WorkflowOrchestratorService } from "../src/workflow-orchestrator-service.js";
import { Agent2StoryAudioWorkerService } from "../src/agent2-story-audio-service.js";
import { Agent3VisualProductionWorkerService } from "../src/agent3-visual-production-service.js";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

test("Agent3 executes T040-T060, compiles prompts and unlocks T070", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-agent3-worker-"));
  try {
    const bootstrap = new ProjectBootstrapService({ repositoryRoot, workspaceRoot: root });
    const created = await bootstrap.createProject({
      projectId: "agent3_sample",
      title: "Roman IX Agent3 Sample",
      format: "shortform",
      targetDurationSec: 5,
      language: "ko"
    });
    const manager = new Agent1WorkflowOrchestratorService(bootstrap);
    const agent2 = new Agent2StoryAudioWorkerService(bootstrap);
    const agent3 = new Agent3VisualProductionWorkerService(bootstrap);

    await manager.dispatch("agent3_sample", "T010");
    await agent2.executePayload("agent3_sample", "T010", {
      research_spec: {
        schema_version: "1.0",
        project_id: "agent3_sample",
        topic: "로마 제9군단",
        central_question: "제9군단은 어디로 사라졌는가?",
        sources: [{
          source_id: "SRC_001",
          title: "Reference",
          source_type: "BOOK",
          citation: "Reference p.1"
        }],
        research_notes: ["테스트"]
      },
      fact_check_spec: {
        schema_version: "1.0",
        project_id: "agent3_sample",
        facts: [{
          fact_id: "FACT_001",
          statement_ko: "제9군단에 대한 기록이 존재한다.",
          classification: "VERIFIED_FACT",
          confidence: "HIGH",
          source_refs: ["SRC_001"]
        }]
      }
    });
    await manager.complete("agent3_sample", "T010");

    const scriptText = "제9군단의기록은끊겼습니다.";
    await manager.dispatch("agent3_sample", "T020");
    await agent2.executePayload("agent3_sample", "T020", {
      story_spec: {
        schema_version: "1.0",
        project_id: "agent3_sample",
        central_question: "제9군단은 어디로 사라졌는가?",
        sections: [{
          section_id: "SEC_01",
          role: "HOOK",
          purpose_ko: "기록 단절 제시",
          fact_refs: ["FACT_001"]
        }],
        scenes: [{
          scene_id: "SCENE_01",
          story_role: "HOOK",
          narrative_purpose_ko: "기록이 끊기는 미스터리를 제기한다.",
          script_ko: scriptText,
          fact_refs: ["FACT_001"],
          beats: [{
            beat_id: "BEAT_01",
            purpose_ko: "기록 단절 제시",
            script_ko: scriptText
          }]
        }]
      },
      script: {
        schema_version: "1.0",
        project_id: "agent3_sample",
        language: "ko",
        body_ko: scriptText,
        estimated_duration_sec: 1,
        source_fact_refs: ["FACT_001"]
      }
    });
    await manager.complete("agent3_sample", "T020");

    const chars = Array.from(scriptText);
    const starts = chars.map((_, i) => Number((i * 0.2).toFixed(3)));
    const ends = chars.map((_, i) => Number(((i + 1) * 0.2).toFixed(3)));
    const duration = ends.at(-1)!;

    await manager.dispatch("agent3_sample", "T030");
    await agent2.executePayload("agent3_sample", "T030", {
      schema_version: "1.0",
      project_id: "agent3_sample",
      provider: "ELEVENLABS",
      voice_id: "TEST",
      model_id: "eleven_v3",
      sections: [{
        section_id: "TTS_001",
        timeline_start_sec: 0,
        text: scriptText,
        audio_relative_path: "03_tts/narration.mp3",
        audio_sha256: "a".repeat(64),
        audio_duration_sec: duration,
        alignment: {
          characters: chars,
          character_start_times_seconds: starts,
          character_end_times_seconds: ends
        }
      }]
    });
    await manager.complete("agent3_sample", "T030");
    assert.equal((await manager.next("agent3_sample"))?.task_id, "T040");

    const status = await bootstrap.getStatus("agent3_sample");
    const bible = status.resourcePins.find(pin => pin.resourceType === "CHANNEL_VISUAL_BIBLE");
    assert.ok(bible);

    await manager.dispatch("agent3_sample", "T040");
    await agent3.executePayload("agent3_sample", "T040", {
      schema_version: "1.0",
      project_id: "agent3_sample",
      visual_bible: {
        resource_id: bible!.resourceId,
        version: bible!.version,
        content_hash: bible!.contentHash
      },
      scenes: [{
        scene_id: "SCENE_01",
        story_role: "HOOK",
        factuality_mode: "HISTORICAL_RECONSTRUCTION",
        narrative_purpose_ko: "기록이 끊기는 미스터리를 제기한다.",
        narrative_purpose_en: "",
        visual_intent_ko: "사라지는 사건이 아니라 마지막으로 확인되는 흔적을 보여준다.",
        visual_intent_en: "Show the last trace rather than a literal disappearance.",
        environment_ko: "비안개가 낀 고대 도로",
        environment_en: "Ancient road in rain mist",
        subject_ko: "멀리 전진하는 군단 행렬",
        subject_en: "A distant marching column",
        action_ko: "행렬이 날씨에 점차 가려진다.",
        action_en: "Weather gradually obscures the column.",
        evidence_constraints: [],
        uncertainty_handling_ko: "마법적 소멸을 묘사하지 않는다.",
        uncertainty_handling_en: "No magical disappearance.",
        forbidden_visual_claims: ["magical disappearance", "fabricated inscription"],
        continuity: {
          character_identity: [],
          environment_identity: ["road", "stone structures"],
          lighting_direction: "soft side light",
          color_language: "cool storm blue and earth tones",
          weather: "rain mist",
          movement_direction: "forward into depth",
          screen_direction: "LEFT_TO_RIGHT",
          camera_energy: "RESTRAINED",
          visual_motif: ["mist", "stone"]
        },
        handoff: {
          entry_anchor: "marching line",
          exit_anchor: "dense mist",
          preserve_elements: ["screen direction", "mist", "road axis"],
          next_cut_intent: "carry the mist axis forward"
        }
      }]
    });
    assert.equal((await manager.complete("agent3_sample", "T040")).status, "COMPLETE");
    assert.equal((await manager.next("agent3_sample"))?.task_id, "T050");

    await manager.dispatch("agent3_sample", "T050");
    await agent3.executePayload("agent3_sample", "T050", {
      schema_version: "1.0",
      project_id: "agent3_sample",
      state_images: [
        {
          state_image_id: "IMG_01_ENTRY",
          scene_id: "SCENE_01",
          beat_id: "BEAT_01",
          role: "ENTRY",
          sequence_order: 1,
          visual_goal_ko: "행렬이 분명히 보인다.",
          visual_goal_en: "The column remains clearly visible.",
          composition_ko: "전경 암석, 중경 행렬, 원경 안개",
          composition_en: "Foreground rock, midground column, distant mist",
          subject_state_ko: "규율 있게 이동하는 병사들",
          subject_state_en: "A disciplined moving column",
          environment_state_ko: "비에 젖은 도로",
          environment_state_en: "Rain-soaked road",
          motion_vector_ko: "왼쪽에서 오른쪽 깊이 방향",
          motion_vector_en: "Left to right into depth",
          handoff_anchor: "marching line",
          continuity_refs: ["road axis", "screen direction"],
          factual_constraints: [],
          avoidances: ["readable text", "magic effect"]
        },
        {
          state_image_id: "IMG_01_TARGET",
          scene_id: "SCENE_01",
          beat_id: "BEAT_01",
          role: "TARGET",
          sequence_order: 2,
          visual_goal_ko: "행렬이 짙은 안개 뒤로 가려진다.",
          visual_goal_en: "The column is obscured by denser mist.",
          composition_ko: "동일한 도로 축과 짙어진 안개",
          composition_en: "Same road axis with denser mist",
          subject_state_ko: "희미하게 남은 행렬 실루엣",
          subject_state_en: "Faint remaining silhouettes",
          environment_state_ko: "짙어진 비안개",
          environment_state_en: "Dense rain mist",
          motion_vector_ko: "동일 진행 방향 유지",
          motion_vector_en: "Same travel direction",
          handoff_anchor: "dense mist",
          continuity_refs: ["road axis", "mist"],
          factual_constraints: [],
          avoidances: ["teleportation", "magic effect"]
        }
      ]
    });
    assert.equal((await manager.complete("agent3_sample", "T050")).status, "COMPLETE");
    assert.equal((await manager.next("agent3_sample"))?.task_id, "T060");

    const narrative = Number((duration * 0.65).toFixed(3));
    const target = Number((duration * 0.8).toFixed(3));
    const startHandle = Number((duration * 0.05).toFixed(3));
    const coreStart = Number((duration * 0.1).toFixed(3));
    const coreEnd = Number((duration * 0.5).toFixed(3));
    const endHold = Number((duration - target).toFixed(3));

    await manager.dispatch("agent3_sample", "T060");
    const executed = await agent3.executePayload("agent3_sample", "T060", {
      schema_version: "1.0",
      project_id: "agent3_sample",
      clip_production_spec: {
        schema_version: "1.0",
        project_id: "agent3_sample",
        clips: [{
          scene_id: "SCENE_01",
          clip_id: "CLIP_01",
          editorial_duration_sec: duration,
          generation_duration_sec: null,
          mandatory_core_points: [{
            id: "CP_01",
            description_ko: "행렬이 비안개에 가려진다.",
            description_en: "The column becomes obscured by rain mist.",
            window_start_sec: coreStart,
            window_end_sec: coreEnd
          }],
          narrative_deadline_sec: narrative,
          target_state_deadline_sec: target,
          start_handle_sec: startHandle,
          end_hold_sec: endHold,
          safe_trim_start_sec: duration,
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
      }
    });
    assert.deepEqual(
      executed.stored_artifacts.map(item => item.artifact_type),
      ["clip_production_spec", "prompt_bundle_spec"]
    );

    assert.equal((await manager.complete("agent3_sample", "T060")).status, "COMPLETE");
    const workflow = await manager.status("agent3_sample");
    assert.equal(workflow.next_task?.task_id, "T070");
    assert.equal(workflow.next_task?.assigned_agent, "AGENT3_VISUAL_PRODUCTION");

    const production = new ProductionSpecRepository(created.projectDbPath, { readonly: true });
    const visualRepo = new Agent3VisualProductionRepository(created.projectDbPath, { readonly: true });
    try {
      assert.equal(production.getLatestGate("agent3_sample", "VISUAL_PLAN_GATE")?.status, "PASS");
      assert.equal(production.getLatestGate("agent3_sample", "STATE_IMAGE_GATE")?.status, "PASS");
      assert.equal(production.getLatestGate("agent3_sample", "CLIP_PLAN_GATE")?.status, "PASS");
      assert.equal(production.getLatestGate("agent3_sample", "GENERATION_READY_GATE")?.status, "PASS");
      const prompts = visualRepo.getActive<any>("agent3_sample", "prompt_bundle_spec")?.value;
      assert.equal(prompts?.video_prompts?.[0]?.clip_id, "CLIP_01");
      assert.equal(prompts?.video_prompts?.[0]?.safe_trim_start_sec, duration);
    } finally {
      visualRepo.close();
      production.close();
    }

    const mutableVisual = new Agent3VisualProductionRepository(created.projectDbPath);
    try {
      const currentStates = mutableVisual.getActive<any>("agent3_sample", "state_image_spec");
      assert.ok(currentStates);
      mutableVisual.save(
        "agent3_sample",
        "state_image_spec",
        currentStates!.value,
        "T050",
        new Date().toISOString()
      );
    } finally {
      mutableVisual.close();
    }

    const stale = await manager.status("agent3_sample");
    assert.equal(stale.tasks.find(task => task.task_id === "T050")?.status, "REVISION_REQUIRED");
    assert.equal(stale.tasks.find(task => task.task_id === "T060")?.status, "BLOCKED");
    assert.equal(stale.tasks.find(task => task.task_id === "T070")?.status, "BLOCKED");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
