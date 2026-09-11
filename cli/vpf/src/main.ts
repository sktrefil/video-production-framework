#!/usr/bin/env node
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { LegacyGuardError, assertNoLegacyReference } from "@vpf/legacy-guard";
import {
  ProjectBootstrapError,
  ProjectBootstrapService
} from "@vpf/project-bootstrap";
import { ResourceRegistryError } from "@vpf/resource-registry";
import { SceneAssetValidationError } from "@vpf/scene-assets";
import { runCli, type CliIo } from "./index.js";
import { Wf09CliError, Wf09CliService } from "./wf09.js";

const WF09_USAGE = `WF-09A scene asset operations:
  vpf asset readiness <project_id> --file <project-file>
  vpf asset design apply <project_id> --file <project-file>
  vpf asset prompt materialize <project_id> --file <project-file>
  vpf asset status <project_id>`;

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function printJson(io: CliIo, value: unknown): void {
  io.out(JSON.stringify(value, null, 2));
}

function defaultIo(): CliIo {
  return {
    out: (message) => console.log(message),
    error: (message) => console.error(message)
  };
}

function assertAssetArgumentsAreIsolated(args: string[]): void {
  for (const arg of args) assertNoLegacyReference(arg);
}

export async function runUnifiedCli(
  args: string[],
  io: CliIo = defaultIo(),
  projects: ProjectBootstrapService = new ProjectBootstrapService()
): Promise<number> {
  if (args[0] !== "asset") {
    const code = await runCli(args, io, projects);
    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
      io.out("\n" + WF09_USAGE);
    }
    return code;
  }

  try {
    assertAssetArgumentsAreIsolated(args);
    const wf09 = new Wf09CliService(projects);

    if (args[1] === "readiness") {
      const projectId = args[2];
      const file = readOption(args, "--file");
      if (projectId === undefined || file === undefined) {
        io.error("[CLI_USAGE] asset readiness requires <project_id> and --file <project-file>.");
        return 2;
      }
      const result = await wf09.readiness(projectId, file);
      printJson(io, result);
      return result.ready ? 0 : 1;
    }

    if (args[1] === "design" && args[2] === "apply") {
      const projectId = args[3];
      const file = readOption(args, "--file");
      if (projectId === undefined || file === undefined) {
        io.error("[CLI_USAGE] asset design apply requires <project_id> and --file <project-file>.");
        return 2;
      }
      printJson(io, await wf09.applyDesigns(projectId, file));
      return 0;
    }

    if (args[1] === "prompt" && args[2] === "materialize") {
      const projectId = args[3];
      const file = readOption(args, "--file");
      if (projectId === undefined || file === undefined) {
        io.error("[CLI_USAGE] asset prompt materialize requires <project_id> and --file <project-file>.");
        return 2;
      }
      printJson(io, await wf09.materializePrompts(projectId, file));
      return 0;
    }

    if (args[1] === "status") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] asset status requires <project_id>.");
        return 2;
      }
      printJson(io, await wf09.status(projectId));
      return 0;
    }

    io.error("[CLI_USAGE] Unknown asset command.\n" + WF09_USAGE);
    return 2;
  } catch (error: unknown) {
    if (
      error instanceof ProjectBootstrapError ||
      error instanceof LegacyGuardError ||
      error instanceof ResourceRegistryError ||
      error instanceof SceneAssetValidationError ||
      error instanceof Wf09CliError
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
  process.exitCode = await runUnifiedCli(process.argv.slice(2));
}
