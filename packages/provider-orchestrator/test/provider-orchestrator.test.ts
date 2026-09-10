import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { MediaArtifact, ProviderJob } from "@vpf/domain";
import type {
  RuntimeJob,
  RuntimeResult
} from "@vpf/runtime-contracts";
import {
  RuntimeExecutorRegistry,
  RuntimeOrchestrator,
  type RuntimeExecutionReceipt,
  type RuntimePersistencePort,
  type RuntimeTargetRevisionPort
} from "../src/index.js";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";

const now = "2026-09-10T03:00:00.000Z";

function providerJob(input: Partial<ProviderJob> = {}): ProviderJob {
  return {
    id: "job_1",
    projectId: "project_1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    jobType: "IMAGE_GENERATION",
    provider: "MOCK_IMAGE",
    providerProfileVersion: "mock-image-v1",
    targetType: "ASSET",
    targetId: "asset_1",
    targetRevision: 1,
    executionMode: "AUTOMATED",
    status: "READY",
    attempt: 1,
    inputPayload: { prompt: "exact approved prompt" },
    resultMediaIds: [],
    ...input
  };
}

class MemoryPersistence implements RuntimePersistencePort {
  readonly jobs = new Map<string, ProviderJob>();
  readonly receipts: RuntimeExecutionReceipt[] = [];
  readonly media: MediaArtifact[] = [];
  readonly events: WorkflowEvent[] = [];
  readonly outbox: OutboxRecord[] = [];

  constructor(jobs: ProviderJob[]) {
    for (const job of jobs) this.jobs.set(job.id, job);
  }

  async getLatestProviderJob(projectId: string, jobId: string) {
    const job = this.jobs.get(jobId);
    return job?.projectId === projectId ? job : null;
  }

  async recordRuntimeReceipt(input: {
    receipt: RuntimeExecutionReceipt;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.receipts.push(input.receipt);
    this.events.push(input.event);
    this.outbox.push(input.outbox);
  }

  async commitProviderTransition(input: {
    previousJob: ProviderJob;
    nextJob: ProviderJob;
    receipt: RuntimeExecutionReceipt;
    media: MediaArtifact[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    assert.equal(this.jobs.get(input.previousJob.id)?.revision, input.previousJob.revision);
    this.jobs.set(input.nextJob.id, input.nextJob);
    this.receipts.push(input.receipt);
    this.media.push(...input.media);
    this.events.push(input.event);
    this.outbox.push(input.outbox);
  }
}

class MutableTarget implements RuntimeTargetRevisionPort {
  revision = 1;

  async getCurrentTargetRevision() {
    return this.revision;
  }
}

function ids() {
  let n = 0;
  return {
    next(prefix: "med" | "runtime_receipt" | "evt" | "outbox") {
      n += 1;
      return prefix + "_" + n;
    }
  };
}

const clock = { nowIso: () => now };
const imageExpected = [
  {
    role: "primary",
    mediaType: "IMAGE" as const,
    required: true,
    acceptedMimeTypes: ["image/png"]
  }
];

async function createWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "vpf-mig02-"));
  const projectRoot = join(root, "projects", "project_1");
  await mkdir(join(projectRoot, "05_images"), { recursive: true });
  await mkdir(join(projectRoot, "06_clips"), { recursive: true });
  await mkdir(join(projectRoot, "03_tts"), { recursive: true });
  return { root, projectRoot };
}

function sha(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("automated image execution persists RUNNING/COMPLETE and ingests candidate media only", async () => {
  const workspace = await createWorkspace();
  const initial = providerJob();
  const persistence = new MemoryPersistence([initial]);
  const target = new MutableTarget();
  const registry = new RuntimeExecutorRegistry();

  registry.register({
    provider: "MOCK_IMAGE",
    jobType: "IMAGE_GENERATION",
    executor: {
      async execute(job: RuntimeJob): Promise<RuntimeResult> {
        const bytes = Buffer.from("fake-png");
        const path = join(workspace.projectRoot, "05_images", "candidate.png");
        await writeFile(path, bytes);
        return {
          schemaVersion: 1,
          jobId: job.jobId,
          jobRevision: job.jobRevision,
          projectId: job.projectId,
          attempt: job.attempt,
          status: "COMPLETE",
          providerRequestIds: ["req_image_1"],
          outputs: [
            {
              role: "primary",
              relativePath: "05_images/candidate.png",
              mimeType: "image/png",
              sizeBytes: bytes.length,
              sha256: sha(bytes),
              width: 1024,
              height: 1024
            }
          ],
          startedAt: now,
          completedAt: now
        };
      }
    }
  });

  const orchestrator = new RuntimeOrchestrator(
    persistence,
    target,
    registry,
    clock,
    ids(),
    { workspaceRoot: workspace.root, env: {} }
  );

  const outcome = await orchestrator.executeAutomated(
    "project_1",
    "job_1",
    { expectedOutputs: imageExpected }
  );

  assert.equal(outcome.providerJob.status, "COMPLETE");
  assert.equal(outcome.providerJob.revision, 3);
  assert.equal(outcome.media.length, 1);
  assert.equal(outcome.media[0]!.mediaStatus, "AVAILABLE");
  assert.equal(outcome.media[0]!.sourceJobId, "job_1");
  assert.equal("approvalState" in outcome.media[0]!, false);
  assert.deepEqual(
    persistence.receipts.map(item => item.stage),
    ["RUNNING", "COMPLETE"]
  );
  assert.equal(persistence.events.length, 2);
  assert.equal(persistence.outbox.length, 2);
});

test("manual external job prepares without executor and imports through the same artifact path", async () => {
  const workspace = await createWorkspace();
  const initial = providerJob({
    id: "job_manual",
    executionMode: "MANUAL_EXTERNAL",
    status: "WAITING_EXTERNAL",
    jobType: "VIDEO_GENERATION",
    provider: "GOOGLE_FLOW",
    providerProfileVersion: "flow-manual-v1",
    targetType: "CLIP",
    targetId: "clip_1",
    inputPayload: { prompt: "exact flow prompt", durationMs: 5000 }
  });
  const persistence = new MemoryPersistence([initial]);
  const target = new MutableTarget();
  const registry = new RuntimeExecutorRegistry();
  const orchestrator = new RuntimeOrchestrator(
    persistence,
    target,
    registry,
    clock,
    ids(),
    { workspaceRoot: workspace.root, env: {} }
  );

  const expected = [
    {
      role: "video",
      mediaType: "VIDEO" as const,
      required: true,
      acceptedMimeTypes: ["video/mp4"]
    }
  ];
  const runtimeJob = await orchestrator.prepareManual(
    "project_1",
    "job_manual",
    { expectedOutputs: expected }
  );

  assert.equal(runtimeJob.jobRevision, 1);
  assert.equal(persistence.jobs.get("job_manual")?.status, "WAITING_EXTERNAL");
  assert.deepEqual(persistence.receipts.map(item => item.stage), ["PREPARED"]);

  const bytes = Buffer.from("fake-mp4");
  await writeFile(join(workspace.projectRoot, "06_clips", "clip.mp4"), bytes);
  const outcome = await orchestrator.ingestManualResult({
    projectId: "project_1",
    jobId: "job_manual",
    runtimeJob,
    result: {
      schemaVersion: 1,
      jobId: runtimeJob.jobId,
      jobRevision: runtimeJob.jobRevision,
      projectId: runtimeJob.projectId,
      attempt: runtimeJob.attempt,
      status: "COMPLETE",
      providerRequestIds: [],
      outputs: [
        {
          role: "video",
          relativePath: "06_clips/clip.mp4",
          mimeType: "video/mp4",
          sizeBytes: bytes.length,
          sha256: sha(bytes),
          durationMs: 5000
        }
      ],
      startedAt: now,
      completedAt: now
    }
  });

  assert.equal(outcome.providerJob.status, "COMPLETE");
  assert.equal(outcome.providerJob.revision, 2);
  assert.equal(outcome.media[0]?.mediaType, "VIDEO");
  assert.deepEqual(
    persistence.receipts.map(item => item.stage),
    ["PREPARED", "COMPLETE"]
  );
});

test("artifact checksum mismatch blocks provider job and creates no MediaArtifact", async () => {
  const workspace = await createWorkspace();
  const persistence = new MemoryPersistence([providerJob()]);
  const target = new MutableTarget();
  const registry = new RuntimeExecutorRegistry();

  registry.register({
    provider: "MOCK_IMAGE",
    jobType: "IMAGE_GENERATION",
    executor: {
      async execute(job: RuntimeJob): Promise<RuntimeResult> {
        const bytes = Buffer.from("actual");
        await writeFile(
          join(workspace.projectRoot, "05_images", "bad.png"),
          bytes
        );
        return {
          schemaVersion: 1,
          jobId: job.jobId,
          jobRevision: job.jobRevision,
          projectId: job.projectId,
          attempt: job.attempt,
          status: "COMPLETE",
          providerRequestIds: [],
          outputs: [
            {
              role: "primary",
              relativePath: "05_images/bad.png",
              mimeType: "image/png",
              sizeBytes: bytes.length,
              sha256: sha(Buffer.from("different"))
            }
          ],
          startedAt: now,
          completedAt: now
        };
      }
    }
  });

  const orchestrator = new RuntimeOrchestrator(
    persistence,
    target,
    registry,
    clock,
    ids(),
    { workspaceRoot: workspace.root, env: {} }
  );
  const outcome = await orchestrator.executeAutomated(
    "project_1",
    "job_1",
    { expectedOutputs: imageExpected }
  );

  assert.equal(outcome.providerJob.status, "BLOCKED");
  assert.equal(outcome.providerJob.errorCode, "ARTIFACT_HASH_MISMATCH");
  assert.equal(outcome.media.length, 0);
});

test("target revision drift after provider execution blocks result ingestion", async () => {
  const workspace = await createWorkspace();
  const persistence = new MemoryPersistence([providerJob()]);
  const target = new MutableTarget();
  const registry = new RuntimeExecutorRegistry();

  registry.register({
    provider: "MOCK_IMAGE",
    jobType: "IMAGE_GENERATION",
    executor: {
      async execute(job: RuntimeJob): Promise<RuntimeResult> {
        const bytes = Buffer.from("fake-png");
        await writeFile(
          join(workspace.projectRoot, "05_images", "stale.png"),
          bytes
        );
        target.revision = 2;
        return {
          schemaVersion: 1,
          jobId: job.jobId,
          jobRevision: job.jobRevision,
          projectId: job.projectId,
          attempt: job.attempt,
          status: "COMPLETE",
          providerRequestIds: [],
          outputs: [
            {
              role: "primary",
              relativePath: "05_images/stale.png",
              mimeType: "image/png",
              sizeBytes: bytes.length,
              sha256: sha(bytes)
            }
          ],
          startedAt: now,
          completedAt: now
        };
      }
    }
  });

  const orchestrator = new RuntimeOrchestrator(
    persistence,
    target,
    registry,
    clock,
    ids(),
    { workspaceRoot: workspace.root, env: {} }
  );
  const outcome = await orchestrator.executeAutomated(
    "project_1",
    "job_1",
    { expectedOutputs: imageExpected }
  );

  assert.equal(outcome.providerJob.status, "BLOCKED");
  assert.equal(outcome.providerJob.errorCode, "RUNTIME_TARGET_STALE");
  assert.equal(outcome.media.length, 0);
});

test("executor exception maps to stable FAILED runtime/provider state", async () => {
  const workspace = await createWorkspace();
  const persistence = new MemoryPersistence([providerJob()]);
  const target = new MutableTarget();
  const registry = new RuntimeExecutorRegistry();

  registry.register({
    provider: "MOCK_IMAGE",
    jobType: "IMAGE_GENERATION",
    executor: {
      async execute() {
        throw new Error("network unavailable");
      }
    }
  });

  const orchestrator = new RuntimeOrchestrator(
    persistence,
    target,
    registry,
    clock,
    ids(),
    { workspaceRoot: workspace.root, env: {} }
  );
  const outcome = await orchestrator.executeAutomated(
    "project_1",
    "job_1",
    { expectedOutputs: imageExpected }
  );

  assert.equal(outcome.result.status, "FAILED");
  assert.equal(outcome.providerJob.status, "FAILED");
  assert.equal(outcome.providerJob.errorCode, "PROVIDER_REQUEST_FAILED");
  assert.equal(outcome.media.length, 0);
});
