import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ProviderJob } from "@vpf/domain";
import {
  RuntimeExecutorRegistry,
  RuntimeOrchestrator
} from "@vpf/provider-orchestrator";
import type { RuntimeJob, RuntimeResult } from "@vpf/runtime-contracts";
import { SqliteRuntimeExecutionRepository } from "../src/runtime-execution.js";

const now = "2026-09-10T03:20:00.000Z";

test("sqlite + orchestrator persists COMPLETE provider revision, candidate media and execution receipts", async () => {
  const repository = new SqliteRuntimeExecutionRepository(":memory:");
  repository.db.exec("CREATE TABLE projects (project_id TEXT, revision INTEGER, lifecycle_status TEXT, pipeline TEXT, legacy_allowed INTEGER); INSERT INTO projects VALUES ('project_integration',1,'ACTIVE','VPF_UNIFIED_V1',0)");
  try {
    const initial: ProviderJob = {
      id: "job_integration",
      projectId: "project_integration",
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      jobType: "IMAGE_GENERATION",
      provider: "MOCK_IMAGE",
      providerProfileVersion: "mock-v1",
      targetType: "ASSET",
      targetId: "asset_1",
      targetRevision: 1,
      executionMode: "AUTOMATED",
      status: "READY",
      attempt: 1,
      inputPayload: { prompt: "approved exact prompt" },
      resultMediaIds: []
    };

    repository.db.prepare(
      `INSERT INTO provider_jobs
        (id, project_id, revision, lifecycle_status, job_type, provider,
         provider_profile_version, target_type, target_id, target_revision,
         execution_mode, status, attempt, retry_of_job_id, input_payload_json,
         result_media_ids_json, error_code, error_detail, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      initial.id,
      initial.projectId,
      initial.revision,
      initial.lifecycleStatus,
      initial.jobType,
      initial.provider,
      initial.providerProfileVersion,
      initial.targetType,
      initial.targetId,
      initial.targetRevision,
      initial.executionMode,
      initial.status,
      initial.attempt,
      null,
      JSON.stringify(initial.inputPayload),
      "[]",
      null,
      null,
      now,
      now
    );

    const workspaceRoot = await mkdtemp(join(tmpdir(), "vpf-sql-mig02-"));
    const projectRoot = join(workspaceRoot, "projects", initial.projectId);
    await mkdir(join(projectRoot, "05_images"), { recursive: true });

    const registry = new RuntimeExecutorRegistry();
    registry.register({
      provider: "MOCK_IMAGE",
      jobType: "IMAGE_GENERATION",
      executor: {
        async execute(job: RuntimeJob): Promise<RuntimeResult> {
          const bytes = Buffer.from("sqlite-image");
          await writeFile(
            join(projectRoot, "05_images", "candidate.png"),
            bytes
          );
          return {
            schemaVersion: 1,
            jobId: job.jobId,
            jobRevision: job.jobRevision,
            projectId: job.projectId,
            attempt: job.attempt,
            status: "COMPLETE",
            providerRequestIds: ["provider_req_1"],
            outputs: [
              {
                role: "primary",
                relativePath: "05_images/candidate.png",
                mimeType: "image/png",
                sizeBytes: bytes.length,
                sha256: createHash("sha256").update(bytes).digest("hex")
              }
            ],
            startedAt: now,
            completedAt: now
          };
        }
      }
    });

    let id = 0;
    const orchestrator = new RuntimeOrchestrator(
      repository,
      {
        async getCurrentTargetRevision() {
          return 1;
        }
      },
      registry,
      { nowIso: () => now },
      {
        next(prefix) {
          id += 1;
          return prefix + "_" + id;
        }
      },
      { workspaceRoot, env: {} }
    );

    const outcome = await orchestrator.executeAutomated(
      initial.projectId,
      initial.id,
      {
        expectedOutputs: [
          {
            role: "primary",
            mediaType: "IMAGE",
            required: true,
            acceptedMimeTypes: ["image/png"]
          }
        ]
      }
    );

    assert.equal(outcome.providerJob.status, "COMPLETE");
    assert.equal(outcome.media.length, 1);

    const latest = await repository.getLatestProviderJob(
      initial.projectId,
      initial.id
    );
    assert.equal(latest?.revision, 3);
    assert.equal(latest?.status, "COMPLETE");
    assert.equal(latest?.resultMediaIds.length, 1);

    const mediaCount = repository.db.prepare(
      "SELECT COUNT(*) AS count FROM media_artifacts WHERE project_id = ? AND source_job_id = ?"
    ).get(initial.projectId, initial.id) as { count: number };
    assert.equal(mediaCount.count, 1);

    const receipts = await repository.listRuntimeReceipts(
      initial.projectId,
      initial.id
    );
    assert.deepEqual(
      receipts.map(item => item.stage),
      ["RUNNING", "COMPLETE"]
    );
    assert.deepEqual(
      receipts[1]?.runtimeResult?.providerRequestIds,
      ["provider_req_1"]
    );

    const eventCount = repository.db.prepare(
      "SELECT COUNT(*) AS count FROM workflow_events WHERE project_id = ? AND event_type LIKE 'RUNTIME_%'"
    ).get(initial.projectId) as { count: number };
    assert.equal(eventCount.count, 2);
  } finally {
    repository.close();
  }
});
