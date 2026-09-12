import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import {
  REFERENCE_LIBRARY_SCHEMA_VERSION,
  ROMAN_IX_REFERENCE_FILES,
  ReferenceLibraryError,
  registerReferenceLibrary,
  type ReferenceLibraryEntry,
  type ReferenceLibraryManifest
} from "./index.js";
import type { ReferenceTier } from "./tiered-selector.js";

export interface IndexReferenceTierInput {
  tier: ReferenceTier;
  directory: string;
  libraryId: string;
  version?: string;
  createdAt?: string;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function mimeFor(fileName: string): ReferenceLibraryEntry["mimeType"] {
  const ext = extname(fileName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  throw new ReferenceLibraryError("REFERENCE_MANIFEST_INVALID", `Unsupported reference image extension: ${fileName}`);
}

function tokensFromFilename(fileName: string): string[] {
  return fileName
    .replace(/\.[^.]+$/u, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(token => token.length > 1);
}

async function indexKnfInPlace(input: IndexReferenceTierInput): Promise<ReferenceLibraryManifest> {
  // registerReferenceLibrary deliberately copies source -> target. Use a temporary
  // source so indexing an already-approved KNF folder never copyFile()s a file onto itself.
  const temporary = await mkdtemp(join(tmpdir(), "vpf-knf-index-"));
  try {
    for (const fileName of ROMAN_IX_REFERENCE_FILES) {
      const source = join(input.directory, fileName);
      try {
        const info = await stat(source);
        if (!info.isFile() || info.size <= 0) throw new Error("not a non-empty file");
        await copyFile(source, join(temporary, fileName));
      } catch {
        throw new ReferenceLibraryError("B010", `Required reference file is missing: ${fileName}`);
      }
    }
    return await registerReferenceLibrary({
      libraryId: input.libraryId,
      version: input.version ?? "1.0.0",
      sourceDirectory: temporary,
      targetDirectory: input.directory,
      files: ROMAN_IX_REFERENCE_FILES,
      ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt })
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/**
 * Index already-approved images in-place and write a SHA-256 manifest.
 * KNF_LAYOUT keeps the strict six-frame contract. GLOBAL_VISUAL and PROJECT
 * accept any approved png/jpg/jpeg/webp set and derive lightweight scene tags
 * from filenames; their tier semantics are enforced by the selector.
 */
export async function indexReferenceTier(input: IndexReferenceTierInput): Promise<ReferenceLibraryManifest> {
  if (input.tier === "KNF_LAYOUT") {
    return indexKnfInPlace(input);
  }

  let names: string[];
  try {
    names = (await readdir(input.directory))
      .filter(name => [".png", ".jpg", ".jpeg", ".webp"].includes(extname(name).toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    throw new ReferenceLibraryError("B010", `Reference tier directory is missing: ${input.directory}`);
  }
  if (names.length === 0) {
    throw new ReferenceLibraryError("B010", `Reference tier has no approved images: ${input.tier}`);
  }

  const entries: ReferenceLibraryEntry[] = [];
  for (const [index, fileName] of names.entries()) {
    const absolute = join(input.directory, fileName);
    const info = await stat(absolute);
    if (!info.isFile() || info.size <= 0) {
      throw new ReferenceLibraryError("B010", `Reference image is missing or empty: ${fileName}`);
    }
    const bytes = await readFile(absolute);
    entries.push({
      id: `${input.libraryId}:${String(index + 1).padStart(2, "0")}`,
      fileName,
      relativePath: fileName,
      sha256: sha256(bytes),
      mimeType: mimeFor(fileName),
      role: "NORMAL_CAPTION",
      beatTags: [],
      sceneTags: tokensFromFilename(fileName),
      priority: names.length - index
    });
  }

  const manifest: ReferenceLibraryManifest = {
    schemaVersion: REFERENCE_LIBRARY_SCHEMA_VERSION,
    libraryId: input.libraryId,
    version: input.version ?? "1.0.0",
    createdAt: input.createdAt ?? new Date().toISOString(),
    source: "APPROVED_REFERENCE_FRAMES",
    entries
  };
  await writeFile(join(input.directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}
