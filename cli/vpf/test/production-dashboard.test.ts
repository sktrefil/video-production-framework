import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { ProductionTailRepository } from "@vpf/storage/production-tail";
import { WorkflowOrchestratorRepository } from "@vpf/storage/workflow-orchestrator";
import {
  combineEtaRanges,
  estimateTaskRemaining
} from "../src/production-dashboard-eta.js";
import { ProductionDashboardHub } from "../src/production-dashboard-hub.js";
import {
  buildClipPlanPreview,
  countGeneratedImageFiles,
  inspectFlowManifestFiles,
  ProductionDashboardSnapshotService
} from "../src/production-dashboard-snapshot.js";
import {
  resolveDashboardImagePath,
  startProductionDashboard
} from "../src/production-dashboard-server.js";
import type { ProductionProgressEvent } from "../src/production-progress.js";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const resourcesDir = path.join(repositoryRoot, "resources");
const migrationsDir = path.join(repositoryRoot, "migrations");

function event(
  sequence: number,
  type: ProductionProgressEvent["event"],
  extra: Partial<ProductionProgressEvent> = {}
): ProductionProgressEvent {
  return {
    schema_version: "1.0",
    sequence,
    event: type,
    project_id: "dashboard_fixture",
    at: "2026-09-25T06:00:0" + String(sequence) + ".000Z",
    ...extra
  };
}

async function fixture(projectId = "dashboard_fixture") {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-dashboard-"));
  const workspaceRoot = path.join(root, "workspace");
  const service = new ProjectBootstrapService({
    repositoryRoot,
    resourcesDir,
    migrationsDir,
    workspaceRoot
  });
  const created = await service.createProject({
    projectId,
    title: "Dashboard Fixture",
    format: "longform"
  });
  return { root, service, created };
}

test("dashboard ETA uses ranges and improves from real item throughput", () => {
  const initial = estimateTaskRemaining("T050", 0, 0);
  assert.deepEqual(initial, {
    min_sec: 120,
    max_sec: 300,
    confidence: "LOW",
    source: "DEFAULT"
  });

  const measured = estimateTaskRemaining(
    "T070",
    600,
    40,
    { completed: 5, total: 10 }
  );
  assert.deepEqual(measured, {
    min_sec: 480,
    max_sec: 720,
    confidence: "HIGH",
    source: "ITEM_RATE"
  });
  assert.equal(estimateTaskRemaining("T080", 10, 50), null);

  const combined = combineEtaRanges([initial, measured]);
  assert.ok(combined !== null);
  assert.equal(combined.min_sec, 600);
  assert.equal(combined.max_sec, 1020);
});

test("dashboard hub preserves event order and isolates broken subscribers", () => {
  const hub = new ProductionDashboardHub();
  const seen: number[] = [];
  hub.subscribe(item => { seen.push(item.sequence); });
  let brokenCalls = 0;
  hub.subscribe(() => {
    brokenCalls += 1;
    throw new Error("client disconnected");
  });

  hub.publish(event(1, "RUN_STARTED"));
  hub.publish(event(2, "TASK_STARTED", { task_id: "T010" }));
  hub.publish(event(3, "TASK_PROGRESS", {
    task_id: "T010",
    percent: 25,
    completed: 25,
    total: 100
  }));

  assert.deepEqual(seen, [1, 2, 3]);
  assert.equal(brokenCalls, 1);
  assert.deepEqual(hub.snapshot().recent_events.map(item => item.sequence), [1, 2, 3]);
  assert.equal(hub.snapshot().task_progress.T010?.percent, 25);
});

test("dashboard exposes T060 clip prompts and scene handoff before T080", () => {
  const promptBundle = {
    schema_version: "1.0",
    project_id: "dashboard_fixture",
    compiler_version: "AGENT3_PROMPT_COMPILER_V1",
    image_prompts: [],
    video_prompts: [{
      clip_id: "CLIP_01",
      scene_id: "SC01",
      entry_state_image_id: "SC01_ENTRY",
      mid_state_image_id: "SC01_MID",
      target_state_image_id: "SC01_TARGET",
      prompt_ko: "진입에서 목표 상태까지 연결한다.",
      prompt_en: "Connect entry to target.",
      provider_prompt_en: "Flow prompt with continuity and camera motion.",
      editorial_duration_sec: 8,
      narrative_deadline_sec: 7,
      target_state_deadline_sec: 7.5,
      safe_trim_start_sec: 8
    }]
  } as Parameters<typeof buildClipPlanPreview>[0];
  const sceneVisual = {
    schema_version: "1.0",
    project_id: "dashboard_fixture",
    visual_bible: {
      resource_id: "VB",
      version: "1",
      content_hash: "a".repeat(64)
    },
    scenes: [{
      scene_id: "SC01",
      story_role: "HOOK",
      factuality_mode: "EVIDENCE",
      fact_refs: [],
      narrative_purpose_ko: "",
      narrative_purpose_en: "",
      visual_intent_ko: "",
      visual_intent_en: "",
      environment_ko: "",
      environment_en: "",
      subject_ko: "",
      subject_en: "",
      action_ko: "",
      action_en: "",
      evidence_constraints: [],
      uncertainty_handling_ko: "",
      uncertainty_handling_en: "",
      forbidden_visual_claims: [],
      continuity: {
        character_identity: [],
        environment_identity: [],
        lighting_direction: "LEFT",
        color_language: "COOL",
        weather: "MIST",
        movement_direction: "RIGHTWARD",
        screen_direction: "LEFT_TO_RIGHT",
        camera_energy: "RESTRAINED",
        visual_motif: []
      },
      handoff: {
        entry_anchor: "river bend",
        exit_anchor: "reeds at screen right",
        preserve_elements: ["river bend", "reeds"],
        next_cut_intent: "continue rightward"
      }
    }]
  } as Parameters<typeof buildClipPlanPreview>[1];

  const preview = buildClipPlanPreview(promptBundle, sceneVisual);
  assert.equal(preview.available, true);
  assert.equal(preview.total, 1);
  assert.equal(preview.items[0]?.provider_prompt_en, "Flow prompt with continuity and camera motion.");
  assert.equal(preview.items[0]?.handoff?.exit_anchor, "reeds at screen right");
  assert.deepEqual(preview.items[0]?.handoff?.preserve_elements, ["river bend", "reeds"]);
  assert.equal(preview.items[0]?.continuity?.screen_direction, "LEFT_TO_RIGHT");
  assert.equal(preview.items[0]?.fantasy_mode, "RESTRAINED");
});

test("dashboard counts only real generated image files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-dashboard-images-"));
  try {
    await mkdir(path.join(root, "05_images", "generated"), { recursive: true });
    await writeFile(path.join(root, "05_images", "generated", "STATE_A.png"), "a");
    await writeFile(path.join(root, "05_images", "generated", "STATE_C.png"), "c");

    const result = await countGeneratedImageFiles(
      root,
      ["STATE_A", "STATE_B", "STATE_C"]
    );
    assert.equal(result.total, 3);
    assert.equal(result.completed, 2);
    assert.deepEqual(
      result.items.filter(item => item.ready).map(item => item.state_image_id),
      ["STATE_A", "STATE_C"]
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dashboard reports real missing Google Flow outputs without mutating them", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-dashboard-flow-"));
  try {
    await mkdir(path.join(root, "06_clips", "generated"), { recursive: true });
    await writeFile(
      path.join(root, "06_clips", "google-flow-manifest.json"),
      JSON.stringify({
        items: [
          { clip_id: "CLIP_01", expected_output_relative_path: "06_clips/generated/CLIP_01.mp4" },
          { clip_id: "CLIP_02", expected_output_relative_path: "06_clips/generated/CLIP_02.mp4" }
        ]
      }),
      "utf8"
    );
    await writeFile(path.join(root, "06_clips", "generated", "CLIP_01.mp4"), "clip");

    const result = await inspectFlowManifestFiles(root);
    assert.equal(result.exists, true);
    assert.equal(result.total, 2);
    assert.equal(result.completed, 1);
    assert.deepEqual(result.missing, ["06_clips/generated/CLIP_02.mp4"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dashboard snapshot reconstructs progress from DB and does not mutate workflow", async () => {
  const { root, service, created } = await fixture("dashboard_db_fixture");
  try {
    const repo = new WorkflowOrchestratorRepository(created.projectDbPath);
    try {
      repo.updateTask({
        projectId: "dashboard_db_fixture",
        taskId: "T010",
        status: "COMPLETE",
        attempt: 1,
        startedAt: "2026-09-25T06:00:00.000Z",
        completedAt: "2026-09-25T06:02:00.000Z",
        updatedAt: "2026-09-25T06:02:00.000Z"
      });
      repo.updateTask({
        projectId: "dashboard_db_fixture",
        taskId: "T020",
        status: "RUNNING",
        attempt: 1,
        startedAt: "2026-09-25T06:03:00.000Z",
        completedAt: null,
        updatedAt: "2026-09-25T06:03:00.000Z"
      });
    } finally {
      repo.close();
    }

    const hub = new ProductionDashboardHub();
    hub.publish(event(1, "TASK_PROGRESS", {
      project_id: "dashboard_db_fixture",
      task_id: "T020",
      percent: 50,
      completed: 50,
      total: 100,
      at: "2026-09-25T06:04:00.000Z"
    }));
    const snapshot = new ProductionDashboardSnapshotService(
      service,
      hub,
      () => "2026-09-25T06:05:00.000Z"
    );

    const beforeRepo = new WorkflowOrchestratorRepository(created.projectDbPath, { readonly: true });
    const before = beforeRepo.listTasks("dashboard_db_fixture").map(item => [item.task_id, item.status]);
    beforeRepo.close();

    const state = await snapshot.get("dashboard_db_fixture");
    assert.equal(state.overall_percent, 14);
    assert.equal(state.current_task, "T020");
    assert.equal(state.tasks.find(item => item.task_id === "T010")?.elapsed_sec, 120);
    assert.equal(state.tasks.find(item => item.task_id === "T020")?.elapsed_sec, 120);

    const afterRepo = new WorkflowOrchestratorRepository(created.projectDbPath, { readonly: true });
    const after = afterRepo.listTasks("dashboard_db_fixture").map(item => [item.task_id, item.status]);
    afterRepo.close();
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dashboard exposes T070 seed, scene and final visual QC state", async () => {
  const { root, service, created } = await fixture("dashboard_t070_qc_fixture");
  try {
    await mkdir(path.join(created.projectRoot, "05_images", "generated"), { recursive: true });
    await writeFile(
      path.join(created.projectRoot, "05_images", "generated", "t070-checkpoint.json"),
      JSON.stringify({
        schema_version: "1.0",
        project_id: "dashboard_t070_qc_fixture",
        source_prompt_bundle_sha256: "a".repeat(64),
        width: 1920,
        height: 1080,
        phase: "FULL_GENERATION",
        seed_image_ids: ["SEED_A", "SEED_B", "SEED_C"],
        scene_qc_passed_ids: ["SC01", "SC02"],
        scene_qc_attempts: { SC01: 1, SC02: 2, SC03: 1 },
        revision_feedback_by_state: { SC03_MID: "regenerate composition" },
        images: [],
        updated_at: "2026-09-25T06:00:00.000Z"
      }),
      "utf8"
    );

    const tail = new ProductionTailRepository(created.projectDbPath);
    try {
      tail.save(
        "dashboard_t070_qc_fixture",
        "t070_seed_visual_qc",
        {
          schema_version: "1.0",
          policy_version: "T070_IMAGE_POLICY_V1",
          verdict: "PASS",
          cross_seed_diversity: "PASS",
          style_coherence: "PASS"
        },
        "T070",
        "2026-09-25T06:01:00.000Z"
      );
      tail.save(
        "dashboard_t070_qc_fixture",
        "t070_final_visual_qc",
        {
          schema_version: "1.0",
          policy_version: "T070_IMAGE_POLICY_V1",
          verdict: "REVISE",
          checked_image_count: 43,
          expected_image_count: 43,
          failed_scene_ids: ["SC03"],
          failed_image_ids: ["SC03_MID"]
        },
        "T070",
        "2026-09-25T06:02:00.000Z"
      );
    } finally {
      tail.close();
    }

    const snapshot = new ProductionDashboardSnapshotService(
      service,
      new ProductionDashboardHub()
    );
    const state = await snapshot.get("dashboard_t070_qc_fixture");
    assert.equal(state.t070.phase, "FULL_GENERATION");
    assert.deepEqual(state.t070.seed_image_ids, ["SEED_A", "SEED_B", "SEED_C"]);
    assert.equal(state.t070.seed_qc_verdict, "PASS");
    assert.equal(state.t070.seed_cross_seed_diversity, "PASS");
    assert.equal(state.t070.seed_style_coherence, "PASS");
    assert.deepEqual(state.t070.scene_qc_passed_ids, ["SC01", "SC02"]);
    assert.equal(state.t070.revision_pending_count, 1);
    assert.equal(state.t070.final_qc_verdict, "REVISE");
    assert.equal(state.t070.final_checked_image_count, 43);
    assert.deepEqual(state.t070.final_failed_scene_ids, ["SC03"]);
    assert.deepEqual(state.t070.final_failed_image_ids, ["SC03_MID"]);
    assert.equal(state.t070.policy_version, "T070_IMAGE_POLICY_V1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dashboard only reports production complete after T100 DB completion and final artifacts", async () => {
  const { root, service, created } = await fixture("dashboard_complete_fixture");
  try {
    const repo = new WorkflowOrchestratorRepository(created.projectDbPath);
    try {
      for (const task of repo.listTasks("dashboard_complete_fixture")) {
        repo.updateTask({
          projectId: "dashboard_complete_fixture",
          taskId: task.task_id,
          status: "COMPLETE",
          attempt: Math.max(1, task.attempt),
          startedAt: "2026-09-25T06:00:00.000Z",
          completedAt: "2026-09-25T06:10:00.000Z",
          updatedAt: "2026-09-25T06:10:00.000Z"
        });
      }
    } finally {
      repo.close();
    }

    const hub = new ProductionDashboardHub();
    const snapshot = new ProductionDashboardSnapshotService(
      service,
      hub,
      () => "2026-09-25T06:10:00.000Z"
    );
    const before = await snapshot.get("dashboard_complete_fixture");
    assert.equal(before.final.production_complete, false);

    await mkdir(path.join(created.projectRoot, "09_render"), { recursive: true });
    await writeFile(path.join(created.projectRoot, "09_render", "final.mp4"), "final");
    const tail = new ProductionTailRepository(created.projectDbPath);
    try {
      tail.save(
        "dashboard_complete_fixture",
        "final_qc_result",
        { schema_version: "1.0", verdict: "APPROVE" },
        "T100",
        "2026-09-25T06:10:00.000Z"
      );
    } finally {
      tail.close();
    }

    const after = await snapshot.get("dashboard_complete_fixture");
    assert.equal(after.overall_percent, 100);
    assert.equal(after.final.production_complete, true);
    assert.equal(after.final.final_qc_verdict, "APPROVE");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dashboard image endpoint rejects traversal and non-generated paths", () => {
  const root = path.resolve("workspace", "projects", "safe_project");
  assert.equal(resolveDashboardImagePath(root, encodeURIComponent("../secret.png")), null);
  assert.equal(resolveDashboardImagePath(root, encodeURIComponent("06_clips/generated/a.png")), null);
  const valid = resolveDashboardImagePath(
    root,
    encodeURIComponent("05_images/generated/STATE_A.png")
  );
  assert.equal(valid, path.resolve(root, "05_images/generated/STATE_A.png"));
});

test("dashboard server binds only to localhost", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-dashboard-server-"));
  const hub = new ProductionDashboardHub();
  const fakeSnapshot = {
    get: async () => ({})
  } as unknown as ProductionDashboardSnapshotService;
  const handle = await startProductionDashboard({
    projectId: "server_fixture",
    projectRoot: root,
    snapshot: fakeSnapshot,
    hub,
    preferredPort: 0
  });
  try {
    assert.equal(handle.host, "127.0.0.1");
    assert.match(handle.url, /^http:\/\/127\.0\.0\.1:\d+\/$/u);
    const response = await fetch(handle.url);
    assert.equal(response.status, 200);
    const page = await response.text();
    assert.match(page, /VPF LONGFORM PRODUCTION/u);
    assert.match(page, /T060 VIDEO CLIP PLAN — PREVIEW/u);
    assert.match(page, /Google Flow provider prompt/u);
    assert.match(page, /fantasy /u);
    assert.match(page, /T070 IMAGE GENERATION \/ VISUAL QC/u);
    assert.match(page, /t070-qc-summary/u);
    assert.match(page, /Seed diversity:/u);
    assert.match(page, /Scene QC passed:/u);
    assert.match(page, /Final coverage:/u);
  } finally {
    await handle.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("production run keeps JSONL stdout separate from dashboard diagnostics", async () => {
  const source = await readFile(path.join(repositoryRoot, "cli", "vpf", "src", "index.ts"), "utf8");
  assert.match(
    source,
    /if \(eventsJsonl\) \{\s*io\.out\(JSON\.stringify\(event\)\);\s*\} else if \(terminalProgress !== null\)/u
  );
  assert.match(source, /io\.error\("\[VPF DASHBOARD\] " \+ dashboard\.url\)/u);
  assert.match(source, /Dashboard lifecycle is observational and must not affect production exit/u);
});


test("dashboard event log persists ordered JSONL without blocking publishers", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-dashboard-log-"));
  try {
    const logPath = path.join(root, "logs", "production-events.jsonl");
    const hub = new ProductionDashboardHub(logPath);
    hub.publish(event(1, "RUN_STARTED"));
    hub.publish(event(2, "TASK_STARTED", { task_id: "T010" }));
    hub.publish(event(3, "TASK_PROGRESS", {
      task_id: "T010",
      percent: 25,
      completed: 25,
      total: 100
    }));
    await hub.flush();
    const lines = (await readFile(logPath, "utf8")).trim().split("\n");
    assert.deepEqual(
      lines.map(line => (JSON.parse(line) as ProductionProgressEvent).sequence),
      [1, 2, 3]
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dashboard SSE delivers production events in order", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-dashboard-sse-"));
  const hub = new ProductionDashboardHub();
  const fakeSnapshot = { get: async () => ({}) } as unknown as ProductionDashboardSnapshotService;
  const handle = await startProductionDashboard({
    projectId: "sse_fixture",
    projectRoot: root,
    snapshot: fakeSnapshot,
    hub,
    preferredPort: 0
  });
  const controller = new AbortController();
  try {
    const response = await fetch(handle.url + "api/events", { signal: controller.signal });
    assert.equal(response.status, 200);
    assert.ok(response.body !== null);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let body = "";
    hub.publish(event(1, "RUN_STARTED", { project_id: "sse_fixture" }));
    hub.publish(event(2, "TASK_STARTED", {
      project_id: "sse_fixture",
      task_id: "T010"
    }));
    const deadline = Date.now() + 1500;
    while (!body.includes('"sequence":2') && Date.now() < deadline) {
      const next = await Promise.race([
        reader.read(),
        new Promise<{done:true;value?:undefined}>(resolve =>
          setTimeout(() => resolve({ done: true }), 100)
        )
      ]);
      if (next.done) continue;
      body += decoder.decode(next.value, { stream: true });
    }
    assert.match(body, /"sequence":1/u);
    assert.match(body, /"sequence":2/u);
    assert.ok(body.indexOf('"sequence":1') < body.indexOf('"sequence":2'));
  } finally {
    controller.abort();
    await handle.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("dashboard reports T090 frame progress as unavailable instead of inventing it", async () => {
  const { root, service } = await fixture("dashboard_t090_fixture");
  try {
    const hub = new ProductionDashboardHub();
    const snapshot = new ProductionDashboardSnapshotService(service, hub);
    const state = await snapshot.get("dashboard_t090_fixture");
    assert.equal(state.t090.render_progress_available, false);
    assert.equal(state.t090.rendered_frames, null);
    assert.equal(state.t090.total_frames, null);
    assert.match(state.t090.message, /unavailable/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("production run gives dashboard a final snapshot settle window before shutdown", async () => {
  const source = await readFile(path.join(repositoryRoot, "cli", "vpf", "src", "index.ts"), "utf8");
  assert.match(source, /await dashboardHub\?\.flush\(\);\s*await settleDashboardFinalState\(dashboard\);\s*await dashboard\?\.close\(\);/u);
});
