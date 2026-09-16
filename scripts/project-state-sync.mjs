import {createHash} from "node:crypto";
import {access, copyFile, mkdir, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import {constants as fsConstants} from "node:fs";
import {createRequire} from "node:module";
import {dirname, resolve} from "node:path";
import {execFileSync} from "node:child_process";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const repositoryRoot = resolve(import.meta.dirname, "..");
const runtimeProjectsRoot = resolve(repositoryRoot, "workspace", "projects");
const snapshotsRoot = resolve(repositoryRoot, "workspace", "project-state-snapshots");
const confirmation = "--confirm-stopped";

const usage = () => {
  console.error("Usage: npm run project:state -- <snapshot|restore|status|publish|download> <project_id> [--confirm-stopped]");
};

const pathExists = async filename => {
  try {
    await access(filename, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const hashFile = async filename => createHash("sha256").update(await readFile(filename)).digest("hex");

const ensureProjectId = projectId => {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(projectId ?? "")) {
    throw new Error(`Invalid project id: ${projectId ?? ""}`);
  }
};

const requireStopped = flags => {
  if (!flags.includes(confirmation)) {
    throw new Error(`Refusing to alter a project database without ${confirmation}. Stop Studio and studio-server first.`);
  }
};

const assertSqliteIntegrity = filename => {
  const db = new Database(filename, {readonly: true, fileMustExist: true});
  try {
    const integrity = db.pragma("integrity_check", {simple: true});
    if (integrity !== "ok") throw new Error(`SQLite integrity check failed for ${filename}: ${integrity}`);
  } finally {
    db.close();
  }
};

const readJson = async filename => JSON.parse(await readFile(filename, "utf8"));

const replaceFile = async (temporary, filename) => {
  const previous = `${filename}.previous-${process.pid}-${Date.now()}`;
  const hadPrevious = await pathExists(filename);
  if (hadPrevious) await rename(filename, previous);
  try {
    await rename(temporary, filename);
  } catch (error) {
    if (hadPrevious && !(await pathExists(filename))) await rename(previous, filename);
    throw error;
  }
  if (hadPrevious) await rm(previous, {force: true});
};

const writeJsonAtomically = async (filename, value) => {
  const temporary = `${filename}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await replaceFile(temporary, filename);
};

const snapshotPaths = projectId => {
  const directory = resolve(snapshotsRoot, projectId);
  return {
    directory,
    database: resolve(directory, "project.db"),
    projectJson: resolve(directory, "project.json"),
    manifest: resolve(directory, "manifest.json")
  };
};

const runtimePaths = projectId => {
  const directory = resolve(runtimeProjectsRoot, projectId);
  return {
    directory,
    database: resolve(directory, "project.db"),
    projectJson: resolve(directory, "project.json"),
    wal: resolve(directory, "project.db-wal"),
    shm: resolve(directory, "project.db-shm")
  };
};

const stateRelativePath = projectId => `workspace/project-state-snapshots/${projectId}`;

const runGit = args => execFileSync("git", args, {
  cwd: repositoryRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
}).trim();

const currentBranch = () => {
  const branch = runGit(["branch", "--show-current"]);
  if (!branch) throw new Error("Project state publish/download requires a checked-out branch.");
  return branch;
};

const hasStateWorkingTreeChanges = projectId => {
  const changes = runGit(["status", "--porcelain", "--", stateRelativePath(projectId)]);
  return changes.length > 0;
};

const ensureRemoteIsNotAhead = branch => {
  runGit(["fetch", "origin", "--prune"]);
  const counts = runGit(["rev-list", "--left-right", "--count", `HEAD...origin/${branch}`]).split(/\s+/).map(Number);
  if (counts.length !== 2 || counts.some(value => !Number.isInteger(value))) throw new Error("Could not compare the current branch to origin.");
  if (counts[1] > 0) throw new Error(`origin/${branch} is ${counts[1]} commit(s) ahead. Run the download command before publishing a new database snapshot.`);
};

const checkManifest = async (projectId, paths) => {
  const manifest = await readJson(paths.manifest);
  if (manifest.schemaVersion !== 1 || manifest.projectId !== projectId) {
    throw new Error("Snapshot manifest has an unexpected schema version or project id.");
  }
  for (const [key, filename] of [["database", paths.database], ["projectJson", paths.projectJson]]) {
    if (!(await pathExists(filename))) throw new Error(`Snapshot file is missing: ${filename}`);
    const expected = manifest.files?.[key]?.sha256;
    const actual = await hashFile(filename);
    if (typeof expected !== "string" || expected !== actual) {
      throw new Error(`Snapshot checksum mismatch: ${key}`);
    }
  }
  assertSqliteIntegrity(paths.database);
  const snapshotProject = await readJson(paths.projectJson);
  if (snapshotProject.projectId !== projectId) throw new Error("Snapshot project.json does not match the requested project id.");
  return manifest;
};

const commandSnapshot = async (projectId, flags) => {
  requireStopped(flags);
  const source = runtimePaths(projectId);
  if (!(await pathExists(source.database)) || !(await pathExists(source.projectJson))) {
    throw new Error("Runtime project.db and project.json must both exist before snapshotting.");
  }
  assertSqliteIntegrity(source.database);
  const project = await readJson(source.projectJson);
  if (project.projectId !== projectId) throw new Error("Runtime project.json does not match the requested project id.");

  const target = snapshotPaths(projectId);
  await mkdir(target.directory, {recursive: true});
  const temporaryDatabase = `${target.database}.tmp-${process.pid}-${Date.now()}`;
  const temporaryProjectJson = `${target.projectJson}.tmp-${process.pid}-${Date.now()}`;
  try {
    // VACUUM INTO produces a consistent, self-contained SQLite file without WAL state.
    const sourceDb = new Database(source.database, {fileMustExist: true});
    try {
      sourceDb.exec(`VACUUM INTO '${temporaryDatabase.replaceAll("'", "''")}'`);
    } finally {
      sourceDb.close();
    }
    assertSqliteIntegrity(temporaryDatabase);
    await replaceFile(temporaryDatabase, target.database);
    await copyFile(source.projectJson, temporaryProjectJson);
    await replaceFile(temporaryProjectJson, target.projectJson);
    const manifest = {
      schemaVersion: 1,
      projectId,
      generatedAt: new Date().toISOString(),
      files: {
        database: {path: "project.db", bytes: (await stat(target.database)).size, sha256: await hashFile(target.database)},
        projectJson: {path: "project.json", bytes: (await stat(target.projectJson)).size, sha256: await hashFile(target.projectJson)}
      }
    };
    await writeJsonAtomically(target.manifest, manifest);
    console.log(JSON.stringify({status: "SNAPSHOT_READY", projectId, snapshotDirectory: target.directory, manifest}, null, 2));
  } finally {
    await rm(temporaryDatabase, {force: true});
    await rm(temporaryProjectJson, {force: true});
  }
};

const backupExistingState = async (source, backupDirectory) => {
  await mkdir(backupDirectory, {recursive: true});
  for (const [name, filename] of Object.entries({"project.db": source.database, "project.json": source.projectJson, "project.db-wal": source.wal, "project.db-shm": source.shm})) {
    if (await pathExists(filename)) await copyFile(filename, resolve(backupDirectory, name));
  }
};

const moveTransientFilesAside = async (source, backupDirectory) => {
  for (const [name, filename] of Object.entries({"project.db-wal": source.wal, "project.db-shm": source.shm})) {
    if (await pathExists(filename)) await rename(filename, resolve(backupDirectory, `${name}.pre-restore`));
  }
};

const commandRestore = async (projectId, flags) => {
  requireStopped(flags);
  const snapshot = snapshotPaths(projectId);
  const manifest = await checkManifest(projectId, snapshot);
  const target = runtimePaths(projectId);
  await mkdir(target.directory, {recursive: true});
  const backupDirectory = resolve(target.directory, ".project-state-backups", `${new Date().toISOString().replaceAll(":", "-")}-${manifest.files.database.sha256.slice(0, 12)}`);
  await backupExistingState(target, backupDirectory);
  await moveTransientFilesAside(target, backupDirectory);
  await copyFile(snapshot.database, target.database);
  await copyFile(snapshot.projectJson, target.projectJson);
  assertSqliteIntegrity(target.database);
  if (await hashFile(target.database) !== manifest.files.database.sha256) throw new Error("Restored database checksum does not match the snapshot.");
  if (await hashFile(target.projectJson) !== manifest.files.projectJson.sha256) throw new Error("Restored project.json checksum does not match the snapshot.");
  console.log(JSON.stringify({status: "RESTORE_COMPLETE", projectId, backupDirectory, snapshotDirectory: snapshot.directory}, null, 2));
};

const commandStatus = async projectId => {
  const runtime = runtimePaths(projectId);
  const snapshot = snapshotPaths(projectId);
  const output = {projectId, runtime: {}, snapshot: {}};
  for (const [name, filename] of Object.entries({database: runtime.database, projectJson: runtime.projectJson})) {
    output.runtime[name] = (await pathExists(filename)) ? {sha256: await hashFile(filename)} : null;
  }
  if (await pathExists(snapshot.manifest)) {
    const manifest = await checkManifest(projectId, snapshot);
    output.snapshot = {manifest, matchesRuntime: output.runtime.database?.sha256 === manifest.files.database.sha256 && output.runtime.projectJson?.sha256 === manifest.files.projectJson.sha256};
  } else {
    output.snapshot = {manifest: null, matchesRuntime: false};
  }
  console.log(JSON.stringify(output, null, 2));
};

const commandPublish = async (projectId, flags) => {
  requireStopped(flags);
  const branch = currentBranch();
  ensureRemoteIsNotAhead(branch);
  await commandSnapshot(projectId, flags);
  runGit(["add", "--", stateRelativePath(projectId)]);
  const staged = (() => {
    try {
      runGit(["diff", "--cached", "--quiet", "--", stateRelativePath(projectId)]);
      return false;
    } catch {
      return true;
    }
  })();
  if (staged) runGit(["commit", "-m", `chore(project-state): snapshot ${projectId}`]);
  runGit(["push", "origin", branch]);
  await commandStatus(projectId);
};

const commandDownload = async (projectId, flags) => {
  requireStopped(flags);
  const branch = currentBranch();
  if (hasStateWorkingTreeChanges(projectId)) {
    throw new Error("The tracked project-state snapshot has local changes. Commit, stash, or discard them before downloading.");
  }
  runGit(["fetch", "origin", "--prune"]);
  runGit(["pull", "--ff-only", "origin", branch]);
  await commandRestore(projectId, flags);
  await commandStatus(projectId);
};

const [command, projectId, ...flags] = process.argv.slice(2);
try {
  ensureProjectId(projectId);
  if (command === "snapshot") await commandSnapshot(projectId, flags);
  else if (command === "restore") await commandRestore(projectId, flags);
  else if (command === "status") await commandStatus(projectId);
  else if (command === "publish") await commandPublish(projectId, flags);
  else if (command === "download") await commandDownload(projectId, flags);
  else {
    usage();
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`[PROJECT_STATE_${String(command ?? "UNKNOWN").toUpperCase()}_FAILED] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
