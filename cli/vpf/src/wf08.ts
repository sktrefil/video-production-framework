import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectStatus } from "@vpf/project-bootstrap";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import type {
  AnchorPlanDecision,
  ProjectStyleDecision,
  VisualIdentityDecisionPort
} from "@vpf/production-system";
import {
  FileSystemResourceRegistry,
  type ChannelVisualBiblePayload,
  type ResourcePin
} from "@vpf/resource-registry";
import { SqliteVisualIdentityRepository } from "@vpf/storage/visual-identity";
import { VisualIdentityPipeline } from "@vpf/visual-identity";

export class Wf08CliError extends Error {
  constructor(
    public readonly code:
      | "WF08_USAGE"
      | "WF08_INPUT_PATH"
      | "WF08_INPUT_INVALID"
      | "WF08_RESOURCE_PIN",
    message: string
  ) {
    super(message);
    this.name = "Wf08CliError";
  }
}

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const canonicalResourcesRoot = path.join(repositoryRoot, "resources");

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

async function readProjectJson(projectRoot: string, inputPath: string): Promise<unknown> {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedInput = path.resolve(inputPath);
  if (!isInside(resolvedRoot, resolvedInput)) {
    throw new Wf08CliError(
      "WF08_INPUT_PATH",
      "WF-08 input files must remain inside the current project workspace."
    );
  }

  let realInput: string;
  try {
    realInput = await realpath(resolvedInput);
  } catch {
    throw new Wf08CliError(
      "WF08_INPUT_PATH",
      `WF-08 input file does not exist or is unreadable: ${inputPath}`
    );
  }
  if (!isInside(resolvedRoot, realInput)) {
    throw new Wf08CliError(
      "WF08_INPUT_PATH",
      "WF-08 input symlink resolves outside the current project workspace."
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(realInput, "utf8")) as unknown;
  } catch {
    throw new Wf08CliError(
      "WF08_INPUT_INVALID",
      `WF-08 input must contain valid JSON: ${inputPath}`
    );
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Wf08CliError("WF08_INPUT_INVALID", `${label}.${key} must be a non-empty string.`);
  }
  return value;
}

function requireStringArray(record: Record<string, unknown>, key: string, label: string, allowEmpty = true): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || item.trim().length === 0) || (!allowEmpty && value.length === 0)) {
    throw new Wf08CliError("WF08_INPUT_INVALID", `${label}.${key} must be ${allowEmpty ? "an" : "a non-empty"} array of non-empty strings.`);
  }
  return [...value] as string[];
}

export function parseProjectStyleDecision(value: unknown): ProjectStyleDecision {
  if (!isRecord(value)) throw new Wf08CliError("WF08_INPUT_INVALID", "project-style.json must contain a JSON object.");
  return {
    eraRegion: requireString(value, "eraRegion", "project-style.json"),
    visualApproach: requireString(value, "visualApproach", "project-style.json"),
    realismLevel: requireString(value, "realismLevel", "project-style.json"),
    colorLanguage: requireString(value, "colorLanguage", "project-style.json"),
    lightingLanguage: requireString(value, "lightingLanguage", "project-style.json"),
    materialLanguage: requireString(value, "materialLanguage", "project-style.json"),
    environmentLanguage: requireString(value, "environmentLanguage", "project-style.json"),
    characterRenderingPrinciple: requireString(value, "characterRenderingPrinciple", "project-style.json"),
    cameraCompositionTendency: requireString(value, "cameraCompositionTendency", "project-style.json"),
    moodRange: requireStringArray(value, "moodRange", "project-style.json", false),
    factualConstraints: requireStringArray(value, "factualConstraints", "project-style.json"),
    avoidances: requireStringArray(value, "avoidances", "project-style.json")
  };
}

const ANCHOR_TYPES = new Set(["CHARACTER", "LOCATION", "PROP"] as const);
const CONTINUITY_REASONS = new Set(["RECURRING", "CRITICAL_CONTINUITY"] as const);
const PRIORITIES = new Set(["CRITICAL", "IMPORTANT", "SUPPORTING"] as const);

export function parseAnchorPlanDecision(value: unknown): AnchorPlanDecision {
  if (!isRecord(value) || !Array.isArray(value.anchors)) throw new Wf08CliError("WF08_INPUT_INVALID", "identity-anchors.json must contain an anchors array.");
  return {
    anchors: value.anchors.map((candidate, index) => {
      const label = `identity-anchors.json.anchors[${index}]`;
      if (!isRecord(candidate) || !isRecord(candidate.specification)) throw new Wf08CliError("WF08_INPUT_INVALID", `${label} must contain an object specification.`);
      const anchorType = requireString(candidate, "anchorType", label);
      const continuityReason = requireString(candidate, "continuityReason", label);
      const productionPriority = requireString(candidate, "productionPriority", label);
      if (!ANCHOR_TYPES.has(anchorType as "CHARACTER" | "LOCATION" | "PROP")) throw new Wf08CliError("WF08_INPUT_INVALID", `${label}.anchorType must be CHARACTER, LOCATION or PROP.`);
      if (!CONTINUITY_REASONS.has(continuityReason as "RECURRING" | "CRITICAL_CONTINUITY")) throw new Wf08CliError("WF08_INPUT_INVALID", `${label}.continuityReason must be RECURRING or CRITICAL_CONTINUITY.`);
      if (!PRIORITIES.has(productionPriority as "CRITICAL" | "IMPORTANT" | "SUPPORTING")) throw new Wf08CliError("WF08_INPUT_INVALID", `${label}.productionPriority must be CRITICAL, IMPORTANT or SUPPORTING.`);
      return {
        key: requireString(candidate, "key", label),
        anchorType: anchorType as "CHARACTER" | "LOCATION" | "PROP",
        name: requireString(candidate, "name", label),
        rationale: requireString(candidate, "rationale", label),
        continuityReason: continuityReason as "RECURRING" | "CRITICAL_CONTINUITY",
        productionPriority: productionPriority as "CRITICAL" | "IMPORTANT" | "SUPPORTING",
        requiredBySceneIds: requireStringArray(candidate, "requiredBySceneIds", label),
        specification: {
          locked: requireStringArray(candidate.specification, "locked", `${label}.specification`),
          contextual: requireStringArray(candidate.specification, "contextual", `${label}.specification`),
          temporary: requireStringArray(candidate.specification, "temporary", `${label}.specification`)
        }
      };
    })
  };
}

function createIds() {
  return { next(prefix: "sty" | "anc" | "apr" | "evt" | "outbox"): string { return `${prefix}_${randomUUID().replaceAll("-", "")}`; } };
}

const systemClock = { nowIso: () => new Date().toISOString() };

function unavailableDecisions(): VisualIdentityDecisionPort {
  return {
    async designProjectStyle() { throw new Wf08CliError("WF08_USAGE", "Project Style decision input is unavailable for this command."); },
    async planIdentityAnchors() { throw new Wf08CliError("WF08_USAGE", "Identity Anchor decision input is unavailable for this command."); }
  };
}

function visualBiblePin(status: ProjectStatus): ResourcePin {
  const pin = status.resourcePins.find(candidate => candidate.resourceType === "CHANNEL_VISUAL_BIBLE");
  if (pin === undefined) throw new Wf08CliError("WF08_RESOURCE_PIN", "Project is missing its pinned Channel Visual Bible resource.");
  return pin;
}

export class Wf08CliService {
  private readonly registry = new FileSystemResourceRegistry(canonicalResourcesRoot);
  constructor(private readonly projects: ProjectBootstrapService) {}

  private async withRepository<T>(projectId: string, fn: (repo: SqliteVisualIdentityRepository, status: ProjectStatus) => Promise<T>): Promise<T> {
    const status = await this.projects.getStatus(projectId);
    const repo = new SqliteVisualIdentityRepository(status.projectDbPath);
    try { return await fn(repo, status); } finally { repo.close(); }
  }

  private bible(status: ProjectStatus) {
    const pin = visualBiblePin(status);
    return {
      resolve: async (version: string) => {
        if (version !== pin.version) return null;
        const snapshot = await this.registry.resolvePinned<ChannelVisualBiblePayload>(pin);
        return { version: snapshot.version, resourceId: snapshot.resourceId, contentHash: snapshot.contentHash, payload: snapshot.payload };
      }
    };
  }

  async applyProjectStyle(projectId: string, file: string) {
    return this.withRepository(projectId, async (repo, status) => {
      const decision = parseProjectStyleDecision(await readProjectJson(status.projectRoot, file));
      const decisions: VisualIdentityDecisionPort = {
        async designProjectStyle() { return decision; },
        async planIdentityAnchors() { throw new Wf08CliError("WF08_USAGE", "Identity Anchor decision input is unavailable during Project Style apply."); }
      };
      const pipeline = new VisualIdentityPipeline(repo, repo, this.bible(status), decisions, systemClock, createIds());
      return pipeline.generateProjectStyle({ projectId, format: status.project.format, channelVisualBibleVersion: visualBiblePin(status).version });
    });
  }

  async approveProjectStyle(projectId: string, approvedById?: string) {
    return this.withRepository(projectId, async (repo, status) => {
      const pipeline = new VisualIdentityPipeline(repo, repo, this.bible(status), unavailableDecisions(), systemClock, createIds());
      return pipeline.approveProjectStyle({ projectId, ...(approvedById === undefined ? {} : { approvedById }) });
    });
  }

  async status(projectId: string) {
    return this.withRepository(projectId, async (repo, status) => {
      const projectStyle = await repo.getLatestProjectStyle(projectId);
      const identityAnchors = await repo.listActiveAnchors(projectId);
      const projectStyleApproval = projectStyle === null ? null : await repo.getLatestApproval(projectId, "PROJECT_STYLE", projectStyle.id);
      const anchors = await Promise.all(identityAnchors.map(async anchor => ({ ...anchor, approval: await repo.getLatestApproval(projectId, "IDENTITY_ANCHOR", anchor.id) })));
      const pipeline = new VisualIdentityPipeline(repo, repo, this.bible(status), unavailableDecisions(), systemClock, createIds());
      return { projectId, projectStyle: projectStyle === null ? null : { ...projectStyle, approval: projectStyleApproval }, identityAnchors: anchors, readiness: await pipeline.getReadiness(projectId) };
    });
  }
}
