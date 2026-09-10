import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeContractError } from "../src/index.js";
import {
  imageMimeForOutputPath,
  imageRuntimeExpectedOutputs,
  normalizeImageSha256,
  validateImageRuntimeInput,
  type ImageRuntimeInput
} from "../src/image.js";

function validInput(): ImageRuntimeInput {
  return {
    prompt: "exact approved prompt",
    negativePrompt: "exact negative prompt",
    width: 1536,
    height: 864,
    aspectRatio: "16:9",
    references: [
      {
        mediaId: "ref-1",
        role: "IDENTITY_ANCHOR:anchor-1",
        relativePath: "04_visual_identity/ref.png",
        sha256: "a".repeat(64)
      }
    ],
    outputRelativePath: "05_images/generated/asset-1/attempt-1.png"
  };
}

test("typed image runtime input accepts exact prompt, format dimensions and pinned references", () => {
  const input = validInput();
  assert.doesNotThrow(() => validateImageRuntimeInput(input));
  assert.deepEqual(imageRuntimeExpectedOutputs(input), [
    {
      role: "primary",
      mediaType: "IMAGE",
      required: true,
      acceptedMimeTypes: ["image/png"]
    }
  ]);
  assert.equal(normalizeImageSha256("sha256:" + "A".repeat(64)), "a".repeat(64));
  assert.equal(imageMimeForOutputPath("x.webp"), "image/webp");
});

test("image runtime rejects dimensions that do not match the approved aspect ratio", () => {
  const input = { ...validInput(), width: 1000 };
  assert.throws(
    () => validateImageRuntimeInput(input),
    (error: unknown) =>
      error instanceof RuntimeContractError && error.code === "RUNTIME_CONFIG_INVALID"
  );
});

test("image runtime rejects absolute and traversal output/reference paths", () => {
  assert.throws(
    () => validateImageRuntimeInput({ ...validInput(), outputRelativePath: "../escape.png" }),
    (error: unknown) =>
      error instanceof RuntimeContractError && error.code === "ARTIFACT_PATH_INVALID"
  );
  const input = validInput();
  input.references[0] = { ...input.references[0]!, relativePath: "C:\\legacy\\ref.png" };
  assert.throws(
    () => validateImageRuntimeInput(input),
    (error: unknown) =>
      error instanceof RuntimeContractError && error.code === "ARTIFACT_PATH_INVALID"
  );
});

test("image runtime rejects malformed pinned reference hashes", () => {
  const input = validInput();
  input.references[0] = { ...input.references[0]!, sha256: "not-a-sha" };
  assert.throws(
    () => validateImageRuntimeInput(input),
    (error: unknown) =>
      error instanceof RuntimeContractError && error.code === "RUNTIME_CONFIG_INVALID"
  );
});
