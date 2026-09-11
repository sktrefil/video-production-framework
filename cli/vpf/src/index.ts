#!/usr/bin/env node
import * as path from "node:path";
import {assertNoLegacyReference, LegacyGuardError} from "@vpf/legacy-guard";
import { fileURLToPath } from "node:url";
import {
  ProjectBootstrapError,
  ProjectBootstrapService
} from "@vpf/project-bootstrap";
import { ResourceRegistryError } from "@vpf/resource-registry";
import { StoryValidationError } from "@vpf/story";
import { VisualIdentityValidationError } from "@vpf/visual-identity";
import {
  PilotReadinessService,
  parseMinimumFreeGb
} from "./pilot-readiness.js";
import { Wf07CliError, Wf07CliService } from "./wf07.js";
import { Wf08CliError, Wf08CliService } from "./wf08.js";

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
  vpf env check --format <longform|shortform> [--min-free-gb <number>]
  vpf pilot preflight <project_id> [--min-free-gb <number>]

WF-07 story operations:
  vpf research add <project_id> --title "..." --type <WEB|BOOK|PAPER|ARCHIVE|USER_FILE|OTHER> [--url "..."] [--citation "..."] [--notes "..."]
  vpf fact add <project_id> --classification <FACT|PLAUSIBLE|INTERPRETATION> --statement "..." [--source <source_id>]...
  vpf fact approve <project_id> <fact_id>
  vpf script create <project_id> --file <project-file> [--kind <DRAFT|FINAL>]
  vpf script revise <project_id> <script_id> --file <project-file> [--kind <DRAFT|FINAL>]
  vpf script approve <project_id> <script_id> [--approved-by <id>]
  vpf story generate <project_id> --plan <project-file>
  vpf story status <project_id>
  vpf story approve-structure <project_id> [--approved-by <id>]
  vpf story approve-scenes <project_id> (--all | --scene <scene_id>...) [--approved-by <id>]

WF-08 visual identity operations:
  vpf visual style apply <project_id> --file <project-file>
  vpf visual style approve <project_id> [--approved-by <id>]
  vpf visual anchors apply <project_id> --file <project-file>
  vpf visual anchors approve <project_id> (--all | --anchor <anchor_id>...) [--approved-by <id>]
  vpf visual status <project_id>
`;

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function readOptions(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === name) values.push(args[i + 1]!);
  }
  return values;
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

const SEMANTIC_OPTION_VALUES = new Set([
  "--title",
  "--statement",
  "--url",
  "--citation",
  "--notes"
]);

function assertCommandArgumentsAreIsolated(args: string[]): void {
  for (let i = 0; i < args.length; i++) {
    if (i > 0 && SEMANTIC_OPTION_VALUES.has(args[i - 1]!)) continue;
    assertNoLegacyReference(args[i]!);
  }
}

function requireOption(
  args: string[],
  name: string,
  io: CliIo,
  message: string
): string | null {
  const value = readOption(args, name);
  if (value === undefined) {
    io.error(`[CLI_USAGE] ${message}`);
    return null;
  }
  return value;
}

export async function runCli(
  args: string[],
  io: CliIo = {
    out: (message) => console.log(message),
    error: (message) => console.error(message)
  },
  service: ProjectBootstrapService = new ProjectBootstrapService(),
  readinessService?: PilotReadinessService
): Promise<number> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    io.out(USAGE);
    return 0;
  }

  try {
    // Human prose and citations are content, not executable references. Commands and paths remain guarded.
    assertCommandArgumentsAreIsolated(args);

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

    const wf07 = new Wf07CliService(service);

    if (args[0] === "research" && args[1] === "add") {
      const projectId = args[2];
      const title = readOption(args, "--title");
      const sourceType = readOption(args, "--type");
      if (projectId === undefined || title === undefined || sourceType === undefined) {
        io.error("[CLI_USAGE] research add requires <project_id>, --title and --type.");
        return 2;
      }
      printJson(io, await wf07.addResearch({
        projectId,
        title,
        sourceType,
        ...(readOption(args, "--url") === undefined ? {} : { url: readOption(args, "--url")! }),
        ...(readOption(args, "--citation") === undefined ? {} : { citation: readOption(args, "--citation")! }),
        ...(readOption(args, "--notes") === undefined ? {} : { notes: readOption(args, "--notes")! })
      }));
      return 0;
    }

    if (args[0] === "fact" && args[1] === "add") {
      const projectId = args[2];
      const classification = readOption(args, "--classification");
      const statement = readOption(args, "--statement");
      if (projectId === undefined || classification === undefined || statement === undefined) {
        io.error("[CLI_USAGE] fact add requires <project_id>, --classification and --statement.");
        return 2;
      }
      const sourceIds = readOptions(args, "--source")
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      printJson(io, await wf07.addFact({ projectId, classification, statement, sourceIds }));
      return 0;
    }

    if (args[0] === "fact" && args[1] === "approve") {
      const projectId = args[2];
      const factId = args[3];
      if (projectId === undefined || factId === undefined) {
        io.error("[CLI_USAGE] fact approve requires <project_id> <fact_id>.");
        return 2;
      }
      printJson(io, await wf07.approveFact(projectId, factId));
      return 0;
    }

    if (args[0] === "script" && args[1] === "create") {
      const projectId = args[2];
      const file = requireOption(args, "--file", io, "script create requires --file <project-file>.");
      if (projectId === undefined || file === null) {
        if (projectId === undefined) io.error("[CLI_USAGE] script create requires <project_id>.");
        return 2;
      }
      printJson(io, await wf07.createScript({
        projectId,
        file,
        ...(readOption(args, "--kind") === undefined ? {} : { kind: readOption(args, "--kind")! })
      }));
      return 0;
    }

    if (args[0] === "script" && args[1] === "revise") {
      const projectId = args[2];
      const scriptId = args[3];
      const file = requireOption(args, "--file", io, "script revise requires --file <project-file>.");
      if (projectId === undefined || scriptId === undefined || file === null) {
        if (projectId === undefined || scriptId === undefined) {
          io.error("[CLI_USAGE] script revise requires <project_id> <script_id>.");
        }
        return 2;
      }
      printJson(io, await wf07.reviseScript({
        projectId,
        scriptId,
        file,
        ...(readOption(args, "--kind") === undefined ? {} : { kind: readOption(args, "--kind")! })
      }));
      return 0;
    }

    if (args[0] === "script" && args[1] === "approve") {
      const projectId = args[2];
      const scriptId = args[3];
      if (projectId === undefined || scriptId === undefined) {
        io.error("[CLI_USAGE] script approve requires <project_id> <script_id>.");
        return 2;
      }
      printJson(io, await wf07.approveScript(
        projectId,
        scriptId,
        readOption(args, "--approved-by")
      ));
      return 0;
    }

    if (args[0] === "story" && args[1] === "generate") {
      const projectId = args[2];
      const plan = requireOption(args, "--plan", io, "story generate requires --plan <project-file>.");
      if (projectId === undefined || plan === null) {
        if (projectId === undefined) io.error("[CLI_USAGE] story generate requires <project_id>.");
        return 2;
      }
      const graph = await wf07.generateStory(projectId, plan);
      printJson(io, {
        projectId,
        chapterCount: graph.chapters.length,
        sequenceCount: graph.sequences.length,
        sceneCount: graph.scenes.length,
        chapters: graph.chapters,
        sequences: graph.sequences,
        scenes: graph.scenes
      });
      return 0;
    }

    if (args[0] === "story" && args[1] === "status") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] story status requires <project_id>.");
        return 2;
      }
      printJson(io, await wf07.status(projectId));
      return 0;
    }

    if (args[0] === "story" && args[1] === "approve-structure") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] story approve-structure requires <project_id>.");
        return 2;
      }
      printJson(io, await wf07.approveStructure(projectId, readOption(args, "--approved-by")));
      return 0;
    }

    if (args[0] === "story" && args[1] === "approve-scenes") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] story approve-scenes requires <project_id>.");
        return 2;
      }
      const all = args.includes("--all");
      const sceneIds = readOptions(args, "--scene");
      if ((!all && sceneIds.length === 0) || (all && sceneIds.length > 0)) {
        io.error("[CLI_USAGE] story approve-scenes requires either --all or one/more --scene values.");
        return 2;
      }
      printJson(io, await wf07.approveScenes(
        projectId,
        all ? "ALL" : sceneIds,
        readOption(args, "--approved-by")
      ));
      return 0;
    }

    const wf08 = new Wf08CliService(service);

    if (args[0] === "visual" && args[1] === "style" && args[2] === "apply") {
      const projectId = args[3];
      const file = requireOption(
        args,
        "--file",
        io,
        "visual style apply requires --file <project-file>."
      );
      if (projectId === undefined || file === null) {
        if (projectId === undefined) {
          io.error("[CLI_USAGE] visual style apply requires <project_id>.");
        }
        return 2;
      }
      printJson(io, await wf08.applyProjectStyle(projectId, file));
      return 0;
    }

    if (args[0] === "visual" && args[1] === "style" && args[2] === "approve") {
      const projectId = args[3];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] visual style approve requires <project_id>.");
        return 2;
      }
      printJson(io, await wf08.approveProjectStyle(
        projectId,
        readOption(args, "--approved-by")
      ));
      return 0;
    }

    if (args[0] === "visual" && args[1] === "anchors" && args[2] === "apply") {
      const projectId = args[3];
      const file = requireOption(
        args,
        "--file",
        io,
        "visual anchors apply requires --file <project-file>."
      );
      if (projectId === undefined || file === null) {
        if (projectId === undefined) {
          io.error("[CLI_USAGE] visual anchors apply requires <project_id>.");
        }
        return 2;
      }
      printJson(io, await wf08.applyIdentityAnchors(projectId, file));
      return 0;
    }

    if (args[0] === "visual" && args[1] === "anchors" && args[2] === "approve") {
      const projectId = args[3];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] visual anchors approve requires <project_id>.");
        return 2;
      }
      const all = args.includes("--all");
      const anchorIds = readOptions(args, "--anchor")
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      if ((!all && anchorIds.length === 0) || (all && anchorIds.length > 0)) {
        io.error("[CLI_USAGE] visual anchors approve requires either --all or one/more --anchor values.");
        return 2;
      }
      printJson(io, await wf08.approveIdentityAnchors(
        projectId,
        all ? "ALL" : anchorIds,
        readOption(args, "--approved-by")
      ));
      return 0;
    }

    if (args[0] === "visual" && args[1] === "status") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] visual status requires <project_id>.");
        return 2;
      }
      printJson(io, await wf08.status(projectId));
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
      error instanceof ResourceRegistryError ||
      error instanceof StoryValidationError ||
      error instanceof VisualIdentityValidationError ||
      error instanceof Wf07CliError ||
      error instanceof Wf08CliError
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
