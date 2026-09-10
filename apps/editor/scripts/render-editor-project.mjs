import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {mkdir, rm, stat, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {FinalRenderPipeline} from "@vpf/final-render";
import {
  resolveFrameworkArtifactPath,
  sha256File
} from "@vpf/editor-materializer";
import {SqliteFinalRenderRepository} from "@vpf/storage/final-render";
import {materializeProjectCommand, defaultProjectRoot, EDITOR_PUBLIC_ROOT} from "./materialize-editor-project.mjs";
import {
  validateEditorProductionProject,
  writeProductionGateReport
} from "./editor-production-gate.mjs";
import {probeFinalRender} from "./final-render-technical-qc.mjs";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clock = {nowIso: () => new Date().toISOString()};
const ids = {next: prefix => `${prefix}_${randomUUID()}`};

async function writeJson(path, value) {
  await mkdir(dirname(path), {recursive: true});
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function runRemotion(args) {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, ["exec", "--", "remotion", ...args], {
      cwd: APP_ROOT,
      stdio: "inherit",
      windowsHide: false,
      shell: false,
      env: {...process.env}
    });
    child.once("error", error => {
      if (error?.code === "EPERM") {
        rejectRun(new Error(`spawn EPERM while launching Remotion/browser: ${error.message}`));
        return;
      }
      rejectRun(error);
    });
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(signal ? `Remotion render terminated by ${signal}` : `Remotion render failed with exit code ${code ?? "unknown"}`));
    });
  });
}

export async function renderEditorProject({
  projectId,
  projectRoot = defaultProjectRoot(projectId),
  gateOnly = false,
  allowVisualGaps = false
}) {
  const materialized = await materializeProjectCommand({
    projectId,
    projectRoot,
    editorPublicRoot: EDITOR_PUBLIC_ROOT
  });
  const project = materialized.executionProject;
  const gateLogicalPath = `out/${projectId}/production_gate.json`;
  const gatePath = resolveFrameworkArtifactPath(projectRoot, projectId, gateLogicalPath);
  const validation = await validateEditorProductionProject(project, {
    publicDir: EDITOR_PUBLIC_ROOT,
    allowVisualGaps,
    verifyMedia: true
  });
  const gate = await writeProductionGateReport({
    project,
    validation,
    outputPath: gatePath.absolutePath
  });
  if (!validation.ok) {
    const error = new Error(`Production gate blocked: ${validation.errors.map(entry => entry.code).join(",")}`);
    error.code = "PRODUCTION_GATE_BLOCKED";
    throw error;
  }
  if (gateOnly) return {status: "GATE_PASS", materialized, gate};

  const dbPath = resolve(projectRoot, "project.db");
  const repository = new SqliteFinalRenderRepository(dbPath);
  const pipeline = new FinalRenderPipeline(repository, clock, ids);
  try {
    const prepared = await pipeline.prepareRender({projectId});
    if (!prepared.created && prepared.renderAttempt.status === "DELIVERY_READY") {
      const delivery = await repository.getLatestDeliveryManifest(projectId);
      return {status: "DELIVERY_READY", materialized, gate, renderAttempt: prepared.renderAttempt, delivery};
    }
    if (prepared.renderAttempt.status !== "READY") {
      throw new Error(`Current render attempt is ${prepared.renderAttempt.status}; expected READY.`);
    }
    const running = await pipeline.markRunning({
      projectId,
      renderAttemptId: prepared.renderAttempt.id
    });

    const outputPath = resolveFrameworkArtifactPath(projectRoot, projectId, running.paths.outputPath);
    const propsPath = resolveFrameworkArtifactPath(projectRoot, projectId, running.paths.renderPropsPath);
    const manifestPath = resolveFrameworkArtifactPath(projectRoot, projectId, running.paths.renderManifestPath);
    const technicalQcPath = resolveFrameworkArtifactPath(projectRoot, projectId, running.paths.technicalQcPath);
    const deliveryPath = resolveFrameworkArtifactPath(projectRoot, projectId, running.paths.deliveryManifestPath);

    await mkdir(dirname(outputPath.absolutePath), {recursive: true});
    await writeJson(propsPath.absolutePath, {project});
    await Promise.all([
      rm(outputPath.absolutePath, {force: true}),
      rm(manifestPath.absolutePath, {force: true}),
      rm(technicalQcPath.absolutePath, {force: true}),
      rm(deliveryPath.absolutePath, {force: true})
    ]);

    try {
      const renderArgs = [
        "render",
        "src/index.ts",
        "GenericFinalRender",
        outputPath.absolutePath,
        "--props",
        propsPath.absolutePath,
        "--codec=h264",
        "--audio-codec=aac",
        "--pixel-format=yuv420p",
        "--crf=18",
        "--overwrite=true"
      ];
      if (process.env.REMOTION_CONCURRENCY) {
        renderArgs.push(`--concurrency=${process.env.REMOTION_CONCURRENCY}`);
      }
      await runRemotion(renderArgs);
    } catch (error) {
      await pipeline.failRender({
        projectId,
        renderAttemptId: running.id,
        errorCode: error?.message?.includes("spawn EPERM") ? "SPAWN_EPERM" : "REMOTION_RENDER_FAILED",
        errorDetail: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    const outputInfo = await stat(outputPath.absolutePath);
    if (!outputInfo.isFile() || outputInfo.size <= 0) throw new Error("Final render output is missing or empty.");
    const outputSha256 = await sha256File(outputPath.absolutePath);
    const probe = await probeFinalRender(outputPath.absolutePath);
    const result = {
      schemaVersion: 1,
      status: "RENDERED",
      compositionId: "GenericFinalRender",
      projectId,
      projectSha256: running.projectSha256,
      renderedAt: new Date().toISOString(),
      metadata: {
        fps: project.project.fps,
        width: project.project.width,
        height: project.project.height,
        durationInFrames: project.project.durationInFrames
      },
      output: {
        path: running.paths.outputPath,
        sizeBytes: outputInfo.size,
        sha256: outputSha256,
        codec: "h264",
        audioCodec: "aac",
        pixelFormat: "yuv420p",
        crf: 18
      },
      probe
    };
    await writeJson(manifestPath.absolutePath, result);

    const outcome = await pipeline.importRenderResult({
      projectId,
      renderAttemptId: running.id,
      result
    });
    await writeJson(technicalQcPath.absolutePath, outcome.technicalQc);
    await writeJson(deliveryPath.absolutePath, outcome.delivery);

    return {
      status: outcome.delivery.status === "READY" ? "DELIVERY_READY" : "TECHNICAL_QC_FAILED",
      materialized,
      gate,
      renderAttempt: outcome.renderAttempt,
      technicalQc: outcome.technicalQc,
      delivery: outcome.delivery,
      physicalOutputPath: outputPath.projectRelativePath
    };
  } finally {
    repository.close();
  }
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) return null;
  const result = {projectId: argv.shift(), projectRoot: null, gateOnly: false, allowVisualGaps: false};
  while (argv.length) {
    const arg = argv.shift();
    if (arg === "--project-root") {
      const value = argv.shift();
      if (!value) throw new Error("--project-root requires a path");
      result.projectRoot = resolve(value);
    } else if (arg === "--gate-only") result.gateOnly = true;
    else if (arg === "--allow-visual-gaps") result.allowVisualGaps = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    console.log("Usage: node scripts/render-editor-project.mjs <project_id> [--project-root <path>] [--gate-only]");
    process.exitCode = process.argv.length <= 2 ? 1 : 0;
  } else {
    void renderEditorProject({
      projectId: args.projectId,
      ...(args.projectRoot ? {projectRoot: args.projectRoot} : {}),
      gateOnly: args.gateOnly,
      allowVisualGaps: args.allowVisualGaps
    }).then(result => {
      console.log(`[final-render] ${result.status} · project=${args.projectId}${result.physicalOutputPath ? ` · output=${result.physicalOutputPath}` : ""}`);
      if (result.status === "TECHNICAL_QC_FAILED") process.exitCode = 3;
    }).catch(error => {
      console.error(`[final-render] BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
  }
}
