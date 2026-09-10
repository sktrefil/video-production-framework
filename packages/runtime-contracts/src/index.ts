import { createHash } from "node:crypto";
import {assertNoLegacyExecutionInput, assertNoLegacyReference} from "@vpf/legacy-guard";
import type {
  MediaType,
  ProviderExecutionMode,
  ProviderJob,
  ProviderJobStatus,
  ProviderJobType
} from "@vpf/domain";

export type RuntimeErrorCode =
  | import("@vpf/legacy-guard").LegacyBlockCode
  | "RUNTIME_CONFIG_INVALID"
  | "RUNTIME_SECRET_MISSING"
  | "RUNTIME_SECRET_PRESENT"
  | "RUNTIME_INPUT_MISSING"
  | "RUNTIME_INPUT_HASH_MISMATCH"
  | "RUNTIME_JOB_STATE_INVALID"
  | "RUNTIME_EXECUTOR_NOT_FOUND"
  | "RUNTIME_TARGET_STALE"
  | "PROVIDER_REQUEST_FAILED"
  | "PROVIDER_RESULT_INVALID"
  | "PROVIDER_TIMEOUT"
  | "MANUAL_RESULT_NOT_READY"
  | "ARTIFACT_WRITE_FAILED"
  | "ARTIFACT_HASH_MISMATCH"
  | "ARTIFACT_PATH_INVALID"
  | "ARTIFACT_MEDIA_TYPE_MISMATCH"
  | "LEGACY_RUNTIME_FORBIDDEN";

export class RuntimeContractError extends Error {
  constructor(
    public readonly code: RuntimeErrorCode,
    message: string
  ) {
    super(message);
    this.name = "RuntimeContractError";
  }
}

export interface RuntimeTargetRef {
  type: ProviderJob["targetType"];
  id: string;
  revision: number;
}

export interface RuntimeExpectedOutput {
  role: string;
  mediaType: MediaType;
  required: boolean;
  acceptedMimeTypes?: string[];
}

export interface RuntimeSecretRequirement {
  envName: string;
  required: boolean;
}

export interface RuntimeJob<TInput = unknown> {
  schemaVersion: 1;
  jobId: string;
  jobRevision: number;
  projectId: string;
  jobType: ProviderJobType;
  target: RuntimeTargetRef;
  provider: string;
  providerProfileVersion: string;
  executionMode: ProviderExecutionMode;
  attempt: number;
  inputHash: string;
  input: TInput;
  expectedOutputs: RuntimeExpectedOutput[];
  secretRequirements: RuntimeSecretRequirement[];
}

export type RuntimeResultStatus = "COMPLETE" | "FAILED" | "BLOCKED";

export interface RuntimeOutputArtifact {
  role: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface RuntimeResult {
  schemaVersion: 1;
  jobId: string;
  jobRevision: number;
  projectId: string;
  attempt: number;
  status: RuntimeResultStatus;
  providerRequestIds: string[];
  outputs: RuntimeOutputArtifact[];
  startedAt: string;
  completedAt: string;
  error?: {
    code: RuntimeErrorCode;
    detail?: string;
  };
}

export interface RuntimeExecutor {
  execute(job: RuntimeJob): Promise<RuntimeResult>;
}

export interface RuntimeExecutorResolver {
  resolve(provider: string, jobType: ProviderJobType): RuntimeExecutor;
}

export interface MaterializeRuntimeJobInput {
  job: ProviderJob;
  expectedOutputs: RuntimeExpectedOutput[];
  secretRequirements?: RuntimeSecretRequirement[];
}

const SECRET_KEY_PATTERN =
  /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|bearer|cookie|password|passwd|client[_-]?secret|session[_-]?(?:id|token)|private[_-]?key|secret)$/iu;

const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/u;

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

export function sha256CanonicalJson(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function materializeRuntimeJob<TInput = unknown>(
  input: MaterializeRuntimeJobInput
): RuntimeJob<TInput> {
  const { job } = input;

  validateProviderJobStateForMaterialization(job);
  assertNoLegacyReference(job.provider);
  assertNoLegacyExecutionInput(job.inputPayload);
  assertNoSecretValues(job.inputPayload);
  const secretRequirements = input.secretRequirements ?? [];
  validateSecretRequirements(secretRequirements);
  validateExpectedOutputs(input.expectedOutputs);

  return {
    schemaVersion: 1,
    jobId: job.id,
    jobRevision: job.revision,
    projectId: job.projectId,
    jobType: job.jobType,
    target: {
      type: job.targetType,
      id: job.targetId,
      revision: job.targetRevision
    },
    provider: job.provider,
    providerProfileVersion: job.providerProfileVersion,
    executionMode: job.executionMode,
    attempt: job.attempt,
    inputHash: sha256CanonicalJson(job.inputPayload),
    input: job.inputPayload as TInput,
    expectedOutputs: structuredClone(input.expectedOutputs),
    secretRequirements: structuredClone(secretRequirements)
  };
}

export function validateRuntimeJob(job: RuntimeJob): void {
  assertNoLegacyReference(job.provider);
  assertNoLegacyExecutionInput(job.input);
  if (
    job.schemaVersion !== 1 ||
    !job.jobId.trim() ||
    job.jobRevision <= 0 ||
    !job.projectId.trim() ||
    !job.provider.trim() ||
    !job.providerProfileVersion.trim() ||
    job.attempt <= 0 ||
    !job.target.id.trim() ||
    job.target.revision <= 0
  ) {
    throw new RuntimeContractError(
      "RUNTIME_CONFIG_INVALID",
      "RuntimeJob identity/version fields are invalid."
    );
  }

  assertNoSecretValues(job.input);
  validateSecretRequirements(job.secretRequirements);
  validateExpectedOutputs(job.expectedOutputs);

  const actualHash = sha256CanonicalJson(job.input);
  if (actualHash !== job.inputHash) {
    throw new RuntimeContractError(
      "RUNTIME_INPUT_HASH_MISMATCH",
      "RuntimeJob inputHash does not match canonical input."
    );
  }
}

export function validateRuntimeResult(
  job: RuntimeJob,
  result: RuntimeResult
): void {
  if (
    result.schemaVersion !== 1 ||
    result.jobId !== job.jobId ||
    result.jobRevision !== job.jobRevision ||
    result.projectId !== job.projectId ||
    result.attempt !== job.attempt
  ) {
    throw new RuntimeContractError(
      "PROVIDER_RESULT_INVALID",
      "RuntimeResult identity does not match RuntimeJob."
    );
  }

  if (
    !isIsoDate(result.startedAt) ||
    !isIsoDate(result.completedAt) ||
    Date.parse(result.completedAt) < Date.parse(result.startedAt)
  ) {
    throw new RuntimeContractError(
      "PROVIDER_RESULT_INVALID",
      "RuntimeResult timestamps are invalid."
    );
  }

  const roles = new Set<string>();
  for (const output of result.outputs) {
    if (
      !output.role.trim() ||
      !output.relativePath.trim() ||
      !output.mimeType.trim() ||
      !Number.isFinite(output.sizeBytes) ||
      output.sizeBytes < 0 ||
      !/^[a-f0-9]{64}$/u.test(output.sha256)
    ) {
      throw new RuntimeContractError(
        "PROVIDER_RESULT_INVALID",
        "RuntimeResult contains invalid output artifact metadata."
      );
    }
    if (roles.has(output.role)) {
      throw new RuntimeContractError(
        "PROVIDER_RESULT_INVALID",
        "RuntimeResult contains duplicate output roles."
      );
    }
    roles.add(output.role);
  }

  if (result.status === "COMPLETE") {
    if (result.error !== undefined) {
      throw new RuntimeContractError(
        "PROVIDER_RESULT_INVALID",
        "COMPLETE RuntimeResult cannot contain an error."
      );
    }
  } else if (result.error === undefined) {
    throw new RuntimeContractError(
      "PROVIDER_RESULT_INVALID",
      "FAILED/BLOCKED RuntimeResult requires a stable error."
    );
  }
}

export function assertNoSecretValues(value: unknown): void {
  walkForSecrets(value, []);
}

export function validateSecretRequirements(
  requirements: RuntimeSecretRequirement[]
): void {
  const names = new Set<string>();
  for (const requirement of requirements) {
    if (!ENV_NAME_PATTERN.test(requirement.envName)) {
      throw new RuntimeContractError(
        "RUNTIME_CONFIG_INVALID",
        "Runtime secret requirements must use environment-variable names only."
      );
    }
    if (names.has(requirement.envName)) {
      throw new RuntimeContractError(
        "RUNTIME_CONFIG_INVALID",
        "Runtime secret requirements must not contain duplicates."
      );
    }
    names.add(requirement.envName);
  }
}

export function nextProviderJobRunning(
  job: ProviderJob,
  nowIso: string
): ProviderJob {
  if (job.executionMode !== "AUTOMATED" || job.status !== "READY") {
    throw new RuntimeContractError(
      "RUNTIME_JOB_STATE_INVALID",
      "Only AUTOMATED READY provider jobs can transition to RUNNING."
    );
  }
  return reviseProviderJob(job, "RUNNING", nowIso);
}

export function nextProviderJobFromRuntimeResult(
  job: ProviderJob,
  runtimeJob: RuntimeJob,
  result: RuntimeResult,
  mediaIds: string[],
  nowIso: string
): ProviderJob {
  validateRuntimeJob(runtimeJob);
  validateRuntimeResult(runtimeJob, result);
  assertProviderJobStillMatchesRuntime(job, runtimeJob);

  const allowed =
    (job.executionMode === "AUTOMATED" && job.status === "RUNNING") ||
    (job.executionMode === "MANUAL_EXTERNAL" &&
      job.status === "WAITING_EXTERNAL");

  if (!allowed) {
    throw new RuntimeContractError(
      "RUNTIME_JOB_STATE_INVALID",
      "Provider job cannot accept a runtime result in its current state."
    );
  }

  const status: ProviderJobStatus =
    result.status === "COMPLETE"
      ? "COMPLETE"
      : result.status === "FAILED"
        ? "FAILED"
        : "BLOCKED";

  const patch: Partial<ProviderJob> = {
    status,
    resultMediaIds: result.status === "COMPLETE" ? [...mediaIds] : []
  };

  if (result.error !== undefined) {
    patch.errorCode = result.error.code;
    if (result.error.detail !== undefined) {
      patch.errorDetail = result.error.detail;
    }
  }

  const next = nextProviderJobRevision(job, patch, nowIso);
  if (result.error === undefined) {
    delete next.errorCode;
    delete next.errorDetail;
  }
  return next;
}

export function createRetryProviderJob(input: {
  failedJob: ProviderJob;
  newJobId: string;
  targetRevision: number;
  nowIso: string;
  inputPayload?: unknown;
  executionMode?: ProviderExecutionMode;
}): ProviderJob {
  if (
    input.failedJob.status !== "FAILED" &&
    input.failedJob.status !== "BLOCKED"
  ) {
    throw new RuntimeContractError(
      "RUNTIME_JOB_STATE_INVALID",
      "Only FAILED or BLOCKED provider jobs can be retried."
    );
  }
  if (!input.newJobId.trim() || input.targetRevision <= 0) {
    throw new RuntimeContractError(
      "RUNTIME_CONFIG_INVALID",
      "Retry requires a new job ID and positive target revision."
    );
  }

  const inputPayload = input.inputPayload ?? input.failedJob.inputPayload;
  assertNoSecretValues(inputPayload);

  const executionMode = input.executionMode ?? input.failedJob.executionMode;
  const status: ProviderJobStatus =
    executionMode === "AUTOMATED" ? "READY" : "WAITING_EXTERNAL";

  return {
    id: input.newJobId,
    projectId: input.failedJob.projectId,
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
    jobType: input.failedJob.jobType,
    provider: input.failedJob.provider,
    providerProfileVersion: input.failedJob.providerProfileVersion,
    targetType: input.failedJob.targetType,
    targetId: input.failedJob.targetId,
    targetRevision: input.targetRevision,
    executionMode,
    status,
    attempt: input.failedJob.attempt + 1,
    retryOfJobId: input.failedJob.id,
    inputPayload,
    resultMediaIds: []
  };
}

export function assertProviderJobStillMatchesRuntime(
  job: ProviderJob,
  runtimeJob: RuntimeJob
): void {
  if (
    job.id !== runtimeJob.jobId ||
    job.revision !== runtimeJob.jobRevision ||
    job.projectId !== runtimeJob.projectId ||
    job.targetType !== runtimeJob.target.type ||
    job.targetId !== runtimeJob.target.id ||
    job.targetRevision !== runtimeJob.target.revision ||
    job.provider !== runtimeJob.provider ||
    job.providerProfileVersion !== runtimeJob.providerProfileVersion ||
    job.executionMode !== runtimeJob.executionMode ||
    job.attempt !== runtimeJob.attempt
  ) {
    throw new RuntimeContractError(
      "RUNTIME_INPUT_HASH_MISMATCH",
      "ProviderJob no longer matches the materialized RuntimeJob."
    );
  }

  if (sha256CanonicalJson(job.inputPayload) !== runtimeJob.inputHash) {
    throw new RuntimeContractError(
      "RUNTIME_INPUT_HASH_MISMATCH",
      "ProviderJob input changed after RuntimeJob materialization."
    );
  }
}

function validateProviderJobStateForMaterialization(job: ProviderJob): void {
  const valid =
    (job.executionMode === "AUTOMATED" &&
      (job.status === "READY" || job.status === "RUNNING")) ||
    (job.executionMode === "MANUAL_EXTERNAL" &&
      job.status === "WAITING_EXTERNAL");

  if (!valid) {
    throw new RuntimeContractError(
      "RUNTIME_JOB_STATE_INVALID",
      "ProviderJob is not in an executable/materializable state."
    );
  }
}

function validateExpectedOutputs(outputs: RuntimeExpectedOutput[]): void {
  if (outputs.length === 0) {
    throw new RuntimeContractError(
      "RUNTIME_CONFIG_INVALID",
      "RuntimeJob requires at least one expected output."
    );
  }

  const roles = new Set<string>();
  for (const output of outputs) {
    if (!output.role.trim()) {
      throw new RuntimeContractError(
        "RUNTIME_CONFIG_INVALID",
        "Expected output role cannot be empty."
      );
    }
    if (roles.has(output.role)) {
      throw new RuntimeContractError(
        "RUNTIME_CONFIG_INVALID",
        "Expected output roles must be unique."
      );
    }
    roles.add(output.role);

    if (
      output.acceptedMimeTypes !== undefined &&
      output.acceptedMimeTypes.some(value => !value.trim())
    ) {
      throw new RuntimeContractError(
        "RUNTIME_CONFIG_INVALID",
        "Accepted MIME types cannot contain empty values."
      );
    }
  }
}

function reviseProviderJob(
  job: ProviderJob,
  status: ProviderJobStatus,
  nowIso: string
): ProviderJob {
  return nextProviderJobRevision(job, { status }, nowIso);
}

function nextProviderJobRevision(
  job: ProviderJob,
  patch: Partial<ProviderJob>,
  nowIso: string
): ProviderJob {
  return {
    ...job,
    ...patch,
    id: job.id,
    projectId: job.projectId,
    revision: job.revision + 1,
    lifecycleStatus: "ACTIVE",
    createdAt: job.createdAt,
    updatedAt: nowIso
  };
}

function walkForSecrets(value: unknown, path: string[]): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    if (typeof value === "string" && /^\s*Bearer\s+\S+/iu.test(value)) {
      throw new RuntimeContractError(
        "RUNTIME_SECRET_PRESENT",
        "Runtime input contains an authorization bearer value."
      );
    }
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RuntimeContractError(
        "RUNTIME_CONFIG_INVALID",
        "Runtime input contains a non-finite number."
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => walkForSecrets(item, [...path, String(index)]));
    return;
  }

  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        throw new RuntimeContractError(
          "RUNTIME_SECRET_PRESENT",
          "Runtime input contains a secret-like field at " +
            [...path, key].join(".")
        );
      }
      walkForSecrets(nested, [...path, key]);
    }
    return;
  }

  throw new RuntimeContractError(
    "RUNTIME_CONFIG_INVALID",
    "Runtime input must be JSON-compatible."
  );
}

function normalizeJson(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RuntimeContractError(
        "RUNTIME_CONFIG_INVALID",
        "Runtime input contains a non-finite number."
      );
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeJson);
  }

  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(object).sort()) {
      const nested = object[key];
      if (nested === undefined) {
        throw new RuntimeContractError(
          "RUNTIME_CONFIG_INVALID",
          "Runtime input contains undefined."
        );
      }
      normalized[key] = normalizeJson(nested);
    }
    return normalized;
  }

  throw new RuntimeContractError(
    "RUNTIME_CONFIG_INVALID",
    "Runtime input must be JSON-compatible."
  );
}

function isIsoDate(value: string): boolean {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value));
}
