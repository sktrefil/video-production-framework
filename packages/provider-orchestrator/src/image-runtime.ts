import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, link, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, parse, sep } from "node:path";
import { inflateSync } from "node:zlib";
import {
  RuntimeContractError, validateRuntimeJob,
  type ImageRuntimeInput, type RuntimeExecutor, type RuntimeJob, type RuntimeResult
} from "@vpf/runtime-contracts";
import { normalizeProjectRelativePath, resolveProjectWorkspace, type WorkspaceResolverOptions } from "@vpf/workspace";

export interface ImageFormatResolver {
  /** Resolve using the project's approved version/hash, never a latest-version lookup. */
  resolve(pin: ImageRuntimeInput["formatProfile"]): Promise<{
    resourceId: string; version: string; contentHash: string;
    payload: { aspectRatio: string; imageGeneration: { width: number; height: number } };
  }>;
}
export interface ImageProviderRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  aspectRatio: string;
  references: Array<ImageRuntimeInput["references"][number] & { bytes: Uint8Array }>;
}
export interface ImageProviderAdapter {
  provider: string;
  providerProfileVersion: string;
  generate(request: ImageProviderRequest): Promise<{ bytes: Uint8Array; requestId?: string }>;
}
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const invalid = (detail: string): never => { throw new RuntimeContractError("PROVIDER_RESULT_INVALID", detail); };

/** Strict PNG probe: validates chunks/CRC and inflated scanline size, not just a header. */
export function probeImage(bytes: Uint8Array): { width: number; height: number; mimeType: string } {
  const b = Buffer.from(bytes);
  if (b.length > 64 * 1024 * 1024 || !b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    return invalid("This runtime currently accepts PNG results only.");
  let offset = 8, width = 0, height = 0, channels = 0, ended = false;
  const data: Buffer[] = [];
  while (offset + 12 <= b.length) {
    const length = b.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > b.length) return invalid("Truncated PNG chunk.");
    const type = b.toString("ascii", offset + 4, offset + 8);
    let crc = 0xffffffff;
    for (const byte of b.subarray(offset + 4, end - 4)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    if (((crc ^ 0xffffffff) >>> 0) !== b.readUInt32BE(end - 4)) return invalid("PNG CRC mismatch.");
    if (offset === 8 && type !== "IHDR") return invalid("PNG IHDR missing.");
    if (type === "IHDR") {
      if (width || length !== 13) return invalid("Invalid PNG IHDR.");
      width = b.readUInt32BE(offset + 8); height = b.readUInt32BE(offset + 12);
      channels = ({0:1, 2:3, 4:2, 6:4} as Record<number, number>)[b[offset + 17]!] ?? 0;
      if (!width || !height || width * height > 40_000_000 || !channels || b[offset + 16] !== 8 ||
          b[offset + 18] !== 0 || b[offset + 19] !== 0 || b[offset + 20] !== 0)
        return invalid("Unsupported PNG encoding (requires 8-bit, non-interlaced grayscale/RGB/RGBA).");
    } else if (type === "IDAT") data.push(b.subarray(offset + 8, end - 4));
    else if (type === "IEND") {
      if (length !== 0 || end !== b.length) return invalid("Invalid PNG end.");
      ended = true;
    }
    offset = end;
  }
  if (!ended || !data.length) return invalid("Incomplete PNG.");
  const stride = width * channels + 1;
  let decoded: Buffer;
  try { decoded = inflateSync(Buffer.concat(data), { maxOutputLength: stride * height }); }
  catch { return invalid("Invalid PNG compressed data."); }
  if (decoded.length !== stride * height) return invalid("PNG scanline size mismatch.");
  for (let row = 0; row < height; row++) if (decoded[row * stride]! > 4) return invalid("Invalid PNG filter.");
  return {width, height, mimeType: "image/png"};
}

/** Reject symlinks, including ancestors, rather than following them outside the workspace. */
async function safePath(root: string, relative: string, createParents = false): Promise<string> {
  let normalized: string;
  try { normalized = normalizeProjectRelativePath(relative); }
  catch { throw new RuntimeContractError("ARTIFACT_PATH_INVALID", "Unsafe image path."); }
  const target = join(resolve(root), normalized);
  const base = parse(resolve(target)).root;
  const parts = resolve(target).slice(base.length).split(sep).filter(Boolean);
  let current = base;
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]!);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || (index < parts.length - 1 && !info.isDirectory()))
        throw new RuntimeContractError("ARTIFACT_PATH_INVALID", "Symlink/non-directory image path component.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (createParents && index < parts.length - 1) await mkdir(current);
    }
  }
  return target;
}

export class ImageRuntimeExecutor implements RuntimeExecutor {
  constructor(
    private readonly adapter: ImageProviderAdapter,
    private readonly formats: ImageFormatResolver,
    private readonly workspace: WorkspaceResolverOptions = {}
  ) {}

  private async prepare(job: RuntimeJob): Promise<{ input: ImageRuntimeInput; request: ImageProviderRequest; output: string }> {
    validateRuntimeJob(job);
    if (job.jobType !== "IMAGE_GENERATION" || job.target.type !== "ASSET" ||
        job.provider !== this.adapter.provider || job.providerProfileVersion !== this.adapter.providerProfileVersion)
      throw new RuntimeContractError("RUNTIME_CONFIG_INVALID", "Image provider/target contract mismatch.");
    const input = structuredClone(job.input) as ImageRuntimeInput;
    if (!input || typeof input.prompt !== "string" || !input.prompt.trim() ||
        (input.negativePrompt !== undefined && typeof input.negativePrompt !== "string") ||
        !Number.isSafeInteger(input.width) || !Number.isSafeInteger(input.height) || input.width <= 0 || input.height <= 0 ||
        !Array.isArray(input.references) || !input.formatProfile || typeof input.outputRelativePath !== "string")
      throw new RuntimeContractError("RUNTIME_CONFIG_INVALID", "Incomplete approved image execution input.");
    const profile = await this.formats.resolve(input.formatProfile);
    if (profile.resourceId !== input.formatProfile.resourceId || profile.version !== input.formatProfile.version ||
        profile.contentHash !== input.formatProfile.contentHash ||
        profile.payload.imageGeneration.width !== input.width || profile.payload.imageGeneration.height !== input.height ||
        profile.payload.aspectRatio !== input.aspectRatio)
      throw new RuntimeContractError("RUNTIME_CONFIG_INVALID", "Pinned image format mismatch.");
    const ratio = /^(\d+):(\d+)$/u.exec(input.aspectRatio);
    if (!ratio || Number(ratio[1]) <= 0 || Number(ratio[2]) <= 0 || input.width * Number(ratio[2]) !== input.height * Number(ratio[1]))
      throw new RuntimeContractError("RUNTIME_CONFIG_INVALID", "Image aspect ratio mismatch.");
    if (job.expectedOutputs.length !== 1 || job.expectedOutputs[0]?.role !== "image" ||
        job.expectedOutputs[0].mediaType !== "IMAGE" || !job.expectedOutputs[0].required)
      throw new RuntimeContractError("RUNTIME_CONFIG_INVALID", "Expected one required image output.");
    const root = resolveProjectWorkspace(job.projectId, this.workspace).projectRoot;
    const output = await safePath(root, input.outputRelativePath);
    const references: ImageProviderRequest["references"] = [];
    for (const reference of input.references) {
      if (!reference.mediaId?.trim() || !reference.role?.trim() || !/^[a-f0-9]{64}$/u.test(reference.sha256))
        throw new RuntimeContractError("RUNTIME_CONFIG_INVALID", "Incomplete image reference.");
      const path = await safePath(root, reference.relativePath);
      if (path === output) throw new RuntimeContractError("ARTIFACT_PATH_INVALID", "Output cannot replace a reference.");
      const bytes = await readFile(path);
      if (hash(bytes) !== reference.sha256)
        throw new RuntimeContractError("RUNTIME_INPUT_HASH_MISMATCH", "Reference checksum mismatch.");
      references.push({...reference, bytes});
    }
    return {input, output, request: {
      prompt: input.prompt,
      ...(input.negativePrompt === undefined ? {} : {negativePrompt: input.negativePrompt}),
      width: input.width, height: input.height, aspectRatio: input.aspectRatio, references
    }};
  }

  async prepareManual(job: RuntimeJob): Promise<string> {
    if (job.executionMode !== "MANUAL_EXTERNAL") throw new RuntimeContractError("RUNTIME_JOB_STATE_INVALID", "Expected manual image job.");
    await this.prepare(job);
    return JSON.stringify(job, null, 2);
  }

  async importManual(job: RuntimeJob, sourceRelativePath: string, expectedSha256: string, requestId?: string): Promise<RuntimeResult> {
    if (job.executionMode !== "MANUAL_EXTERNAL") throw new RuntimeContractError("RUNTIME_JOB_STATE_INVALID", "Expected manual image job.");
    const startedAt = new Date().toISOString();
    const prepared = await this.prepare(job);
    const root = resolveProjectWorkspace(job.projectId, this.workspace).projectRoot;
    const bytes = await readFile(await safePath(root, sourceRelativePath));
    if (hash(bytes) !== expectedSha256) throw new RuntimeContractError("ARTIFACT_HASH_MISMATCH", "Manual image checksum mismatch.");
    return this.store(job, prepared, bytes, startedAt, requestId);
  }

  async execute(job: RuntimeJob): Promise<RuntimeResult> {
    const startedAt = new Date().toISOString();
    if (job.executionMode !== "AUTOMATED") throw new RuntimeContractError("RUNTIME_JOB_STATE_INVALID", "Expected automated image job.");
    const prepared = await this.prepare(job);
    let response: Awaited<ReturnType<ImageProviderAdapter["generate"]>>;
    try { response = await this.adapter.generate(prepared.request); }
    catch { throw new RuntimeContractError("PROVIDER_REQUEST_FAILED", "Image provider request failed."); }
    return this.store(job, prepared, response.bytes, startedAt, response.requestId);
  }

  private async store(job: RuntimeJob, prepared: {input: ImageRuntimeInput; output: string}, bytes: Uint8Array, startedAt: string, requestId?: string): Promise<RuntimeResult> {
    const metadata = probeImage(bytes);
    if (metadata.width !== prepared.input.width || metadata.height !== prepared.input.height)
      return invalid("Provider result dimensions differ from approved image dimensions.");
    const root = resolveProjectWorkspace(job.projectId, this.workspace).projectRoot;
    const output = await safePath(root, prepared.input.outputRelativePath, true);
    const temporary = join(dirname(output), ".image-" + randomUUID() + ".tmp");
    await writeFile(temporary, bytes, {flag: "wx"});
    try {
      // Hard-link promotion is atomic and cannot overwrite an existing candidate.
      await link(temporary, output);
    } finally { await unlink(temporary); }
    return {
      schemaVersion: 1, jobId: job.jobId, jobRevision: job.jobRevision, projectId: job.projectId,
      attempt: job.attempt, status: "COMPLETE", providerRequestIds: requestId === undefined ? [] : [requestId],
      outputs: [{role: "image", relativePath: prepared.input.outputRelativePath, ...metadata, sizeBytes: bytes.byteLength, sha256: hash(bytes)}],
      startedAt, completedAt: new Date().toISOString()
    };
  }
}

/** Test-only provider; fixture bytes are supplied explicitly, never generated creatively. */
export class MockImageProvider implements ImageProviderAdapter {
  readonly requests: ImageProviderRequest[] = [];
  constructor(public readonly provider: string, public readonly providerProfileVersion: string, private readonly bytes: Uint8Array) {}
  async generate(request: ImageProviderRequest) {
    this.requests.push(structuredClone(request));
    return {bytes: this.bytes.slice(), requestId: "mock-image-" + this.requests.length};
  }
}
