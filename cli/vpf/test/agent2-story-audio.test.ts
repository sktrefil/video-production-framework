import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { ProductionSpecRepository } from "@vpf/storage/production-spec";
import { Agent2StoryAudioRepository } from "@vpf/storage/agent2-story-audio";
import { Agent1WorkflowOrchestratorService } from "../src/workflow-orchestrator-service.js";
import { Agent2StoryAudioWorkerService } from "../src/agent2-story-audio-service.js";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

async function writeJson(filename: string, value: unknown): Promise<void> {
  await writeFile(filename, JSON.stringify(value, null, 2), "utf8");
}

test("Agent2 executes T010-T030 and hands measured timing to Agent3", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-agent2-worker-"));
  try {
    const bootstrap = new ProjectBootstrapService({ repositoryRoot, workspaceRoot: root });
    const created = await bootstrap.createProject({
      projectId: "agent2_sample",
      title: "Roman IX Sample",
      format: "shortform",
      targetDurationSec: 5,
      language: "ko"
    });
    const manager = new Agent1WorkflowOrchestratorService(bootstrap);
    const worker = new Agent2StoryAudioWorkerService(bootstrap);

    assert.equal((await manager.next("agent2_sample"))?.task_id, "T010");
    await manager.dispatch("agent2_sample", "T010");

    const researchFile = path.join(root, "research.json");
    await writeJson(researchFile, {
      research_spec: {
        schema_version: "1.0",
        project_id: "agent2_sample",
        topic: "로마 제9군단",
        central_question: "제9군단은 어디로 사라졌는가?",
        sources: [{
          source_id: "SRC_001",
          title: "Reference Source",
          source_type: "BOOK",
          citation: "Reference Source, p.1"
        }],
        research_notes: ["테스트 조사"]
      },
      fact_check_spec: {
        schema_version: "1.0",
        project_id: "agent2_sample",
        facts: [{
          fact_id: "FACT_001",
          statement_ko: "로마 군단에 대한 기록이 존재한다.",
          classification: "VERIFIED_FACT",
          confidence: "HIGH",
          source_refs: ["SRC_001"]
        }]
      }
    });
    const research = await worker.execute("agent2_sample", "T010", researchFile);
    assert.deepEqual(research.stored_artifacts.map(item => item.artifact_type), ["research_spec", "fact_check_spec"]);
    assert.equal((await manager.complete("agent2_sample", "T010")).status, "COMPLETE");
    assert.equal((await manager.next("agent2_sample"))?.task_id, "T020");

    await manager.dispatch("agent2_sample", "T020");
    const scriptText = "로마군단은사라졌다.";
    const storyFile = path.join(root, "story.json");
    await writeJson(storyFile, {
      story_spec: {
        schema_version: "1.0",
        project_id: "agent2_sample",
        central_question: "제9군단은 어디로 사라졌는가?",
        sections: [{
          section_id: "SEC_01",
          role: "HOOK",
          purpose_ko: "실종 미스터리 제기",
          fact_refs: ["FACT_001"]
        }],
        scenes: [{
          scene_id: "SCENE_01",
          story_role: "HOOK",
          narrative_purpose_ko: "제9군단 실종 미스터리를 제기한다.",
          script_ko: scriptText,
          fact_refs: ["FACT_001"],
          beats: [{
            beat_id: "BEAT_01",
            purpose_ko: "실종 사실 제시",
            script_ko: scriptText
          }]
        }]
      },
      script: {
        schema_version: "1.0",
        project_id: "agent2_sample",
        language: "ko",
        body_ko: scriptText,
        estimated_duration_sec: 999,
        source_fact_refs: ["FACT_001"]
      }
    });
    const story = await worker.execute("agent2_sample", "T020", storyFile);
    assert.deepEqual(story.stored_artifacts.map(item => item.artifact_type), ["story_spec", "script"]);
    assert.equal((await manager.complete("agent2_sample", "T020")).status, "COMPLETE");
    assert.equal((await manager.next("agent2_sample"))?.task_id, "T030");

    await manager.dispatch("agent2_sample", "T030");
    const characters = Array.from(scriptText);
    const step = 0.2;
    const starts = characters.map((_, index) => Number((index * step).toFixed(3)));
    const ends = characters.map((_, index) => Number(((index + 1) * step).toFixed(3)));
    const duration = ends.at(-1)!;
    const ttsFile = path.join(root, "tts.json");
    await writeJson(ttsFile, {
      schema_version: "1.0",
      project_id: "agent2_sample",
      provider: "ELEVENLABS",
      voice_id: "TEST_VOICE",
      model_id: "eleven_v3",
      sections: [{
        section_id: "TTS_SEC_001",
        timeline_start_sec: 0,
        text: scriptText,
        audio_relative_path: "03_tts/narration.mp3",
        audio_sha256: "a".repeat(64),
        audio_duration_sec: duration,
        alignment: {
          characters,
          character_start_times_seconds: starts,
          character_end_times_seconds: ends
        }
      }]
    });
    const timing = await worker.execute("agent2_sample", "T030", ttsFile);
    assert.deepEqual(timing.stored_artifacts.map(item => item.artifact_type), [
      "tts_manifest",
      "scene_timing_spec",
      "subtitle_timing"
    ]);

    assert.equal((await manager.complete("agent2_sample", "T030")).status, "COMPLETE");
    const workflow = await manager.status("agent2_sample");
    assert.equal(workflow.next_task?.task_id, "T040");
    assert.equal(workflow.next_task?.assigned_agent, "AGENT3_VISUAL_PRODUCTION");

    await manager.dispatch("agent2_sample", "T040");
    const mutableProduction = new ProductionSpecRepository(created.projectDbPath);
    try {
      const currentTiming = mutableProduction.getSceneTiming("agent2_sample");
      assert.ok(currentTiming);
      mutableProduction.saveSceneTiming("agent2_sample", currentTiming!, new Date().toISOString());
    } finally {
      mutableProduction.close();
    }
    const staleWorkflow = await manager.status("agent2_sample");
    assert.equal(staleWorkflow.tasks.find(task => task.task_id === "T040")?.status, "REVISION_REQUIRED");
    assert.equal(staleWorkflow.tasks.find(task => task.task_id === "T050")?.status, "BLOCKED");

    const production = new ProductionSpecRepository(created.projectDbPath, { readonly: true });
    const agent2 = new Agent2StoryAudioRepository(created.projectDbPath, { readonly: true });
    try {
      const scene = production.getSceneTiming("agent2_sample")?.scenes[0];
      assert.equal(scene?.tts?.start_sec, 0);
      assert.equal(scene?.tts?.end_sec, duration);
      assert.equal(scene?.tts?.duration_sec, duration);
      assert.equal(scene?.beats[0]?.start_sec, 0);
      assert.equal(scene?.beats[0]?.end_sec, duration);
      assert.equal(agent2.getActive("agent2_sample", "tts_manifest") !== null, true);
      assert.equal(agent2.getActive("agent2_sample", "subtitle_timing") !== null, true);
      assert.equal(production.getLatestGate("agent2_sample", "RESEARCH_GATE")?.status, "PASS");
      assert.equal(production.getLatestGate("agent2_sample", "SCRIPT_GATE")?.status, "PASS");
      assert.equal(production.getLatestGate("agent2_sample", "STORY_AUDIO_GATE")?.status, "PASS");
    } finally {
      agent2.close();
      production.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
