import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {renderEditorProject} from "./render-editor-project.mjs";

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) return null;
  const result = {projectId: argv.shift(), projectRoot: null, gateOnly: false, allowVisualGaps: false, forceRender: false};
  while (argv.length) {
    const arg = argv.shift();
    if (arg === "--project-root") {
      const value = argv.shift();
      if (!value) throw new Error("--project-root requires a path");
      result.projectRoot = resolve(value);
    } else if (arg === "--gate-only") result.gateOnly = true;
    else if (arg === "--allow-visual-gaps") result.allowVisualGaps = true;
    else if (arg === "--force") result.forceRender = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

export async function renderCanonicalEditorProject(args) {
  const result = await renderEditorProject(args);
  const materializedRevision = result.materialized?.report?.assemblyRevision;
  const materializedId = result.materialized?.report?.assemblyId;
  const renderRevision = result.renderAttempt?.assemblyRevision;
  const renderId = result.renderAttempt?.assemblyId;

  if (result.renderAttempt && (materializedRevision !== renderRevision || materializedId !== renderId)) {
    const error = new Error(
      `ASSEMBLY_LINEAGE_MISMATCH: materialized=${materializedId}@${materializedRevision}, render=${renderId}@${renderRevision}`
    );
    error.code = "ASSEMBLY_LINEAGE_MISMATCH";
    throw error;
  }
  return result;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    console.log("Usage: node scripts/render-editor-project-canonical.mjs <project_id> [--project-root <path>] [--gate-only] [--allow-visual-gaps]");
    process.exitCode = process.argv.length <= 2 ? 1 : 0;
  } else {
    void renderCanonicalEditorProject({
      projectId: args.projectId,
      ...(args.projectRoot ? {projectRoot: args.projectRoot} : {}),
      gateOnly: args.gateOnly,
      allowVisualGaps: args.allowVisualGaps,
      forceRender: args.forceRender
    }).then(result => {
      console.log(
        `[editor-render] ${result.status} · assembly=${result.materialized.report.assemblyId}@${result.materialized.report.assemblyRevision}`
      );
    }).catch(error => {
      console.error(`[editor-render] BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
  }
}
