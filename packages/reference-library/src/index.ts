import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { normalizeImageSha256, type ImageRuntimeReference } from "@vpf/runtime-contracts/image";

export const REFERENCE_LIBRARY_SCHEMA_VERSION = 1 as const;

export const ROMAN_IX_REFERENCE_FILES = [
  "01_hook_title.png",
  "02_persistent_header.png",
  "03_normal_caption.png",
  "04_emphasis_caption.png",
  "05_two_line_caption_blur.png",
  "06_info_label_object.png"
] as const;

export type ReferenceRole =
  | "HOOK_TITLE"
  | "PERSISTENT_HEADER"
  | "NORMAL_CAPTION"
  | "EMPHASIS_CAPTION"
  | "TWO_LINE_CAPTION_BLUR"
  | "INFO_LABEL_OBJECT";

export interface ReferenceLibraryEntry {
  id: string;
  fileName: string;
  relativePath: string;
  sha256: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  role: ReferenceRole;
  beatTags: string[];
  sceneTags: string[];
  priority: number;
}

export interface ReferenceLibraryManifest {
  schemaVersion: typeof REFERENCE_LIBRARY_SCHEMA_VERSION;
  libraryId: string;
  version: string;
  createdAt: string;
  source: "APPROVED_REFERENCE_FRAMES";
  entries: ReferenceLibraryEntry[];
}

export interface SceneReferenceSelectionInput {
  sceneId: string;
  sceneText: string;
  primaryVisualIdea?: string;
  mustBeSeen?: string[];
  knfBeat?: string;
  maxReferences?: number;
}

export interface ReferenceLibraryRegistrationInput {
  libraryId: string;
  version: string;
  sourceDirectory: string;
  targetDirectory: string;
  files: readonly string[];
  createdAt?: string;
}

export class ReferenceLibraryError extends Error {
  constructor(
    public readonly code:
      | "B010"
      | "REFERENCE_HASH_MISMATCH"
      | "REFERENCE_MANIFEST_INVALID"
      | "REFERENCE_PATH_INVALID",
    message: string
  ) {
    super(message);
    this.name = "ReferenceLibraryError";
  }
}

const ROLE_BY_FILE: Record<string, ReferenceRole> = {
  "01_hook_title.png": "HOOK_TITLE",
  "02_persistent_header.png": "PERSISTENT_HEADER",
  "03_normal_caption.png": "NORMAL_CAPTION",
  "04_emphasis_caption.png": "EMPHASIS_CAPTION",
  "05_two_line_caption_blur.png": "TWO_LINE_CAPTION_BLUR",
  "06_info_label_object.png": "INFO_LABEL_OBJECT"
};

const ROLE_BEATS: Record<ReferenceRole, string[]> = {
  HOOK_TITLE: ["HOOK", "OPEN", "QUESTION", "TEASE"],
  PERSISTENT_HEADER: ["ORIENTATION", "CONTEXT", "SETUP", "EVIDENCE"],
  NORMAL_CAPTION: ["CONTEXT", "DEVELOPMENT", "EXPLANATION", "EVIDENCE"],
  EMPHASIS_CAPTION: ["HOOK", "TURN", "REVEAL", "CONTRAST", "WARNING"],
  TWO_LINE_CAPTION_BLUR: ["DEVELOPMENT", "EXPLANATION", "QUOTE", "EVIDENCE"],
  INFO_LABEL_OBJECT: ["EVIDENCE", "OBJECT", "MAP", "PAYOFF", "CLOSE"]
};

const ROLE_SCENE_TERMS: Record<ReferenceRole, string[]> = {
  HOOK_TITLE: ["mystery", "question", "disappear", "vanish", "ninth", "legion", "미스터리", "의문", "실종"],
  PERSISTENT_HEADER: ["where", "when", "britain", "rome", "location", "date", "브리튼", "로마", "위치", "시기"],
  NORMAL_CAPTION: ["explain", "record", "source", "account", "설명", "기록", "사료"],
  EMPHASIS_CAPTION: ["but", "however", "yet", "turn", "reveal", "하지만", "그러나", "반전"],
  TWO_LINE_CAPTION_BLUR: ["evidence", "inscription", "text", "quote", "document", "증거", "비문", "문서"],
  INFO_LABEL_OBJECT: ["map", "route", "object", "stone", "inscription", "fort", "지도", "경로", "유물", "비문", "요새"]
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function mimeFor(fileName: string): ReferenceLibraryEntry["mimeType"] {
  const ext = extname(fileName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  throw new ReferenceLibraryError(
    "REFERENCE_MANIFEST_INVALID",
    `Unsupported reference image extension: ${fileName}`
  );
}

function assertContained(root: string, candidate: string): void {
  const rootAbs = resolve(root);
  const candidateAbs = resolve(candidate);
  const rel = relative(rootAbs, candidateAbs);
  if (rel.startsWith("..") || rel === "" && candidateAbs !== rootAbs || resolve(rootAbs, rel) !== candidateAbs) {
    throw new ReferenceLibraryError("REFERENCE_PATH_INVALID", `Reference path escapes library root: ${candidate}`);
  }
}

function normalizedRelativePath(value: string): string {
  const unix = value.replaceAll("\\", "/");
  if (!unix || unix.startsWith("/") || /^[A-Za-z]:\//u.test(unix) || unix.split("/").some(part => part === ".." || part === "." || part === "")) {
    throw new ReferenceLibraryError("REFERENCE_PATH_INVALID", `Invalid project-relative reference path: ${value}`);
  }
  return unix;
}

function defaultSceneTags(role: ReferenceRole): string[] {
  return [...ROLE_SCENE_TERMS[role]];
}

function defaultBeatTags(role: ReferenceRole): string[] {
  return [...ROLE_BEATS[role]];
}

export async function registerReferenceLibrary(
  input: ReferenceLibraryRegistrationInput
): Promise<ReferenceLibraryManifest> {
  await mkdir(input.targetDirectory, { recursive: true });
  const entries: ReferenceLibraryEntry[] = [];

  for (const [index, fileName] of input.files.entries()) {
    const source = resolve(input.sourceDirectory, fileName);
    assertContained(input.sourceDirectory, source);
    try {
      const info = await stat(source);
      if (!info.isFile() || info.size <= 0) throw new Error("not a non-empty file");
    } catch {
      throw new ReferenceLibraryError("B010", `Required reference file is missing: ${fileName}`);
    }
    const role = ROLE_BY_FILE[fileName];
    if (role === undefined) {
      throw new ReferenceLibraryError("REFERENCE_MANIFEST_INVALID", `Reference role is not registered for: ${fileName}`);
    }
    const bytes = await readFile(source);
    const target = resolve(input.targetDirectory, fileName);
    assertContained(input.targetDirectory, target);
    await copyFile(source, target);
    entries.push({
      id: `${input.libraryId}:${String(index + 1).padStart(2, "0")}`,
      fileName,
      relativePath: normalizedRelativePath(fileName),
      sha256: sha256(bytes),
      mimeType: mimeFor(fileName),
      role,
      beatTags: defaultBeatTags(role),
      sceneTags: defaultSceneTags(role),
      priority: input.files.length - index
    });
  }

  const manifest: ReferenceLibraryManifest = {
    schemaVersion: REFERENCE_LIBRARY_SCHEMA_VERSION,
    libraryId: input.libraryId,
    version: input.version,
    createdAt: input.createdAt ?? new Date().toISOString(),
    source: "APPROVED_REFERENCE_FRAMES",
    entries
  };
  await writeFile(join(input.targetDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

function assertManifestShape(value: unknown): asserts value is ReferenceLibraryManifest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ReferenceLibraryError("REFERENCE_MANIFEST_INVALID", "Reference manifest must be an object.");
  }
  const manifest = value as Partial<ReferenceLibraryManifest>;
  if (manifest.schemaVersion !== 1 || typeof manifest.libraryId !== "string" || !manifest.libraryId || typeof manifest.version !== "string" || !manifest.version || !Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    throw new ReferenceLibraryError("REFERENCE_MANIFEST_INVALID", "Reference manifest header is invalid.");
  }
}

export async function loadVerifiedReferenceLibrary(
  libraryDirectory: string
): Promise<ReferenceLibraryManifest> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(libraryDirectory, "manifest.json"), "utf8"));
  } catch {
    throw new ReferenceLibraryError("B010", "Reference library manifest is missing or unreadable.");
  }
  assertManifestShape(parsed);
  const manifest = parsed;
  const seen = new Set<string>();
  for (const entry of manifest.entries) {
    if (!entry.id || !entry.fileName || !entry.relativePath || !entry.role || seen.has(entry.id)) {
      throw new ReferenceLibraryError("REFERENCE_MANIFEST_INVALID", `Invalid or duplicate reference entry: ${entry.id ?? "unknown"}`);
    }
    seen.add(entry.id);
    const expected = normalizeImageSha256(entry.sha256);
    const absolute = resolve(libraryDirectory, normalizedRelativePath(entry.relativePath));
    assertContained(libraryDirectory, absolute);
    let bytes: Buffer;
    try {
      const info = await stat(absolute);
      if (!info.isFile() || info.size <= 0) throw new Error("not file");
      bytes = await readFile(absolute);
    } catch {
      throw new ReferenceLibraryError("B010", `Required reference file is missing: ${entry.relativePath}`);
    }
    const actual = sha256(bytes);
    if (actual !== expected) {
      throw new ReferenceLibraryError("REFERENCE_HASH_MISMATCH", `Reference SHA-256 mismatch: ${entry.id}`);
    }
  }
  return manifest;
}

function tokenize(input: SceneReferenceSelectionInput): Set<string> {
  const joined = [input.sceneText, input.primaryVisualIdea ?? "", ...(input.mustBeSeen ?? [])]
    .join(" ")
    .toLowerCase();
  return new Set(joined.split(/[^\p{L}\p{N}_-]+/u).filter(Boolean));
}

function normalizedBeat(beat?: string): string {
  return (beat ?? "").trim().toUpperCase().replaceAll(/[\s-]+/gu, "_");
}

export function selectSceneReferences(
  manifest: ReferenceLibraryManifest,
  input: SceneReferenceSelectionInput
): ReferenceLibraryEntry[] {
  const beat = normalizedBeat(input.knfBeat);
  const words = tokenize(input);
  const maxReferences = Math.max(1, Math.min(input.maxReferences ?? 2, 6));
  const ranked = manifest.entries.map((entry, manifestIndex) => {
    let score = entry.priority;
    if (beat && entry.beatTags.some(tag => normalizedBeat(tag) === beat)) score += 100;
    for (const term of entry.sceneTags) {
      if (words.has(term.toLowerCase())) score += 12;
    }
    if (entry.role === "NORMAL_CAPTION") score += 2;
    return { entry, score, manifestIndex };
  });
  ranked.sort((a, b) => b.score - a.score || a.manifestIndex - b.manifestIndex || a.entry.id.localeCompare(b.entry.id));
  return ranked.slice(0, maxReferences).map(item => item.entry);
}

export function toImageRuntimeReferences(
  selected: readonly ReferenceLibraryEntry[],
  projectRelativeLibraryRoot: string
): ImageRuntimeReference[] {
  const root = normalizedRelativePath(projectRelativeLibraryRoot);
  return selected.map(entry => ({
    mediaId: `REFERENCE_LIBRARY:${entry.id}`,
    role: `REFERENCE_LIBRARY:${entry.role}`,
    relativePath: normalizedRelativePath(`${root}/${entry.relativePath}`),
    sha256: normalizeImageSha256(entry.sha256)
  }));
}

export interface BrowserReferenceUploadItem {
  index: number;
  mediaId: string;
  role: string;
  relativePath: string;
  sha256: string;
}

export interface BrowserReferenceUploadPlan {
  schemaVersion: 1;
  referenceCount: number;
  uploads: BrowserReferenceUploadItem[];
}

export function buildBrowserReferenceUploadPlan(
  references: readonly ImageRuntimeReference[]
): BrowserReferenceUploadPlan {
  return {
    schemaVersion: 1,
    referenceCount: references.length,
    uploads: references.map((reference, index) => ({
      index,
      mediaId: reference.mediaId,
      role: reference.role,
      relativePath: normalizedRelativePath(reference.relativePath),
      sha256: normalizeImageSha256(reference.sha256)
    }))
  };
}

export function mergeRuntimeReferences(
  primary: readonly ImageRuntimeReference[],
  library: readonly ImageRuntimeReference[]
): ImageRuntimeReference[] {
  const seen = new Set<string>();
  const merged: ImageRuntimeReference[] = [];
  for (const reference of [...primary, ...library]) {
    const key = `${reference.mediaId}\u0000${reference.role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...reference, sha256: normalizeImageSha256(reference.sha256) });
  }
  return merged;
}
