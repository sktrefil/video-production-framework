import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderJob } from "@vpf/domain";
import type { RuntimeExecutionReceipt } from "@vpf/provider-orchestrator";
import {
  materializeRuntimeJob,
  nextProviderJobRunning
} from "@vpf/runtime-contracts";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import { SqliteRuntimeExecutionRepository } from "../src/runtime-execution.js";

const now = "2026-09-10T03:10:00.000Z";

function seedJob(repository: SqliteRuntimeExecutionRepository): ProviderJob {
  const job: ProviderJob = {
    id: "job_sql",
    projectId: "project_sql",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    jobType: "IMAGE_GENERATION",
    provider: "MOCK_IMAGE",
    providerProfileVersion: "mock-v1",
    targetType: "ASSET",
    targetId: "asset_sql",
    targetRevision: 1,
    executionMode: "AUTOMATED",
    status: "READY",
    attempt: 1,
    inputPayload: { prompt: "approved" },
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
    job.id,
    job.projectId,
    job.revision,
    job.lifecycleStatus,
    job.jobType,
    job.provider,
    job.providerProfileVersion,
    job.targetType,
    job.targetId,
    job.targetRevision,
    job.executionMode,
    job.status,
    job.attempt,
    null,
    JSON.stringify(job.inputPayload),
    "[]",
    null,
    null,
    job.createdAt,
    job.updatedAt
  );

  return job;
}

test("sqlite commits provider transition, runtime receipt and durable event atomically", async () => {
  const repository = new SqliteRuntimeExecutionRepository(":memory:");
  try {
    const ready = seedJob(repository);
    const running = nextProviderJobRunning(ready, now);
    const runtimeJob = materializeRuntimeJob({
      job: running,
      expectedOutputs: [
        { role: "primary", mediaType: "IMAGE", required: true }
      ]
    });
    const receipt: RuntimeExecutionReceipt = {
      id: "receipt_1",
      projectId: ready.projectId,
      providerJobId: ready.id,
      providerJobRevision: running.revision,
      attempt: ready.attempt,
      stage: "RUNNING",
      inputHash: runtimeJob.inputHash,
      runtimeJob,
      createdAt: now
    };
    const event: WorkflowEvent = {
      eventId: "evt_1",
      projectId: ready.projectId,
      eventType: "RUNTIME_EXECUTION_STARTED",
      targetType: ready.targetType,
      targetId: ready.targetId,
      trigger: "SYSTEM",
      payload: { providerJobId: ready.id },
      createdAt: now
    };
    const outbox: OutboxRecord = {
      outboxId: "outbox_1",
      eventId: event.eventId,
      status: "PENDING",
      attempts: 0,
      createdAt: now
    };

    await repository.commitProviderTransition({
      previousJob: ready,
      nextJob: running,
      receipt,
      media: [],
      event,
      outbox
    });

    const latest = await repository.getLatestProviderJob(
      ready.projectId,
      ready.id
    );
    assert.equal(latest?.revision, 2);
    assert.equal(latest?.status, "RUNNING");

    const receipts = await repository.listRuntimeReceipts(
      ready.projectId,
      ready.id
    );
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]?.stage, "RUNNING");
    assert.equal(receipts[0]?.inputHash, runtimeJob.inputHash);

    const oldRow = repository.db.prepare(
      "SELECT lifecycle_status FROM provider_jobs WHERE id = ? AND revision = 1"
    ).get(ready.id) as { lifecycle_status: string };
    assert.equal(oldRow.lifecycle_status, "SUPERSEDED");

    const eventCount = repository.db.prepare(
      "SELECT COUNT(*) AS count FROM workflow_events WHERE event_id = ?"
    ).get(event.eventId) as { count: number };
    const outboxCount = repository.db.prepare(
      "SELECT COUNT(*) AS count FROM event_outbox WHERE outbox_id = ?"
    ).get(outbox.outboxId) as { count: number };
    assert.equal(eventCount.count, 1);
    assert.equal(outboxCount.count, 1);
  } finally {
    repository.close();
  }
});

test("sqlite can record MANUAL_EXTERNAL PREPARED receipt without changing provider job state", async () => {
  const repository = new SqliteRuntimeExecutionRepository(":memory:");
  try {
    const base = seedJob(repository);
    repository.db.prepare(
      "UPDATE provider_jobs SET execution_mode = 'MANUAL_EXTERNAL', status = 'WAITING_EXTERNAL' WHERE id = ?"
    ).run(base.id);
    const manual = await repository.getLatestProviderJob(base.projectId, base.id);
    assert.ok(manual);

    const runtimeJob = materializeRuntimeJob({
      job: manual,
      expectedOutputs: [
        { role: "primary", mediaType: "IMAGE", required: true }
      ]
    });
    const receipt: RuntimeExecutionReceipt = {
      id: "receipt_manual",
      projectId: manual.projectId,
      providerJobId: manual.id,
      providerJobRevision: manual.revision,
      attempt: manual.attempt,
      stage: "PREPARED",
      inputHash: runtimeJob.inputHash,
      runtimeJob,
      createdAt: now
    };
    const event: WorkflowEvent = {
      eventId: "evt_manual",
      projectId: manual.projectId,
      eventType: "RUNTIME_JOB_PREPARED",
      targetType: manual.targetType,
      targetId: manual.targetId,
      trigger: "SYSTEM",
      createdAt: now
    };
    const outbox: OutboxRecord = {
      outboxId: "outbox_manual",
      eventId: event.eventId,
      status: "PENDING",
      attempts: 0,
      createdAt: now
    };

    await repository.recordRuntimeReceipt({ receipt, event, outbox });

    const latest = await repository.getLatestProviderJob(manual.projectId, manual.id);
    assert.equal(latest?.revision, 1);
    assert.equal(latest?.status, "WAITING_EXTERNAL");
    assert.equal(
      (await repository.listRuntimeReceipts(manual.projectId, manual.id))[0]?.stage,
      "PREPARED"
    );
  } finally {
    repository.close();
  }
});
