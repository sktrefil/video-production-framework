import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = path => readFile(resolve(root, path), "utf8");

test("MIG-09 runtime scripts use unified workspace adapters and Framework WF-17/WF-18 state authorities", async () => {
  const render = await read("scripts/render-editor-project.mjs");
  const outputQc = await read("scripts/final-output-qc.mjs");
  const publish = await read("scripts/package-publish-handoff.mjs");
  assert.match(render, /FinalRenderPipeline/);
  assert.match(render, /resolveFrameworkArtifactPath/);
  assert.match(render, /importRenderResult/);
  assert.match(outputQc, /FinalOutputPipeline/);
  assert.match(publish, /createPublishPackage/);
  assert.match(publish, /materializePublishHandoff/);
});

test("MIG-09 production scripts contain zero operational dependency on the old repository or old local state", async () => {
  const files = [
    "scripts/materialize-editor-project.mjs",
    "scripts/editor-production-gate.mjs",
    "scripts/render-editor-project.mjs",
    "scripts/final-render-technical-qc.mjs",
    "scripts/final-output-qc.mjs",
    "scripts/package-publish-handoff.mjs"
  ];
  const source = (await Promise.all(files.map(read))).join("\n");
  assert.doesNotMatch(source, /Youtubu_projects/);
  assert.doesNotMatch(source, /video-production(?:[\\/]|\.git)/);
  assert.doesNotMatch(source, /\.local[\\/]/);
  assert.doesNotMatch(source, /sado_prince/i);
});

test("production gate rejects remote and ephemeral media instead of making editor mirror authoritative", async () => {
  const source = await read("scripts/editor-production-gate.mjs");
  assert.match(source, /https\?:\|data:\|blob:/);
  assert.match(source, /persistent project-relative path/);
});

test("actual render bridge pins the accepted production profile", async () => {
  const source = await read("scripts/render-editor-project.mjs");
  assert.match(source, /GenericFinalRender/);
  assert.match(source, /--codec=h264/);
  assert.match(source, /--audio-codec=aac/);
  assert.match(source, /--pixel-format=yuv420p/);
  assert.match(source, /--crf=18/);
});

test("MIG-09 deliberately excludes the old Whisper subtitle cache bridge", async () => {
  const source = await read("scripts/editor-production-gate.mjs");
  assert.doesNotMatch(source, /whisper/i);
  assert.doesNotMatch(source, /word_timestamps/);
  assert.match(source, /SUBTITLE_TTS_PROVENANCE_MISSING/);
});
