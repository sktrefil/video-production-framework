import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import * as path from "node:path";
import type {
  FactClassification,
  ResearchSource,
  ScriptVersion
} from "@vpf/domain";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { SqliteStoryRepository } from "@vpf/storage";
import {
  StoryGenerationService,
  StoryPipeline
} from "@vpf/story";

export class Wf07CliError extends Error {
  constructor(
    public readonly code:
      | "WF07_USAGE"
      | "WF07_INPUT_PATH"
      | "WF07_INPUT_INVALID",
    message: string
  ) {
    super(message);
    this.name = "Wf07CliError";
  }
}

const SOURCE_TYPES = new Set<ResearchSource["sourceType"]>([
  "WEB",
  "BOOK",
  "PAPER",
  "ARCHIVE",
  "USER_FILE",
  "OTHER"
]);

const FACT_CLASSIFICATIONS = new Set<FactClassification>([
  "FACT",
  "PLAUSIBLE",
  "INTERPRETATION"
]);

const SCRIPT_KINDS = new Set<ScriptVersion["kind"]>(["DRAFT", "FINAL"]);

function normalizeSourceType(value: string): ResearchSource["sourceType"] {
  const normalized = value.trim().toUpperCase() as ResearchSource["sourceType"];
  if (!SOURCE_TYPES.has(normalized)) {
    throw new Wf07CliError(
      "WF07_USAGE",
      `Unsupported research source type: ${value}. Use WEB, BOOK, PAPER, ARCHIVE, USER_FILE or OTHER.`
    );
  }
  return normalized;
}

function normalizeClassification(value: string): FactClassification {
  const normalized = value.trim().toUpperCase() as FactClassification;
  if (!FACT_CLASSIFICATIONS.has(normalized)) {
    throw new Wf07CliError(
      "WF07_USAGE",
      `Unsupported fact classification: ${value}. Use FACT, PLAUSIBLE or INTERPRETATION.`
    );
  }
  return normalized;
}

function normalizeScriptKind(value: string | undefined): ScriptVersion["kind"] | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toUpperCase() as ScriptVersion["kind"];
  if (!SCRIPT_KINDS.has(normalized)) {
    throw new Wf07CliError(
      "WF07_USAGE",
      `Unsupported script kind: ${value}. Use DRAFT or FINAL.`
    );
  }
  return normalized;
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function readProjectInput(projectRoot: string, inputPath: string): Promise<string> {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedInput = path.resolve(inputPath);
  if (!isInside(resolvedRoot, resolvedInput)) {
    throw new Wf07CliError(
      "WF07_INPUT_PATH",
      "WF-07 input files must remain inside the current project workspace."
    );
  }

  let realInput: string;
  try {
    realInput = await realpath(resolvedInput);
  } catch {
    throw new Wf07CliError(
      "WF07_INPUT_PATH",
      `WF-07 input file does not exist or is unreadable: ${inputPath}`
    );
  }
  if (!isInside(resolvedRoot, realInput)) {
    throw new Wf07CliError(
      "WF07_INPUT_PATH",
      "WF-07 input symlink resolves outside the current project workspace."
    );
  }
  return readFile(realInput, "utf8");
}

interface StoryPlan {
  structure: {
    chapters: Array<{
      key: string;
      displayNumber: number;
      title: string;
    }>;
  };
  sequences: {
    sequences: Array<{
      key: string;
      chapterKey: string;
      displayNumber: number;
      title: string;
      storyPurpose: string;
    }>;
  };
  scenes: {
    scenes: Array<{
      key: string;
      sequenceKey: string;
      displayNumber: number;
      scriptSegment: string;
      stateIn: string;
      stateCurrent: string;
      stateOut: string;
      primaryVisualIdea: string;
      mustBeSeen: string[];
      canBeNarrated: string[];
      canBeImplied: string[];
      requiredIdentityAnchorIds: string[];
    }>;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStoryPlan(text: string): StoryPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Wf07CliError("WF07_INPUT_INVALID", "story-plan.json must contain valid JSON.");
  }
  if (!isRecord(parsed) || !isRecord(parsed.structure) || !isRecord(parsed.sequences) || !isRecord(parsed.scenes)) {
    throw new Wf07CliError(
      "WF07_INPUT_INVALID",
      "story-plan.json must contain structure, sequences and scenes objects."
    );
  }
  if (
    !Array.isArray(parsed.structure.chapters) ||
    !Array.isArray(parsed.sequences.sequences) ||
    !Array.isArray(parsed.scenes.scenes)
  ) {
    throw new Wf07CliError(
      "WF07_INPUT_INVALID",
      "story-plan.json must contain chapters, sequences and scenes arrays."
    );
  }
  return parsed as unknown as StoryPlan;
}

function createIds() {
  return {
    next(prefix: string): string {
      return `${prefix}_${randomUUID().replaceAll("-", "")}`;
    }
  };
}

const systemClock = { nowIso: () => new Date().toISOString() };

export class Wf07CliService {
  constructor(private readonly projects: ProjectBootstrapService) {}

  private async withRepository<T>(
    projectId: string,
    fn: (repo: SqliteStoryRepository, projectRoot: string, format: "LONGFORM" | "SHORTFORM") => Promise<T>
  ): Promise<T> {
    const status = await this.projects.getStatus(projectId);
    const repo = new SqliteStoryRepository(status.projectDbPath);
    try {
      return await fn(repo, status.projectRoot, status.project.format);
    } finally {
      repo.close();
    }
  }

  async createScript(input: {
    projectId: string;
    file: string;
    kind?: string;
  }) {
    return this.withRepository(input.projectId, async (repo, projectRoot) => {
      const body = await readProjectInput(projectRoot, input.file);
      const pipeline = new StoryPipeline(repo, systemClock, createIds());
      return pipeline.createScript({
        projectId: input.projectId,
        body,
        ...(normalizeScriptKind(input.kind) === undefined ? {} : { kind: normalizeScriptKind(input.kind)! })
      });
    });
  }

  async approveScript(projectId: string, scriptId: string, approvedById?: string) {
    return this.withRepository(projectId, async (repo) => {
      const pipeline = new StoryPipeline(repo, systemClock, createIds());
      return pipeline.approveFinalScript({
        projectId,
        scriptId,
        ...(approvedById === undefined ? {} : { approvedById })
      });
    });
  }

  async generateStory(projectId: string, planFile: string) {
    return this.withRepository(projectId, async (repo, projectRoot, format) => {
      const plan = parseStoryPlan(await readProjectInput(projectRoot, planFile));
      const decisions = {
        async designStructure() { return plan.structure; },
        async designSequences() { return plan.sequences; },
        async designScenes() { return plan.scenes; }
      };
      const service = new StoryGenerationService(repo, decisions, systemClock, createIds());
      return service.generate({ projectId, format });
    });
  }

  async status(projectId: string) {
    return this.withRepository(projectId, async (repo) => {
      const scripts = await repo.listScripts(projectId);
      const facts = await repo.listFacts(projectId);
      const graph = await repo.listActiveStory(projectId);
      const structureApproval = await repo.getLatestApproval(projectId, "STORY_STRUCTURE", projectId);
      const scenes = await Promise.all(graph.scenes.map(async (scene) => ({
        ...scene,
        approval: await repo.getLatestApproval(projectId, "SCENE", scene.id)
      })));
      return {
        projectId,
        facts,
        scripts,
        chapters: graph.chapters,
        sequences: graph.sequences,
        scenes,
        structureApproval
      };
    });
  }

  async approveStructure(projectId: string, approvedById?: string) {
    return this.withRepository(projectId, async (repo) => {
      const service = new StoryGenerationService(repo, {
        async designStructure() { throw new Wf07CliError("WF07_USAGE", "Story generation adapter is unavailable during approval."); },
        async designSequences() { throw new Wf07CliError("WF07_USAGE", "Story generation adapter is unavailable during approval."); },
        async designScenes() { throw new Wf07CliError("WF07_USAGE", "Story generation adapter is unavailable during approval."); }
      }, systemClock, createIds());
      return service.approveStructure({ projectId, ...(approvedById === undefined ? {} : { approvedById }) });
    });
  }

  async approveScenes(projectId: string, sceneIds: string[] | "ALL", approvedById?: string) {
    return this.withRepository(projectId, async (repo) => {
      const graph = await repo.listActiveStory(projectId);
      const selected = sceneIds === "ALL" ? graph.scenes.map((scene) => scene.id) : sceneIds;
      if (selected.length === 0) throw new Wf07CliError("WF07_USAGE", "No scenes were selected for approval.");
      const service = new StoryGenerationService(repo, {
        async designStructure() { throw new Wf07CliError("WF07_USAGE", "Story generation adapter is unavailable during approval."); },
        async designSequences() { throw new Wf07CliError("WF07_USAGE", "Story generation adapter is unavailable during approval."); },
        async designScenes() { throw new Wf07CliError("WF07_USAGE", "Story generation adapter is unavailable during approval."); }
      }, systemClock, createIds());
      return service.approveScenes({ projectId, sceneIds: selected, ...(approvedById === undefined ? {} : { approvedById }) });
    });
  }
}
