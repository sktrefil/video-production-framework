import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateOverallProgress,
  ProductionProgressReporter,
  type ProductionProgressEvent
} from "../src/production-progress.js";

test("production progress reporter emits ordered, versioned events and computes item progress", async () => {
  const events: ProductionProgressEvent[] = [];
  const reporter = new ProductionProgressReporter(
    event => { events.push(event); },
    () => "2026-09-25T06:00:00.000Z"
  );

  await reporter.emit({
    event: "RUN_STARTED",
    project_id: "progress_fixture",
    phase: "PREFLIGHT"
  });
  await reporter.emit({
    event: "TASK_STARTED",
    project_id: "progress_fixture",
    task_id: "T040",
    agent: "AGENT3_VISUAL_PRODUCTION",
    attempt: 1
  });
  await reporter.taskProgress({
    project_id: "progress_fixture",
    task_id: "T040",
    agent: "AGENT3_VISUAL_PRODUCTION",
    attempt: 1,
    phase: "SCENE_PLAN",
    completed: 5,
    total: 8,
    message: "SC05 visual plan completed."
  });

  assert.deepEqual(events.map(event => event.sequence), [1, 2, 3]);
  assert.ok(events.every(event => event.schema_version === "1.0"));
  assert.ok(events.every(event => event.at === "2026-09-25T06:00:00.000Z"));
  assert.equal(events[2]?.event, "TASK_PROGRESS");
  assert.equal(events[2]?.completed, 5);
  assert.equal(events[2]?.total, 8);
  assert.equal(events[2]?.percent, 62.5);
});

test("production progress reporter clamps invalid item progress and never breaks production on sink failure", async () => {
  const reporter = new ProductionProgressReporter(() => {
    throw new Error("renderer failed");
  });

  const event = await reporter.taskProgress({
    project_id: "progress_fixture",
    task_id: "T070",
    completed: 12,
    total: 10
  });

  assert.equal(event.completed, 10);
  assert.equal(event.total, 10);
  assert.equal(event.percent, 100);

  const empty = await reporter.taskProgress({
    project_id: "progress_fixture",
    task_id: "T070",
    completed: 1,
    total: 0
  });

  assert.equal(empty.completed, 0);
  assert.equal(empty.percent, 0);
  assert.equal(empty.sequence, 2);
});

test("overall production progress uses canonical task weights and active task partial progress", () => {
  assert.equal(
    calculateOverallProgress(["T010", "T020", "T030"]),
    30
  );
  assert.equal(
    calculateOverallProgress(
      ["T010", "T020", "T030"],
      { task_id: "T040", percent: 50 }
    ),
    34
  );
  assert.equal(
    calculateOverallProgress(
      ["T010", "T020", "T030", "T040"],
      { task_id: "T040", percent: 50 }
    ),
    38
  );
});
