import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ROMAN_IX_REFERENCE_FILES, loadVerifiedReferenceLibrary } from "../src/index.js";
import { indexReferenceTier } from "../src/tier-registration.js";

async function temporaryRoot(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

test("indexes GLOBAL_VISUAL approved images in place with real SHA-256", async () => {
  const root = await temporaryRoot("vpf-global-index-");
  try {
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "01_environment.png"), Buffer.from("global-environment"));
    await writeFile(join(root, "02_character-scale.jpg"), Buffer.from("global-character"));
    const manifest = await indexReferenceTier({
      tier: "GLOBAL_VISUAL",
      directory: root,
      libraryId: "GLOBAL_VISUAL_V1",
      createdAt: "2026-09-12T00:00:00.000Z"
    });
    assert.equal(manifest.entries.length, 2);
    assert.ok(manifest.entries.every(entry => /^[a-f0-9]{64}$/u.test(entry.sha256)));
    assert.deepEqual(manifest.entries.map(entry => entry.fileName), ["01_environment.png", "02_character-scale.jpg"]);
    const verified = await loadVerifiedReferenceLibrary(root);
    assert.equal(verified.libraryId, "GLOBAL_VISUAL_V1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("indexes the strict KNF six-frame folder in place without self-copy failure", async () => {
  const root = await temporaryRoot("vpf-knf-index-");
  try {
    for (const [index, fileName] of ROMAN_IX_REFERENCE_FILES.entries()) {
      await writeFile(join(root, fileName), Buffer.from(`knf-${index + 1}`));
    }
    const before = await readFile(join(root, ROMAN_IX_REFERENCE_FILES[0]));
    const manifest = await indexReferenceTier({
      tier: "KNF_LAYOUT",
      directory: root,
      libraryId: "KNF_LAYOUT_V1",
      createdAt: "2026-09-12T00:00:00.000Z"
    });
    const after = await readFile(join(root, ROMAN_IX_REFERENCE_FILES[0]));
    assert.deepEqual(after, before);
    assert.equal(manifest.entries.length, 6);
    assert.deepEqual(manifest.entries.map(entry => entry.fileName), [...ROMAN_IX_REFERENCE_FILES]);
    await loadVerifiedReferenceLibrary(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
