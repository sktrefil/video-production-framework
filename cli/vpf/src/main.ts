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
import { RuntimeContractError } from "@vpf/runtime-contracts";
import { runCli, type CliIo } from "./index.js";
import { Wf09CliError, Wf09CliService } from "./wf09.js";
import { Wf09AutoError, Wf09AutoService } from "./wf09-auto.js";
import { Wf09HardenError, Wf09HardenService, type Wf09HardenPhase } from "./wf09-harden.js";
import { Wf09bCliError, Wf09bCliService } from "./wf09b.js";
import { Wf10CliError, Wf10CliService } from "./wf10.js";
import { Wf11CliError, Wf11CliService } from "./wf11.js";
import { FinalClipValidationError } from "@vpf/final-clip";
import { CutListCliError, CutListCliService } from "./cutlist.js";
import { RenameSelectedMediaError, RenameSelectedMediaService } from "./rename-selected-media.js";
import { PreLinkHandoffValidationError } from "@vpf/prelink-handoff";

const WF09_USAGE = `WF-09 hardened gated workflow:
  vpf wf09 harden <project_id> --all
  vpf wf09 harden <project_id> --phase <reference|browser|canary|batch|qc>

WF-09 AUTO connected prompt-to-image operations:
  vpf run wf09 <project_id> [--file <project-file>]
  vpf asset auto run <project_id> --all [--file <project-file>]
  vpf asset auto resume <project_id>
  vpf asset auto status <project_id>

WF-09A scene asset operations:
  vpf asset readiness <project_id> --file <project-file>
  vpf asset design apply <project_id> --file <project-file>
  vpf asset import apply <project_id> --file <project-file>
  vpf asset prompt materialize <project_id> --file <project-file>
  vpf asset status <project_id>

WF-09B image runtime operations:
  vpf asset runtime preflight <project_id>
  vpf asset runtime execute <project_id> (--all | --asset <asset_id>...)
  vpf asset runtime retry-failed <project_id> (--all | --job <job_id>...)
  vpf asset runtime status <project_id>
  vpf asset qc apply <project_id> --file <project-file>
  vpf asset approve <project_id> (--all | --asset <asset_id>...) [--approved-by <id>]`;

const WF10_USAGE = `WF-10 pre-link / handoff operations:
  vpf link graph build <project_id>
  vpf link preflight apply <project_id> --file <project-file>
  vpf link handoff qc <project_id> --file <project-file>
  vpf link handoff approve <project_id> --all [--approved-by <id>]
  vpf link status <project_id>`;

const WF11_USAGE = `WF-11 Final Clip design operations:
  vpf clip design apply <project_id> --file <project-file>
  vpf clip design approve <project_id> --all [--approved-by <id>]
  vpf clip status <project_id>`;

const CUTLIST_USAGE = `Cut-list materialization:
  vpf cutlist materialize <project_id> --file <project-file>`;

const SELECTED_MEDIA_USAGE = `Selected media naming:
  vpf asset media rename-selected <project_id>`;

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function readOptions(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === name) values.push(args[index + 1]!);
  }
  return values;
}

function selection(
  args: string[],
  repeatedFlag: "--asset" | "--job",
  io: CliIo,
  usage: string
): "ALL" | string[] | null {
  const all = args.includes("--all");
  const values = readOptions(args, repeatedFlag)
    .flatMap(value => value.split(","))
    .map(value => value.trim())
    .filter(value => value.length > 0);
  if ((all && values.length > 0) || (!all && values.length === 0)) {
    io.error(`[CLI_USAGE] ${usage}`);
    return null;
  }
  return all ? "ALL" : values;
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

function hardenPhase(args: string[], io: CliIo): Wf09HardenPhase | null {
  if (args.includes("--all")) {
    if (readOption(args, "--phase") !== undefined) {
      io.error("[CLI_USAGE] wf09 harden accepts either --all or --phase, not both.");
      return null;
    }
    return "all";
  }
  const phase = readOption(args, "--phase") as Wf09HardenPhase | undefined;
  if (phase === undefined || !["reference", "browser", "canary", "batch", "qc"].includes(phase)) {
    io.error("[CLI_USAGE] wf09 harden requires --all or --phase <reference|browser|canary|batch|qc>.");
    return null;
  }
  return phase;
}

function hardenSucceeded(result: unknown, phase: Wf09HardenPhase): boolean {
  if (typeof result !== "object" || result === null) return false;
  const record = result as Record<string, unknown>;
  if (phase === "all") return record.completed === true;
  return record.status === "PASS";
}

export async function runUnifiedCli(
  args: string[],
  io: CliIo = defaultIo(),
  projects: ProjectBootstrapService = new ProjectBootstrapService()
): Promise<number> {
  const isHarden = args[0] === "wf09" && args[1] === "harden";
  const isLink = args[0] === "link";
  const isClip = args[0] === "clip";
  const isCutList = args[0] === "cutlist";
  if (args[0] !== "asset" && !(args[0] === "run" && args[1] === "wf09") && !isHarden && !isLink && !isClip && !isCutList) {
    const code = await runCli(args, io, projects);
    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
      io.out("\n" + WF09_USAGE);
    }
    return code;
  }

  try {
    assertAssetArgumentsAreIsolated(args);
    const wf09 = new Wf09CliService(projects);
    const wf09b = new Wf09bCliService(projects);
    const wf09Auto = new Wf09AutoService(projects);
    const wf10 = new Wf10CliService(projects);
    const wf11 = new Wf11CliService(projects);
    const cutList = new CutListCliService(projects);
    const selectedMedia = new RenameSelectedMediaService(projects);

    if (isLink) {
      if (args[1] === "graph" && args[2] === "build") {
        const projectId = args[3];
        if (projectId === undefined) {
          io.error("[CLI_USAGE] link graph build requires <project_id>.");
          return 2;
        }
        printJson(io, await wf10.buildGraph(projectId));
        return 0;
      }
      if (args[1] === "preflight" && args[2] === "apply") {
        const projectId = args[3];
        const file = readOption(args, "--file");
        if (projectId === undefined || file === undefined) {
          io.error("[CLI_USAGE] link preflight apply requires <project_id> and --file <project-file>.");
          return 2;
        }
        printJson(io, await wf10.applyPreLink(projectId, file));
        return 0;
      }
      if (args[1] === "handoff" && args[2] === "qc") {
        const projectId = args[3];
        const file = readOption(args, "--file");
        if (projectId === undefined || file === undefined) {
          io.error("[CLI_USAGE] link handoff qc requires <project_id> and --file <project-file>.");
          return 2;
        }
        printJson(io, await wf10.applyHandoffQc(projectId, file));
        return 0;
      }
      if (args[1] === "handoff" && args[2] === "approve") {
        const projectId = args[3];
        if (projectId === undefined || !args.includes("--all")) {
          io.error("[CLI_USAGE] link handoff approve requires <project_id> --all [--approved-by <id>].");
          return 2;
        }
        printJson(io, await wf10.approveHandoffReviews(projectId, readOption(args, "--approved-by")));
        return 0;
      }
      if (args[1] === "status") {
        const projectId = args[2];
        if (projectId === undefined) {
          io.error("[CLI_USAGE] link status requires <project_id>.");
          return 2;
        }
        printJson(io, await wf10.status(projectId));
        return 0;
      }
      io.error("[CLI_USAGE] Unknown link command.\n" + WF10_USAGE);
      return 2;
    }

    if (isClip) {
      if (args[1] === "design" && args[2] === "apply") {
        const projectId = args[3];
        const file = readOption(args, "--file");
        if (projectId === undefined || file === undefined) {
          io.error("[CLI_USAGE] clip design apply requires <project_id> and --file <project-file>.");
          return 2;
        }
        printJson(io, await wf11.applyDesigns(projectId, file));
        return 0;
      }
      if (args[1] === "design" && args[2] === "approve") {
        const projectId = args[3];
        if (projectId === undefined || !args.includes("--all")) {
          io.error("[CLI_USAGE] clip design approve requires <project_id> --all [--approved-by <id>].");
          return 2;
        }
        printJson(io, await wf11.approveAll(projectId, readOption(args, "--approved-by")));
        return 0;
      }
      if (args[1] === "status") {
        const projectId = args[2];
        if (projectId === undefined) {
          io.error("[CLI_USAGE] clip status requires <project_id>.");
          return 2;
        }
        printJson(io, await wf11.status(projectId));
        return 0;
      }
      io.error("[CLI_USAGE] Unknown clip command.\n" + WF11_USAGE);
      return 2;
    }

    if (isCutList) {
      if (args[1] === "materialize") {
        const projectId = args[2];
        const file = readOption(args, "--file");
        if (projectId === undefined || file === undefined) {
          io.error("[CLI_USAGE] cutlist materialize requires <project_id> and --file <project-file>.");
          return 2;
        }
        printJson(io, await cutList.materialize(projectId, file));
        return 0;
      }
      io.error("[CLI_USAGE] Unknown cutlist command.\n" + CUTLIST_USAGE);
      return 2;
    }

    if (args[0] === "asset" && args[1] === "media" && args[2] === "rename-selected") {
      const projectId = args[3];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] asset media rename-selected requires <project_id>.");
        return 2;
      }
      printJson(io, await selectedMedia.renameToCutNames(projectId));
      return 0;
    }

    if (isHarden) {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] wf09 harden requires <project_id>.");
        return 2;
      }
      const phase = hardenPhase(args, io);
      if (phase === null) return 2;
      const result = await new Wf09HardenService(projects).run(projectId, phase);
      printJson(io, result);
      return hardenSucceeded(result, phase) ? 0 : 1;
    }

    if (args[0] === "run" && args[1] === "wf09") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] run wf09 requires <project_id> [--file <project-file>].");
        return 2;
      }
      const result = await wf09Auto.run(projectId, {
        ...(readOption(args, "--file") === undefined ? {} : { file: readOption(args, "--file") })
      });
      printJson(io, result);
      return result.execution.failed === 0 ? 0 : 1;
    }

    if (args[1] === "auto" && args[2] === "run") {
      const projectId = args[3];
      if (projectId === undefined || !args.includes("--all")) {
        io.error("[CLI_USAGE] asset auto run requires <project_id> --all [--file <project-file>].");
        return 2;
      }
      const result = await wf09Auto.run(projectId, {
        ...(readOption(args, "--file") === undefined ? {} : { file: readOption(args, "--file") })
      });
      printJson(io, result);
      return result.execution.failed === 0 ? 0 : 1;
    }

    if (args[1] === "auto" && args[2] === "resume") {
      const projectId = args[3];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] asset auto resume requires <project_id>.");
        return 2;
      }
      const result = await wf09Auto.resume(projectId);
      printJson(io, result);
      const retryFailed = result.retry?.failed ?? 0;
      const executeFailed = result.execution?.failed ?? 0;
      return retryFailed === 0 && executeFailed === 0 ? 0 : 1;
    }

    if (args[1] === "auto" && args[2] === "status") {
      const projectId = args[3];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] asset auto status requires <project_id>.");
        return 2;
      }
      printJson(io, await wf09Auto.status(projectId));
      return 0;
    }

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

    if (args[1] === "import" && args[2] === "apply") {
      const projectId = args[3];
      const file = readOption(args, "--file");
      if (projectId === undefined || file === undefined) {
        io.error("[CLI_USAGE] asset import apply requires <project_id> and --file <project-file>.");
        return 2;
      }
      printJson(io, await wf09.applyImports(projectId, file));
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

    if (args[1] === "runtime" && args[2] === "preflight") {
      const projectId = args[3];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] asset runtime preflight requires <project_id>.");
        return 2;
      }
      printJson(io, await wf09b.preflight(projectId));
      return 0;
    }

    if (args[1] === "runtime" && args[2] === "execute") {
      const projectId = args[3];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] asset runtime execute requires <project_id>.");
        return 2;
      }
      const selected = selection(
        args,
        "--asset",
        io,
        "asset runtime execute requires either --all or one/more --asset values."
      );
      if (selected === null) return 2;
      const result = await wf09b.execute(projectId, selected);
      printJson(io, result);
      return result.failed === 0 ? 0 : 1;
    }

    if (args[1] === "runtime" && args[2] === "retry-failed") {
      const projectId = args[3];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] asset runtime retry-failed requires <project_id>.");
        return 2;
      }
      const selected = selection(
        args,
        "--job",
        io,
        "asset runtime retry-failed requires either --all or one/more --job values."
      );
      if (selected === null) return 2;
      const result = await wf09b.retryFailed(projectId, selected);
      printJson(io, result);
      return result.failed === 0 ? 0 : 1;
    }

    if (args[1] === "runtime" && args[2] === "status") {
      const projectId = args[3];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] asset runtime status requires <project_id>.");
        return 2;
      }
      printJson(io, await wf09b.status(projectId));
      return 0;
    }

    if (args[1] === "qc" && args[2] === "apply") {
      const projectId = args[3];
      const file = readOption(args, "--file");
      if (projectId === undefined || file === undefined) {
        io.error("[CLI_USAGE] asset qc apply requires <project_id> and --file <project-file>.");
        return 2;
      }
      printJson(io, await wf09b.applyQc(projectId, file));
      return 0;
    }

    if (args[1] === "approve") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] asset approve requires <project_id>.");
        return 2;
      }
      const selected = selection(
        args,
        "--asset",
        io,
        "asset approve requires either --all or one/more --asset values."
      );
      if (selected === null) return 2;
      printJson(io, await wf09b.approve(projectId, selected, readOption(args, "--approved-by")));
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
      error instanceof RuntimeContractError ||
      error instanceof Wf09CliError ||
      error instanceof Wf09AutoError ||
      error instanceof Wf09HardenError ||
      error instanceof Wf09bCliError ||
      error instanceof Wf10CliError ||
      error instanceof Wf11CliError ||
      error instanceof CutListCliError ||
      error instanceof RenameSelectedMediaError ||
      error instanceof FinalClipValidationError ||
      error instanceof PreLinkHandoffValidationError
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
