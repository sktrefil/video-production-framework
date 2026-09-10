import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const forbidden = [
  "HISTORY_MYSTERY_STYLIZED_V1",
  "history_mystery_shorts_style",
  "image_prompt_planner.py",
  "history_mystery_visual_prompt_runtime.py",
  "master_candidate_prompt_planner.py",
  "master_visual_planner.py",
  "visual_v2/"
];

test("MIG-06 production image runtime has zero dependency on the old image decision stack", async () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const files = [
    join(root, "runtimes", "image", "runtime.mjs"),
    join(root, "packages", "runtime-contracts", "src", "image.ts"),
    join(root, "packages", "provider-orchestrator", "src", "image-runtime.ts"),
    join(root, "packages", "scene-assets", "src", "image-runtime.ts")
  ];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const token of forbidden) {
      assert.equal(
        content.includes(token),
        false,
        `legacy image dependency leaked into ${file}: ${token}`
      );
    }
  }
});
