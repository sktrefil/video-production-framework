import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertBrowserUploadMatchesApprovedReferences,
  uploadImageReferencesToBrowser
} from "../src/browser-reference-upload.js";

const shaA = "a".repeat(64);
const shaB = "b".repeat(64);

test("browser upload preserves order, media id and sha without creative substitution", async () => {
  const calls: Array<{ index: number; mediaId: string; sha256: string }> = [];
  const references = [
    {
      mediaId: "REFERENCE_LIBRARY:ROMAN_IX_KNF_V2:01",
      role: "REFERENCE_LIBRARY:HOOK_TITLE",
      absolutePath: "/workspace/project/05_images/reference_library/01_hook_title.png",
      sha256: shaA,
      mimeType: "image/png" as const
    },
    {
      mediaId: "REFERENCE_LIBRARY:ROMAN_IX_KNF_V2:04",
      role: "REFERENCE_LIBRARY:EMPHASIS_CAPTION",
      absolutePath: "/workspace/project/05_images/reference_library/04_emphasis_caption.png",
      sha256: shaB,
      mimeType: "image/png" as const
    }
  ];
  const receipt = await uploadImageReferencesToBrowser(
    {
      async uploadReference(input) {
        calls.push({ index: input.index, mediaId: input.mediaId, sha256: input.sha256 });
      }
    },
    references
  );
  assert.deepEqual(calls.map(call => call.index), [0, 1]);
  assert.deepEqual(receipt.mediaIds, references.map(reference => reference.mediaId));
  assert.deepEqual(receipt.hashes, [shaA, shaB]);
  assertBrowserUploadMatchesApprovedReferences(
    references.map(reference => ({
      mediaId: reference.mediaId,
      role: reference.role,
      relativePath: reference.absolutePath.replace("/workspace/project/", ""),
      sha256: reference.sha256
    })),
    receipt
  );
});

test("browser receipt mismatch is rejected", () => {
  assert.throws(() => assertBrowserUploadMatchesApprovedReferences(
    [{ mediaId: "ref-a", role: "REFERENCE_LIBRARY:HOOK_TITLE", relativePath: "refs/a.png", sha256: shaA }],
    { uploaded: 1, mediaIds: ["ref-b"], hashes: [shaA] }
  ));
});
