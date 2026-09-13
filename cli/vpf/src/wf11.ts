import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import * as path from "node:path";
import type { ProductionLink } from "@vpf/domain";
import {
  FinalClipPipeline,
  FinalClipValidationError,
  type FinalClipIdFactory
} from "@vpf/final-clip";
import type { ProjectStatus } from "@vpf/project-bootstrap";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import type {
  FinalClipDesignDecision,
  FinalClipDecisionPort,
  ProductionDecisionWithMeta,
  ProviderPreQcDecision,
  VideoPromptDecision
} from "@vpf/production-system";
import { SqliteFinalClipRepository } from "@vpf/storage/final-clip";

export class Wf11CliError extends Error {
  constructor(
    public readonly code:
      | "WF11_INPUT_PATH"
      | "WF11_INPUT_INVALID"
      | "WF11_LINK_STATE",
    message: string
  ) {
    super(message);
    this.name = "Wf11CliError";
  }
}

interface FileClipDecision {
  fromSceneId: string;
  toSceneId: string;
  decision: FinalClipDesignDecision;
  providerPreQc?: ProviderPreQcDecision;
  videoPrompt?: VideoPromptDecision;
  confidence: number;
  requiresHumanReview: boolean;
  warnings: string[];
}

interface FinalClipPlan {
  clips: FileClipDecision[];
}

const clock = { nowIso: () => new Date().toISOString() };

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
    throw new Wf11CliError("WF11_INPUT_PATH", "WF-11 input files must remain inside the current project workspace.");
  }
  let actual: string;
  try {
    actual = await realpath(requested);
  } catch {
    throw new Wf11CliError("WF11_INPUT_PATH", `WF-11 input file does not exist or is unreadable: ${inputPath}`);
  }
  if (!isInside(root, actual)) {
    throw new Wf11CliError("WF11_INPUT_PATH", "WF-11 input symlink resolves outside the current project workspace.");
  }
  try {
    return JSON.parse(await readFile(actual, "utf8")) as unknown;
  } catch {
    throw new Wf11CliError("WF11_INPUT_INVALID", `WF-11 input must contain valid JSON: ${inputPath}`);
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Wf11CliError("WF11_INPUT_INVALID", `${label} is required.`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item.trim())) {
    throw new Wf11CliError("WF11_INPUT_INVALID", `${label} must be an array of non-empty strings.`);
  }
  return value.map(item => item.trim());
}

function confidence(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Wf11CliError("WF11_INPUT_INVALID", `${label} must be between 0 and 1.`);
  }
  return value;
}

function parseClipDecision(value: unknown, label: string): FinalClipDesignDecision {
  if (!isRecord(value)) throw new Wf11CliError("WF11_INPUT_INVALID", `${label} must be an object.`);
  const implementationType = value.implementationType;
  const transitionMethod = value.transitionMethod;
  if (implementationType !== "CLIP") {
    throw new Wf11CliError("WF11_INPUT_INVALID", `${label}.implementationType must be CLIP.`);
  }
  if (![
    "DIRECT", "HARD_CUT", "MATCH_CUT", "OBJECT_MATCH", "DIRECTION_MATCH",
    "OCCLUSION", "SOUND_BRIDGE", "LIGHT_SHIFT", "RESET"
  ].includes(transitionMethod as string)) {
    throw new Wf11CliError("WF11_INPUT_INVALID", `${label}.transitionMethod is invalid.`);
  }
  const clipMode = value.clipMode;
  if (![
    "DIRECT_START_END_I2V", "SINGLE_IMAGE_I2V", "EDITORIAL_MOVE", "STATIC_HOLD", "REUSE_REFRAME"
  ].includes(clipMode as string)) {
    throw new Wf11CliError("WF11_INPUT_INVALID", `${label}.clipMode is invalid.`);
  }
  const durationMs = value.durationMs;
  if (!Number.isInteger(durationMs) || (durationMs as number) <= 0) {
    throw new Wf11CliError("WF11_INPUT_INVALID", `${label}.durationMs must be a positive integer.`);
  }
  const singleImageSource = value.singleImageSource;
  if (clipMode === "DIRECT_START_END_I2V") {
    if (singleImageSource !== undefined) {
      throw new Wf11CliError("WF11_INPUT_INVALID", `${label}.singleImageSource is not allowed for DIRECT_START_END_I2V.`);
    }
  } else if (singleImageSource !== "FROM" && singleImageSource !== "TO") {
    throw new Wf11CliError("WF11_INPUT_INVALID", `${label}.singleImageSource must be FROM or TO for a single-source clip.`);
  }
  return {
    implementationType: "CLIP",
    clipMode: clipMode as NonNullable<FinalClipDesignDecision["clipMode"]>,
    ...(singleImageSource === undefined ? {} : { singleImageSource: singleImageSource as "FROM" | "TO" }),
    transitionMethod: transitionMethod as FinalClipDesignDecision["transitionMethod"],
    durationMs: durationMs as number,
    cameraMove: text(value.cameraMove, `${label}.cameraMove`),
    subjectMotion: text(value.subjectMotion, `${label}.subjectMotion`),
    environmentMotion: text(value.environmentMotion, `${label}.environmentMotion`),
    rationale: text(value.rationale, `${label}.rationale`),
    additionalAssetRequired: false
  };
}

function parsePreQc(value: unknown, label: string): ProviderPreQcDecision {
  if (!isRecord(value)) throw new Wf11CliError("WF11_INPUT_INVALID", `${label} must be an object.`);
  if (value.status !== "PASS" && value.status !== "NEEDS_REVIEW" && value.status !== "BLOCKED") {
    throw new Wf11CliError("WF11_INPUT_INVALID", `${label}.status is invalid.`);
  }
  if (
    typeof value.safetySafe !== "boolean" ||
    typeof value.capabilityCompatible !== "boolean" ||
    typeof value.requiresAlternativeRepresentation !== "boolean"
  ) {
    throw new Wf11CliError("WF11_INPUT_INVALID", `${label} must contain boolean safety/capability fields.`);
  }
  return {
    status: value.status,
    safetySafe: value.safetySafe,
    capabilityCompatible: value.capabilityCompatible,
    requiresAlternativeRepresentation: value.requiresAlternativeRepresentation,
    issueCodes: strings(value.issueCodes, `${label}.issueCodes`),
    ...(optionalText(value.recommendedAction) === undefined
      ? {}
      : { recommendedAction: optionalText(value.recommendedAction)! })
  };
}

function parsePrompt(value: unknown, label: string): VideoPromptDecision {
  if (!isRecord(value)) throw new Wf11CliError("WF11_INPUT_INVALID", `${label} must be an object.`);
  return {
    prompt: text(value.prompt, `${label}.prompt`),
    ...(optionalText(value.negativePrompt) === undefined
      ? {}
      : { negativePrompt: optionalText(value.negativePrompt)! })
  };
}

function parsePlan(value: unknown): FinalClipPlan {
  if (!isRecord(value) || !Array.isArray(value.clips) || value.clips.length === 0) {
    throw new Wf11CliError("WF11_INPUT_INVALID", "WF-11 Final Clip plan must contain a non-empty clips array.");
  }
  const seen = new Set<string>();
  const clips = value.clips.map((candidate, index) => {
    const label = `clips[${index}]`;
    if (!isRecord(candidate)) throw new Wf11CliError("WF11_INPUT_INVALID", `${label} must be an object.`);
    const fromSceneId = text(candidate.fromSceneId, `${label}.fromSceneId`);
    const toSceneId = text(candidate.toSceneId, `${label}.toSceneId`);
    const key = `${fromSceneId}->${toSceneId}`;
    if (seen.has(key)) throw new Wf11CliError("WF11_INPUT_INVALID", `${label} duplicates ${key}.`);
    seen.add(key);
    const decision = parseClipDecision(candidate.decision, `${label}.decision`);
    const providerRequired = decision.clipMode === "DIRECT_START_END_I2V" || decision.clipMode === "SINGLE_IMAGE_I2V";
    if (providerRequired && (candidate.providerPreQc === undefined || candidate.videoPrompt === undefined)) {
      throw new Wf11CliError("WF11_INPUT_INVALID", `${label} provider clips require providerPreQc and videoPrompt.`);
    }
    if (!providerRequired && (candidate.providerPreQc !== undefined || candidate.videoPrompt !== undefined)) {
      throw new Wf11CliError("WF11_INPUT_INVALID", `${label} editorial clips must not include provider execution data.`);
    }
    return {
      fromSceneId,
      toSceneId,
      decision,
      ...(candidate.providerPreQc === undefined ? {} : { providerPreQc: parsePreQc(candidate.providerPreQc, `${label}.providerPreQc`) }),
      ...(candidate.videoPrompt === undefined ? {} : { videoPrompt: parsePrompt(candidate.videoPrompt, `${label}.videoPrompt`) }),
      confidence: candidate.confidence === undefined ? 1 : confidence(candidate.confidence, `${label}.confidence`),
      requiresHumanReview: candidate.requiresHumanReview === true,
      warnings: candidate.warnings === undefined ? [] : strings(candidate.warnings, `${label}.warnings`)
    };
  });
  return { clips };
}

function ids(): FinalClipIdFactory {
  return { next: prefix => `${prefix}_${randomUUID().replaceAll("-", "")}` };
}

function decisionMeta<T>(entry: FileClipDecision, decision: T, kind: string): ProductionDecisionWithMeta<T> {
  return {
    decision,
    status: "SUCCESS",
    confidence: entry.confidence,
    requiresHumanReview: entry.requiresHumanReview,
    warnings: entry.warnings,
    decisionId: `file_${kind}_${entry.fromSceneId}_${entry.toSceneId}`
  };
}

function fileDecisions(entries: FileClipDecision[]): FinalClipDecisionPort {
  const byPair = new Map(entries.map(item => [`${item.fromSceneId}->${item.toSceneId}`, item]));
  const find = (link: ProductionLink): FileClipDecision => {
    const entry = byPair.get(`${link.fromSceneId}->${link.toSceneId}`);
    if (entry === undefined) throw new Wf11CliError("WF11_INPUT_INVALID", `Missing Final Clip decision for ${link.id}.`);
    return entry;
  };
  return {
    async designFinalClip(input) {
      const entry = find(input.link);
      return decisionMeta(entry, entry.decision, "final_clip_design");
    },
    async runProviderPreQc(input) {
      const entry = find(input.link);
      if (entry.providerPreQc === undefined) {
        throw new Wf11CliError("WF11_INPUT_INVALID", `Missing Provider Pre-QC decision for ${input.link.id}.`);
      }
      return decisionMeta(entry, entry.providerPreQc, "provider_pre_qc");
    },
    async compileVideoPrompt(input) {
      const entry = find(input.link);
      if (entry.videoPrompt === undefined) {
        throw new Wf11CliError("WF11_INPUT_INVALID", `Missing Video Prompt decision for ${input.link.id}.`);
      }
      return decisionMeta(entry, entry.videoPrompt, "video_prompt");
    }
  };
}

export class Wf11CliService {
  constructor(private readonly projects: ProjectBootstrapService) {}

  private async withRepository<T>(projectId: string, fn: (repo: SqliteFinalClipRepository, status: ProjectStatus) => Promise<T>): Promise<T> {
    const status = await this.projects.getStatus(projectId);
    const repo = new SqliteFinalClipRepository(status.projectDbPath);
    try { return await fn(repo, status); } finally { repo.close(); }
  }

  private pipeline(repo: SqliteFinalClipRepository, decisions: FinalClipDecisionPort): FinalClipPipeline {
    return new FinalClipPipeline(repo, repo, decisions, clock, ids());
  }

  private assertExactPairs(links: ProductionLink[], entries: FileClipDecision[]): void {
    const expected = new Set(links.map(link => `${link.fromSceneId}->${link.toSceneId}`));
    const received = new Set(entries.map(item => `${item.fromSceneId}->${item.toSceneId}`));
    if (expected.size !== received.size || [...expected].some(key => !received.has(key))) {
      throw new Wf11CliError("WF11_INPUT_INVALID", "Final Clip plan must provide exactly one design for every current adjacent Scene Link.");
    }
  }

  async applyDesigns(projectId: string, file: string) {
    return this.withRepository(projectId, async (repo, status) => {
      const plan = parsePlan(await readProjectJson(status.projectRoot, file));
      const links = await repo.listActiveLinks(projectId);
      this.assertExactPairs(links, plan.clips);
      if (links.length === 0 || links.some(link => link.linkStatus !== "HANDOFF_PASS" || link.implementationRefId !== undefined)) {
        throw new Wf11CliError("WF11_LINK_STATE", "Every Link must be HANDOFF_PASS and have no existing final implementation before WF-11 design applies.");
      }
      const pipeline = this.pipeline(repo, fileDecisions(plan.clips));
      const results = [];
      for (const link of links) {
        results.push(await pipeline.designFinalImplementation({ projectId, linkId: link.id, format: status.project.format }));
      }
      const clips = results.filter((result): result is Extract<typeof result, { kind: "CLIP" }> => result.kind === "CLIP");
      return {
        projectId,
        designCount: results.length,
        clipCount: clips.length,
        providerClipCount: clips.filter(item => item.clip.providerExecutionRequired).length,
        editorialClipCount: clips.filter(item => !item.clip.providerExecutionRequired).length,
        awaitingHumanApprovalCount: clips.filter(item => item.clip.finalDesignApprovalId === undefined).length,
        results
      };
    });
  }

  async approveAll(projectId: string, approvedById?: string) {
    return this.withRepository(projectId, async repo => {
      const pipeline = this.pipeline(repo, fileDecisions([]));
      const reviewable = (await repo.listActiveClips(projectId)).filter(clip =>
        clip.clipStatus === "DESIGNED" && clip.finalDesignApprovalId === undefined
      );
      const results = [];
      for (const clip of reviewable) {
        results.push(await pipeline.approveFinalClipDesign({
          projectId,
          clipId: clip.id,
          ...(approvedById === undefined ? {} : { approvedById })
        }));
      }
      return { projectId, approvedCount: results.length, results };
    });
  }

  async status(projectId: string) {
    return this.withRepository(projectId, async repo => {
      const pipeline = this.pipeline(repo, fileDecisions([]));
      const clips = await repo.listActiveClips(projectId);
      const readiness = await Promise.all(clips.map(clip => pipeline.getReadiness(projectId, clip.id)));
      return {
        projectId,
        clipCount: clips.length,
        providerClipCount: clips.filter(clip => clip.providerExecutionRequired).length,
        editorialClipCount: clips.filter(clip => !clip.providerExecutionRequired).length,
        finalDesignApprovedCount: readiness.filter(item => item.finalDesignApproved).length,
        editorialReadyCount: readiness.filter(item => item.editorialReady).length,
        videoGenerationReadyCount: readiness.filter(item => item.videoGenerationReady).length,
        awaitingHumanApprovalCount: clips.filter(clip => clip.clipStatus === "DESIGNED" && clip.finalDesignApprovalId === undefined).length,
        readiness,
        clips
      };
    });
  }
}
