import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  ROMAN_IX_REFERENCE_FILES,
  ReferenceLibraryError,
  registerReferenceLibrary
} from "../src/index.js";
import { ThreeTierFilesystemReferenceSelector } from "../src/tiered-selector.js";

async function seedLibrary(target: string, libraryId: string): Promise<void> {
  const source = `${target}-source`;
  await mkdir(source, { recursive: true });
  for (const [index, file] of ROMAN_IX_REFERENCE_FILES.entries()) {
    await writeFile(join(source, file), Buffer.from(`${libraryId}-${index + 1}`));
  }
  await registerReferenceLibrary({
    libraryId,
    version: "1.0.0",
    sourceDirectory: source,
    targetDirectory: target,
    files: ROMAN_IX_REFERENCE_FILES,
    createdAt: "2026-09-12T00:00:00.000Z"
  });
}

function request(knfBeat?: string) {
  return {
    projectId: "pilot_short_roman_ix",
    scene: {
      id: "scene-04",
      scriptSegment: "A weathered Roman inscription becomes the key evidence.",
      primaryVisualIdea: "inscription stone in northern Britain",
      mustBeSeen: ["evidence", "inscription"]
    },
    ...(knfBeat === undefined ? {} : { knfBeat })
  };
}

test("WF-09 tier policy materializes all global refs inside project and conditionally adds KNF + project", async () => {
  const root = await mkdtemp(join(tmpdir(), "vpf-tiered-reference-"));
  try {
    const shared = join(root, "workspace", "reference_library");
    const project = join(root, "workspace", "projects", "pilot_short_roman_ix");
    await seedLibrary(join(shared, "global_visual"), "GLOBAL_VISUAL_V1");
    await seedLibrary(join(shared, "knf_layout"), "KNF_LAYOUT_V1");
    await seedLibrary(join(project, "05_images", "reference_library", "project"), "ROMAN_IX_PROJECT_V1");

    const selector = new ThreeTierFilesystemReferenceSelector({
      sharedAbsoluteRoot: shared,
      projectAbsoluteRoot: project
    });

    const withBeat = await selector.selectReferencesDetailed(request("EVIDENCE"));
    assert.deepEqual(withBeat.counts, {
      GLOBAL_VISUAL: ROMAN_IX_REFERENCE_FILES.length,
      KNF_LAYOUT: 1,
      PROJECT: 1
    });
    assert.equal(withBeat.references.length, ROMAN_IX_REFERENCE_FILES.length + 2);
    assert.ok(withBeat.references.slice(0, ROMAN_IX_REFERENCE_FILES.length).every(reference => reference.role.startsWith("REFERENCE_LIBRARY:GLOBAL_VISUAL:")));
    assert.ok(withBeat.references.some(reference => reference.role.startsWith("REFERENCE_LIBRARY:KNF_LAYOUT:")));
    assert.ok(withBeat.references.some(reference => reference.role.startsWith("REFERENCE_LIBRARY:PROJECT:")));
    assert.ok(withBeat.references.every(reference => /^[a-f0-9]{64}$/u.test(reference.sha256)));
    assert.ok(withBeat.references.every(reference => !reference.relativePath.startsWith("workspace/")));
    assert.ok(withBeat.references.filter(reference => reference.role.includes(":GLOBAL_VISUAL:")).every(reference => reference.relativePath.startsWith("05_images/reference_library/_shared/global_visual/")));
    assert.ok(withBeat.references.filter(reference => reference.role.includes(":KNF_LAYOUT:")).every(reference => reference.relativePath.startsWith("05_images/reference_library/_shared/knf_layout/")));
    await access(join(project, withBeat.references[0]!.relativePath));

    const withoutBeat = await selector.selectReferencesDetailed(request());
    assert.equal(withoutBeat.counts.GLOBAL_VISUAL, ROMAN_IX_REFERENCE_FILES.length);
    assert.equal(withoutBeat.counts.KNF_LAYOUT, 0);
    assert.equal(withoutBeat.counts.PROJECT, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing global_visual manifest hard-blocks WF-09 instead of silently dropping baseline references", async () => {
  const root = await mkdtemp(join(tmpdir(), "vpf-tiered-reference-missing-"));
  try {
    const shared = join(root, "workspace", "reference_library");
    const project = join(root, "workspace", "projects", "pilot_short_roman_ix");
    await mkdir(shared, { recursive: true });
    await mkdir(project, { recursive: true });
    const selector = new ThreeTierFilesystemReferenceSelector({
      sharedAbsoluteRoot: shared,
      projectAbsoluteRoot: project
    });
    await assert.rejects(
      () => selector.selectReferences(request("HOOK")),
      (error: unknown) => error instanceof ReferenceLibraryError && error.code === "B010"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
