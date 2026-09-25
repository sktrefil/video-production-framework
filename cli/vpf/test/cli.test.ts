import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import test from "node:test";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { Agent2StoryAudioRepository } from "@vpf/storage/agent2-story-audio";
import { Agent3VisualProductionRepository } from "@vpf/storage/agent3-visual-production";
import { ProductionTailRepository } from "@vpf/storage/production-tail";
import { WorkflowOrchestratorRepository } from "@vpf/storage/workflow-orchestrator";
import { runCli } from "../src/index.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const cliPackageRoot = fileURLToPath(new URL("../", import.meta.url));
const execFileAsync = promisify(execFile);

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-cli-"));
  const service = new ProjectBootstrapService({
    repositoryRoot,
    workspaceRoot: path.join(root, "workspace"),
    clock: { nowIso: () => "2026-09-10T05:30:00.000Z" }
  });
  const output: string[] = [];
  const errors: string[] = [];
  return {
    service,
    output,
    errors,
    io: {
      out: (message: string) => output.push(message),
      error: (message: string) => errors.push(message)
    }
  };
}

test("CLI creates SHORTFORM and reports status from project.db", async () => {
  const f = await fixture();
  assert.equal(await runCli([
    "project", "create", "cli_short",
    "--title", "CLI Short",
    "--format", "shortform"
  ], f.io, f.service), 0);

  assert.equal(await runCli([
    "project", "status", "cli_short"
  ], f.io, f.service), 0);

  const status = JSON.parse(f.output.at(-1)!) as any;
  assert.equal(status.projectId, "cli_short");
  assert.equal(status.format, "SHORTFORM");
  assert.equal(status.pipeline, "VPF_UNIFIED_V1");
  assert.equal(status.legacyAllowed, false);
});

test("CLI creates LONGFORM and doctor returns healthy", async () => {
  const f = await fixture();
  assert.equal(await runCli([
    "project", "create", "cli_long",
    "--title", "CLI Long",
    "--format", "longform"
  ], f.io, f.service), 0);
  assert.equal(await runCli(["doctor", "cli_long"], f.io, f.service), 0);

  const doctor = JSON.parse(f.output.at(-1)!) as any;
  assert.equal(doctor.healthy, true);
});

test("CLI materializes the active DB script into 02_script", async () => {
  const f = await fixture();
  assert.equal(await runCli([
    "project", "create", "cli_script_materialize",
    "--title", "CLI Script Materialize",
    "--format", "longform"
  ], f.io, f.service), 0);

  const status = await f.service.getStatus("cli_script_materialize");
  const repo = new Agent2StoryAudioRepository(status.projectDbPath);
  try {
    const at = "2026-09-25T12:00:00.000Z";
    repo.save("cli_script_materialize", "story_spec", {
      schema_version: "1.0",
      project_id: "cli_script_materialize",
      central_question: "테스트 질문",
      sections: [],
      scenes: []
    }, "T020", at);
    repo.save("cli_script_materialize", "script", {
      schema_version: "1.0",
      project_id: "cli_script_materialize",
      language: "ko",
      body_ko: "DB에 저장된 최종 스크립트입니다.",
      body_en: "",
      estimated_duration_sec: 2,
      source_fact_refs: []
    }, "T020", at);
  } finally {
    repo.close();
  }

  assert.equal(await runCli([
    "agent2", "materialize-script", "cli_script_materialize"
  ], f.io, f.service), 0);

  const output = JSON.parse(f.output.at(-1)!) as {
    source: string;
    files: { script_ko_txt: string };
  };
  assert.equal(output.source, "project.db");
  assert.equal(output.files.script_ko_txt, "02_script/script_ko.txt");
  assert.equal(
    (await readFile(path.join(status.projectRoot, output.files.script_ko_txt), "utf8")).trim(),
    "DB에 저장된 최종 스크립트입니다."
  );
});

test("CLI confirmed image regeneration reset preserves T010-T060 and clears T070 outputs", async () => {
  const f = await fixture();
  assert.equal(await runCli([
    "project", "create", "cli_t070_reset",
    "--title", "CLI T070 Reset",
    "--format", "longform"
  ], f.io, f.service), 0);

  const status = await f.service.getStatus("cli_t070_reset");
  const workflow = new WorkflowOrchestratorRepository(status.projectDbPath);
  try {
    const at = "2026-09-25T12:00:00.000Z";
    for (const taskId of ["T010","T020","T030","T040","T050","T060"] as const) {
      workflow.updateTask({
        projectId: "cli_t070_reset",
        taskId,
        status: "COMPLETE",
        attempt: 1,
        startedAt: at,
        completedAt: at,
        updatedAt: at
      });
    }
    workflow.updateTask({
      projectId: "cli_t070_reset",
      taskId: "T070",
      status: "COMPLETE",
      attempt: 1,
      startedAt: at,
      completedAt: at,
      updatedAt: at
    });
    workflow.updateTask({
      projectId: "cli_t070_reset",
      taskId: "T080",
      status: "READY",
      attempt: 0,
      startedAt: null,
      completedAt: null,
      updatedAt: at
    });
  } finally {
    workflow.close();
  }

  const agent3 = new Agent3VisualProductionRepository(status.projectDbPath);
  try {
    agent3.save("cli_t070_reset", "prompt_bundle_spec", {
      schema_version: "1.0",
      project_id: "cli_t070_reset",
      compiler_version: "AGENT3_PROMPT_COMPILER_V1",
      image_prompts: [{
        state_image_id: "STATE_01",
        scene_id: "SC01",
        prompt_ko: "테스트",
        prompt_en: "test",
        provider_prompt_en: "test",
        negative_prompt_en: "none"
      }],
      video_prompts: []
    }, "T060", "2026-09-25T12:00:00.000Z");
  } finally {
    agent3.close();
  }

  const generatedPath = path.join(
    status.projectRoot,
    "05_images",
    "generated",
    "STATE_01.png"
  );
  await mkdir(path.dirname(generatedPath), { recursive: true });
  await writeFile(generatedPath, "old-image");

  const tail = new ProductionTailRepository(status.projectDbPath);
  try {
    tail.save(
      "cli_t070_reset",
      "generated_images",
      {
        schema_version: "1.0",
        project_id: "cli_t070_reset",
        provider: "CHATGPT_BROWSER",
        source_prompt_bundle_sha256: "a".repeat(64),
        images: []
      },
      "T070",
      "2026-09-25T12:01:00.000Z"
    );
  } finally {
    tail.close();
  }

  assert.equal(await runCli([
    "production", "regenerate-images", "cli_t070_reset", "--confirm"
  ], f.io, f.service), 0);

  const result = JSON.parse(f.output.at(-1)!) as {
    status: string;
    reset_tasks: string[];
  };
  assert.equal(result.status, "RESET_FOR_T070_REGENERATION");
  assert.deepEqual(result.reset_tasks, ["T070","T080","T090","T100"]);
  await assert.rejects(readFile(generatedPath));

  const after = new WorkflowOrchestratorRepository(status.projectDbPath, { readonly: true });
  try {
    assert.equal(after.getTask("cli_t070_reset", "T060")?.status, "COMPLETE");
    assert.equal(after.getTask("cli_t070_reset", "T070")?.status, "READY");
    assert.equal(after.getTask("cli_t070_reset", "T080")?.status, "BLOCKED");
    assert.equal(after.getTask("cli_t070_reset", "T090")?.status, "BLOCKED");
    assert.equal(after.getTask("cli_t070_reset", "T100")?.status, "BLOCKED");
  } finally {
    after.close();
  }
});

test("future unified commands fail explicitly as NOT_IMPLEMENTED", async () => {
  const f = await fixture();
  const code = await runCli(["run", "demo", "--to", "tts"], f.io, f.service);
  assert.equal(code, 2);
  assert.match(f.errors.at(-1)!, /NOT_IMPLEMENTED/);
});

test("CLI rejects legacy control-plane and repository commands before dispatch", async () => {
  const f = await fixture();
  for (const [command, category] of [
    ["lived_sentences.cli", "LEGACY_CONTROL_PLANE"],
    ["/opt/video-production/run.py", "LEGACY_RUNTIME_FORBIDDEN"]
  ]) {
    assert.equal(await runCli([command!], f.io, f.service), 1);
    assert.match(f.errors.at(-1)!, new RegExp(category!));
    assert.equal(f.output.length, 0);
  }
});


test("compiled public CLI binary creates a real unified project", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-cli-binary-"));
  const workspaceRoot = path.join(root, "workspace");
  const cliEntry = path.join(cliPackageRoot, "dist", "entry.js");

  const created = await execFileAsync(process.execPath, [
    cliEntry,
    "project",
    "create",
    "binary_fixture",
    "--title",
    "Binary Fixture",
    "--format",
    "longform"
  ], {
    env: {
      ...process.env,
      VPF_WORKSPACE_ROOT: workspaceRoot
    }
  });
  const result = JSON.parse(created.stdout) as any;
  assert.equal(result.status, "CREATED");
  assert.equal(result.format, "LONGFORM");
  assert.equal(result.legacyAllowed, false);

  const statusRun = await execFileAsync(process.execPath, [
    cliEntry,
    "project",
    "status",
    "binary_fixture"
  ], {
    env: {
      ...process.env,
      VPF_WORKSPACE_ROOT: workspaceRoot
    }
  });
  const status = JSON.parse(statusRun.stdout) as any;
  assert.equal(status.projectId, "binary_fixture");
  assert.equal(status.migrationsCurrent, true);
});
