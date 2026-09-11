import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { MediaArtifact, ProductionClip, ProviderJob } from "@vpf/domain";
import type { VideoJobPack, VideoResultImportItem } from "@vpf/final-clip";
import type { RuntimeExecutionReceipt } from "@vpf/provider-orchestrator";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import {
  GoogleFlowManualError,
  GoogleFlowManualService,
  type GoogleFlowManualServiceOptions
} from "../src/google-flow-manual.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const resourcesDir = path.join(repositoryRoot, "resources");
const generatedFixture = path.join(
  repositoryRoot,
  "tests",
  "e2e",
  "unified-project",
  "fixtures",
  "manual-clip-600ms.mp4"
);
const now = "2026-09-11T01:00:00.000Z";

function sha(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function media(id: string, relativePath: string, bytes: Buffer): MediaArtifact {
  return {
    id,
    projectId: "p_flow",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    mediaType: "IMAGE",
    relativePath,
    mimeType: "image/png",
    checksum: sha(bytes),
    mediaStatus: "AVAILABLE"
  };
}

function clip(mode: "DIRECT_START_END_I2V" | "SINGLE_IMAGE_I2V"): ProductionClip {
  return {
    id: "clip_flow",
    projectId: "p_flow",
    revision: 2,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    stale: false,
    linkId: "link_1",
    linkRevision: 4,
    clipMode: mode,
    clipStartStateRef: {
      entityType: "SCENE",
      entityId: "scene_1",
      entityRevision: 1,
      stateField: "STATE_OUT"
    },
    clipEndStateTarget: {
      entityType: "SCENE",
      entityId: "scene_2",
      entityRevision: 1,
      stateField: "STATE_IN"
    },
    startAssetId: "asset_start",
    startAssetRevision: 3,
    startMediaId: "media_start",
    ...(mode === "DIRECT_START_END_I2V"
      ? {
          endAssetId: "asset_end",
          endAssetRevision: 3,
          endMediaId: "media_end"
        }
      : {}),
    transitionMethod: "DIRECT",
    cameraMove: "slow push",
    subjectMotion: "subtle",
    environmentMotion: "subtle",
    durationMs: 600,
    providerExecutionRequired: true,
    finalDesignApprovalId: "approval_1",
    providerPreflightId: "preflight_1",
    candidateMediaIds: [],
    clipStatus: "READY"
  };
}

function providerJob(mode: "DIRECT_START_END_I2V" | "SINGLE_IMAGE_I2V"): ProviderJob {
  return {
    id: "job_flow",
    projectId: "p_flow",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    jobType: "VIDEO_GENERATION",
    provider: "GOOGLE_FLOW",
    providerProfileVersion: "1.0.0",
    targetType: "CLIP",
    targetId: "clip_flow",
    targetRevision: 2,
    executionMode: "MANUAL_EXTERNAL",
    status: "WAITING_EXTERNAL",
    attempt: 1,
    inputPayload: {
      clipMode: mode,
      transitionMethod: "DIRECT",
      durationMs: 600,
      prompt: "Exact Flow prompt — preserve punctuation, 한국어, spacing.",
      startMediaId: "media_start",
      startMediaPath: "05_images/start.png",
      ...(mode === "DIRECT_START_END_I2V"
        ? {
            endMediaId: "media_end",
            endMediaPath: "05_images/end.png"
          }
        : {})
    },
    resultMediaIds: []
  };
}

class FakeFlowPort {
  job: ProviderJob;
  clip: ProductionClip;
  readonly media = new Map<string, MediaArtifact>();
  readonly receipts: RuntimeExecutionReceipt[] = [];
  readonly events: WorkflowEvent[] = [];
  readonly outbox: OutboxRecord[] = [];
  imported?: VideoResultImportItem;

  constructor(
    mode: "DIRECT_START_END_I2V" | "SINGLE_IMAGE_I2V",
    start: MediaArtifact,
    end?: MediaArtifact
  ) {
    this.job = providerJob(mode);
    this.clip = clip(mode);
    this.media.set(start.id, start);
    if (end !== undefined) this.media.set(end.id, end);
  }

  async getProviderJob(projectId: string, jobId: string) {
    return this.job.projectId === projectId && this.job.id === jobId ? structuredClone(this.job) : null;
  }

  async getClip(projectId: string, clipId: string) {
    return this.clip.projectId === projectId && this.clip.id === clipId ? structuredClone(this.clip) : null;
  }

  async getMedia(projectId: string, mediaId: string) {
    const value = this.media.get(mediaId);
    return value?.projectId === projectId ? structuredClone(value) : null;
  }

  async exportPack(projectId: string, jobId: string): Promise<VideoJobPack> {
    assert.equal(projectId, this.job.projectId);
    assert.equal(jobId, this.job.id);
    const payload = this.job.inputPayload as Record<string, unknown>;
    return {
      schemaVersion: "1.0",
      projectId,
      createdAt: now,
      jobs: [
        {
          jobId,
          clipId: this.clip.id,
          clipRevision: this.clip.revision,
          provider: this.job.provider,
          providerProfileVersion: this.job.providerProfileVersion,
          clipMode: this.clip.clipMode,
          durationMs: this.clip.durationMs,
          prompt: String(payload.prompt),
          startMediaId: String(payload.startMediaId),
          startMediaPath: String(payload.startMediaPath),
          ...(payload.endMediaId === undefined
            ? {}
            : {
                endMediaId: String(payload.endMediaId),
                endMediaPath: String(payload.endMediaPath)
              }),
          resultKey: jobId
        }
      ]
    };
  }

  async registerResult(input: VideoResultImportItem & { projectId: string }) {
    if (this.job.status !== "WAITING_EXTERNAL") {
      throw new Error("result already imported");
    }
    this.imported = { ...input };
    const resultMedia: MediaArtifact = {
      id: "media_flow_result",
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      mediaType: "VIDEO",
      relativePath: input.relativePath,
      mimeType: input.mimeType,
      durationMs: input.durationMs,
      ...(input.width === undefined ? {} : { width: input.width }),
      ...(input.height === undefined ? {} : { height: input.height }),
      checksum: input.checksum,
      sourceJobId: input.jobId,
      mediaStatus: "AVAILABLE"
    };
    this.media.set(resultMedia.id, resultMedia);
    this.job = {
      ...this.job,
      revision: this.job.revision + 1,
      status: "COMPLETE",
      resultMediaIds: [resultMedia.id],
      updatedAt: now
    };
    this.clip = {
      ...this.clip,
      revision: this.clip.revision + 1,
      candidateMediaIds: [resultMedia.id],
      clipStatus: "QC_PENDING",
      updatedAt: now
    };
    return {
      clip: structuredClone(this.clip),
      job: structuredClone(this.job),
      media: structuredClone(resultMedia)
    };
  }

  async recordRuntimeReceipt(input: {
    receipt: RuntimeExecutionReceipt;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.receipts.push(structuredClone(input.receipt));
    this.events.push(structuredClone(input.event));
    this.outbox.push(structuredClone(input.outbox));
  }

  close() {}
}

async function setup(mode: "DIRECT_START_END_I2V" | "SINGLE_IMAGE_I2V") {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-flow-manual-"));
  const workspaceRoot = path.join(root, "workspace");
  const projectRoot = path.join(workspaceRoot, "projects", "p_flow");
  await mkdir(path.join(projectRoot, "05_images"), { recursive: true });
  await writeFile(path.join(projectRoot, "project.db"), "test-db-placeholder");
  const startBytes = Buffer.from("exact-start-bytes");
  const endBytes = Buffer.from("exact-end-bytes");
  await writeFile(path.join(projectRoot, "05_images", "start.png"), startBytes);
  await writeFile(path.join(projectRoot, "05_images", "end.png"), endBytes);
  const start = media("media_start", "05_images/start.png", startBytes);
  const end = media("media_end", "05_images/end.png", endBytes);
  const port = new FakeFlowPort(mode, start, mode === "DIRECT_START_END_I2V" ? end : undefined);
  const options: GoogleFlowManualServiceOptions = {
    repositoryRoot,
    resourcesDir,
    workspaceRoot,
    clock: { nowIso: () => now },
    openPort: () => port as never
  };
  return {
    root,
    workspaceRoot,
    projectRoot,
    port,
    service: new GoogleFlowManualService(options),
    startBytes,
    endBytes
  };
}

async function packageText(packageDir: string): Promise<string> {
  const names = await readdir(packageDir);
  const textFiles = names.filter((name) => /\.(?:json|txt|md)$/iu.test(name));
  let output = "";
  for (const name of textFiles) output += await readFile(path.join(packageDir, name), "utf8");
  return output;
}

test("DIRECT_START_END_I2V exports exact prompt, exact START/END bytes and a non-secret RuntimeJob package", async () => {
  const { service, port, startBytes, endBytes } = await setup("DIRECT_START_END_I2V");
  const result = await service.exportJob({ projectId: "p_flow", jobId: "job_flow" });

  assert.equal(await readFile(path.join(result.packageDir, "prompt.txt"), "utf8"),
    "Exact Flow prompt — preserve punctuation, 한국어, spacing.");
  assert.deepEqual(await readFile(path.join(result.packageDir, result.manifest.start.exportedFilename)), startBytes);
  assert.ok(result.manifest.end);
  assert.deepEqual(await readFile(path.join(result.packageDir, result.manifest.end!.exportedFilename)), endBytes);
  assert.equal(result.manifest.start.sourceSha256, sha(startBytes));
  assert.equal(result.manifest.end!.sourceSha256, sha(endBytes));
  assert.equal(result.manifest.providerProfile.resourceId, "GOOGLE_FLOW_MANUAL_EXTERNAL_V1");
  assert.equal(result.manifest.providerProfile.version, "1.0.0");
  assert.match(result.manifest.providerProfile.contentHash, /^sha256:[a-f0-9]{64}$/u);
  assert.match(result.manifest.runtimeJobInputHash, /^[a-f0-9]{64}$/u);
  assert.equal(port.receipts.at(-1)?.stage, "PREPARED");
  const allText = await packageText(result.packageDir);
  assert.equal(/api[_-]?key|cookie|authorization|session[_-]?token/iu.test(allText), false);
});

test("SINGLE_IMAGE_I2V exports only the exact single source image", async () => {
  const { service } = await setup("SINGLE_IMAGE_I2V");
  const result = await service.exportJob({ projectId: "p_flow", jobId: "job_flow" });
  assert.equal(result.manifest.end, undefined);
  const names = await readdir(result.packageDir);
  assert.ok(names.includes(result.manifest.start.exportedFilename));
  assert.equal(names.some((name) => name.startsWith("end.")), false);
});

test("export rejects changed source bytes instead of packaging stale media", async () => {
  const { service, projectRoot } = await setup("DIRECT_START_END_I2V");
  await writeFile(path.join(projectRoot, "05_images", "start.png"), "tampered");
  await assert.rejects(
    () => service.exportJob({ projectId: "p_flow", jobId: "job_flow" }),
    (error: unknown) => error instanceof GoogleFlowManualError && error.code === "FLOW_SOURCE_INVALID"
  );
});

test("MP4 import validates the exported package, creates candidate VIDEO and routes clip to QC_PENDING", async () => {
  const { service, port, projectRoot } = await setup("DIRECT_START_END_I2V");
  const exported = await service.exportJob({ projectId: "p_flow", jobId: "job_flow" });
  const imported = await service.importResult({
    projectId: "p_flow",
    jobId: "job_flow",
    generatedFile: generatedFixture
  });

  assert.equal(imported.clipStatus, "QC_PENDING");
  assert.equal(imported.mediaId, "media_flow_result");
  assert.ok(imported.durationMs > 0);
  assert.ok(imported.width > 0);
  assert.ok(imported.height > 0);
  assert.equal(port.imported?.mimeType, "video/mp4");
  assert.match(port.imported?.checksum ?? "", /^sha256:[a-f0-9]{64}$/u);
  const copied = await readFile(path.join(projectRoot, imported.relativePath));
  assert.equal(`sha256:${sha(copied)}`, imported.checksum);
  assert.equal(port.clip.approvedMediaId, undefined);
  assert.equal(port.receipts.map((item) => item.stage).includes("COMPLETE"), true);
  assert.ok(await readFile(path.join(exported.packageDir, "runtime_result.json"), "utf8"));

  await assert.rejects(
    () => service.importResult({
      projectId: "p_flow",
      jobId: "job_flow",
      generatedFile: generatedFixture
    }),
    (error: unknown) => error instanceof GoogleFlowManualError && error.code === "FLOW_JOB_INVALID"
  );
});

test("import rejects stale clip revision, missing package and non-MP4 results", async () => {
  {
    const { service, port } = await setup("DIRECT_START_END_I2V");
    await service.exportJob({ projectId: "p_flow", jobId: "job_flow" });
    port.clip = { ...port.clip, revision: 3 };
    await assert.rejects(
      () => service.importResult({ projectId: "p_flow", jobId: "job_flow", generatedFile: generatedFixture }),
      (error: unknown) => error instanceof GoogleFlowManualError && error.code === "FLOW_PACKAGE_STALE"
    );
  }
  {
    const { service } = await setup("DIRECT_START_END_I2V");
    await assert.rejects(
      () => service.importResult({ projectId: "p_flow", jobId: "job_flow", generatedFile: generatedFixture }),
      (error: unknown) => error instanceof GoogleFlowManualError && error.code === "FLOW_PACKAGE_MISSING"
    );
  }
  {
    const { service, root } = await setup("DIRECT_START_END_I2V");
    await service.exportJob({ projectId: "p_flow", jobId: "job_flow" });
    const bad = path.join(root, "not-video.txt");
    await writeFile(bad, "not video");
    await assert.rejects(
      () => service.importResult({ projectId: "p_flow", jobId: "job_flow", generatedFile: bad }),
      (error: unknown) => error instanceof GoogleFlowManualError && error.code === "FLOW_RESULT_INVALID"
    );
  }
});
