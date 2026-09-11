import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type { MediaArtifact, ProductionClip, ProviderJob } from "@vpf/domain";
import {
  FinalClipPipeline,
  type VideoJobPack,
  type VideoResultImportItem
} from "@vpf/final-clip";
import { assertNoLegacyReference } from "@vpf/legacy-guard";
import { assertIsolatedPath } from "@vpf/legacy-guard/filesystem";
import type { RuntimeExecutionReceipt } from "@vpf/provider-orchestrator";
import { FileSystemResourceRegistry } from "@vpf/resource-registry";
import {
  assertProviderJobStillMatchesRuntime,
  materializeRuntimeJob,
  validateRuntimeJob,
  validateRuntimeResult,
  type RuntimeJob,
  type RuntimeResult
} from "@vpf/runtime-contracts";
import {
  normalizeProjectRelativePath,
  resolveProjectRelativePath,
  resolveProjectWorkspace,
  type WorkspaceResolverOptions
} from "@vpf/workspace";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import { SqliteFinalClipRepository } from "./final-clip.js";
import { SqliteRuntimeExecutionRepository } from "./runtime-execution.js";

export const GOOGLE_FLOW_PROVIDER = "GOOGLE_FLOW";
export const GOOGLE_FLOW_PROFILE_ID = "GOOGLE_FLOW_MANUAL_EXTERNAL_V1";

export type GoogleFlowManualErrorCode =
  | "FLOW_JOB_NOT_FOUND"
  | "FLOW_JOB_AMBIGUOUS"
  | "FLOW_JOB_INVALID"
  | "FLOW_PROFILE_INVALID"
  | "FLOW_PACKAGE_MISSING"
  | "FLOW_PACKAGE_STALE"
  | "FLOW_SOURCE_INVALID"
  | "FLOW_RESULT_INVALID";

export class GoogleFlowManualError extends Error {
  constructor(
    public readonly code: GoogleFlowManualErrorCode,
    message: string
  ) {
    super(message);
    this.name = "GoogleFlowManualError";
  }
}

export interface GoogleFlowClock {
  nowIso(): string;
}

export interface GoogleFlowManifestSource {
  mediaId: string;
  sourceRelativePath: string;
  sourceSha256: string;
  exportedFilename: string;
}

export interface GoogleFlowJobManifest {
  schemaVersion: 1;
  projectId: string;
  jobId: string;
  jobRevision: number;
  attempt: number;
  clipId: string;
  clipRevision: number;
  clipMode: "DIRECT_START_END_I2V" | "SINGLE_IMAGE_I2V";
  durationMs: number;
  provider: typeof GOOGLE_FLOW_PROVIDER;
  providerProfile: {
    resourceId: typeof GOOGLE_FLOW_PROFILE_ID;
    version: string;
    contentHash: string;
  };
  runtimeJobInputHash: string;
  promptSha256: string;
  start: GoogleFlowManifestSource;
  end?: GoogleFlowManifestSource;
  expectedOutput: {
    mimeType: "video/mp4";
    relativePath: string;
  };
  createdAt: string;
}

export interface GoogleFlowExportResult {
  projectId: string;
  jobId: string;
  clipId: string;
  packageDir: string;
  manifest: GoogleFlowJobManifest;
}

export interface GoogleFlowImportResult {
  projectId: string;
  jobId: string;
  clipId: string;
  mediaId: string;
  relativePath: string;
  checksum: string;
  durationMs: number;
  width: number;
  height: number;
  clipStatus: ProductionClip["clipStatus"];
}

interface FlowPort {
  getProviderJob(projectId: string, jobId: string): Promise<ProviderJob | null>;
  getClip(projectId: string, clipId: string): Promise<ProductionClip | null>;
  getMedia(projectId: string, mediaId: string): Promise<MediaArtifact | null>;
  exportPack(projectId: string, jobId: string): Promise<VideoJobPack>;
  registerResult(input: VideoResultImportItem & { projectId: string }): Promise<{
    clip: ProductionClip;
    job: ProviderJob;
    media: MediaArtifact;
  }>;
  recordRuntimeReceipt(input: {
    receipt: RuntimeExecutionReceipt;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  close(): void;
}

export interface GoogleFlowManualServiceOptions extends WorkspaceResolverOptions {
  resourcesDir?: string;
  clock?: GoogleFlowClock;
  openPort?: (projectId: string, projectDbPath: string) => FlowPort;
}

const DEFAULT_REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url))
);
const VIDEO_EXPECTED_OUTPUTS = [
  {
    role: "video",
    mediaType: "VIDEO" as const,
    required: true,
    acceptedMimeTypes: ["video/mp4"]
  }
];

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function checksumHex(value: string): string {
  const normalized = value.startsWith("sha256:") ? value.slice(7) : value;
  if (!/^[a-f0-9]{64}$/u.test(normalized)) {
    throw new GoogleFlowManualError(
      "FLOW_SOURCE_INVALID",
      "Source MediaArtifact must contain a real SHA-256 checksum."
    );
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePayload(job: ProviderJob): {
  clipMode: "DIRECT_START_END_I2V" | "SINGLE_IMAGE_I2V";
  durationMs: number;
  prompt: string;
  negativePrompt?: string;
  startMediaId: string;
  startMediaPath: string;
  endMediaId?: string;
  endMediaPath?: string;
} {
  if (!isRecord(job.inputPayload)) {
    throw new GoogleFlowManualError("FLOW_JOB_INVALID", "Flow job input payload must be an object.");
  }
  const payload = job.inputPayload;
  const clipMode = payload.clipMode;
  const durationMs = payload.durationMs;
  const prompt = payload.prompt;
  const startMediaId = payload.startMediaId;
  const startMediaPath = payload.startMediaPath;
  if (
    (clipMode !== "DIRECT_START_END_I2V" && clipMode !== "SINGLE_IMAGE_I2V") ||
    typeof durationMs !== "number" ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    typeof prompt !== "string" ||
    !prompt.trim() ||
    typeof startMediaId !== "string" ||
    !startMediaId.trim() ||
    typeof startMediaPath !== "string" ||
    !startMediaPath.trim()
  ) {
    throw new GoogleFlowManualError(
      "FLOW_JOB_INVALID",
      "Flow job is missing exact clip mode, duration, prompt, or START media data."
    );
  }
  const endMediaId = typeof payload.endMediaId === "string" ? payload.endMediaId : undefined;
  const endMediaPath = typeof payload.endMediaPath === "string" ? payload.endMediaPath : undefined;
  if (clipMode === "DIRECT_START_END_I2V" && (!endMediaId || !endMediaPath)) {
    throw new GoogleFlowManualError(
      "FLOW_JOB_INVALID",
      "DIRECT_START_END_I2V requires exact END media identity/path."
    );
  }
  return {
    clipMode,
    durationMs,
    prompt,
    ...(typeof payload.negativePrompt === "string" ? { negativePrompt: payload.negativePrompt } : {}),
    startMediaId,
    startMediaPath,
    ...(endMediaId === undefined ? {} : { endMediaId }),
    ...(endMediaPath === undefined ? {} : { endMediaPath })
  };
}

function assertFlowJob(job: ProviderJob): void {
  if (
    job.provider !== GOOGLE_FLOW_PROVIDER ||
    job.jobType !== "VIDEO_GENERATION" ||
    job.targetType !== "CLIP" ||
    job.executionMode !== "MANUAL_EXTERNAL" ||
    job.status !== "WAITING_EXTERNAL"
  ) {
    throw new GoogleFlowManualError(
      "FLOW_JOB_INVALID",
      "Google Flow export/import requires a current MANUAL_EXTERNAL VIDEO_GENERATION job in WAITING_EXTERNAL state."
    );
  }
  parsePayload(job);
}

function assertClipMatchesJob(clip: ProductionClip, job: ProviderJob): void {
  const payload = parsePayload(job);
  if (
    clip.id !== job.targetId ||
    clip.revision !== job.targetRevision ||
    clip.stale ||
    !clip.providerExecutionRequired ||
    clip.clipMode !== payload.clipMode ||
    clip.durationMs !== payload.durationMs ||
    (clip.clipMode !== "DIRECT_START_END_I2V" && clip.clipMode !== "SINGLE_IMAGE_I2V")
  ) {
    throw new GoogleFlowManualError(
      "FLOW_PACKAGE_STALE",
      "Current clip no longer matches the exported Google Flow job target."
    );
  }
}

function exportedName(role: "start" | "end", relativePath: string): string {
  const ext = path.extname(relativePath).toLowerCase();
  return `${role}${ext && /^[.][a-z0-9]+$/u.test(ext) ? ext : ".bin"}`;
}

async function readVerifiedSource(input: {
  projectRoot: string;
  media: MediaArtifact;
  expectedId: string;
  expectedPath: string;
}): Promise<{ bytes: Buffer; sha256: string; absolutePath: string }> {
  if (
    input.media.id !== input.expectedId ||
    input.media.mediaType !== "IMAGE" ||
    input.media.mediaStatus !== "AVAILABLE" ||
    normalizeProjectRelativePath(input.media.relativePath) !==
      normalizeProjectRelativePath(input.expectedPath)
  ) {
    throw new GoogleFlowManualError(
      "FLOW_SOURCE_INVALID",
      "Flow source media identity/path/type is not the approved job source."
    );
  }
  const absolutePath = resolveProjectRelativePath(
    input.projectRoot,
    normalizeProjectRelativePath(input.media.relativePath)
  );
  assertIsolatedPath(input.projectRoot, absolutePath);
  const info = await stat(absolutePath).catch(() => null);
  if (info === null || !info.isFile() || info.size <= 0) {
    throw new GoogleFlowManualError("FLOW_SOURCE_INVALID", "Flow source media file is missing or empty.");
  }
  const bytes = await readFile(absolutePath);
  const actual = sha256(bytes);
  if (actual !== checksumHex(input.media.checksum)) {
    throw new GoogleFlowManualError(
      "FLOW_SOURCE_INVALID",
      "Flow source media checksum no longer matches MediaArtifact."
    );
  }
  return { bytes, sha256: actual, absolutePath };
}

function probeMp4(bytes: Buffer): { durationMs: number; width: number; height: number } {
  const ftyp = bytes.indexOf(Buffer.from("ftyp", "ascii"));
  const moov = bytes.indexOf(Buffer.from("moov", "ascii"));
  const mvhd = bytes.indexOf(Buffer.from("mvhd", "ascii"));
  const tkhd = bytes.indexOf(Buffer.from("tkhd", "ascii"));
  if (ftyp < 4 || ftyp > 32 || moov < 4 || mvhd < 4 || tkhd < 4) {
    throw new GoogleFlowManualError("FLOW_RESULT_INVALID", "Generated result is not a readable MP4 with ftyp/moov/mvhd/tkhd boxes.");
  }

  const mvhdVersion = bytes[mvhd + 4];
  let timescale: number;
  let durationUnits: number;
  if (mvhdVersion === 0) {
    if (mvhd + 24 > bytes.length) throw new GoogleFlowManualError("FLOW_RESULT_INVALID", "MP4 mvhd box is truncated.");
    timescale = bytes.readUInt32BE(mvhd + 16);
    durationUnits = bytes.readUInt32BE(mvhd + 20);
  } else if (mvhdVersion === 1) {
    if (mvhd + 36 > bytes.length) throw new GoogleFlowManualError("FLOW_RESULT_INVALID", "MP4 mvhd v1 box is truncated.");
    timescale = bytes.readUInt32BE(mvhd + 24);
    const value = bytes.readBigUInt64BE(mvhd + 28);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new GoogleFlowManualError("FLOW_RESULT_INVALID", "MP4 duration is outside the supported range.");
    }
    durationUnits = Number(value);
  } else {
    throw new GoogleFlowManualError("FLOW_RESULT_INVALID", "Unsupported MP4 mvhd version.");
  }
  if (timescale <= 0 || durationUnits <= 0) {
    throw new GoogleFlowManualError("FLOW_RESULT_INVALID", "MP4 duration metadata is invalid.");
  }

  const tkhdStart = tkhd - 4;
  if (tkhdStart < 0 || tkhdStart + 8 > bytes.length) {
    throw new GoogleFlowManualError("FLOW_RESULT_INVALID", "MP4 tkhd box is invalid.");
  }
  const tkhdSize = bytes.readUInt32BE(tkhdStart);
  if (tkhdSize < 16 || tkhdStart + tkhdSize > bytes.length) {
    throw new GoogleFlowManualError("FLOW_RESULT_INVALID", "MP4 tkhd box size is invalid.");
  }
  const width = bytes.readUInt32BE(tkhdStart + tkhdSize - 8) / 65536;
  const height = bytes.readUInt32BE(tkhdStart + tkhdSize - 4) / 65536;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new GoogleFlowManualError("FLOW_RESULT_INVALID", "MP4 dimensions are unavailable or invalid.");
  }

  return {
    durationMs: Math.round((durationUnits / timescale) * 1000),
    width: Math.round(width),
    height: Math.round(height)
  };
}

class SqliteFlowPort implements FlowPort {
  private readonly repository: SqliteFinalClipRepository;
  private readonly runtimeRepository: SqliteRuntimeExecutionRepository;
  private readonly pipeline: FinalClipPipeline;

  constructor(filename: string, private readonly clock: GoogleFlowClock) {
    this.repository = new SqliteFinalClipRepository(filename);
    this.runtimeRepository = new SqliteRuntimeExecutionRepository(filename);
    const decisions = {} as never;
    this.pipeline = new FinalClipPipeline(
      this.repository,
      this.repository,
      decisions,
      clock,
      {
        next(prefix) {
          return `${prefix}_${randomUUID()}`;
        }
      }
    );
  }

  async getProviderJob(projectId: string, jobId: string) {
    return this.repository.getLatestProviderJob(projectId, jobId);
  }

  async getClip(projectId: string, clipId: string) {
    return this.repository.getLatestClip(projectId, clipId);
  }

  async getMedia(projectId: string, mediaId: string) {
    return this.repository.getMedia(projectId, mediaId);
  }

  async exportPack(projectId: string, jobId: string) {
    return this.pipeline.exportVideoJobPack({ projectId, jobIds: [jobId] });
  }

  async registerResult(input: VideoResultImportItem & { projectId: string }) {
    return this.pipeline.registerVideoResult(input);
  }

  async recordRuntimeReceipt(input: {
    receipt: RuntimeExecutionReceipt;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    await this.runtimeRepository.recordRuntimeReceipt(input);
  }

  close() {
    this.runtimeRepository.close();
    this.repository.close();
  }
}

export class GoogleFlowManualService {
  private readonly clock: GoogleFlowClock;
  private readonly resourcesDir: string;

  constructor(private readonly options: GoogleFlowManualServiceOptions = {}) {
    this.clock = options.clock ?? { nowIso: () => new Date().toISOString() };
    this.resourcesDir = options.resourcesDir ?? path.join(
      options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT,
      "resources"
    );
  }

  async exportJob(input: { jobId: string; projectId?: string }): Promise<GoogleFlowExportResult> {
    assertNoLegacyReference(input.jobId);
    const projectId = input.projectId ?? await this.findProjectForJob(input.jobId);
    const workspace = resolveProjectWorkspace(projectId, this.options);
    const projectDbPath = path.join(workspace.projectRoot, "project.db");
    const port = this.openPort(projectId, projectDbPath);
    try {
      const job = await port.getProviderJob(projectId, input.jobId);
      if (job === null) throw new GoogleFlowManualError("FLOW_JOB_NOT_FOUND", `Provider job ${input.jobId} was not found in project ${projectId}.`);
      assertFlowJob(job);
      const clip = await port.getClip(projectId, job.targetId);
      if (clip === null) throw new GoogleFlowManualError("FLOW_PACKAGE_STALE", `Target clip ${job.targetId} was not found.`);
      assertClipMatchesJob(clip, job);
      const profile = await this.resolveProfile(job.providerProfileVersion);
      const payload = parsePayload(job);
      const pack = await port.exportPack(projectId, job.id);
      if (pack.jobs.length !== 1 || pack.jobs[0]?.jobId !== job.id) {
        throw new GoogleFlowManualError("FLOW_JOB_INVALID", "Final Clip export did not return exactly the requested Flow job.");
      }
      const item = pack.jobs[0];
      if (
        item.clipId !== clip.id ||
        item.clipRevision !== clip.revision ||
        item.clipMode !== payload.clipMode ||
        item.durationMs !== payload.durationMs ||
        item.prompt !== payload.prompt ||
        item.startMediaId !== payload.startMediaId ||
        normalizeProjectRelativePath(item.startMediaPath) !== normalizeProjectRelativePath(payload.startMediaPath)
      ) {
        throw new GoogleFlowManualError("FLOW_PACKAGE_STALE", "VideoJobPack does not exactly match the current ProviderJob/clip input.");
      }

      const runtimeJob = materializeRuntimeJob({
        job,
        expectedOutputs: VIDEO_EXPECTED_OUTPUTS,
        secretRequirements: []
      });
      const startMedia = await port.getMedia(projectId, item.startMediaId);
      if (startMedia === null) throw new GoogleFlowManualError("FLOW_SOURCE_INVALID", "START MediaArtifact was not found.");
      const start = await readVerifiedSource({
        projectRoot: workspace.projectRoot,
        media: startMedia,
        expectedId: item.startMediaId,
        expectedPath: item.startMediaPath
      });

      let end: Awaited<ReturnType<typeof readVerifiedSource>> | undefined;
      let endMedia: MediaArtifact | undefined;
      if (payload.clipMode === "DIRECT_START_END_I2V") {
        if (!item.endMediaId || !item.endMediaPath) {
          throw new GoogleFlowManualError("FLOW_JOB_INVALID", "DIRECT_START_END_I2V VideoJobPack is missing END media.");
        }
        const found = await port.getMedia(projectId, item.endMediaId);
        if (found === null) throw new GoogleFlowManualError("FLOW_SOURCE_INVALID", "END MediaArtifact was not found.");
        endMedia = found;
        end = await readVerifiedSource({
          projectRoot: workspace.projectRoot,
          media: found,
          expectedId: item.endMediaId,
          expectedPath: item.endMediaPath
        });
      }

      const expectedRelativePath = normalizeProjectRelativePath(
        `06_clips/generated/${clip.id}/${job.id}-attempt-${job.attempt}.mp4`
      );
      const manifest: GoogleFlowJobManifest = {
        schemaVersion: 1,
        projectId,
        jobId: job.id,
        jobRevision: job.revision,
        attempt: job.attempt,
        clipId: clip.id,
        clipRevision: clip.revision,
        clipMode: payload.clipMode,
        durationMs: payload.durationMs,
        provider: GOOGLE_FLOW_PROVIDER,
        providerProfile: {
          resourceId: GOOGLE_FLOW_PROFILE_ID,
          version: profile.version,
          contentHash: profile.contentHash
        },
        runtimeJobInputHash: runtimeJob.inputHash,
        promptSha256: sha256(payload.prompt),
        start: {
          mediaId: startMedia.id,
          sourceRelativePath: normalizeProjectRelativePath(startMedia.relativePath),
          sourceSha256: start.sha256,
          exportedFilename: exportedName("start", startMedia.relativePath)
        },
        ...(end === undefined || endMedia === undefined
          ? {}
          : {
              end: {
                mediaId: endMedia.id,
                sourceRelativePath: normalizeProjectRelativePath(endMedia.relativePath),
                sourceSha256: end.sha256,
                exportedFilename: exportedName("end", endMedia.relativePath)
              }
            }),
        expectedOutput: {
          mimeType: "video/mp4",
          relativePath: expectedRelativePath
        },
        createdAt: this.clock.nowIso()
      };

      const jobsRoot = path.join(workspace.projectRoot, "jobs");
      const packageDir = path.join(jobsRoot, job.id);
      const tempDir = path.join(jobsRoot, `.${job.id}.tmp-${randomUUID()}`);
      assertIsolatedPath(workspace.projectRoot, packageDir);
      assertIsolatedPath(workspace.projectRoot, tempDir);
      await rm(tempDir, { recursive: true, force: true });
      await mkdir(tempDir, { recursive: true });
      try {
        await writeFile(path.join(tempDir, "runtime_job.json"), `${JSON.stringify(runtimeJob, null, 2)}\n`, "utf8");
        await writeFile(path.join(tempDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
        await writeFile(path.join(tempDir, "prompt.txt"), payload.prompt, "utf8");
        await writeFile(
          path.join(tempDir, "INSTRUCTIONS.md"),
          this.instructions(manifest),
          "utf8"
        );
        await copyFile(start.absolutePath, path.join(tempDir, manifest.start.exportedFilename));
        if (end !== undefined && manifest.end !== undefined) {
          await copyFile(end.absolutePath, path.join(tempDir, manifest.end.exportedFilename));
        }
        await rm(packageDir, { recursive: true, force: true });
        await rename(tempDir, packageDir);
      } catch (error) {
        await rm(tempDir, { recursive: true, force: true });
        throw error;
      }

      await port.recordRuntimeReceipt(
        this.runtimeReceipt(runtimeJob, "PREPARED", undefined, manifest.createdAt)
      );
      return { projectId, jobId: job.id, clipId: clip.id, packageDir, manifest };
    } finally {
      port.close();
    }
  }

  async importResult(input: {
    jobId: string;
    generatedFile: string;
    projectId?: string;
  }): Promise<GoogleFlowImportResult> {
    assertNoLegacyReference(input.jobId);
    assertNoLegacyReference(input.generatedFile);
    const projectId = input.projectId ?? await this.findProjectForJob(input.jobId);
    const workspace = resolveProjectWorkspace(projectId, this.options);
    const projectDbPath = path.join(workspace.projectRoot, "project.db");
    const port = this.openPort(projectId, projectDbPath);
    try {
      const job = await port.getProviderJob(projectId, input.jobId);
      if (job === null) throw new GoogleFlowManualError("FLOW_JOB_NOT_FOUND", `Provider job ${input.jobId} was not found in project ${projectId}.`);
      assertFlowJob(job);
      const clip = await port.getClip(projectId, job.targetId);
      if (clip === null) throw new GoogleFlowManualError("FLOW_PACKAGE_STALE", `Target clip ${job.targetId} was not found.`);
      assertClipMatchesJob(clip, job);
      await this.resolveProfile(job.providerProfileVersion);

      const packageDir = path.join(workspace.projectRoot, "jobs", job.id);
      assertIsolatedPath(workspace.projectRoot, packageDir);
      const manifest = await this.readManifest(path.join(packageDir, "manifest.json"));
      const runtimeJob = JSON.parse(await readFile(path.join(packageDir, "runtime_job.json"), "utf8")) as RuntimeJob;
      validateRuntimeJob(runtimeJob);
      assertProviderJobStillMatchesRuntime(job, runtimeJob);
      if (
        manifest.projectId !== projectId ||
        manifest.jobId !== job.id ||
        manifest.jobRevision !== job.revision ||
        manifest.attempt !== job.attempt ||
        manifest.clipId !== clip.id ||
        manifest.clipRevision !== clip.revision ||
        manifest.runtimeJobInputHash !== runtimeJob.inputHash
      ) {
        throw new GoogleFlowManualError("FLOW_PACKAGE_STALE", "Flow package identity/revision/input hash is stale.");
      }

      await this.verifyExportedSource(packageDir, manifest.start);
      if (manifest.end !== undefined) await this.verifyExportedSource(packageDir, manifest.end);
      const prompt = await readFile(path.join(packageDir, "prompt.txt"), "utf8");
      if (sha256(prompt) !== manifest.promptSha256 || prompt !== parsePayload(job).prompt) {
        throw new GoogleFlowManualError("FLOW_PACKAGE_STALE", "Flow prompt.txt no longer matches the current exact provider prompt.");
      }

      if (path.extname(input.generatedFile).toLowerCase() !== ".mp4") {
        throw new GoogleFlowManualError("FLOW_RESULT_INVALID", "Google Flow result must be an .mp4 file.");
      }
      const sourceInfo = await stat(input.generatedFile).catch(() => null);
      if (sourceInfo === null || !sourceInfo.isFile() || sourceInfo.size <= 0) {
        throw new GoogleFlowManualError("FLOW_RESULT_INVALID", "Generated MP4 is missing or empty.");
      }
      const bytes = await readFile(input.generatedFile);
      const mediaInfo = probeMp4(bytes);
      const hash = sha256(bytes);
      const relativePath = manifest.expectedOutput.relativePath;
      const destination = resolveProjectRelativePath(workspace.projectRoot, relativePath);
      assertIsolatedPath(workspace.projectRoot, destination);
      await mkdir(path.dirname(destination), { recursive: true });
      const tempDestination = `${destination}.tmp-${randomUUID()}`;
      try {
        await copyFile(input.generatedFile, tempDestination);
        await rename(tempDestination, destination);
      } catch (error) {
        await rm(tempDestination, { force: true });
        throw error;
      }

      const startedAt = this.clock.nowIso();
      const runtimeResult: RuntimeResult = {
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
            relativePath,
            mimeType: "video/mp4",
            sizeBytes: bytes.length,
            sha256: hash,
            durationMs: mediaInfo.durationMs,
            width: mediaInfo.width,
            height: mediaInfo.height
          }
        ],
        startedAt,
        completedAt: this.clock.nowIso()
      };
      validateRuntimeResult(runtimeJob, runtimeResult);

      try {
        const registered = await port.registerResult({
          projectId,
          jobId: job.id,
          relativePath,
          mimeType: "video/mp4",
          checksum: `sha256:${hash}`,
          durationMs: mediaInfo.durationMs,
          width: mediaInfo.width,
          height: mediaInfo.height
        });
        if (
          registered.clip.clipStatus !== "QC_PENDING" ||
          registered.clip.approvedMediaId !== undefined ||
          registered.media.sourceJobId !== job.id ||
          registered.media.mediaType !== "VIDEO"
        ) {
          throw new GoogleFlowManualError(
            "FLOW_RESULT_INVALID",
            "Imported Flow media did not remain a candidate routed to WF-12 QC."
          );
        }
        await writeFile(
          path.join(packageDir, "runtime_result.json"),
          `${JSON.stringify(runtimeResult, null, 2)}\n`,
          "utf8"
        );
        await port.recordRuntimeReceipt(
          this.runtimeReceipt(runtimeJob, "COMPLETE", runtimeResult, runtimeResult.completedAt)
        );
        return {
          projectId,
          jobId: job.id,
          clipId: registered.clip.id,
          mediaId: registered.media.id,
          relativePath: registered.media.relativePath,
          checksum: registered.media.checksum,
          durationMs: mediaInfo.durationMs,
          width: mediaInfo.width,
          height: mediaInfo.height,
          clipStatus: registered.clip.clipStatus
        };
      } catch (error) {
        await rm(destination, { force: true });
        throw error;
      }
    } catch (error) {
      if (error instanceof SyntaxError || (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT")) {
        throw new GoogleFlowManualError("FLOW_PACKAGE_MISSING", "Google Flow export package is missing or unreadable.");
      }
      throw error;
    } finally {
      port.close();
    }
  }

  async findProjectForJob(jobId: string): Promise<string> {
    const probe = resolveProjectWorkspace("__flow_lookup__", this.options);
    const projectsRoot = path.dirname(probe.projectRoot);
    const entries = await readdir(projectsRoot, { withFileTypes: true }).catch(() => []);
    const matches: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dbPath = path.join(projectsRoot, entry.name, "project.db");
      const info = await stat(dbPath).catch(() => null);
      if (info === null || !info.isFile()) continue;
      let db: Database.Database | undefined;
      try {
        db = new Database(dbPath, { readonly: true, fileMustExist: true });
        const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='provider_jobs'").get();
        if (table === undefined) continue;
        const row = db.prepare(
          "SELECT project_id FROM provider_jobs WHERE id = ? AND lifecycle_status = 'ACTIVE' ORDER BY revision DESC LIMIT 1"
        ).get(jobId) as { project_id: string } | undefined;
        if (row?.project_id === entry.name) matches.push(entry.name);
      } finally {
        db?.close();
      }
    }
    if (matches.length === 0) {
      throw new GoogleFlowManualError("FLOW_JOB_NOT_FOUND", `No active ProviderJob ${jobId} exists in the unified workspace.`);
    }
    if (matches.length > 1) {
      throw new GoogleFlowManualError("FLOW_JOB_AMBIGUOUS", `ProviderJob ${jobId} exists in multiple projects; pass --project <project_id>.`);
    }
    return matches[0]!;
  }

  private openPort(projectId: string, projectDbPath: string): FlowPort {
    return this.options.openPort?.(projectId, projectDbPath) ?? new SqliteFlowPort(projectDbPath, this.clock);
  }

  private async resolveProfile(version: string) {
    const profile = await new FileSystemResourceRegistry(this.resourcesDir).resolve({
      resourceType: "PROVIDER_PROFILE",
      resourceId: GOOGLE_FLOW_PROFILE_ID,
      version
    });
    if (profile === null || !isRecord(profile.payload)) {
      throw new GoogleFlowManualError("FLOW_PROFILE_INVALID", `Google Flow provider profile ${GOOGLE_FLOW_PROFILE_ID}@${version} was not found.`);
    }
    const payload = profile.payload;
    if (
      payload.provider !== GOOGLE_FLOW_PROVIDER ||
      payload.executionMode !== "MANUAL_EXTERNAL" ||
      !Array.isArray(payload.jobTypes) ||
      !payload.jobTypes.includes("VIDEO_GENERATION") ||
      !isRecord(payload.result) ||
      payload.result.mediaType !== "VIDEO" ||
      payload.result.candidateOnly !== true ||
      payload.result.requiresDownstreamQc !== true
    ) {
      throw new GoogleFlowManualError("FLOW_PROFILE_INVALID", "Canonical Google Flow profile violates the manual candidate-only contract.");
    }
    return profile;
  }

  private async readManifest(filename: string): Promise<GoogleFlowJobManifest> {
    const value = JSON.parse(await readFile(filename, "utf8")) as GoogleFlowJobManifest;
    if (
      value.schemaVersion !== 1 ||
      value.provider !== GOOGLE_FLOW_PROVIDER ||
      value.providerProfile?.resourceId !== GOOGLE_FLOW_PROFILE_ID ||
      value.expectedOutput?.mimeType !== "video/mp4"
    ) {
      throw new GoogleFlowManualError("FLOW_PACKAGE_STALE", "manifest.json is not a valid Google Flow manual package manifest.");
    }
    return value;
  }

  private async verifyExportedSource(packageDir: string, source: GoogleFlowManifestSource): Promise<void> {
    const filename = path.join(packageDir, source.exportedFilename);
    const info = await stat(filename).catch(() => null);
    if (info === null || !info.isFile() || info.size <= 0) {
      throw new GoogleFlowManualError("FLOW_PACKAGE_STALE", `Exported source ${source.exportedFilename} is missing.`);
    }
    if (sha256(await readFile(filename)) !== source.sourceSha256) {
      throw new GoogleFlowManualError("FLOW_PACKAGE_STALE", `Exported source ${source.exportedFilename} no longer matches its exact source hash.`);
    }
  }

  private runtimeReceipt(
    runtimeJob: RuntimeJob,
    stage: RuntimeExecutionReceipt["stage"],
    runtimeResult: RuntimeResult | undefined,
    createdAt: string
  ): {
    receipt: RuntimeExecutionReceipt;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  } {
    const receiptId = `runtime_receipt_${randomUUID()}`;
    const eventId = `evt_${randomUUID()}`;
    const receipt: RuntimeExecutionReceipt = {
      id: receiptId,
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
    const event: WorkflowEvent = {
      eventId,
      projectId: runtimeJob.projectId,
      eventType: stage === "PREPARED" ? "GOOGLE_FLOW_JOB_EXPORTED" : "GOOGLE_FLOW_RESULT_IMPORTED",
      targetType: "CLIP",
      targetId: runtimeJob.target.id,
      trigger: stage === "PREPARED" ? "SYSTEM" : "PROVIDER_RESULT",
      payload: {
        providerJobId: runtimeJob.jobId,
        runtimeReceiptId: receiptId,
        inputHash: runtimeJob.inputHash
      },
      createdAt
    };
    return {
      receipt,
      event,
      outbox: {
        outboxId: `outbox_${randomUUID()}`,
        eventId,
        status: "PENDING",
        attempts: 0,
        createdAt
      }
    };
  }

  private instructions(manifest: GoogleFlowJobManifest): string {
    const sources = manifest.end === undefined
      ? `- Source image: \`${manifest.start.exportedFilename}\``
      : `- START image: \`${manifest.start.exportedFilename}\`\n- END image: \`${manifest.end.exportedFilename}\``;
    return `# Google Flow Manual Job\n\nThis package is execution-only. Do not rewrite the prompt or redesign the clip.\n\n- Job: \`${manifest.jobId}\` revision ${manifest.jobRevision}, attempt ${manifest.attempt}\n- Clip: \`${manifest.clipId}\` revision ${manifest.clipRevision}\n- Mode: \`${manifest.clipMode}\`\n- Planned duration: ${manifest.durationMs} ms\n${sources}\n- Prompt: copy \`prompt.txt\` exactly.\n\nGenerate the clip manually in Google Flow. Save the generated MP4 anywhere outside this package, then import it with:\n\n\`\`\`powershell\nvpf job import-result ${manifest.jobId} <generated.mp4>\n\`\`\`\n\nImport creates a candidate VIDEO only. WF-12 CLIP_QC remains mandatory and no result is auto-approved.\n`;
  }
}

export { probeMp4 };
