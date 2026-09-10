import { createHash } from "node:crypto";
import {assertNoLegacyReference, assertUnifiedProject, LegacyGuardError, type UnifiedProjectPolicy} from "@vpf/legacy-guard";
import {assertIsolatedPath} from "@vpf/legacy-guard/filesystem";
import { readFile, stat } from "node:fs/promises";
import type {
  MediaArtifact,
  ProviderJob,
  ProviderJobType
} from "@vpf/domain";
import {
  RuntimeContractError,
  assertProviderJobStillMatchesRuntime,
  materializeRuntimeJob,
  nextProviderJobFromRuntimeResult,
  nextProviderJobRunning,
  validateRuntimeJob,
  validateRuntimeResult,
  type RuntimeErrorCode,
  type RuntimeExecutor,
  type RuntimeExpectedOutput,
  type RuntimeJob,
  type RuntimeResult,
  type RuntimeSecretRequirement
} from "@vpf/runtime-contracts";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import {
  normalizeProjectRelativePath,
  resolveProjectRelativePath,
  resolveProjectWorkspace,
  type WorkspaceResolverOptions
} from "@vpf/workspace";

export type RuntimeExecutionStage =
  | "PREPARED"
  | "RUNNING"
  | "COMPLETE"
  | "FAILED"
  | "BLOCKED";

export interface RuntimeExecutionReceipt {
  id: string;
  projectId: string;
  providerJobId: string;
  providerJobRevision: number;
  attempt: number;
  stage: RuntimeExecutionStage;
  inputHash: string;
  runtimeJob: RuntimeJob;
  runtimeResult?: RuntimeResult;
  createdAt: string;
}

export interface RuntimePersistencePort {
  getProjectPolicy(projectId: string): Promise<UnifiedProjectPolicy | null>;
  getLatestProviderJob(
    projectId: string,
    jobId: string
  ): Promise<ProviderJob | null>;

  recordRuntimeReceipt(input: {
    receipt: RuntimeExecutionReceipt;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  commitProviderTransition(input: {
    previousJob: ProviderJob;
    nextJob: ProviderJob;
    receipt: RuntimeExecutionReceipt;
    media: MediaArtifact[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
}

export interface RuntimeTargetRevisionPort {
  getCurrentTargetRevision(input: {
    projectId: string;
    targetType: ProviderJob["targetType"];
    targetId: string;
  }): Promise<number | null>;
}

export interface RuntimeClock {
  nowIso(): string;
}

export interface RuntimeIdFactory {
  next(prefix: "med" | "runtime_receipt" | "evt" | "outbox"): string;
}

export interface RuntimeExecutionOptions {
  expectedOutputs: RuntimeExpectedOutput[];
  secretRequirements?: RuntimeSecretRequirement[];
}

export interface RuntimeExecutionOutcome {
  runtimeJob: RuntimeJob;
  result: RuntimeResult;
  providerJob: ProviderJob;
  media: MediaArtifact[];
}

export class RuntimeExecutorRegistry {
  private readonly executors = new Map<string, RuntimeExecutor>();

  register(input: {
    provider: string;
    jobType: ProviderJobType;
    executor: RuntimeExecutor;
  }): void {
    assertNoLegacyReference(input.provider);
    const key = registryKey(input.provider, input.jobType);
    if (this.executors.has(key)) {
      throw new RuntimeContractError(
        "RUNTIME_CONFIG_INVALID",
        "Runtime executor is already registered for " + key
      );
    }
    this.executors.set(key, input.executor);
  }

  resolve(provider: string, jobType: ProviderJobType): RuntimeExecutor {
    assertNoLegacyReference(provider);
    const key = registryKey(provider, jobType);
    const executor = this.executors.get(key);
    if (executor === undefined) {
      throw new RuntimeContractError(
        "RUNTIME_EXECUTOR_NOT_FOUND",
        "No runtime executor registered for " + key
      );
    }
    return executor;
  }
}

export class RuntimeOrchestrator {
  constructor(
    private readonly persistence: RuntimePersistencePort,
    private readonly targets: RuntimeTargetRevisionPort,
    private readonly registry: RuntimeExecutorRegistry,
    private readonly clock: RuntimeClock,
    private readonly ids: RuntimeIdFactory,
    private readonly workspaceOptions: WorkspaceResolverOptions = {}
  ) {}

  async prepareManual(
    projectId: string,
    jobId: string,
    options: RuntimeExecutionOptions
  ): Promise<RuntimeJob> {
    const job = await this.requireCurrentJob(projectId, jobId);

    if (
      job.executionMode !== "MANUAL_EXTERNAL" ||
      job.status !== "WAITING_EXTERNAL"
    ) {
      throw new RuntimeContractError(
        "RUNTIME_JOB_STATE_INVALID",
        "Manual preparation requires a MANUAL_EXTERNAL WAITING_EXTERNAL job."
      );
    }

    await this.assertTargetCurrent(job);

    const runtimeJob = materializeRuntimeJob({
      job,
      expectedOutputs: options.expectedOutputs,
      ...(options.secretRequirements === undefined
        ? {}
        : { secretRequirements: options.secretRequirements })
    });

    const receipt = this.makeReceipt(runtimeJob, "PREPARED");
    const durable = this.makeEvent(job, receipt, "RUNTIME_JOB_PREPARED", "SYSTEM");
    await this.persistence.recordRuntimeReceipt({
      receipt,
      event: durable.event,
      outbox: durable.outbox
    });

    return runtimeJob;
  }

  async executeAutomated(
    projectId: string,
    jobId: string,
    options: RuntimeExecutionOptions
  ): Promise<RuntimeExecutionOutcome> {
    const readyJob = await this.requireCurrentJob(projectId, jobId);

    if (
      readyJob.executionMode !== "AUTOMATED" ||
      readyJob.status !== "READY"
    ) {
      throw new RuntimeContractError(
        "RUNTIME_JOB_STATE_INVALID",
        "Automated execution requires an AUTOMATED READY job."
      );
    }

    await this.assertTargetCurrent(readyJob);
    // Resolve before RUNNING so a blocked/unregistered executor cannot strand a job.
    this.registry.resolve(readyJob.provider, readyJob.jobType);

    const runningAt = this.clock.nowIso();
    const runningJob = nextProviderJobRunning(readyJob, runningAt);
    const runtimeJob = materializeRuntimeJob({
      job: runningJob,
      expectedOutputs: options.expectedOutputs,
      ...(options.secretRequirements === undefined
        ? {}
        : { secretRequirements: options.secretRequirements })
    });

    const runningReceipt = this.makeReceipt(
      runtimeJob,
      "RUNNING",
      undefined,
      runningAt
    );
    const startDurable = this.makeEvent(
      runningJob,
      runningReceipt,
      "RUNTIME_EXECUTION_STARTED",
      "SYSTEM"
    );

    await this.persistence.commitProviderTransition({
      previousJob: readyJob,
      nextJob: runningJob,
      receipt: runningReceipt,
      media: [],
      event: startDurable.event,
      outbox: startDurable.outbox
    });

    const executor = this.registry.resolve(
      runningJob.provider,
      runningJob.jobType
    );

    let result: RuntimeResult;
    try {
      result = await executor.execute(runtimeJob);
      validateRuntimeResult(runtimeJob, result);
    } catch (error) {
      result = this.failureResult(runtimeJob, error, runningAt);
    }

    return this.finishExecution(runningJob, runtimeJob, result);
  }

  async ingestManualResult(input: {
    projectId: string;
    jobId: string;
    runtimeJob: RuntimeJob;
    result: RuntimeResult;
  }): Promise<RuntimeExecutionOutcome> {
    const job = await this.requireCurrentJob(input.projectId, input.jobId);

    if (
      job.executionMode !== "MANUAL_EXTERNAL" ||
      job.status !== "WAITING_EXTERNAL"
    ) {
      throw new RuntimeContractError(
        "RUNTIME_JOB_STATE_INVALID",
        "Manual result import requires a MANUAL_EXTERNAL WAITING_EXTERNAL job."
      );
    }

    validateRuntimeJob(input.runtimeJob);
    assertProviderJobStillMatchesRuntime(job, input.runtimeJob);
    validateRuntimeResult(input.runtimeJob, input.result);
    await this.assertTargetCurrent(job);

    return this.finishExecution(job, input.runtimeJob, input.result);
  }

  private async finishExecution(
    currentJob: ProviderJob,
    runtimeJob: RuntimeJob,
    initialResult: RuntimeResult
  ): Promise<RuntimeExecutionOutcome> {
    let result = initialResult;
    let media: MediaArtifact[] = [];

    if (result.status === "COMPLETE") {
      try {
        assertUnifiedProject(await this.persistence.getProjectPolicy(currentJob.projectId));
        await this.assertTargetCurrent(currentJob);
        media = await this.ingestArtifacts(runtimeJob, result);
      } catch (error) {
        result = this.blockedResult(
          runtimeJob,
          error,
          result.startedAt,
          result
        );
        media = [];
      }
    }

    const completedAt = this.clock.nowIso();
    const nextJob = nextProviderJobFromRuntimeResult(
      currentJob,
      runtimeJob,
      result,
      media.map(item => item.id),
      completedAt
    );

    const receipt = this.makeReceipt(
      runtimeJob,
      result.status,
      result,
      completedAt
    );
    const eventType =
      result.status === "COMPLETE"
        ? "RUNTIME_EXECUTION_COMPLETED"
        : result.status === "FAILED"
          ? "RUNTIME_EXECUTION_FAILED"
          : "RUNTIME_EXECUTION_BLOCKED";
    const durable = this.makeEvent(
      nextJob,
      receipt,
      eventType,
      "PROVIDER_RESULT"
    );

    await this.persistence.commitProviderTransition({
      previousJob: currentJob,
      nextJob,
      receipt,
      media,
      event: durable.event,
      outbox: durable.outbox
    });

    return {
      runtimeJob,
      result,
      providerJob: nextJob,
      media
    };
  }

  private async ingestArtifacts(
    job: RuntimeJob,
    result: RuntimeResult
  ): Promise<MediaArtifact[]> {
    const outputByRole = new Map(
      result.outputs.map(output => [output.role, output] as const)
    );

    for (const expected of job.expectedOutputs) {
      if (expected.required && !outputByRole.has(expected.role)) {
        throw new RuntimeContractError(
          "PROVIDER_RESULT_INVALID",
          "Required runtime output is missing: " + expected.role
        );
      }
    }

    for (const output of result.outputs) {
      if (!job.expectedOutputs.some(expected => expected.role === output.role)) {
        throw new RuntimeContractError(
          "PROVIDER_RESULT_INVALID",
          "Runtime produced an unexpected output role: " + output.role
        );
      }
    }

    const workspace = resolveProjectWorkspace(
      job.projectId,
      this.workspaceOptions
    );
    const now = this.clock.nowIso();
    const media: MediaArtifact[] = [];

    for (const expected of job.expectedOutputs) {
      const output = outputByRole.get(expected.role);
      if (output === undefined) continue;

      const normalizedPath = normalizeProjectRelativePath(output.relativePath);
      const absolutePath = resolveProjectRelativePath(
        workspace.projectRoot,
        normalizedPath
      );
      assertIsolatedPath(workspace.projectRoot, absolutePath);

      let info;
      try {
        info = await stat(absolutePath);
      } catch {
        throw new RuntimeContractError(
          "RUNTIME_INPUT_MISSING",
          "Runtime output file does not exist: " + normalizedPath
        );
      }

      if (!info.isFile() || info.size <= 0 || info.size !== output.sizeBytes) {
        throw new RuntimeContractError(
          "PROVIDER_RESULT_INVALID",
          "Runtime output size does not match the actual file: " + normalizedPath
        );
      }

      const actualSha = createHash("sha256")
        .update(await readFile(absolutePath))
        .digest("hex");

      if (actualSha !== output.sha256) {
        throw new RuntimeContractError(
          "ARTIFACT_HASH_MISMATCH",
          "Runtime output checksum does not match the actual file: " +
            normalizedPath
        );
      }

      validateMime(expected, output.mimeType);

      media.push({
        id: this.ids.next("med"),
        projectId: job.projectId,
        revision: 1,
        lifecycleStatus: "ACTIVE",
        createdAt: now,
        updatedAt: now,
        mediaType: expected.mediaType,
        relativePath: normalizedPath,
        mimeType: output.mimeType,
        ...(output.width === undefined ? {} : { width: output.width }),
        ...(output.height === undefined ? {} : { height: output.height }),
        ...(output.durationMs === undefined
          ? {}
          : { durationMs: output.durationMs }),
        checksum: actualSha,
        sourceJobId: job.jobId,
        mediaStatus: "AVAILABLE"
      });
    }

    return media;
  }

  private async assertTargetCurrent(job: ProviderJob): Promise<void> {
    const revision = await this.targets.getCurrentTargetRevision({
      projectId: job.projectId,
      targetType: job.targetType,
      targetId: job.targetId
    });

    if (revision === null || revision !== job.targetRevision) {
      throw new RuntimeContractError(
        "RUNTIME_TARGET_STALE",
        "Provider job target revision is no longer current."
      );
    }
  }

  private async requireCurrentJob(
    projectId: string,
    jobId: string
  ): Promise<ProviderJob> {
    assertUnifiedProject(await this.persistence.getProjectPolicy(projectId));
    const job = await this.persistence.getLatestProviderJob(projectId, jobId);
    if (job === null) {
      throw new RuntimeContractError(
        "RUNTIME_INPUT_MISSING",
        "Provider job does not exist."
      );
    }
    return job;
  }

  private failureResult(
    job: RuntimeJob,
    error: unknown,
    startedAt: string
  ): RuntimeResult {
    const normalized = normalizeRuntimeError(error, "PROVIDER_REQUEST_FAILED");
    return {
      schemaVersion: 1,
      jobId: job.jobId,
      jobRevision: job.jobRevision,
      projectId: job.projectId,
      attempt: job.attempt,
      status: "FAILED",
      providerRequestIds: [],
      outputs: [],
      startedAt,
      completedAt: this.clock.nowIso(),
      error: {
        code: normalized.code,
        ...(normalized.detail === undefined
          ? {}
          : { detail: normalized.detail })
      }
    };
  }

  private blockedResult(
    job: RuntimeJob,
    error: unknown,
    startedAt: string,
    sourceResult?: RuntimeResult
  ): RuntimeResult {
    const normalized = normalizeRuntimeError(error, "PROVIDER_RESULT_INVALID");
    return {
      schemaVersion: 1,
      jobId: job.jobId,
      jobRevision: job.jobRevision,
      projectId: job.projectId,
      attempt: job.attempt,
      status: "BLOCKED",
      providerRequestIds: [...(sourceResult?.providerRequestIds ?? [])],
      outputs: [...(sourceResult?.outputs ?? [])],
      startedAt,
      completedAt: this.clock.nowIso(),
      error: {
        code: normalized.code,
        ...(normalized.detail === undefined
          ? {}
          : { detail: normalized.detail })
      }
    };
  }

  private makeReceipt(
    runtimeJob: RuntimeJob,
    stage: RuntimeExecutionStage,
    runtimeResult?: RuntimeResult,
    createdAt = this.clock.nowIso()
  ): RuntimeExecutionReceipt {
    return {
      id: this.ids.next("runtime_receipt"),
      projectId: runtimeJob.projectId,
      providerJobId: runtimeJob.jobId,
      providerJobRevision: runtimeJob.jobRevision,
      attempt: runtimeJob.attempt,
      stage,
      inputHash: runtimeJob.inputHash,
      runtimeJob,
      ...(runtimeResult === undefined ? {} : { runtimeResult }),
      createdAt
    };
  }

  private makeEvent(
    job: ProviderJob,
    receipt: RuntimeExecutionReceipt,
    eventType: string,
    trigger: WorkflowEvent["trigger"]
  ): { event: WorkflowEvent; outbox: OutboxRecord } {
    const createdAt = receipt.createdAt;
    const event: WorkflowEvent = {
      eventId: this.ids.next("evt"),
      projectId: job.projectId,
      eventType,
      targetType: job.targetType,
      targetId: job.targetId,
      trigger,
      payload: {
        providerJobId: receipt.providerJobId,
        providerJobRevision: receipt.providerJobRevision,
        attempt: receipt.attempt,
        stage: receipt.stage,
        inputHash: receipt.inputHash
      },
      createdAt
    };
    return {
      event,
      outbox: {
        outboxId: this.ids.next("outbox"),
        eventId: event.eventId,
        status: "PENDING",
        attempts: 0,
        createdAt
      }
    };
  }
}

function validateMime(
  expected: RuntimeExpectedOutput,
  actualMimeType: string
): void {
  const actual = actualMimeType.toLowerCase();

  if (
    expected.acceptedMimeTypes !== undefined &&
    !expected.acceptedMimeTypes.map(value => value.toLowerCase()).includes(actual)
  ) {
    throw new RuntimeContractError(
      "ARTIFACT_MEDIA_TYPE_MISMATCH",
      "Runtime output MIME type is not accepted for role " + expected.role
    );
  }

  const compatible =
    expected.mediaType === "IMAGE"
      ? actual.startsWith("image/")
      : expected.mediaType === "VIDEO"
        ? actual.startsWith("video/")
        : expected.mediaType === "AUDIO"
          ? actual.startsWith("audio/")
          : expected.mediaType === "DOCUMENT"
            ? actual === "application/pdf" ||
              actual.startsWith("text/") ||
              actual.startsWith("application/")
            : true;

  if (!compatible) {
    throw new RuntimeContractError(
      "ARTIFACT_MEDIA_TYPE_MISMATCH",
      "Runtime output MIME type does not match expected media type."
    );
  }
}

function normalizeRuntimeError(
  error: unknown,
  fallback: RuntimeErrorCode
): { code: RuntimeErrorCode; detail?: string } {
  if (error instanceof RuntimeContractError || error instanceof LegacyGuardError) {
    return { code: error.code, detail: error.message };
  }
  if (error instanceof Error) {
    return { code: fallback, detail: error.message };
  }
  return { code: fallback, detail: String(error) };
}

function registryKey(provider: string, jobType: ProviderJobType): string {
  const normalized = provider.trim().toUpperCase();
  if (!normalized) {
    throw new RuntimeContractError(
      "RUNTIME_CONFIG_INVALID",
      "Provider name cannot be empty."
    );
  }
  return normalized + "::" + jobType;
}
