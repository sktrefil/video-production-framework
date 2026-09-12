import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  ROMAN_IX_REFERENCE_FILES,
  ReferenceLibraryError,
  buildBrowserReferenceUploadPlan,
  loadVerifiedReferenceLibrary,
  registerReferenceLibrary,
  selectSceneReferences,
  toImageRuntimeReferences
} from "../src/index.js";

async function fixture(): Promise<{ root: string; source: string; target: string }> {
  const root = await mkdtemp(join(tmpdir(), "vpf-reference-library-"));
  const source = join(root, "source");
  const target = join(root, "target");
  await mkdir(source, { recursive: true });
  for (const [index, file] of ROMAN_IX_REFERENCE_FILES.entries()) {
    await writeFile(join(source, file), Buffer.from(`reference-${index + 1}`));
  }
  return { root, source, target };
}

test("registers all six approved Roman IX frame names with real SHA-256 and verifies bytes", async () => {
  const f = await fixture();
  try {
    const manifest = await registerReferenceLibrary({
      libraryId: "ROMAN_IX_KNF_V2",
      version: "1.0.0",
      sourceDirectory: f.source,
      targetDirectory: f.target,
      files: ROMAN_IX_REFERENCE_FILES,
      createdAt: "2026-09-12T00:00:00.000Z"
    });
    assert.equal(manifest.entries.length, 6);
    assert.deepEqual(manifest.entries.map(entry => entry.fileName), [...ROMAN_IX_REFERENCE_FILES]);
    assert.ok(manifest.entries.every(entry => /^[a-f0-9]{64}$/u.test(entry.sha256)));
    const verified = await loadVerifiedReferenceLibrary(f.target);
    assert.equal(verified.libraryId, "ROMAN_IX_KNF_V2");
    const persisted = JSON.parse(await readFile(join(f.target, "manifest.json"), "utf8"));
    assert.equal(persisted.entries.length, 6);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("hard blocks B010 when a required frame is missing", async () => {
  const f = await fixture();
  try {
    await rm(join(f.source, ROMAN_IX_REFERENCE_FILES[5]));
    await assert.rejects(
      () => registerReferenceLibrary({
        libraryId: "ROMAN_IX_KNF_V2",
        version: "1.0.0",
        sourceDirectory: f.source,
        targetDirectory: f.target,
        files: ROMAN_IX_REFERENCE_FILES
      }),
      (error: unknown) => error instanceof ReferenceLibraryError && error.code === "B010"
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("detects hash drift and never silently accepts changed reference bytes", async () => {
  const f = await fixture();
  try {
    await registerReferenceLibrary({
      libraryId: "ROMAN_IX_KNF_V2",
      version: "1.0.0",
      sourceDirectory: f.source,
      targetDirectory: f.target,
      files: ROMAN_IX_REFERENCE_FILES
    });
    await writeFile(join(f.target, ROMAN_IX_REFERENCE_FILES[0]), Buffer.from("tampered"));
    await assert.rejects(
      () => loadVerifiedReferenceLibrary(f.target),
      (error: unknown) => error instanceof ReferenceLibraryError && error.code === "REFERENCE_HASH_MISMATCH"
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("Scene and KNF Beat selection is deterministic and browser plan preserves exact hashes", async () => {
  const f = await fixture();
  try {
    const manifest = await registerReferenceLibrary({
      libraryId: "ROMAN_IX_KNF_V2",
      version: "1.0.0",
      sourceDirectory: f.source,
      targetDirectory: f.target,
      files: ROMAN_IX_REFERENCE_FILES
    });
    const selected = selectSceneReferences(manifest, {
      sceneId: "scene-ix-04",
      sceneText: "A Roman inscription becomes the key evidence on screen.",
      primaryVisualIdea: "weathered inscription stone",
      mustBeSeen: ["evidence", "inscription"],
      knfBeat: "EVIDENCE",
      maxReferences: 2
    });
    assert.equal(selected.length, 2);
    assert.ok(selected.some(entry => entry.role === "INFO_LABEL_OBJECT" || entry.role === "TWO_LINE_CAPTION_BLUR"));
    const runtime = toImageRuntimeReferences(selected, "05_images/reference_library/ROMAN_IX_KNF_V2/1.0.0");
    const upload = buildBrowserReferenceUploadPlan(runtime);
    assert.equal(upload.referenceCount, 2);
    assert.deepEqual(upload.uploads.map(item => item.sha256), runtime.map(item => item.sha256));
    assert.ok(upload.uploads.every(item => item.relativePath.startsWith("05_images/reference_library/")));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
