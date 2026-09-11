#!/usr/bin/env node
import * as path from "node:path";
import {assertNoLegacyReference, LegacyGuardError} from "@vpf/legacy-guard";
import { fileURLToPath } from "node:url";
import {
  ProjectBootstrapError,
  ProjectBootstrapService
} from "@vpf/project-bootstrap";
import {
  GoogleFlowManualError,
  GoogleFlowManualService
} from "@vpf/storage/google-flow-manual";
import {
  PilotReadinessService,
  parseMinimumFreeGb
} from "./pilot-readiness.js";

export interface CliIo {
  out(message: string): void;
  error(message: string): void;
}

export interface GoogleFlowCliService {
  exportJob(input: { jobId: string; projectId?: string }): Promise<unknown>;
  importResult(input: {
    jobId: string;
    generatedFile: string;
    projectId?: string;
  }): Promise<unknown>;
}

const USAGE = `VPF Unified CLI

Commands:
  vpf project create <project_id> --title "..." --format <longform|shortform>
  vpf project status <project_id>
  vpf project doctor <project_id>
  vpf doctor <project_id>
  vpf env check --format <longform|shortform> [--min-free-gb <number>]
  vpf pilot preflight <project_id> [--min-free-gb <number>]
  vpf job export <job_id> [--project <project_id>]
  vpf job import-result <job_id> <generated.mp4> [--project <project_id>]
`;

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function printJson(io: CliIo, value: unknown): void {
  io.out(JSON.stringify(value, null, 2));
}

function notImplemented(io: CliIo, command: string): number {
  io.error(`[NOT_IMPLEMENTED] ${command} is reserved by the unified CLI contract but is not implemented.`);
  return 2;
}

function minimumFreeBytes(args: string[], io: CliIo): bigint | null | undefined {
  try {
    return parseMinimumFreeGb(readOption(args, "--min-free-gb"));
  } catch (error) {
    io.error(`[CLI_USAGE] ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function runCli(
  args: string[],
  io: CliIo = {
    out: (message) => console.log(message),
    error: (message) => console.error(message)
  },
  service: ProjectBootstrapService = new ProjectBootstrapService(),
  readinessService?: PilotReadinessService,
  flowService?: GoogleFlowCliService
): Promise<number> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    io.out(USAGE);
    return 0;
  }

  try {
    // Prose titles are not executable references. Commands/paths are.
    for (let i = 0; i < args.length; i++) if (args[i - 1] !== "--title") assertNoLegacyReference(args[i]!);
    if (args[0] === "project" && args[1] === "create") {
      const projectId = args[2];
      const title = readOption(args, "--title");
      const format = readOption(args, "--format");
      if (projectId === undefined || title === undefined || format === undefined) {
        io.error("[CLI_USAGE] project create requires <project_id>, --title and --format.");
        return 2;
      }
      const created = await service.createProject({ projectId, title, format });
      printJson(io, {
        status: "CREATED",
        projectId: created.record.project.projectId,
        title: created.record.project.title,
        format: created.record.project.format,
        projectRoot: created.projectRoot,
        projectDb: created.projectDbPath,
        projectJson: created.projectJsonPath,
        migration: created.migrations.latestMigrationId,
        resourcePins: created.record.resourcePins.length,
        legacyAllowed: created.record.legacyAllowed
      });
      return 0;
    }

    if (args[0] === "project" && args[1] === "status") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] project status requires <project_id>.");
        return 2;
      }
      const status = await service.getStatus(projectId);
      printJson(io, {
        projectId: status.project.projectId,
        title: status.project.title,
        format: status.project.format,
        revision: status.project.revision,
        pipeline: status.pipeline,
        legacyAllowed: status.legacyAllowed,
        migrationsCurrent: status.migrations.current,
        latestMigration: status.migrations.latestMigrationId,
        resourcePins: status.resourcePins
      });
      return 0;
    }

    if (
      (args[0] === "doctor" && args[1] !== undefined) ||
      (args[0] === "project" && args[1] === "doctor" && args[2] !== undefined)
    ) {
      const projectId = args[0] === "doctor" ? args[1]! : args[2]!;
      const result = await service.doctor(projectId);
      printJson(io, result);
      return result.healthy ? 0 : 1;
    }

    if (args[0] === "env" && args[1] === "check") {
      const format = readOption(args, "--format");
      if (format === undefined) {
        io.error("[CLI_USAGE] env check requires --format <longform|shortform>.");
        return 2;
      }
      const minimum = minimumFreeBytes(args, io);
      if (minimum === null) return 2;
      const readiness = readinessService ?? new PilotReadinessService(service);
      const result = await readiness.checkEnvironment(
        format,
        minimum === undefined ? {} : {minimumFreeBytes: minimum}
      );
      printJson(io, result);
      return result.ready ? 0 : 1;
    }

    if (args[0] === "pilot" && args[1] === "preflight") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] pilot preflight requires <project_id>.");
        return 2;
      }
      const minimum = minimumFreeBytes(args, io);
      if (minimum === null) return 2;
      const readiness = readinessService ?? new PilotReadinessService(service);
      const result = await readiness.checkProject(
        projectId,
        minimum === undefined ? {} : {minimumFreeBytes: minimum}
      );
      printJson(io, result);
      return result.ready ? 0 : 1;
    }

    if (args[0] === "job" && args[1] === "export") {
      const jobId = args[2];
      if (jobId === undefined) {
        io.error("[CLI_USAGE] job export requires <job_id>.");
        return 2;
      }
      const projectId = readOption(args, "--project");
      const flow = flowService ?? new GoogleFlowManualService();
      const result = await flow.exportJob({
        jobId,
        ...(projectId === undefined ? {} : { projectId })
      });
      printJson(io, result);
      return 0;
    }

    if (args[0] === "job" && args[1] === "import-result") {
      const jobId = args[2];
      const generatedFile = args[3];
      if (jobId === undefined || generatedFile === undefined) {
        io.error("[CLI_USAGE] job import-result requires <job_id> <generated.mp4>.");
        return 2;
      }
      const projectId = readOption(args, "--project");
      const flow = flowService ?? new GoogleFlowManualService();
      const result = await flow.importResult({
        jobId,
        generatedFile,
        ...(projectId === undefined ? {} : { projectId })
      });
      printJson(io, result);
      return 0;
    }

    if (args[0] === "run" || args[0] === "job" || args[0] === "qc") {
      return notImplemented(io, args.join(" "));
    }

    io.error("[CLI_USAGE] Unknown command.\n" + USAGE);
    return 2;
  } catch (error: unknown) {
    if (
      error instanceof ProjectBootstrapError ||
      error instanceof LegacyGuardError ||
      error instanceof GoogleFlowManualError
    ) {
      io.error(`[${error.code}] ${error.message}`);
      return 1;
    }
    if (error instanceof Error) {
      io.error(`[UNEXPECTED] ${error.message}`);
      return 1;
    }
    io.error("[UNEXPECTED] Unknown error.");
    return 1;
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  path.resolve(invokedPath) === path.resolve(fileURLToPath(import.meta.url))
) {
  process.exitCode = await runCli(process.argv.slice(2));
}
