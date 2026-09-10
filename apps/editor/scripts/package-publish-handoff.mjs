import {randomUUID} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {FinalOutputPipeline} from "@vpf/final-output";
import {
  materializePublishHandoff,
  resolveFrameworkArtifactPath
} from "@vpf/editor-materializer";
import {SqliteFinalOutputRepository} from "@vpf/storage/final-output";
import {defaultProjectRoot} from "./materialize-editor-project.mjs";

const clock = {nowIso: () => new Date().toISOString()};
const ids = {next: prefix => `${prefix}_${randomUUID()}`};

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), {recursive: true});
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export async function packagePublishHandoffCommand({
  projectId,
  projectRoot = defaultProjectRoot(projectId),
  metadataPath
}) {
  const canonicalMetadata = resolveFrameworkArtifactPath(
    projectRoot,
    projectId,
    `out/${projectId}/publish_metadata.json`
  );
  const sourceMetadataPath = metadataPath ? resolve(metadataPath) : canonicalMetadata.absolutePath;
  const metadata = await readJson(sourceMetadataPath);

  const repository = new SqliteFinalOutputRepository(resolve(projectRoot, "project.db"));
  const pipeline = new FinalOutputPipeline(repository, clock, ids);
  try {
    const outcome = await pipeline.createPublishPackage({projectId, metadata});
    await writeJson(canonicalMetadata.absolutePath, outcome.manifest.metadata);
    const materialized = await materializePublishHandoff({
      projectRoot,
      manifest: outcome.manifest,
      output: outcome.output
    });
    return {outcome, materialized};
  } finally {
    repository.close();
  }
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) return null;
  const result = {projectId: argv.shift(), projectRoot: null, metadataPath: null};
  while (argv.length) {
    const arg = argv.shift();
    if (arg === "--project-root") {
      const value = argv.shift(); if (!value) throw new Error("--project-root requires a path"); result.projectRoot = resolve(value);
    } else if (arg === "--metadata") {
      const value = argv.shift(); if (!value) throw new Error("--metadata requires a path"); result.metadataPath = resolve(value);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    console.log("Usage: node scripts/package-publish-handoff.mjs <project_id> [--project-root <path>] [--metadata <path>]");
    process.exitCode = process.argv.length <= 2 ? 1 : 0;
  } else {
    void packagePublishHandoffCommand({
      projectId: args.projectId,
      ...(args.projectRoot ? {projectRoot: args.projectRoot} : {}),
      ...(args.metadataPath ? {metadataPath: args.metadataPath} : {})
    }).then(result => {
      console.log(`[publish-package] READY · package=${result.materialized.packageDirectory} · handoff=${result.materialized.handoffPath}`);
    }).catch(error => {
      console.error(`[publish-package] BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
  }
}
