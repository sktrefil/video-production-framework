#!/usr/bin/env node
import * as path from "node:path";
import {assertNoLegacyReference, LegacyGuardError} from "@vpf/legacy-guard";
import { fileURLToPath } from "node:url";
import {
  ProjectBootstrapError,
  ProjectBootstrapService
} from "@vpf/project-bootstrap";
import { StoryValidationError } from "@vpf/story";
import {
  PilotReadinessService,
  parseMinimumFreeGb
} from "./pilot-readiness.js";
import { Wf07CliError, Wf07CliService } from "./wf07.js";
import { Wf08CliError, Wf08CliService } from "./wf08.js";
import {EditorAssembleError, assembleEditorProject} from "./editor-assemble.js";
import {EditorMediaImportError, importEditorMedia} from "./editor-media-import.js";
import { Agent1ProductionManagerService, ProductionSpecCliError } from "./production-spec-service.js";
import { ProductionSpecRepository } from "@vpf/storage/production-spec";
import { getAgent2TaskInstruction, getAgent3TaskInstruction } from "@vpf/production-spec";
import { Agent1WorkflowOrchestratorService, WorkflowOrchestratorError } from "./workflow-orchestrator-service.js";
import { Agent2StoryAudioWorkerService, Agent2StoryAudioError } from "./agent2-story-audio-service.js";
import { Agent3VisualProductionWorkerService, Agent3VisualProductionError } from "./agent3-visual-production-service.js";
import { Agent2RuntimeAdapterService, Agent2RuntimeAdapterError } from "./agent2-runtime-adapter-service.js";
import { Agent3RuntimeAdapterService, Agent3RuntimeAdapterError } from "./agent3-runtime-adapter-service.js";
import { CodexProcessRunner, CodexRuntimeError } from "./codex-process-runner.js";
import { CodexRuntimeRepository } from "@vpf/storage/codex-runtime";
import { ProductionProgressReporter } from "./production-progress.js";
import { ProductionTerminalProgressRenderer } from "./production-progress-terminal.js";

export interface CliIo {
  out(message: string): void;
  error(message: string): void;
}

const USAGE = `VPF Unified CLI

Commands:
  vpf project create <project_id> --title "..." --format <longform|shortform> [--topic "..."] [--target-duration-sec <seconds>] [--language <code>]
  vpf project set-topic <project_id> --topic "..."
  vpf project status <project_id>
  vpf project upgrade-runtime <project_id>
  vpf project doctor <project_id>
  vpf doctor <project_id>
  vpf env check --format <longform|shortform> [--min-free-gb <number>]
  vpf pilot preflight <project_id> [--min-free-gb <number>]
  vpf editor assemble <project_id> [--header "..."]
  vpf editor media import <project_id>

Production Spec operations:
  vpf production apply-story <project_id> --file <scene-timing-spec.json>
  vpf production apply-clips <project_id> --file <clip-production-spec.json>
  vpf production validate-project <project_id>
  vpf production validate-story <project_id>
  vpf production validate-visual <project_id>
  vpf production validate-states <project_id>
  vpf production validate-clips <project_id>
  vpf production generation-ready <project_id>
  vpf production run <project_id> [--events-jsonl] [--no-progress]

Codex multi-agent runtime:
  vpf codex preflight
  vpf codex status <project_id>

Agent 1 workflow operations:
  vpf workflow status <project_id>
  vpf workflow next <project_id>
  vpf workflow dispatch <project_id> [task_id] [--agent <agent_id>]
  vpf workflow gate <project_id> <task_id> --status <pass|fail> [--reason "..."]
  vpf workflow complete <project_id> <task_id>
  vpf workflow revise <project_id> <task_id>

Agent 2 story/audio operations:
  vpf agent2 instruction <T010|T020|T030>
  vpf agent2 execute <project_id> <T010|T020|T030> --file <json>
  vpf agent2 run <project_id>
  vpf agent2 run-all <project_id>
  vpf agent2 runtime-status <project_id>

Agent 3 visual/production operations:
  vpf agent3 instruction <T040|T050|T060>
  vpf agent3 execute <project_id> <T040|T050|T060> --file <json>
  vpf agent3 run <project_id>
  vpf agent3 run-all <project_id>
  vpf agent3 runtime-status <project_id>

WF-07 story operations:
  vpf script create <project_id> --file <project-file> [--kind <DRAFT|FINAL>]
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
  vpf visual resources sync <project_id>
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
  io.error(`[NOT_IMPLEMENTED] ${command} is reserved by the unified CLI contract but is not implemented in MIG-04.`);
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

const SEMANTIC_OPTION_VALUES = new Set(["--title"]);

function assertCommandArgumentsAreIsolated(args: string[]): void {
  for (let i = 0; i < args.length; i++) {
    if (i > 0 && SEMANTIC_OPTION_VALUES.has(args[i - 1]!)) continue;
    assertNoLegacyReference(args[i]!);
  }
}

function requireOption(args: string[], name: string, io: CliIo, message: string): string | null {
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
    assertCommandArgumentsAreIsolated(args);

    if (args[0] === "project" && args[1] === "create") {
      const projectId = args[2];
      const title = readOption(args, "--title");
      const format = readOption(args, "--format");
      if (projectId === undefined || title === undefined || format === undefined) {
        io.error("[CLI_USAGE] project create requires <project_id>, --title and --format.");
        return 2;
      }
      const targetDurationInput = readOption(args, "--target-duration-sec");
      const targetDurationSec = targetDurationInput === undefined ? undefined : Number(targetDurationInput);
      if (targetDurationSec !== undefined && (!Number.isFinite(targetDurationSec) || targetDurationSec <= 0)) {
        io.error("[CLI_USAGE] --target-duration-sec must be a positive number.");
        return 2;
      }
      const created = await service.createProject({
        projectId,
        title,
        format,
        ...(targetDurationSec === undefined ? {} : { targetDurationSec }),
        ...(readOption(args, "--language") === undefined ? {} : { language: readOption(args, "--language")! }),
        ...(readOption(args, "--topic") === undefined ? {} : { topic: readOption(args, "--topic")! })
      });
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
        legacyAllowed: created.record.legacyAllowed,
        productionSpec: created.projectSpec
      });
      return 0;
    }

    if (args[0] === "project" && args[1] === "set-topic") {
      const projectId = args[2];
      const topic = readOption(args, "--topic");
      if (projectId === undefined || topic === undefined) {
        io.error("[CLI_USAGE] project set-topic requires <project_id> and --topic \"...\".");
        return 2;
      }
      const updated = await service.setProjectTopic(projectId, topic);
      printJson(io, {
        status: "TOPIC_UPDATED",
        projectId: updated.projectId,
        topic: updated.topic,
        projectSpecRevision: updated.projectSpecRevision
      });
      return 0;
    }

    if (args[0] === "project" && args[1] === "upgrade-runtime") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] project upgrade-runtime requires <project_id>.");
        return 2;
      }
      const upgraded = await service.upgradeRuntime(projectId);
      printJson(io, {
        status: "UPGRADED",
        projectId: upgraded.projectId,
        migration: {
          before: {
            appliedCount: upgraded.migrationBefore.appliedCount,
            availableCount: upgraded.migrationBefore.availableCount,
            current: upgraded.migrationBefore.current
          },
          after: {
            latestMigration: upgraded.migrationAfter.latestMigrationId,
            appliedCount: upgraded.migrationAfter.appliedCount,
            availableCount: upgraded.migrationAfter.availableCount,
            current: upgraded.migrationAfter.current
          }
        },
        channelProfile: {
          before: upgraded.previousChannelProfileVersion,
          after: upgraded.currentChannelProfileVersion
        },
        addedProviderProfiles: upgraded.addedProviderProfiles,
        preservedProjectRevision: upgraded.preservedProjectRevision,
        preservedWorkflowState: upgraded.preservedWorkflowState,
        projectSpecBackfilled: upgraded.projectSpecBackfilled,
        workflowBackfilled: upgraded.workflowBackfilled
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
      const productionRepo = new ProductionSpecRepository(
        status.projectDbPath,
        { readonly: true }
      );
      const projectSpec = productionRepo.getProjectSpec(projectId);
      productionRepo.close();
      printJson(io, {
        projectId: status.project.projectId,
        title: status.project.title,
        topic: projectSpec?.topic ?? null,
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
      const result = await readiness.checkEnvironment(format, minimum === undefined ? {} : {minimumFreeBytes: minimum});
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
      const result = await readiness.checkProject(projectId, minimum === undefined ? {} : {minimumFreeBytes: minimum});
      printJson(io, result);
      return result.ready ? 0 : 1;
    }

    const wf07 = new Wf07CliService(service);
    const wf08 = new Wf08CliService(service);
    const production = new Agent1ProductionManagerService(service);
    const workflow = new Agent1WorkflowOrchestratorService(service);
    const agent2 = new Agent2StoryAudioWorkerService(service);
    const agent2Runtime = new Agent2RuntimeAdapterService(service);
    const agent3 = new Agent3VisualProductionWorkerService(service);
    const agent3Runtime = new Agent3RuntimeAdapterService(service);
    const codexRuntime = new CodexProcessRunner();

    if (args[0] === "codex" && args[1] === "preflight") {
      const result = await codexRuntime.preflight();
      printJson(io, result);
      return result.ready ? 0 : 1;
    }

    if (args[0] === "codex" && args[1] === "status") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] codex status requires <project_id>.");
        return 2;
      }
      const status = await service.getStatus(projectId);
      if (!status.migrations.appliedMigrationIds.includes("0023")) {
        io.error("[CODEX_CAPABILITY_MISSING] Project does not include migration 0023.");
        return 1;
      }
      const repository = new CodexRuntimeRepository(
        status.projectDbPath,
        { readonly: true }
      );
      try {
        printJson(io, {
          project_id: projectId,
          runtime_mode: process.env.VPF_AI_RUNTIME_MODE ?? "CODEX_SESSION",
          runs: repository.list(projectId),
          manager_reviews: repository.listManagerReviews(projectId)
        });
      } finally {
        repository.close();
      }
      return 0;
    }

    if (args[0] === "agent2" && args[1] === "instruction") {
      const taskId = args[2];
      if (taskId !== "T010" && taskId !== "T020" && taskId !== "T030") {
        io.error("[CLI_USAGE] agent2 instruction requires <T010|T020|T030>.");
        return 2;
      }
      printJson(io, getAgent2TaskInstruction(taskId));
      return 0;
    }

    if (args[0] === "agent2" && args[1] === "execute") {
      const projectId = args[2];
      const taskId = args[3];
      const file = requireOption(args, "--file", io, "agent2 execute requires --file <json>.");
      if (projectId === undefined || file === null || (taskId !== "T010" && taskId !== "T020" && taskId !== "T030")) {
        if (projectId === undefined || (taskId !== "T010" && taskId !== "T020" && taskId !== "T030")) {
          io.error("[CLI_USAGE] agent2 execute requires <project_id> <T010|T020|T030>.");
        }
        return 2;
      }
      printJson(io, await agent2.execute(projectId, taskId, file));
      return 0;
    }

    if (args[0] === "agent2" && args[1] === "run") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] agent2 run requires <project_id>.");
        return 2;
      }
      printJson(io, await agent2Runtime.runNext(projectId));
      return 0;
    }

    if (args[0] === "agent2" && args[1] === "run-all") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] agent2 run-all requires <project_id>.");
        return 2;
      }
      printJson(io, await agent2Runtime.runAll(projectId));
      return 0;
    }

    if (args[0] === "agent2" && args[1] === "runtime-status") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] agent2 runtime-status requires <project_id>.");
        return 2;
      }
      printJson(io, await agent2Runtime.runtimeStatus(projectId));
      return 0;
    }

    if (args[0] === "agent3" && args[1] === "instruction") {
      const taskId = args[2];
      if (taskId !== "T040" && taskId !== "T050" && taskId !== "T060") {
        io.error("[CLI_USAGE] agent3 instruction requires <T040|T050|T060>.");
        return 2;
      }
      printJson(io, getAgent3TaskInstruction(taskId));
      return 0;
    }

    if (args[0] === "agent3" && args[1] === "execute") {
      const projectId = args[2];
      const taskId = args[3];
      const file = requireOption(args, "--file", io, "agent3 execute requires --file <json>.");
      if (projectId === undefined || file === null || (taskId !== "T040" && taskId !== "T050" && taskId !== "T060")) {
        if (projectId === undefined || (taskId !== "T040" && taskId !== "T050" && taskId !== "T060")) {
          io.error("[CLI_USAGE] agent3 execute requires <project_id> <T040|T050|T060>.");
        }
        return 2;
      }
      printJson(io, await agent3.execute(projectId, taskId, file));
      return 0;
    }

    if (args[0] === "agent3" && args[1] === "run") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] agent3 run requires <project_id>.");
        return 2;
      }
      printJson(io, await agent3Runtime.runNext(projectId));
      return 0;
    }

    if (args[0] === "agent3" && args[1] === "run-all") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] agent3 run-all requires <project_id>.");
        return 2;
      }
      printJson(io, await agent3Runtime.runAll(projectId));
      return 0;
    }

    if (args[0] === "agent3" && args[1] === "runtime-status") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] agent3 runtime-status requires <project_id>.");
        return 2;
      }
      printJson(io, await agent3Runtime.runtimeStatus(projectId));
      return 0;
    }

    if (args[0] === "workflow" && args[1] === "status") {
      const projectId = args[2];
      if (projectId === undefined) { io.error("[CLI_USAGE] workflow status requires <project_id>."); return 2; }
      printJson(io, await workflow.status(projectId));
      return 0;
    }

    if (args[0] === "workflow" && args[1] === "next") {
      const projectId = args[2];
      if (projectId === undefined) { io.error("[CLI_USAGE] workflow next requires <project_id>."); return 2; }
      printJson(io, { project_id: projectId, next_task: await workflow.next(projectId) });
      return 0;
    }

    if (args[0] === "workflow" && args[1] === "dispatch") {
      const projectId = args[2];
      if (projectId === undefined) { io.error("[CLI_USAGE] workflow dispatch requires <project_id>."); return 2; }
      const agent = readOption(args, "--agent");
      printJson(io, await workflow.dispatch(projectId, args[3]?.startsWith("--") ? undefined : args[3], agent as any));
      return 0;
    }

    if (args[0] === "workflow" && args[1] === "gate") {
      const projectId = args[2];
      const taskId = args[3];
      const gateStatus = readOption(args, "--status")?.toLowerCase();
      if (projectId === undefined || taskId === undefined || (gateStatus !== "pass" && gateStatus !== "fail")) {
        io.error("[CLI_USAGE] workflow gate requires <project_id> <task_id> --status <pass|fail>.");
        return 2;
      }
      const reason = readOption(args, "--reason");
      printJson(io, await workflow.recordGate(
        projectId,
        taskId,
        gateStatus === "pass",
        gateStatus === "fail" ? [{ code: "MANUAL_GATE_FAIL", message: reason ?? "Agent 1 gate rejected the task output." }] : []
      ));
      return gateStatus === "pass" ? 0 : 1;
    }

    if (args[0] === "workflow" && args[1] === "complete") {
      const projectId = args[2];
      const taskId = args[3];
      if (projectId === undefined || taskId === undefined) {
        io.error("[CLI_USAGE] workflow complete requires <project_id> <task_id>.");
        return 2;
      }
      printJson(io, await workflow.complete(projectId, taskId));
      return 0;
    }

    if (args[0] === "workflow" && args[1] === "revise") {
      const projectId = args[2];
      const taskId = args[3];
      if (projectId === undefined || taskId === undefined) {
        io.error("[CLI_USAGE] workflow revise requires <project_id> <task_id>.");
        return 2;
      }
      await workflow.requestRevision(projectId, taskId);
      printJson(io, { project_id: projectId, task_id: taskId, status: "REVISION_REQUIRED" });
      return 0;
    }

    if (args[0] === "production" && args[1] === "run") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] production run requires <project_id>.");
        return 2;
      }
      const eventsJsonl = args.includes("--events-jsonl");
      const noProgress = args.includes("--no-progress");
      const initialWorkflow = await workflow.status(projectId);
      const terminalProgress = !eventsJsonl && !noProgress
        ? new ProductionTerminalProgressRenderer(initialWorkflow.tasks, line => io.error(line))
        : null;
      const progress = new ProductionProgressReporter(
        eventsJsonl
          ? event => { io.out(JSON.stringify(event)); }
          : terminalProgress === null
            ? () => undefined
            : event => { terminalProgress.handle(event); }
      );
      const runtimeMode = (process.env.VPF_AI_RUNTIME_MODE ?? "CODEX_SESSION")
        .trim()
        .toUpperCase();

      await progress.emit({
        event: "RUN_STARTED",
        project_id: projectId,
        phase: "PREFLIGHT",
        message: `Production run started in ${runtimeMode} mode.`
      });

      const preflight = runtimeMode === "CODEX_SESSION"
        ? await codexRuntime.preflight()
        : null;
      if (preflight !== null && !preflight.ready) {
        await progress.emit({
          event: "RUN_BLOCKED",
          project_id: projectId,
          phase: "CODEX_PREFLIGHT",
          message: "Codex preflight did not pass."
        });
        if (!eventsJsonl) {
          printJson(io, {
            project_id: projectId,
            status: "BLOCKED",
            stage: "CODEX_PREFLIGHT",
            preflight
          });
        }
        return 1;
      }

      const productionAgent2Runtime = new Agent2RuntimeAdapterService(
        service,
        process.env,
        progress
      );
      const productionAgent3Runtime = new Agent3RuntimeAdapterService(
        service,
        process.env,
        progress
      );

      try {
        const agent2Result = await productionAgent2Runtime.runAll(projectId);
        const agent3Result = await productionAgent3Runtime.runAll(projectId);
        const finalWorkflow = await workflow.status(projectId);
        await progress.emit({
          event: "RUN_FINISHED",
          project_id: projectId,
          next_task: finalWorkflow.next_task?.task_id ?? null,
          next_agent: finalWorkflow.next_task?.assigned_agent ?? null,
          message: finalWorkflow.next_task === null
            ? "Production run reached the end of the current workflow."
            : `Production run stopped at handoff to ${finalWorkflow.next_task.task_id}.`
        });
        if (!eventsJsonl) {
          printJson(io, {
            project_id: projectId,
            status: "RUN_COMPLETE",
            runtime_mode: runtimeMode,
            codex_preflight: preflight,
            agent2: agent2Result,
            agent3: agent3Result,
            next_task: finalWorkflow.next_task
          });
        }
        return 0;
      } catch (error) {
        await progress.emit({
          event: "RUN_BLOCKED",
          project_id: projectId,
          message: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }

    if (args[0] === "production" && (args[1] === "apply-story" || args[1] === "apply-clips")) {
      const projectId = args[2];
      const file = requireOption(args, "--file", io, `production ${args[1]} requires --file <project-file>.`);
      if (projectId === undefined || file === null) {
        if (projectId === undefined) io.error(`[CLI_USAGE] production ${args[1]} requires <project_id>.`);
        return 2;
      }
      const applied = args[1] === "apply-story"
        ? await production.applyStory(projectId, file)
        : await production.applyClips(projectId, file);
      printJson(io, { project_id: projectId, operation: args[1], ...applied });
      return applied.stored ? 0 : 1;
    }

    if (args[0] === "production" && ["validate-project", "validate-story", "validate-visual", "validate-states", "validate-clips", "generation-ready"].includes(args[1] ?? "")) {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error(`[CLI_USAGE] production ${args[1]} requires <project_id>.`);
        return 2;
      }
      const evaluated = args[1] === "validate-project" ? await production.validateProject(projectId)
        : args[1] === "validate-story" ? await production.validateStory(projectId)
        : args[1] === "validate-visual" ? await production.validateVisualPlan(projectId)
        : args[1] === "validate-states" ? await production.validateStateImages(projectId)
        : args[1] === "validate-clips" ? await production.validateClips(projectId)
        : await production.generationReady(projectId);
      if (args[1] === "generation-ready") {
        const status = await service.getStatus(projectId);
        const repository = new ProductionSpecRepository(status.projectDbPath, { readonly: true });
        try {
          const clips = repository.getClipProduction(projectId)?.clips ?? [];
          printJson(io, {
            ...evaluated,
            clips: {
              total: clips.length,
              ready: evaluated.ready_for_generation ? clips.length : 0,
              blocked: evaluated.ready_for_generation ? 0 : clips.length
            }
          });
        } finally { repository.close(); }
      } else printJson(io, evaluated);
      return evaluated.status === "PASS" ? 0 : 1;
    }

    if (args[0] === "visual" && args[1] === "resources" && args[2] === "sync") {
      const projectId = args[3];
      if (projectId === undefined) { io.error("[CLI_USAGE] visual resources sync requires <project_id>."); return 2; }
      printJson(io, await wf08.syncCanonicalVisualResources(projectId));
      return 0;
    }

    if (args[0] === "editor" && args[1] === "assemble") {
      const projectId = args[2];
      if (projectId === undefined) {
        io.error("[CLI_USAGE] editor assemble requires <project_id>.");
        return 2;
      }
      const project = await service.getStatus(projectId);
      const projectRoot = path.resolve(process.cwd(), "workspace", "projects", projectId);
      const result = await assembleEditorProject({
        projectId,
        projectRoot,
        header: readOption(args, "--header") ?? ""
      });
      printJson(io, {status: "ASSEMBLED", projectId: project.project.projectId, ...result});
      return 0;
    }
    if (args[0] === "editor" && args[1] === "media" && args[2] === "import") {
      const projectId=args[3]; if(projectId===undefined){io.error("[CLI_USAGE] editor media import requires <project_id>.");return 2;}
      const root=path.resolve(process.cwd(),"workspace","projects",projectId);
      printJson(io,{status:"IMPORTED",projectId,...importEditorMedia(projectId,root)}); return 0;
    }

    if (args[0] === "visual" && args[1] === "style" && args[2] === "apply") {
      const projectId = args[3];
      const file = requireOption(args, "--file", io, "visual style apply requires --file <project-file>.");
      if (projectId === undefined || file === null) {
        if (projectId === undefined) io.error("[CLI_USAGE] visual style apply requires <project_id>.");
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
      printJson(io, await wf08.approveProjectStyle(projectId, readOption(args, "--approved-by")));
      return 0;
    }

    if (args[0] === "visual" && args[1] === "anchors" && args[2] === "apply") {
      const projectId = args[3];
      const file = requireOption(args, "--file", io, "visual anchors apply requires --file <project-file>.");
      if (projectId === undefined || file === null) {
        if (projectId === undefined) io.error("[CLI_USAGE] visual anchors apply requires <project_id>.");
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
      const anchorIds = readOptions(args, "--anchor");
      if ((!all && anchorIds.length === 0) || (all && anchorIds.length > 0)) {
        io.error("[CLI_USAGE] visual anchors approve requires either --all or one/more --anchor values.");
        return 2;
      }
      printJson(io, await wf08.approveAnchors(projectId, all ? "ALL" : anchorIds, readOption(args, "--approved-by")));
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

    if (args[0] === "script" && args[1] === "approve") {
      const projectId = args[2];
      const scriptId = args[3];
      if (projectId === undefined || scriptId === undefined) {
        io.error("[CLI_USAGE] script approve requires <project_id> <script_id>.");
        return 2;
      }
      printJson(io, await wf07.approveScript(projectId, scriptId, readOption(args, "--approved-by")));
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
      printJson(io, await wf07.approveScenes(projectId, all ? "ALL" : sceneIds, readOption(args, "--approved-by")));
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
      error instanceof StoryValidationError ||
      error instanceof Wf07CliError ||
      error instanceof Wf08CliError ||
      error instanceof ProductionSpecCliError ||
      error instanceof WorkflowOrchestratorError ||
      error instanceof Agent2StoryAudioError ||
      error instanceof Agent2RuntimeAdapterError ||
      error instanceof Agent3RuntimeAdapterError ||
      error instanceof CodexRuntimeError ||
      error instanceof Agent3VisualProductionError ||
      error instanceof EditorAssembleError ||
      error instanceof EditorMediaImportError
    ) {
      io.error(`[${error instanceof EditorAssembleError || error instanceof EditorMediaImportError ? "EDITOR" : error.code}] ${error.message}`);
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
