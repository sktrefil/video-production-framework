import {existsSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {materializeEditorProjectFromRepository} from "@vpf/editor-materializer";
import {SqliteEditorMaterializationRepository} from "@vpf/storage/editor-materialization";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = resolve(APP_ROOT, "../..");
export const EDITOR_PUBLIC_ROOT = resolve(APP_ROOT, "public");

export function defaultProjectRoot(projectId) {
  const configured = process.env.VPF_WORKSPACE_ROOT;
  const workspaceRoot = configured && configured.trim()
    ? (resolve(configured))
    : resolve(REPOSITORY_ROOT, "workspace");
  return resolve(workspaceRoot, "projects", projectId);
}

export async function materializeProjectCommand({
  projectId,
  projectRoot = defaultProjectRoot(projectId),
  editorPublicRoot = EDITOR_PUBLIC_ROOT
}) {
  const dbPath = resolve(projectRoot, "project.db");
  if (!existsSync(dbPath)) {
    throw new Error(`project.db not found: ${dbPath}`);
  }
  const repository = new SqliteEditorMaterializationRepository(dbPath);
  try {
    return await materializeEditorProjectFromRepository({
      repository,
      projectId,
      projectRoot,
      editorPublicRoot
    });
  } finally {
    repository.close();
  }
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) return null;
  const result = {projectId: argv[0], projectRoot: null};
  const rest = argv.slice(1);
  while (rest.length) {
    const arg = rest.shift();
    if (arg === "--project-root") {
      const value = rest.shift();
      if (!value) throw new Error("--project-root requires a path");
      result.projectRoot = resolve(value);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

const isDirect = resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
if (isDirect) {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    console.log("Usage: node scripts/materialize-editor-project.mjs <project_id> [--project-root <path>]");
    process.exitCode = process.argv.length <= 2 ? 1 : 0;
  } else {
    void materializeProjectCommand({
      projectId: args.projectId,
      ...(args.projectRoot ? {projectRoot: args.projectRoot} : {})
    }).then(result => {
      console.log(`[editor-materialize] READY · canonical=${result.report.canonicalProjectPath} · mirror=${result.report.editorMirrorProjectPath} · media=${result.report.media.length}`);
    }).catch(error => {
      console.error(`[editor-materialize] BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
  }
}
