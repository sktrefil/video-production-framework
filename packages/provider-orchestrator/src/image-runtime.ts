import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  RuntimeContractError,
  type RuntimeExecutor,
  type RuntimeJob,
  type RuntimeResult
} from "@vpf/runtime-contracts";
import {
  imageMimeForOutputPath,
  normalizeImageSha256,
  requireImageRuntimeJob,
  type ImageRuntimeInput,
  type ImageRuntimeMimeType
} from "@vpf/runtime-contracts/image";
import {
  resolveProjectRelativePath,
  resolveProjectWorkspace,
  type WorkspaceResolverOptions
} from "@vpf/workspace";

export interface ImageProviderReference {
  mediaId: string;
  role: string;
  absolutePath: string;
  sha256: string;
  mimeType: ImageRuntimeMimeType;
}

export interface ImageProviderRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  aspectRatio: string;
  references: ImageProviderReference[];
}

export interface ImageProviderResult {
  bytes: Uint8Array;
  mimeType: ImageRuntimeMimeType;
  providerRequestIds?: string[];
}

/**
 * Provider adapters are transport-only. They receive the exact approved prompt
 * and reference set and must not add creative policy, style, palette or scene
 * interpretation.
 */
export interface ImageProviderAdapter {
  generate(request: ImageProviderRequest): Promise<ImageProviderResult>;
}

export interface ImageRuntimeClock {
  nowIso(): string;
}

export interface ImageRuntimeExecutorOptions {
  workspace?: WorkspaceResolverOptions;
  clock?: ImageRuntimeClock;
}

interface ImageProbe {
  mimeType: ImageRuntimeMimeType;
  width: number;
  height: number;
}

const defaultClock: ImageRuntimeClock = {
  nowIso: () => new Date().toISOString()
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertPositiveDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new RuntimeContractError(
      "PROVIDER_RESULT_INVALID",
      "Generated image contains invalid dimensions."
    );
  }
}

export function probeImageBytes(bytes: Uint8Array): ImageProbe {
  const buffer = Buffer.from(bytes);
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    assertPositiveDimensions(width, height);
    return { mimeType: "image/png", width, height };
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (offset + 3 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
      if (offset >= buffer.length) break;
      const marker = buffer[offset]!;
      offset += 1;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 1 >= buffer.length) break;
      const length = buffer.readUInt16BE(offset);
      if (length < 2 || offset + length > buffer.length) break;
      if (sofMarkers.has(marker) && length >= 7) {
        const height = buffer.readUInt16BE(offset + 3);
        const width = buffer.readUInt16BE(offset + 5);
        assertPositiveDimensions(width, height);
        return { mimeType: "image/jpeg", width, height };
      }
      offset += length;
    }
    throw new RuntimeContractError(
      "PROVIDER_RESULT_INVALID",
      "JPEG output does not contain a readable SOF dimension marker."
    );
  }

  if (
    buffer.length >= 30 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X" && buffer.length >= 30) {
      const width = 1 + buffer.readUIntLE(24, 3);
      const height = 1 + buffer.readUIntLE(27, 3);
      assertPositiveDimensions(width, height);
      return { mimeType: "image/webp", width, height };
    }
    if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
      const b1 = buffer[21]!;
      const b2 = buffer[22]!;
      const b3 = buffer[23]!;
      const b4 = buffer[24]!;
      const width = 1 + (b1 | ((b2 & 0x3f) << 8));
      const height = 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10));
      assertPositiveDimensions(width, height);
      return { mimeType: "image/webp", width, height };
    }
    if (chunk === "VP8 " && buffer.length >= 30) {
      for (let index = 20; index + 6 < buffer.length; index += 1) {
        if (buffer[index] === 0x9d && buffer[index + 1] === 0x01 && buffer[index + 2] === 0x2a) {
          const width = buffer.readUInt16LE(index + 3) & 0x3fff;
          const height = buffer.readUInt16LE(index + 5) & 0x3fff;
          assertPositiveDimensions(width, height);
          return { mimeType: "image/webp", width, height };
        }
      }
    }
    throw new RuntimeContractError(
      "PROVIDER_RESULT_INVALID",
      "WebP output does not contain readable dimensions."
    );
  }

  throw new RuntimeContractError(
    "ARTIFACT_MEDIA_TYPE_MISMATCH",
    "Image runtime received bytes that are not PNG, JPEG or WebP."
  );
}

async function atomicWrite(absolutePath: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(absolutePath), { recursive: true });
  const temporary = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, absolutePath);
  } catch (error) {
    throw new RuntimeContractError(
      "ARTIFACT_WRITE_FAILED",
      error instanceof Error ? error.message : "Image output could not be written atomically."
    );
  }
}

export class ImageRuntimeExecutor implements RuntimeExecutor {
  private readonly workspace: WorkspaceResolverOptions;
  private readonly clock: ImageRuntimeClock;

  constructor(
    private readonly adapter: ImageProviderAdapter,
    options: ImageRuntimeExecutorOptions = {}
  ) {
    this.workspace = options.workspace ?? {};
    this.clock = options.clock ?? defaultClock;
  }

  async execute(runtimeJob: RuntimeJob): Promise<RuntimeResult> {
    const job = requireImageRuntimeJob(runtimeJob);
    const input = job.input;
    const startedAt = this.clock.nowIso();
    const project = resolveProjectWorkspace(job.projectId, this.workspace);
    const references: ImageProviderReference[] = [];

    for (const reference of input.references) {
      const absolutePath = resolveProjectRelativePath(project.projectRoot, reference.relativePath);
      let bytes: Buffer;
      try {
        const info = await stat(absolutePath);
        if (!info.isFile() || info.size <= 0) throw new Error("not a file");
        bytes = await readFile(absolutePath);
      } catch {
        throw new RuntimeContractError(
          "RUNTIME_INPUT_MISSING",
          `Image reference is unavailable: ${reference.relativePath}`
        );
      }
      const actualSha = sha256(bytes);
      if (actualSha !== normalizeImageSha256(reference.sha256)) {
        throw new RuntimeContractError(
          "ARTIFACT_HASH_MISMATCH",
          `Image reference checksum mismatch: ${reference.mediaId}`
        );
      }
      const probe = probeImageBytes(bytes);
      references.push({
        mediaId: reference.mediaId,
        role: reference.role,
        absolutePath,
        sha256: actualSha,
        mimeType: probe.mimeType
      });
    }

    // Do not transform prompt/negativePrompt here. Exact semantic strings cross
    // the provider boundary unchanged.
    const providerResult = await this.adapter.generate({
      prompt: input.prompt,
      ...(input.negativePrompt === undefined
        ? {}
        : { negativePrompt: input.negativePrompt }),
      width: input.width,
      height: input.height,
      aspectRatio: input.aspectRatio,
      references
    });

    const bytes = Buffer.from(providerResult.bytes);
    if (bytes.length === 0) {
      throw new RuntimeContractError(
        "PROVIDER_RESULT_INVALID",
        "Image provider returned an empty result."
      );
    }
    const probe = probeImageBytes(bytes);
    const expectedMime = imageMimeForOutputPath(input.outputRelativePath);
    if (providerResult.mimeType !== probe.mimeType || expectedMime !== probe.mimeType) {
      throw new RuntimeContractError(
        "ARTIFACT_MEDIA_TYPE_MISMATCH",
        "Image provider MIME, file extension and actual bytes must agree."
      );
    }
    if (probe.width !== input.width || probe.height !== input.height) {
      throw new RuntimeContractError(
        "PROVIDER_RESULT_INVALID",
        `Generated image dimensions ${probe.width}x${probe.height} do not match required ${input.width}x${input.height}.`
      );
    }

    const absoluteOutput = resolveProjectRelativePath(
      project.projectRoot,
      input.outputRelativePath
    );
    await atomicWrite(absoluteOutput, bytes);

    return {
      schemaVersion: 1,
      jobId: job.jobId,
      jobRevision: job.jobRevision,
      projectId: job.projectId,
      attempt: job.attempt,
      status: "COMPLETE",
      providerRequestIds: [...(providerResult.providerRequestIds ?? [])],
      outputs: [
        {
          role: "primary",
          relativePath: input.outputRelativePath,
          mimeType: probe.mimeType,
          sizeBytes: bytes.length,
          sha256: sha256(bytes),
          width: probe.width,
          height: probe.height
        }
      ],
      startedAt,
      completedAt: this.clock.nowIso()
    };
  }
}

export async function buildManualImageRuntimeResult(input: {
  runtimeJob: RuntimeJob;
  workspace?: WorkspaceResolverOptions;
  providerRequestIds?: string[];
  startedAt?: string;
  completedAt?: string;
}): Promise<RuntimeResult> {
  const job = requireImageRuntimeJob(input.runtimeJob);
  const project = resolveProjectWorkspace(job.projectId, input.workspace ?? {});
  const absolutePath = resolveProjectRelativePath(
    project.projectRoot,
    job.input.outputRelativePath
  );
  let bytes: Buffer;
  try {
    const info = await stat(absolutePath);
    if (!info.isFile() || info.size <= 0) throw new Error("not a file");
    bytes = await readFile(absolutePath);
  } catch {
    throw new RuntimeContractError(
      "MANUAL_RESULT_NOT_READY",
      `Manual image result is not ready: ${job.input.outputRelativePath}`
    );
  }
  const probe = probeImageBytes(bytes);
  const expectedMime = imageMimeForOutputPath(job.input.outputRelativePath);
  if (probe.mimeType !== expectedMime) {
    throw new RuntimeContractError(
      "ARTIFACT_MEDIA_TYPE_MISMATCH",
      "Manual image result MIME does not match its output path."
    );
  }
  if (probe.width !== job.input.width || probe.height !== job.input.height) {
    throw new RuntimeContractError(
      "PROVIDER_RESULT_INVALID",
      "Manual image result dimensions do not match the approved runtime input."
    );
  }
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    jobId: job.jobId,
    jobRevision: job.jobRevision,
    projectId: job.projectId,
    attempt: job.attempt,
    status: "COMPLETE",
    providerRequestIds: [...(input.providerRequestIds ?? [])],
    outputs: [{
      role: "primary",
      relativePath: job.input.outputRelativePath,
      mimeType: probe.mimeType,
      sizeBytes: bytes.length,
      sha256: sha256(bytes),
      width: probe.width,
      height: probe.height
    }],
    startedAt: input.startedAt ?? now,
    completedAt: input.completedAt ?? now
  };
}

export function assertImageProviderRequestMatchesApprovedInput(
  request: ImageProviderRequest,
  approved: ImageRuntimeInput
): void {
  if (
    request.prompt !== approved.prompt ||
    request.negativePrompt !== approved.negativePrompt ||
    request.width !== approved.width ||
    request.height !== approved.height ||
    request.aspectRatio !== approved.aspectRatio ||
    request.references.length !== approved.references.length
  ) {
    throw new RuntimeContractError(
      "RUNTIME_INPUT_HASH_MISMATCH",
      "Image provider request changed approved semantic runtime input."
    );
  }
  for (let index = 0; index < approved.references.length; index += 1) {
    const expected = approved.references[index]!;
    const actual = request.references[index]!;
    if (
      actual.mediaId !== expected.mediaId ||
      actual.role !== expected.role ||
      actual.sha256 !== normalizeImageSha256(expected.sha256)
    ) {
      throw new RuntimeContractError(
        "RUNTIME_INPUT_HASH_MISMATCH",
        "Image provider reference set differs from approved runtime input."
      );
    }
  }
}
