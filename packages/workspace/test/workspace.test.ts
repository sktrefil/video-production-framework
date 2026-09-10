import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import {
  WorkspacePathError,
  normalizeProjectRelativePath,
  resolveProjectRelativePath,
  resolveProjectWorkspace,
  resolveWorkspaceRoot,
  toProjectRelativePath,
  validateProjectId
} from "../src/index.js";

test("workspace defaults to <repository>/workspace", () => {
  const repositoryRoot = resolve("fixture-repository");
  assert.equal(
    resolveWorkspaceRoot({ repositoryRoot, env: {} }),
    resolve(repositoryRoot, "workspace")
  );
});

test("VPF_WORKSPACE_ROOT overrides the default workspace root", () => {
  const repositoryRoot = resolve("fixture-repository");
  assert.equal(
    resolveWorkspaceRoot({
      repositoryRoot,
      env: { VPF_WORKSPACE_ROOT: "runtime-media" }
    }),
    resolve(repositoryRoot, "runtime-media")
  );
});

test("project workspace supports unicode ids and rejects traversal or Windows reserved ids", () => {
  const repositoryRoot = resolve("fixture-repository");
  const workspace = resolveProjectWorkspace("20260910_조선_미스터리", {
    repositoryRoot,
    env: {}
  });

  assert.equal(workspace.projectId, "20260910_조선_미스터리");
  assert.equal(
    workspace.projectRoot,
    resolve(repositoryRoot, "workspace", "projects", "20260910_조선_미스터리")
  );

  for (const unsafe of [
    "../outside",
    "..\\outside",
    "folder/name",
    "folder\\name",
    "CON",
    "project."
  ]) {
    assert.throws(
      () => validateProjectId(unsafe),
      (error: unknown) =>
        error instanceof WorkspacePathError &&
        error.code === "INVALID_PROJECT_ID"
    );
  }
});

test("stored project paths normalize Windows separators to project-relative POSIX form", () => {
  assert.equal(
    normalizeProjectRelativePath("05_images\\generated\\scene_01.png"),
    "05_images/generated/scene_01.png"
  );

  for (const unsafe of [
    "../outside.png",
    "05_images/../outside.png",
    "/tmp/outside.png",
    "C:\\temp\\outside.png"
  ]) {
    assert.throws(() => normalizeProjectRelativePath(unsafe));
  }
});

test("project-relative paths resolve inside the project and can be stored again", () => {
  const projectRoot = resolve("fixture-workspace", "projects", "demo");
  const artifact = resolveProjectRelativePath(
    projectRoot,
    "05_images/generated/scene_01.png"
  );

  assert.equal(
    artifact,
    resolve(projectRoot, "05_images", "generated", "scene_01.png")
  );
  assert.equal(
    toProjectRelativePath(projectRoot, artifact),
    "05_images/generated/scene_01.png"
  );
});

test("artifact paths outside the project root are rejected", () => {
  const projectRoot = resolve("fixture-workspace", "projects", "demo");
  const outside = resolve(projectRoot, "..", "other", "file.mp4");

  assert.throws(
    () => toProjectRelativePath(projectRoot, outside),
    (error: unknown) =>
      error instanceof WorkspacePathError &&
      error.code === "PATH_OUTSIDE_PROJECT"
  );
});
