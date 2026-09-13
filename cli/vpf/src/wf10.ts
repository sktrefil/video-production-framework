import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import * as path from "node:path";
import type { ProductionLink } from "@vpf/domain";
import type { ProjectStatus } from "@vpf/project-bootstrap";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import type {
  HandoffQcDecision,
  LinkDecisionPort,
  PreLinkDecision
} from "@vpf/production-system";
import {
  PreLinkHandoffPipeline,
  PreLinkHandoffValidationError,
  type PreLinkHandoffIdFactory
} from "@vpf/prelink-handoff";
import { SqlitePreLinkHandoffRepository } from "@vpf/storage/prelink-handoff";

export class Wf10CliError extends Error {
  constructor(
    public readonly code: "WF10_USAGE" | "WF10_INPUT_PATH" | "WF10_INPUT_INVALID" | "WF10_LINK_STATE",
    message: string
  ) {
    super(message);
    this.name = "Wf10CliError";
  }
}

interface FileDecision<T> {
  fromSceneId: string;
  toSceneId: string;
  decision: T;
  confidence: number;
  requiresHumanReview: boolean;
  warnings: string[];
}

interface PreLinkPlan { links: Array<FileDecision<PreLinkDecision>>; }
interface HandoffQcPlan { links: Array<FileDecision<HandoffQcDecision>>; }

const systemClock = { nowIso: () => new Date().toISOString() };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function readProjectJson(projectRoot: string, inputPath: string): Promise<unknown> {
  const root = path.resolve(projectRoot);
  const requested = path.resolve(inputPath);
  if (!isInside(root, requested)) {
    throw new Wf10CliError("WF10_INPUT_PATH", "WF-10 input files must remain inside the current project workspace.");
  }
  let actual: string;
  try {
    actual = await realpath(requested);
  } catch {
    throw new Wf10CliError("WF10_INPUT_PATH", `WF-10 input file does not exist or is unreadable: ${inputPath}`);
  }
  if (!isInside(root, actual)) {
    throw new Wf10CliError("WF10_INPUT_PATH", "WF-10 input symlink resolves outside the current project workspace.");
  }
  try {
    return JSON.parse(await readFile(actual, "utf8")) as unknown;
  } catch {
    throw new Wf10CliError("WF10_INPUT_INVALID", `WF-10 input must contain valid JSON: ${inputPath}`);
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Wf10CliError("WF10_INPUT_INVALID", `${label} is required.`);
  }
  return value.trim();
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item.trim())) {
    throw new Wf10CliError("WF10_INPUT_INVALID", `${label} must be an array of non-empty strings.`);
  }
  return value.map(item => item.trim());
}

function confidence(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Wf10CliError("WF10_INPUT_INVALID", `${label} must be between 0 and 1.`);
  }
  return value;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parsePreLinkDecision(value: unknown, label: string): PreLinkDecision {
  if (!isRecord(value) || typeof value.preLinkRequired !== "boolean") {
    throw new Wf10CliError("WF10_INPUT_INVALID", `${label} must contain preLinkRequired.`);
  }
  const channels = strings(value.handoffChannels, `${label}.handoffChannels`);
  if (!channels.every(item => item === "VISUAL" || item === "AUDIO" || item === "EDIT")) {
    throw new Wf10CliError("WF10_INPUT_INVALID", `${label}.handoffChannels contains an invalid channel.`);
  }
  return {
    preLinkRequired: value.preLinkRequired,
    continuityLevel: text(value.continuityLevel, `${label}.continuityLevel`),
    stateChange: text(value.stateChange, `${label}.stateChange`),
    handoffIntent: text(value.handoffIntent, `${label}.handoffIntent`),
    handoffAnchor: strings(value.handoffAnchor, `${label}.handoffAnchor`),
    handoffChannels: channels as PreLinkDecision["handoffChannels"],
    transitionIntent: text(value.transitionIntent, `${label}.transitionIntent`)
  };
}

function parseHandoffQcDecision(value: unknown, label: string): HandoffQcDecision {
  if (!isRecord(value)) throw new Wf10CliError("WF10_INPUT_INVALID", `${label} must be an object.`);
  const qcStatus = value.qcStatus;
  const severity = value.severity;
  const preLinkMatch = value.preLinkMatch;
  if (!(["PASS", "PASS_WITH_NOTE", "FIXABLE", "REGENERATE", "REDESIGN", "REJECT"] as const).includes(qcStatus as never)) {
    throw new Wf10CliError("WF10_INPUT_INVALID", `${label}.qcStatus is invalid.`);
  }
  if (!(["CRITICAL", "MAJOR", "MINOR"] as const).includes(severity as never)) {
    throw new Wf10CliError("WF10_INPUT_INVALID", `${label}.severity is invalid.`);
  }
  if (!(["MATCH", "PARTIAL", "MISMATCH"] as const).includes(preLinkMatch as never) || typeof value.continuityUsable !== "boolean") {
    throw new Wf10CliError("WF10_INPUT_INVALID", `${label} must contain a valid preLinkMatch and continuityUsable.`);
  }
  return {
    qcStatus: qcStatus as HandoffQcDecision["qcStatus"],
    severity: severity as HandoffQcDecision["severity"],
    confidence: confidence(value.confidence, `${label}.confidence`),
    preLinkMatch: preLinkMatch as HandoffQcDecision["preLinkMatch"],
    continuityUsable: value.continuityUsable,
    ...(optionalText(value.symptom) === undefined ? {} : { symptom: optionalText(value.symptom)! }),
    ...(optionalText(value.rootCause) === undefined ? {} : { rootCause: optionalText(value.rootCause)! }),
    ...(optionalText(value.recommendedAction) === undefined ? {} : { recommendedAction: optionalText(value.recommendedAction)! }),
    ...(optionalText(value.fallback) === undefined ? {} : { fallback: optionalText(value.fallback)! })
  };
}

function parsePlan<T>(value: unknown, kind: "PRE_LINK" | "HANDOFF_QC", parseDecision: (value: unknown, label: string) => T): Array<FileDecision<T>> {
  if (!isRecord(value) || !Array.isArray(value.links) || value.links.length === 0) {
    throw new Wf10CliError("WF10_INPUT_INVALID", `${kind} plan must contain a non-empty links array.`);
  }
  const seen = new Set<string>();
  return value.links.map((candidate, index) => {
    const label = `${kind.toLowerCase()}.links[${index}]`;
    if (!isRecord(candidate)) throw new Wf10CliError("WF10_INPUT_INVALID", `${label} must be an object.`);
    const fromSceneId = text(candidate.fromSceneId, `${label}.fromSceneId`);
    const toSceneId = text(candidate.toSceneId, `${label}.toSceneId`);
    const key = `${fromSceneId}->${toSceneId}`;
    if (seen.has(key)) throw new Wf10CliError("WF10_INPUT_INVALID", `${label} duplicates ${key}.`);
    seen.add(key);
    return {
      fromSceneId,
      toSceneId,
      decision: parseDecision(candidate.decision, `${label}.decision`),
      confidence: candidate.confidence === undefined ? 1 : confidence(candidate.confidence, `${label}.confidence`),
      requiresHumanReview: candidate.requiresHumanReview === true,
      warnings: candidate.warnings === undefined ? [] : strings(candidate.warnings, `${label}.warnings`)
    };
  });
}

function ids(): PreLinkHandoffIdFactory {
  return {
    next(prefix) {
      return `${prefix}_${randomUUID().replaceAll("-", "")}`;
    }
  };
}

function unavailableDecisions(): LinkDecisionPort {
  const unavailable = async (): Promise<never> => {
    throw new Wf10CliError("WF10_USAGE", "This WF-10 operation requires its decision file.");
  };
  return { designPreLink: unavailable, runHandoffQc: unavailable };
}

function fileDecisions(
  entries: Array<FileDecision<PreLinkDecision>>,
  handoffs?: Array<FileDecision<HandoffQcDecision>>
): LinkDecisionPort {
  const byPair = new Map(entries.map(item => [`${item.fromSceneId}->${item.toSceneId}`, item]));
  const handoffByPair = new Map((handoffs ?? []).map(item => [`${item.fromSceneId}->${item.toSceneId}`, item]));
  return {
    async designPreLink(input) {
      const item = byPair.get(`${input.link.fromSceneId}->${input.link.toSceneId}`);
      if (item === undefined) throw new Wf10CliError("WF10_INPUT_INVALID", `Missing PRE_LINK decision for ${input.link.id}.`);
      return {
        decision: item.decision,
        status: "SUCCESS",
        confidence: item.confidence,
        requiresHumanReview: item.requiresHumanReview,
        warnings: item.warnings,
        decisionId: `file_prelink_${input.link.id}`
      };
    },
    async runHandoffQc(input) {
      const item = handoffByPair.get(`${input.link.fromSceneId}->${input.link.toSceneId}`);
      if (item === undefined) throw new Wf10CliError("WF10_INPUT_INVALID", `Missing HANDOFF_QC decision for ${input.link.id}.`);
      return {
        decision: item.decision,
        status: "SUCCESS",
        confidence: item.confidence,
        requiresHumanReview: item.requiresHumanReview,
        warnings: item.warnings,
        decisionId: `file_handoff_qc_${input.link.id}`
      };
    }
  };
}

export class Wf10CliService {
  constructor(private readonly projects: ProjectBootstrapService) {}

  private async withRepository<T>(projectId: string, fn: (repo: SqlitePreLinkHandoffRepository, status: ProjectStatus) => Promise<T>): Promise<T> {
    const status = await this.projects.getStatus(projectId);
    const repo = new SqlitePreLinkHandoffRepository(status.projectDbPath);
    try { return await fn(repo, status); } finally { repo.close(); }
  }

  private pipeline(repo: SqlitePreLinkHandoffRepository, decisions: LinkDecisionPort): PreLinkHandoffPipeline {
    return new PreLinkHandoffPipeline(repo, repo, decisions, systemClock, ids());
  }

  private assertExactPairs(links: ProductionLink[], entries: Array<FileDecision<unknown>>, label: string): void {
    const expected = new Set(links.map(link => `${link.fromSceneId}->${link.toSceneId}`));
    const received = new Set(entries.map(item => `${item.fromSceneId}->${item.toSceneId}`));
    if (expected.size !== received.size || [...expected].some(key => !received.has(key))) {
      throw new Wf10CliError("WF10_INPUT_INVALID", `${label} must provide exactly one decision for every current adjacent Scene Link.`);
    }
  }

  async buildGraph(projectId: string) {
    return this.withRepository(projectId, async (repo, status) => {
      const links = await this.pipeline(repo, unavailableDecisions()).buildLinkGraph({ projectId, format: status.project.format });
      return { projectId, linkCount: links.length, links };
    });
  }

  async applyPreLink(projectId: string, file: string) {
    return this.withRepository(projectId, async (repo, status) => {
      const plan: PreLinkPlan = { links: parsePlan(await readProjectJson(status.projectRoot, file), "PRE_LINK", parsePreLinkDecision) };
      const links = await repo.listActiveLinks(projectId);
      if (links.length === 0) throw new Wf10CliError("WF10_LINK_STATE", "No Link graph exists. Run link graph build first.");
      this.assertExactPairs(links, plan.links, "PRE_LINK plan");
      if (links.some(link => link.linkStatus !== "NOT_PLANNED")) {
        throw new Wf10CliError("WF10_LINK_STATE", "PRE_LINK cannot overwrite an already planned Link. Rebuild/reconcile the graph only after upstream changes.");
      }
      const pipeline = this.pipeline(repo, fileDecisions(plan.links));
      const designed = [];
      const bound = [];
      for (const link of links) {
        const result = await pipeline.designPreLink({ projectId, linkId: link.id, format: status.project.format });
        designed.push({ link: result.link, approval: result.approval ?? null, requiresHumanReview: result.decisionMeta.requiresHumanReview });
        if (result.link.preLinkApprovalId !== undefined) {
          bound.push(await pipeline.bindApprovedAssets({ projectId, linkId: result.link.id }));
        }
      }
      return { projectId, preLinkCount: designed.length, boundCount: bound.length, designed, bound };
    });
  }

  async applyHandoffQc(projectId: string, file: string) {
    return this.withRepository(projectId, async (repo, status) => {
      const plan: HandoffQcPlan = { links: parsePlan(await readProjectJson(status.projectRoot, file), "HANDOFF_QC", parseHandoffQcDecision) };
      const links = await repo.listActiveLinks(projectId);
      this.assertExactPairs(links, plan.links, "HANDOFF_QC plan");
      if (links.some(link => link.linkStatus !== "HANDOFF_QC_PENDING")) {
        throw new Wf10CliError("WF10_LINK_STATE", "Every Link must have approved endpoint Assets bound before HANDOFF_QC.");
      }
      const pipeline = this.pipeline(repo, fileDecisions([], plan.links));
      const results = [];
      for (const link of links) {
        const result = await pipeline.runHandoffQc({ projectId, linkId: link.id, format: status.project.format });
        results.push({ link: result.link, qc: result.qc, requiresHumanReview: result.decisionMeta.requiresHumanReview });
      }
      return { projectId, qcCount: results.length, handoffPassCount: results.filter(item => item.link.linkStatus === "HANDOFF_PASS").length, results };
    });
  }

  async approveHandoffReviews(projectId: string, approvedById?: string) {
    return this.withRepository(projectId, async (repo) => {
      const pipeline = this.pipeline(repo, unavailableDecisions());
      const reviewLinks = (await repo.listActiveLinks(projectId)).filter(link => link.linkStatus === "HANDOFF_NEEDS_REVIEW");
      const results = [];
      for (const link of reviewLinks) results.push(await pipeline.approveHandoffReview({ projectId, linkId: link.id, ...(approvedById === undefined ? {} : { approvedById }) }));
      return { projectId, approvedCount: results.length, results };
    });
  }

  async status(projectId: string) {
    return this.withRepository(projectId, async (repo) => {
      const pipeline = this.pipeline(repo, unavailableDecisions());
      const links = await repo.listActiveLinks(projectId);
      const readiness = await Promise.all(links.map(link => pipeline.getReadiness(projectId, link.id)));
      return {
        projectId,
        linkCount: links.length,
        handoffPassCount: readiness.filter(item => item.handoffPassed).length,
        finalClipDesignReady: links.length > 0 && readiness.every(item => item.finalClipDesignReady),
        readiness,
        links
      };
    });
  }
}
