import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { Agent2RuntimeRepository } from "@vpf/storage/agent2-runtime";
import { Agent1WorkflowOrchestratorService } from "../src/workflow-orchestrator-service.js";
import {
  Agent2RuntimeAdapterError,
  Agent2RuntimeAdapterService
} from "../src/agent2-runtime-adapter-service.js";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk.toString("utf8");
  return body;
}

async function listen(handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>) {
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Test server address missing.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  };
}

function alignment(text: string) {
  const chars = Array.from(text);
  return {
    characters: chars,
    character_start_times_seconds: chars.map((_, index) => Number((index * 0.08).toFixed(3))),
    character_end_times_seconds: chars.map((_, index) => Number(((index + 1) * 0.08).toFixed(3)))
  };
}

test("Agent2 runtime adapter automatically runs T010-T030 then hands off T040 to Agent3", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-agent2-runtime-"));
  const sourceUrl = "https://example.org/roman-ix";
  const scriptText = "로마군단은사라졌다.";
  let openAiCalls = 0;
  let ttsCalls = 0;

  const server = await listen(async (req, res) => {
    if (req.url === "/v1/responses" && req.method === "POST") {
      openAiCalls += 1;
      await readBody(req);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");

      if (openAiCalls === 1) {
        const bundle = {
          research_spec: {
            schema_version: "1.0",
            project_id: "agent2_runtime",
            topic: "로마 제9군단",
            central_question: "제9군단은 어디로 사라졌는가?",
            sources: [{
              source_id: "SRC_001",
              title: "Roman IX Source",
              source_type: "WEB",
              url: sourceUrl,
              citation: "Roman IX Source",
              publisher: "Example Institute",
              published_at: "2026-01-01",
              notes: "테스트 출처"
            }],
            research_notes: ["검증 가능한 기록을 중심으로 구성한다."]
          },
          fact_check_spec: {
            schema_version: "1.0",
            project_id: "agent2_runtime",
            facts: [{
              fact_id: "FACT_001",
              statement_ko: "제9군단에 대한 기록이 존재한다.",
              statement_en: "",
              classification: "VERIFIED_FACT",
              confidence: "HIGH",
              source_refs: ["SRC_001"],
              visualisation_note: "기록을 시각적으로 재구성할 수 있다.",
              uncertainty_note: ""
            }]
          }
        };
        res.end(JSON.stringify({
          id: "resp_research",
          status: "completed",
          output: [
            {
              type: "web_search_call",
              action: {
                type: "search",
                sources: [{ type: "url", url: sourceUrl }]
              }
            },
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: JSON.stringify(bundle), annotations: [] }]
            }
          ]
        }));
        return;
      }

      const story = {
        story_spec: {
          schema_version: "1.0",
          project_id: "agent2_runtime",
          central_question: "제9군단은 어디로 사라졌는가?",
          sections: [{
            section_id: "SEC_01",
            role: "HOOK",
            purpose_ko: "실종 미스터리를 제기한다.",
            purpose_en: "",
            fact_refs: ["FACT_001"]
          }],
          scenes: [{
            scene_id: "SCENE_01",
            story_role: "HOOK",
            narrative_purpose_ko: "실종 미스터리를 제기한다.",
            narrative_purpose_en: "",
            script_ko: scriptText,
            script_en: "",
            fact_refs: ["FACT_001"],
            beats: [{
              beat_id: "BEAT_01",
              purpose_ko: "핵심 질문을 제기한다.",
              purpose_en: "",
              script_ko: scriptText
            }]
          }]
        },
        script: {
          schema_version: "1.0",
          project_id: "agent2_runtime",
          language: "ko",
          body_ko: scriptText,
          body_en: "",
          estimated_duration_sec: 1,
          source_fact_refs: ["FACT_001"]
        }
      };
      res.end(JSON.stringify({
        id: "resp_story",
        status: "completed",
        output: [{
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: JSON.stringify(story), annotations: [] }]
        }]
      }));
      return;
    }

    if (req.url?.startsWith("/v1/text-to-speech/") && req.method === "POST") {
      ttsCalls += 1;
      const body = JSON.parse(await readBody(req)) as { text: string };
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.setHeader("request-id", "req_tts_1");
      res.end(JSON.stringify({
        audio_base64: Buffer.from("FAKE_MP3_DATA").toString("base64"),
        alignment: alignment(body.text)
      }));
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  });

  try {
    const bootstrap = new ProjectBootstrapService({
      repositoryRoot,
      workspaceRoot: path.join(root, "workspace")
    });
    const created = await bootstrap.createProject({
      projectId: "agent2_runtime",
      title: "로마 제9군단",
      format: "shortform",
      targetDurationSec: 5,
      language: "ko"
    });

    const runtime = new Agent2RuntimeAdapterService(bootstrap, {
      ...process.env,
      OPENAI_API_KEY: "test-openai-key",
      VPF_AGENT2_OPENAI_MODEL: "gpt-test",
      OPENAI_API_BASE_URL: `${server.baseUrl}/v1`,
      VPF_AGENT2_OPENAI_RETRIES: "0",
      ELEVENLABS_API_KEY: "test-elevenlabs-key",
      ELEVENLABS_VOICE_ID_HISTORY_MYSTERY_SHORTS: "voice-test",
      ELEVENLABS_API_BASE_URL: `${server.baseUrl}/v1`,
      ELEVENLABS_REQUEST_RETRIES: "0"
    });

    const result = await runtime.runAll("agent2_runtime");
    assert.equal(result.steps.length, 3);
    assert.deepEqual(result.steps.map(step => step.task_id), ["T010", "T020", "T030"]);
    assert.equal(result.handoff_task, "T040");
    assert.equal(result.handoff_agent, "AGENT3_VISUAL_PRODUCTION");
    assert.equal(openAiCalls, 2);
    assert.equal(ttsCalls, 1);

    const workflow = new Agent1WorkflowOrchestratorService(bootstrap);
    const state = await workflow.status("agent2_runtime");
    assert.equal(state.tasks.find(task => task.task_id === "T010")?.status, "COMPLETE");
    assert.equal(state.tasks.find(task => task.task_id === "T020")?.status, "COMPLETE");
    assert.equal(state.tasks.find(task => task.task_id === "T030")?.status, "COMPLETE");
    assert.equal(state.tasks.find(task => task.task_id === "T040")?.status, "READY");

    const runs = new Agent2RuntimeRepository(created.projectDbPath, { readonly: true });
    try {
      const rows = runs.list("agent2_runtime");
      assert.equal(rows.length, 3);
      assert.ok(rows.every(row => row.status === "COMPLETE"));
      assert.deepEqual(rows.map(row => row.provider), ["OPENAI", "OPENAI", "ELEVENLABS"]);
      assert.equal(rows.some(row => JSON.stringify(row).includes("test-openai-key")), false);
      assert.equal(rows.some(row => JSON.stringify(row).includes("test-elevenlabs-key")), false);
    } finally {
      runs.close();
    }
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Agent2 automatic T010 fails closed when OPENAI_API_KEY is missing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-agent2-runtime-secret-"));
  try {
    const bootstrap = new ProjectBootstrapService({
      repositoryRoot,
      workspaceRoot: path.join(root, "workspace")
    });
    await bootstrap.createProject({
      projectId: "agent2_no_key",
      title: "테스트 주제",
      format: "shortform",
      targetDurationSec: 5,
      language: "ko"
    });
    const runtime = new Agent2RuntimeAdapterService(bootstrap, {
      ...process.env,
      OPENAI_API_KEY: ""
    });
    await assert.rejects(
      runtime.runNext("agent2_no_key"),
      (error: unknown) =>
        error instanceof Agent2RuntimeAdapterError &&
        error.code === "AGENT2_RUNTIME_SECRET_MISSING"
    );
    const workflow = new Agent1WorkflowOrchestratorService(bootstrap);
    assert.equal(
      (await workflow.status("agent2_no_key")).tasks.find(task => task.task_id === "T010")?.status,
      "REVISION_REQUIRED"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
