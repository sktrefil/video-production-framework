import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderJob } from "@vpf/domain";
import {
  RuntimeContractError,
  canonicalJson,
  createRetryProviderJob,
  materializeRuntimeJob,
  nextProviderJobFromRuntimeResult,
  nextProviderJobRunning,
  sha256CanonicalJson,
  validateRuntimeResult
} from "../src/index.js";

const now = "2026-09-10T02:30:00.000Z";

function job(input: Partial<ProviderJob> = {}): ProviderJob {
  return {
    id: "job_1",
    projectId: "project_1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    jobType: "IMAGE_GENERATION",
    provider: "MOCK",
    providerProfileVersion: "mock-v1",
    targetType: "ASSET",
    targetId: "asset_1",
    targetRevision: 3,
    executionMode: "AUTOMATED",
    status: "READY",
    attempt: 1,
    inputPayload: { prompt: "exact prompt", nested: { b: 2, a: 1 } },
    resultMediaIds: [],
    ...input
  };
}

const expected = [
  {
    role: "primary",
    mediaType: "IMAGE" as const,
    required: true,
    acceptedMimeTypes: ["image/png"]
  }
];

test("canonical JSON and input hash are deterministic across object key order", () => {
  const a = { z: 1, inner: { b: 2, a: 1 } };
  const b = { inner: { a: 1, b: 2 }, z: 1 };
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(sha256CanonicalJson(a), sha256CanonicalJson(b));
});

test("IMAGE VIDEO and TTS provider jobs materialize through the same RuntimeJob envelope", () => {
  const fixtures: ProviderJob[] = [
    job(),
    job({
      id: "job_video",
      jobType: "VIDEO_GENERATION",
      targetType: "CLIP",
      targetId: "clip_1",
      inputPayload: { prompt: "video prompt", durationMs: 5000 }
    }),
    job({
      id: "job_tts",
      jobType: "TTS_GENERATION",
      targetType: "AUDIO",
      targetId: "tts_1",
      inputPayload: { text: "narration", modelId: "eleven_v3" }
    })
  ];

  const outputs = [
    expected,
    [{ role: "video", mediaType: "VIDEO" as const, required: true }],
    [{ role: "audio", mediaType: "AUDIO" as const, required: true }]
  ];

  fixtures.forEach((providerJob, index) => {
    const runtime = materializeRuntimeJob({
      job: providerJob,
      expectedOutputs: outputs[index]!
    });
    assert.equal(runtime.schemaVersion, 1);
    assert.equal(runtime.jobId, providerJob.id);
    assert.equal(runtime.jobRevision, providerJob.revision);
    assert.equal(runtime.target.revision, providerJob.targetRevision);
    assert.match(runtime.inputHash, /^[a-f0-9]{64}$/u);
  });
});

test("secret-looking values cannot enter durable RuntimeJob input", () => {
  assert.throws(
    () =>
      materializeRuntimeJob({
        job: job({ inputPayload: { prompt: "ok", apiKey: "do-not-store" } }),
        expectedOutputs: expected
      }),
    (error: unknown) =>
      error instanceof RuntimeContractError &&
      error.code === "RUNTIME_SECRET_PRESENT"
  );

  assert.throws(
    () =>
      materializeRuntimeJob({
        job: job({ inputPayload: { authorizationHeader: "Bearer abc" } }),
        expectedOutputs: expected
      }),
    (error: unknown) =>
      error instanceof RuntimeContractError &&
      error.code === "RUNTIME_SECRET_PRESENT"
  );
});

test("MANUAL_EXTERNAL WAITING_EXTERNAL can materialize without RUNNING", () => {
  const manual = job({
    executionMode: "MANUAL_EXTERNAL",
    status: "WAITING_EXTERNAL"
  });
  const runtime = materializeRuntimeJob({
    job: manual,
    expectedOutputs: expected,
    secretRequirements: [
      { envName: "EXAMPLE_API_KEY", required: false }
    ]
  });
  assert.equal(runtime.executionMode, "MANUAL_EXTERNAL");
  assert.equal(runtime.jobRevision, 1);
});

test("automated ProviderJob transitions READY -> RUNNING -> COMPLETE without approval state", () => {
  const ready = job();
  const running = nextProviderJobRunning(ready, now);
  const runtime = materializeRuntimeJob({
    job: running,
    expectedOutputs: expected
  });
  const result = {
    schemaVersion: 1 as const,
    jobId: running.id,
    jobRevision: running.revision,
    projectId: running.projectId,
    attempt: running.attempt,
    status: "COMPLETE" as const,
    providerRequestIds: ["req_1"],
    outputs: [],
    startedAt: now,
    completedAt: now
  };
  validateRuntimeResult(runtime, result);
  const complete = nextProviderJobFromRuntimeResult(
    running,
    runtime,
    result,
    ["med_1"],
    now
  );

  assert.equal(running.status, "RUNNING");
  assert.equal(complete.status, "COMPLETE");
  assert.deepEqual(complete.resultMediaIds, ["med_1"]);
  assert.equal("approvalState" in complete, false);
});

test("retry creates a new job id, increments attempt, and preserves retry lineage", () => {
  const failed = job({
    revision: 3,
    status: "FAILED",
    attempt: 2,
    errorCode: "PROVIDER_REQUEST_FAILED"
  });
  const retry = createRetryProviderJob({
    failedJob: failed,
    newJobId: "job_2",
    targetRevision: 4,
    nowIso: now
  });

  assert.equal(retry.id, "job_2");
  assert.equal(retry.revision, 1);
  assert.equal(retry.attempt, 3);
  assert.equal(retry.retryOfJobId, failed.id);
  assert.equal(retry.targetRevision, 4);
  assert.equal(retry.status, "READY");
  assert.deepEqual(retry.inputPayload, failed.inputPayload);
});

test("RuntimeResult identity mismatch is rejected", () => {
  const runtime = materializeRuntimeJob({
    job: job(),
    expectedOutputs: expected
  });
  assert.throws(
    () =>
      validateRuntimeResult(runtime, {
        schemaVersion: 1,
        jobId: "wrong",
        jobRevision: runtime.jobRevision,
        projectId: runtime.projectId,
        attempt: runtime.attempt,
        status: "FAILED",
        providerRequestIds: [],
        outputs: [],
        startedAt: now,
        completedAt: now,
        error: { code: "PROVIDER_REQUEST_FAILED" }
      }),
    (error: unknown) =>
      error instanceof RuntimeContractError &&
      error.code === "PROVIDER_RESULT_INVALID"
  );
});
