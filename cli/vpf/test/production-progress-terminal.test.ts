import assert from "node:assert/strict";
import test from "node:test";
import { ProductionProgressReporter } from "../src/production-progress.js";
import { ProductionTerminalProgressRenderer } from "../src/production-progress-terminal.js";

test("terminal progress renderer shows weighted overall and current task progress", async () => {
  const lines: string[] = [];
  const renderer = new ProductionTerminalProgressRenderer([
    { task_id: "T010", status: "COMPLETE" },
    { task_id: "T020", status: "COMPLETE" },
    { task_id: "T030", status: "COMPLETE" },
    { task_id: "T040", status: "READY" }
  ], line => { lines.push(line); });
  const reporter = new ProductionProgressReporter(
    event => { renderer.handle(event); },
    () => "2026-09-25T06:00:00.000Z"
  );

  await reporter.emit({
    event: "RUN_STARTED",
    project_id: "terminal_fixture",
    phase: "PREFLIGHT",
    message: "Production run started."
  });
  await reporter.emit({
    event: "TASK_STARTED",
    project_id: "terminal_fixture",
    task_id: "T040",
    agent: "AGENT3_VISUAL_PRODUCTION",
    attempt: 1
  });
  await reporter.taskProgress({
    project_id: "terminal_fixture",
    task_id: "T040",
    agent: "AGENT3_VISUAL_PRODUCTION",
    attempt: 1,
    phase: "RUNTIME_EXECUTION",
    completed: 50,
    total: 100,
    message: "Visual planning in progress."
  });
  await reporter.emit({
    event: "QC_STARTED",
    project_id: "terminal_fixture",
    task_id: "T040",
    agent: "CODEX_1_MANAGER",
    attempt: 1,
    qc_kind: "SUCCESS",
    phase: "CODEX1_SUCCESS_QC"
  });

  assert.match(lines[0] ?? "", /VPF\s+30%/u);
  assert.match(lines[1] ?? "", /T040/u);
  assert.match(lines[1] ?? "", /attempt 1\/3/u);
  assert.match(lines[2] ?? "", /VPF\s+34%/u);
  assert.match(lines[2] ?? "", /50%/u);
  assert.match(lines[2] ?? "", /Runtime/u);
  assert.match(lines[3] ?? "", /Codex1 QC started/u);
});

test("terminal progress renderer advances completed tasks and reports handoff", async () => {
  const lines: string[] = [];
  const renderer = new ProductionTerminalProgressRenderer([], line => { lines.push(line); });
  const reporter = new ProductionProgressReporter(event => { renderer.handle(event); });

  await reporter.emit({
    event: "TASK_STARTED",
    project_id: "terminal_fixture",
    task_id: "T010",
    agent: "AGENT2_STORY_AUDIO",
    attempt: 1
  });
  await reporter.emit({
    event: "TASK_COMPLETED",
    project_id: "terminal_fixture",
    task_id: "T010",
    agent: "AGENT2_STORY_AUDIO",
    attempt: 1
  });
  await reporter.emit({
    event: "HANDOFF",
    project_id: "terminal_fixture",
    next_task: "T020",
    next_agent: "AGENT2_STORY_AUDIO"
  });

  assert.match(lines[1] ?? "", /VPF\s+8%/u);
  assert.match(lines[1] ?? "", /DONE/u);
  assert.match(lines[2] ?? "", /T020/u);
  assert.match(lines[2] ?? "", /NEXT/u);
});
