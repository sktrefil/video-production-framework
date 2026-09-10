import {
  RuntimeContractError,
  type RuntimeExpectedOutput,
  type RuntimeJob
} from "./index.js";

export type ImageRuntimeMimeType =
  | "image/png"
  | "image/jpeg"
  | "image/webp";

export interface ImageRuntimeReference {
  mediaId: string;
  role: string;
  relativePath: string;
  sha256: string;
}

export interface ImageRuntimeInput {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  aspectRatio: string;
  references: ImageRuntimeReference[];
  outputRelativePath: string;
}

export type ImageRuntimeJob = RuntimeJob<ImageRuntimeInput>;

function requireObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RuntimeContractError(
      "RUNTIME_CONFIG_INVALID",
      "Image runtime input must be an object."
    );
  }
  return value as Record<string, unknown>;
}

function requireNonEmptyString(
  value: unknown,
  field: string,
  code: "RUNTIME_CONFIG_INVALID" | "ARTIFACT_PATH_INVALID" = "RUNTIME_CONFIG_INVALID"
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RuntimeContractError(code, `Image runtime ${field} is required.`);
  }
  return value;
}

function validateProjectRelativePath(value: string, field: string): void {
  if (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/u.test(value) ||
    value.includes("\\") ||
    value.split("/").some(part => part === ".." || part === ".")
  ) {
    throw new RuntimeContractError(
      "ARTIFACT_PATH_INVALID",
      `Image runtime ${field} must be a normalized project-relative path.`
    );
  }
}

export function normalizeImageSha256(value: string): string {
  const normalized = value.trim().replace(/^sha256:/iu, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(normalized)) {
    throw new RuntimeContractError(
      "RUNTIME_CONFIG_INVALID",
      "Image runtime reference SHA-256 must contain exactly 64 hexadecimal characters."
    );
  }
  return normalized;
}

export function imageMimeForOutputPath(path: string): ImageRuntimeMimeType {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  throw new RuntimeContractError(
    "ARTIFACT_PATH_INVALID",
    "Image runtime output path must end in .png, .jpg/.jpeg or .webp."
  );
}

function validateAspectRatio(width: number, height: number, aspectRatio: string): void {
  const match = /^(\d+):(\d+)$/u.exec(aspectRatio);
  if (match === null) {
    throw new RuntimeContractError(
      "RUNTIME_CONFIG_INVALID",
      "Image runtime aspectRatio must use W:H notation."
    );
  }
  const ratioWidth = Number(match[1]);
  const ratioHeight = Number(match[2]);
  if (
    !Number.isSafeInteger(ratioWidth) ||
    !Number.isSafeInteger(ratioHeight) ||
    ratioWidth <= 0 ||
    ratioHeight <= 0 ||
    width * ratioHeight !== height * ratioWidth
  ) {
    throw new RuntimeContractError(
      "RUNTIME_CONFIG_INVALID",
      "Image runtime dimensions do not match the declared aspect ratio."
    );
  }
}

export function validateImageRuntimeInput(
  value: unknown
): asserts value is ImageRuntimeInput {
  const input = requireObject(value);
  requireNonEmptyString(input.prompt, "prompt");
  if (input.negativePrompt !== undefined && typeof input.negativePrompt !== "string") {
    throw new RuntimeContractError(
      "RUNTIME_CONFIG_INVALID",
      "Image runtime negativePrompt must be a string when provided."
    );
  }

  if (
    !Number.isSafeInteger(input.width) ||
    !Number.isSafeInteger(input.height) ||
    (input.width as number) <= 0 ||
    (input.height as number) <= 0
  ) {
    throw new RuntimeContractError(
      "RUNTIME_CONFIG_INVALID",
      "Image runtime width and height must be positive integers."
    );
  }

  const aspectRatio = requireNonEmptyString(input.aspectRatio, "aspectRatio");
  validateAspectRatio(input.width as number, input.height as number, aspectRatio);

  const outputPath = requireNonEmptyString(
    input.outputRelativePath,
    "outputRelativePath",
    "ARTIFACT_PATH_INVALID"
  );
  validateProjectRelativePath(outputPath, "outputRelativePath");
  imageMimeForOutputPath(outputPath);

  if (!Array.isArray(input.references)) {
    throw new RuntimeContractError(
      "RUNTIME_CONFIG_INVALID",
      "Image runtime references must be an array."
    );
  }

  const seen = new Set<string>();
  for (const rawReference of input.references) {
    const reference = requireObject(rawReference);
    const mediaId = requireNonEmptyString(reference.mediaId, "reference.mediaId");
    const role = requireNonEmptyString(reference.role, "reference.role");
    const relativePath = requireNonEmptyString(
      reference.relativePath,
      "reference.relativePath",
      "ARTIFACT_PATH_INVALID"
    );
    validateProjectRelativePath(relativePath, "reference.relativePath");
    normalizeImageSha256(
      requireNonEmptyString(reference.sha256, "reference.sha256")
    );
    const identity = `${mediaId}\u0000${role}`;
    if (seen.has(identity)) {
      throw new RuntimeContractError(
        "RUNTIME_CONFIG_INVALID",
        "Image runtime reference identities must be unique."
      );
    }
    seen.add(identity);
  }
}

export function requireImageRuntimeJob(job: RuntimeJob): ImageRuntimeJob {
  if (job.jobType !== "IMAGE_GENERATION") {
    throw new RuntimeContractError(
      "RUNTIME_JOB_STATE_INVALID",
      "Image runtime can execute only IMAGE_GENERATION jobs."
    );
  }
  validateImageRuntimeInput(job.input);
  return job as ImageRuntimeJob;
}

export function imageRuntimeExpectedOutputs(
  input: ImageRuntimeInput
): RuntimeExpectedOutput[] {
  validateImageRuntimeInput(input);
  return [
    {
      role: "primary",
      mediaType: "IMAGE",
      required: true,
      acceptedMimeTypes: [imageMimeForOutputPath(input.outputRelativePath)]
    }
  ];
}
