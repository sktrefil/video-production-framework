#!/usr/bin/env node
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ProjectBootstrapError,
  ProjectBootstrapService
} from "@vpf/project-bootstrap";

export interface CliIo {
  out(message: string): void;
  error(message: string): void;
}

const USAGE = `VPF Unified CLI

Commands:
  vpf project create <project_id> --title "..." --format <longform|shortform>
  vpf project status <project_id>
  vpf project doctor <project_id>
  vpf doctor <project_id>
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
  io.error(`[NOT_IMPLEMENTED] ${command} is reserved by the unified CLI contract but is not implemented in MIG-04.`);
  return 2;
}

export async function runCli(
  args: string[],
  io: CliIo = {
    out: (message) => console.log(message),
    error: (message) => console.error(message)
  },
  service: ProjectBootstrapService = new ProjectBootstrapService()
): Promise<number> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    io.out(USAGE);
    return 0;
  }

  try {
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

    if (args[0] === "run" || args[0] === "job" || args[0] === "qc") {
      return notImplemented(io, args.join(" "));
    }

    io.error("[CLI_USAGE] Unknown command.\n" + USAGE);
    return 2;
  } catch (error: unknown) {
    if (error instanceof ProjectBootstrapError) {
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
