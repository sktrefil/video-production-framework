import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp, mkdir, readFile, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import test from "node:test";
import type {
  MediaArtifact,
  PublishHandoffOutput,
  PublishPackageManifest,
  TimelineAssemblyRecord
} from "@vpf/domain";
import {
  EditorMaterializationError,
  materializeEditorProject,
  materializePublishHandoff,
  resolveFrameworkArtifactPath,
  sha256File
} from "../src/index.js";

const now = "2026-09-10T10:00:00.000Z";
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="black"/></svg>';
const sha = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

function assembly(projectId = "p1"): TimelineAssemblyRecord {
  return {
    id: "assembly1",
    projectId,
    revision: 3,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    sourceBindingRefs: [{bindingId: "binding1", bindingRevision: 2}],
    fps: 30,
    width: 64,
    height: 64,
    assemblyStatus: "READY",
    stale: false,
    editProject: {
      schemaVersion: 1,
      project: {
        id: projectId,
        name: "fixture",
        fps: 30,
        width: 64,
        height: 64,
        durationInFrames: 6
      },
      tracks: [
        {id: "V1", type: "VIDEO", name: "Main", enabled: true, locked: false, order: 0}
      ],
      items: [
        {
          id: "img1",
          type: "IMAGE",
          trackId: "V1",
          timelineStartFrame: 0,
          durationInFrames: 6,
          enabled: true,
          locked: false,
          src: "05_images/frame.svg",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          opacity: 1,
          fit: "cover"
        }
      ],
      settings: {
        snapEnabled: true,
        snapToleranceFrames: 4,
        timelineZoom: 1,
        masterVolume: 1
      }
    },
    cutBoundaries: [],
    motionDirectives: [],
    blockers: []
  };
}

function media(projectId = "p1", checksum = sha(svg)): MediaArtifact {
  return {
    id: "media1",
    projectId,
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    mediaType: "IMAGE",
    relativePath: "05_images/frame.svg",
    mimeType: "image/svg+xml",
    width: 64,
    height: 64,
    checksum,
    mediaStatus: "AVAILABLE"
  };
}

async function roots() {
  const root = await mkdtemp(join(tmpdir(), "vpf-mig09-"));
  const projectRoot = join(root, "project");
  const editorPublicRoot = join(root, "editor-public");
  await mkdir(join(projectRoot, "05_images"), {recursive: true});
  await writeFile(join(projectRoot, "05_images", "frame.svg"), svg, "utf8");
  return {root, projectRoot, editorPublicRoot};
}

test("materializer preserves canonical project while rewriting only the disposable editor mirror", async t => {
  const paths = await roots();
  t.after(() => rm(paths.root, {recursive: true, force: true}));
  const input = {
    projectRoot: paths.projectRoot,
    editorPublicRoot: paths.editorPublicRoot,
    assembly: assembly(),
    mediaArtifacts: [media()],
    nowIso: () => now
  };

  const first = await materializeEditorProject(input);
  const canonical = JSON.parse(await readFile(first.canonicalProjectAbsolutePath, "utf8"));
  const mirror = JSON.parse(await readFile(first.editorMirrorProjectAbsolutePath, "utf8"));

  assert.equal(canonical.items[0].src, "05_images/frame.svg");
  assert.match(mirror.items[0].src, /^projects\/p1\/media\/[a-f0-9]{64}\/frame\.svg$/);
  assert.equal(first.report.media.length, 1);
  assert.equal(first.report.media[0]?.sha256, sha(svg));
  assert.equal(
    await sha256File(resolve(first.editorMirrorRoot, "media", sha(svg), "frame.svg")),
    sha(svg)
  );

  await writeFile(resolve(first.editorMirrorRoot, "stale.txt"), "stale", "utf8");
  const second = await materializeEditorProject(input);
  await assert.rejects(stat(resolve(second.editorMirrorRoot, "stale.txt")));
  assert.deepEqual(second.executionProject, first.executionProject);
  assert.equal(second.report.executionProjectSha256, first.report.executionProjectSha256);
});

test("materializer blocks a missing MediaArtifact before creating an authoritative-looking mirror", async t => {
  const paths = await roots();
  t.after(() => rm(paths.root, {recursive: true, force: true}));
  await assert.rejects(
    materializeEditorProject({
      projectRoot: paths.projectRoot,
      editorPublicRoot: paths.editorPublicRoot,
      assembly: assembly(),
      mediaArtifacts: []
    }),
    (error: unknown) =>
      error instanceof EditorMaterializationError &&
      error.code === "MEDIA_ARTIFACT_MISSING"
  );
});

test("materializer verifies the workspace source hash against project.db MediaArtifact checksum", async t => {
  const paths = await roots();
  t.after(() => rm(paths.root, {recursive: true, force: true}));
  await assert.rejects(
    materializeEditorProject({
      projectRoot: paths.projectRoot,
      editorPublicRoot: paths.editorPublicRoot,
      assembly: assembly(),
      mediaArtifacts: [media("p1", "0".repeat(64))]
    }),
    (error: unknown) =>
      error instanceof EditorMaterializationError &&
      error.code === "SOURCE_HASH_MISMATCH"
  );
});

test("legacy out/<project> logical paths map deliberately into unified 09_render and 10_publish workspace folders", async t => {
  const paths = await roots();
  t.after(() => rm(paths.root, {recursive: true, force: true}));

  assert.equal(
    resolveFrameworkArtifactPath(paths.projectRoot, "p1", "out/p1/final.mp4").projectRelativePath,
    "09_render/final.mp4"
  );
  assert.equal(
    resolveFrameworkArtifactPath(paths.projectRoot, "p1", "out/p1/technical_qc.json").projectRelativePath,
    "09_render/technical_qc.json"
  );
  assert.equal(
    resolveFrameworkArtifactPath(paths.projectRoot, "p1", "out/p1/final_output_qc.json").projectRelativePath,
    "10_publish/final_output_qc.json"
  );
  assert.equal(
    resolveFrameworkArtifactPath(paths.projectRoot, "p1", "out/p1/publish/final.mp4").projectRelativePath,
    "10_publish/package/final.mp4"
  );
  assert.throws(
    () => resolveFrameworkArtifactPath(paths.projectRoot, "p1", "out/other/final.mp4"),
    (error: unknown) =>
      error instanceof EditorMaterializationError &&
      error.code === "PROJECT_ID_MISMATCH"
  );
});

test("publish materialization verifies sources and copies WF-18 logical package into 10_publish/package", async t => {
  const paths = await roots();
  t.after(() => rm(paths.root, {recursive: true, force: true}));

  const sources: Array<[string, string]> = [
    ["09_render/final.mp4", "video-bytes"],
    ["09_render/render_manifest.json", "render"],
    ["09_render/technical_qc.json", "tech"],
    ["09_render/delivery_manifest.json", "delivery"],
    ["10_publish/final_output_qc.json", "output-qc"],
    ["10_publish/publish_metadata.json", "metadata"]
  ];
  for (const [relativePath, content] of sources) {
    const target = join(paths.projectRoot, ...relativePath.split("/"));
    await mkdir(resolve(target, ".."), {recursive: true});
    await writeFile(target, content, "utf8");
  }

  const videoBytes = Buffer.from("video-bytes");
  const manifest: PublishPackageManifest = {
    id: "package1",
    projectId: "p1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    renderAttemptId: "render1",
    renderAttemptRevision: 3,
    deliveryManifestId: "delivery1",
    deliveryManifestRevision: 1,
    outputQcId: "outputqc1",
    outputQcRevision: 1,
    projectSha256: "1".repeat(64),
    packageStatus: "READY",
    packageDirectory: "out/p1/publish",
    packageSha256: "2".repeat(64),
    metadata: {
      platform: "YOUTUBE",
      title: "fixture",
      description: "",
      tags: [],
      visibility: "PRIVATE",
      madeForKids: false
    },
    files: [
      {role: "VIDEO", relativePath: "out/p1/publish/final.mp4", sizeBytes: videoBytes.length, sha256: sha(videoBytes)},
      {role: "RENDER_MANIFEST", relativePath: "out/p1/publish/render_manifest.json"},
      {role: "TECHNICAL_QC", relativePath: "out/p1/publish/technical_qc.json"},
      {role: "DELIVERY_MANIFEST", relativePath: "out/p1/publish/delivery_manifest.json"},
      {role: "FINAL_OUTPUT_QC", relativePath: "out/p1/publish/final_output_qc.json"},
      {role: "PUBLISH_METADATA", relativePath: "out/p1/publish/publish_metadata.json"}
    ],
    recommendedFileName: "publish_handoff.json"
  };
  const output: PublishHandoffOutput = {
    schemaVersion: "1.0",
    projectId: "p1",
    createdAt: now,
    status: "READY",
    projectSha256: manifest.projectSha256,
    packageSha256: manifest.packageSha256,
    packageDirectory: manifest.packageDirectory,
    recommendedFileName: "publish_handoff.json",
    metadata: manifest.metadata,
    files: manifest.files
  };

  const result = await materializePublishHandoff({
    projectRoot: paths.projectRoot,
    manifest,
    output
  });
  assert.equal(result.status, "READY");
  assert.equal(result.packageDirectory, "10_publish/package");
  assert.equal(result.files.length, 6);
  assert.equal(await readFile(join(paths.projectRoot, "10_publish", "package", "final.mp4"), "utf8"), "video-bytes");
});
