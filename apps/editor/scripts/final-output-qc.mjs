import {randomUUID} from "node:crypto";
import {mkdir, readFile, stat, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {FinalOutputPipeline} from "@vpf/final-output";
import {resolveFrameworkArtifactPath, sha256File} from "@vpf/editor-materializer";
import {SqliteFinalOutputRepository} from "@vpf/storage/final-output";
import {defaultProjectRoot} from "./materialize-editor-project.mjs";

const clock = {nowIso: () => new Date().toISOString()};
const ids = {next: prefix => `${prefix}_${randomUUID()}`};

async function writeJson(path, value) {
  await mkdir(dirname(path), {recursive: true});
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function verifyDeliveryFile(repository, projectId, projectRoot) {
  const delivery = await repository.getLatestDeliveryManifest(projectId);
  if (!delivery || delivery.status !== "READY") throw new Error("WF-17 delivery is not READY.");
  const physical = resolveFrameworkArtifactPath(projectRoot, projectId, delivery.outputPath);
  const info = await stat(physical.absolutePath);
  const actualSha = await sha256File(physical.absolutePath);
  if (!info.isFile() || info.size !== delivery.outputSizeBytes || actualSha !== delivery.outputSha256) {
    throw new Error("Final MP4 no longer matches the current WF-17 delivery manifest.");
  }
  return delivery;
}

export async function recordFinalOutputQcCommand({
  projectId,
  projectRoot = defaultProjectRoot(projectId),
  status = "PASS",
  confidence = 1,
  issueCodes = [],
  notes = [],
  reviewRequired = false,
  approveReview = false,
  reviewer
}) {
  const repository = new SqliteFinalOutputRepository(resolve(projectRoot, "project.db"));
  const pipeline = new FinalOutputPipeline(repository, clock, ids);
  try {
    await verifyDeliveryFile(repository, projectId, projectRoot);
    const record = approveReview
      ? await pipeline.approveFinalOutputQc({
          projectId,
          ...(reviewer ? {approvedById: reviewer} : {}),
          reason: notes[0] ?? "Final output reviewed against the current delivery."
        })
      : await pipeline.recordFinalOutputQc({
          projectId,
          status,
          confidence,
          issueCodes,
          notes,
          reviewRequired
        });
    const sidecar = resolveFrameworkArtifactPath(projectRoot, projectId, `out/${projectId}/final_output_qc.json`);
    await writeJson(sidecar.absolutePath, record);
    return {record, projectRelativePath: sidecar.projectRelativePath};
  } finally {
    repository.close();
  }
}

export async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) return null;
  const result = {
    projectId: argv.shift(), projectRoot: null, status: "PASS", confidence: 1,
    issueCodes: [], notes: [], reviewRequired: false, approveReview: false, reviewer: null
  };
  while (argv.length) {
    const arg = argv.shift();
    if (arg === "--project-root") {
      const value = argv.shift(); if (!value) throw new Error("--project-root requires a path"); result.projectRoot = resolve(value);
    } else if (arg === "--status") {
      const value = argv.shift(); if (!value) throw new Error("--status requires a value"); result.status = value;
    } else if (arg === "--confidence") {
      const value = Number(argv.shift()); if (!Number.isFinite(value)) throw new Error("--confidence requires a number"); result.confidence = value;
    } else if (arg === "--issue") {
      const value = argv.shift(); if (!value) throw new Error("--issue requires a value"); result.issueCodes.push(value);
    } else if (arg === "--note") {
      const value = argv.shift(); if (!value) throw new Error("--note requires a value"); result.notes.push(value);
    } else if (arg === "--review-required") result.reviewRequired = true;
    else if (arg === "--approve-review") result.approveReview = true;
    else if (arg === "--reviewer") {
      const value = argv.shift(); if (!value) throw new Error("--reviewer requires a value"); result.reviewer = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    console.log("Usage: node scripts/final-output-qc.mjs <project_id> [--status PASS|FIX_REQUIRED|BLOCKED] [--confidence 0..1] [--review-required|--approve-review]");
    process.exitCode = process.argv.length <= 2 ? 1 : 0;
  } else {
    void recordFinalOutputQcCommand({
      projectId: args.projectId,
      ...(args.projectRoot ? {projectRoot: args.projectRoot} : {}),
      status: args.status,
      confidence: args.confidence,
      issueCodes: args.issueCodes,
      notes: args.notes,
      reviewRequired: args.reviewRequired,
      approveReview: args.approveReview,
      ...(args.reviewer ? {reviewer: args.reviewer} : {})
    }).then(result => console.log(`[final-output-qc] ${result.record.status} · report=${result.projectRelativePath}`))
      .catch(error => {
        console.error(`[final-output-qc] BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      });
  }
}
