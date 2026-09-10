import assert from "node:assert/strict";
import {readFile, readdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {join} from "node:path";
import {createEditorState} from "../src/studio/editor/editorReducer.ts";
import {getEditorApiBase} from "../src/editor/runtimeConfig.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixture = JSON.parse(await readFile(join(root, "test/fixtures/edit_project.json"), "utf8"));
const state = createEditorState(fixture);
assert.equal(state.project.schemaVersion, 1);
assert.equal(state.project.project.durationInFrames, 90);
assert.deepEqual(state.project.items.find(item => item.type === "IMAGE").motion, fixture.items[0].motion);
assert.ok(fixture.items[0].src.startsWith("data:image/"));
assert.throws(() => getEditorApiBase(), /not configured/);
globalThis.__VPF_EDITOR_API_BASE__ = "http://127.0.0.1:8123/";
assert.equal(getEditorApiBase(), "http://127.0.0.1:8123");
delete globalThis.__VPF_EDITOR_API_BASE__;

async function scan(dir) {
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (/\.(tsx?|json)$/.test(entry.name)) {
      const source = await readFile(path, "utf8");
      assert.doesNotMatch(source, /sado_prince|SADO_PRINCE|HistoryMysteryShorts|127\.0\.0\.1:4317|Youtubu_projects/, path);
    }
  }
}
await scan(join(root, "src"));
const rootSource = await readFile(join(root, "src/Root.tsx"), "utf8");
assert.deepEqual([...rootSource.matchAll(/id="([^"]+)"/g)].map(match => match[1]), ["GenericVideoEditor", "GenericFinalRender"]);
console.log("[editor-port] PASS: offline fixture, image motion, explicit API configuration, generic compositions and legacy isolation");
