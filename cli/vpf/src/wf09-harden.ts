import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ProductionAsset, Scene } from "@vpf/domain";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { createStandardThreeTierReferenceSelector } from "@vpf/reference-library/tiered-selector";
import { Wf07CliService } from "./wf07.js";
import { Wf09AutoService } from "./wf09-auto.js";
import { Wf09bCliService } from "./wf09b.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

export type Wf09HardenPhase = "reference" | "browser" | "canary" | "batch" | "qc" | "all";

export class Wf09HardenError extends Error {
  constructor(
    public readonly code:
      | "WF09_HARDEN_USAGE"
      | "WF09_HARDEN_REFERENCE"
      | "WF09_HARDEN_BROWSER"
      | "WF09_HARDEN_CANARY"
      | "WF09_HARDEN_BATCH",
    message: string
  ) {
    super(message);
    this.name = "Wf09HardenError";
  }
}

function classifyKnfBeat(scene: Scene): string {
  const text = [scene.scriptSegment, scene.primaryVisualIdea, ...scene.mustBeSeen].join(" ").toLowerCase();
  if (/[?？]|어디|왜|사라|실종|mystery|question|vanish|disappear/u.test(text) && scene.displayNumber === 1) return "HOOK QUESTION";
  if (/하지만|그러나|반면|실제로|contrast|however|reveal/u.test(text)) return "CONTRAST REVEAL";
  if (/비문|기록|연대|타임라인|증거|inscription|record|evidence|124|107|108/u.test(text)) return "EVIDENCE";
  if (/지도|경로|마지막|어디|map|route|close|마무리/u.test(text)) return "MAP CLOSE";
  return "DEVELOPMENT EXPLANATION";
}

function approvedScene(scene: Scene & { approval?: { approvalState?: string } | null }): boolean {
  return !scene.stale &&
    ["APPROVED", "IN_PRODUCTION", "PRODUCTION_COMPLETE"].includes(scene.sceneStatus) &&
    ["HUMAN_APPROVED", "AUTO_APPROVED"].includes(scene.approval?.approvalState ?? "");
}

function canaryPassed(asset: ProductionAsset | undefined): boolean {
  return asset?.assetStatus === "APPROVED" && !asset.stale;
}

function terminalReusable(asset: ProductionAsset): boolean {
  return ["CANDIDATE_AVAILABLE", "NEEDS_REVIEW", "APPROVED"].includes(asset.assetStatus) && !asset.stale;
}

interface BrowserProbeAdapter {
  healthcheck?: () => Promise<Record<string, unknown>>;
}

async function loadProbeAdapter(modulePath: string): Promise<BrowserProbeAdapter> {
  const specifier = path.isAbsolute(modulePath) || path.win32.isAbsolute(modulePath)
    ? pathToFileURL(modulePath).href
    : modulePath.startsWith(".")
      ? pathToFileURL(path.resolve(modulePath)).href
      : modulePath;
  const loaded = await import(specifier) as Record<string, unknown>;
  const candidate = loaded.default as BrowserProbeAdapter | undefined;
  if (candidate === undefined || typeof candidate.healthcheck !== "function") {
    throw new Wf09HardenError(
      "WF09_HARDEN_BROWSER",
      "The selected image adapter does not expose the required healthcheck() browser probe."
    );
  }
  return candidate;
}

export class Wf09HardenService {
  private readonly wf07: Wf07CliService;
  private readonly auto: Wf09AutoService;
  private readonly runtime: Wf09bCliService;

  constructor(private readonly projects: ProjectBootstrapService) {
    this.wf07 = new Wf07CliService(projects);
    this.auto = new Wf09AutoService(projects);
    this.runtime = new Wf09bCliService(projects);
  }

  private async orderedScenes(projectId: string): Promise<Array<Scene & { approval?: { approvalState?: string } | null }>> {
    const story = await this.wf07.status(projectId);
    const sequenceOrder = new Map(story.sequences.map(sequence => [sequence.id, sequence.displayNumber]));
    return story.scenes
      .filter(approvedScene)
      .sort((left, right) => {
        const sequenceDelta = (sequenceOrder.get(left.sequenceId) ?? 0) - (sequenceOrder.get(right.sequenceId) ?? 0);
        return sequenceDelta !== 0 ? sequenceDelta : left.displayNumber - right.displayNumber;
      });
  }

  private async prepared(projectId: string) {
    return await this.auto.prepare(projectId);
  }

  async referenceGate(projectId: string) {
    await this.prepared(projectId);
    const scenes = await this.orderedScenes(projectId);
    if (scenes.length < 2) {
      throw new Wf09HardenError("WF09_HARDEN_REFERENCE", "Reference gate requires at least two approved Scenes.");
    }
    const selector = createStandardThreeTierReferenceSelector(repositoryRoot, projectId);
    const probes = [scenes[0]!, scenes[scenes.length - 1]!];
    const results = [];
    for (const scene of probes) {
      const selected = await selector.selectReferencesDetailed({
        projectId,
        scene: {
          id: scene.id,
          scriptSegment: scene.scriptSegment,
          primaryVisualIdea: scene.primaryVisualIdea,
          mustBeSeen: scene.mustBeSeen
        },
        knfBeat: classifyKnfBeat(scene)
      });
      if (selected.counts.GLOBAL_VISUAL < 2 || selected.counts.KNF_LAYOUT !== 1) {
        throw new Wf09HardenError(
          "WF09_HARDEN_REFERENCE",
          `Scene ${scene.id} did not resolve the required compact GLOBAL_VISUAL + KNF_LAYOUT set.`
        );
      }
      results.push({
        sceneId: scene.id,
        knfBeat: classifyKnfBeat(scene),
        counts: selected.counts,
        references: selected.references.map(reference => ({
          role: reference.role,
          relativePath: reference.relativePath,
          sha256: reference.sha256
        }))
      });
    }
    return {
      gate: "REFERENCE",
      status: "PASS",
      policy: "SCENE_AWARE_COMPACT_GLOBAL_GRAMMAR",
      canaryScenes: probes.map(scene => scene.id),
      results
    };
  }

  async browserGate(projectId: string) {
    await this.prepared(projectId);
    const adapterModule = this.auto.ensureAdapterModule();
    const adapter = await loadProbeAdapter(adapterModule);
    let probe: Record<string, unknown>;
    try {
      probe = await adapter.healthcheck!();
    } catch (error) {
      throw new Wf09HardenError(
        "WF09_HARDEN_BROWSER",
        `Browser probe failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    if (probe.status !== "READY" || probe.composerVisible !== true) {
      throw new Wf09HardenError("WF09_HARDEN_BROWSER", "Browser probe did not reach a ready logged-in ChatGPT composer.");
    }
    return {
      gate: "BROWSER",
      status: "PASS",
      invariants: [
        "CLEAN_TAB_PER_JOB",
        "STATE_DRIVEN_ATTACHMENT_WAIT",
        "ATTACHMENT_COUNT_VERIFIED",
        "PROMPT_TEXT_VERIFIED_BEFORE_SEND",
        "GENERATION_START_VERIFIED",
        "STABLE_IMAGE_AND_STOP_STATE_REQUIRED"
      ],
      probe
    };
  }

  private async executeLifecycleAware(projectId: string, assetIds: string[]) {
    let status = await this.runtime.status(projectId);
    const target = new Set(assetIds);
    const failedJobIds = status.jobs
      .filter(job => target.has(job.assetId) && job.status === "FAILED")
      .map(job => job.id);
    const retry = failedJobIds.length > 0
      ? await this.runtime.retryFailed(projectId, failedJobIds)
      : null;

    status = await this.runtime.status(projectId);
    const designedIds = status.assets
      .filter(asset => target.has(asset.id) && asset.assetStatus === "DESIGNED" && !asset.stale && Boolean(asset.design.imagePrompt?.trim()))
      .map(asset => asset.id);
    const execution = designedIds.length > 0
      ? await this.runtime.execute(projectId, designedIds)
      : null;

    status = await this.runtime.status(projectId);
    const assets = status.assets.filter(asset => target.has(asset.id));
    return {
      retry,
      execution,
      states: assets.map(asset => ({
        assetId: asset.id,
        sceneId: asset.owner.id,
        assetStatus: asset.assetStatus,
        reused: terminalReusable(asset),
        stale: asset.stale
      }))
    };
  }

  async canaryGate(projectId: string) {
    await this.referenceGate(projectId);
    await this.browserGate(projectId);
    const scenes = await this.orderedScenes(projectId);
    const canaryScenes = [scenes[0]!, scenes[scenes.length - 1]!];
    const before = await this.runtime.status(projectId);
    const assets = canaryScenes.map(scene => {
      const asset = before.assets.find(candidate => candidate.owner.type === "SCENE" && candidate.owner.id === scene.id);
      if (asset === undefined) throw new Wf09HardenError("WF09_HARDEN_CANARY", `Canary Scene ${scene.id} has no PRIMARY_SCENE Asset.`);
      return asset;
    });

    const lifecycle = await this.executeLifecycleAware(projectId, assets.map(asset => asset.id));
    const after = await this.runtime.status(projectId);
    const finalAssets = assets.map(asset => after.assets.find(candidate => candidate.id === asset.id));
    const approved = finalAssets.filter(canaryPassed).length;
    const generated = finalAssets.filter(asset => asset !== undefined && terminalReusable(asset)).length;
    return {
      gate: "CANARY",
      status: approved === finalAssets.length ? "PASS" : generated === finalAssets.length ? "AWAITING_QC" : "BLOCKED",
      canary: finalAssets.map((asset, index) => ({
        sceneId: canaryScenes[index]!.id,
        assetId: asset?.id ?? null,
        assetStatus: asset?.assetStatus ?? "MISSING",
        approved: canaryPassed(asset)
      })),
      lifecycle,
      nextAction: approved === finalAssets.length
        ? "BATCH_UNLOCKED"
        : generated === finalAssets.length
          ? "Review both canary images, apply IMAGE_QC, and approve them before batch generation."
          : "Fix failed canary generation before batch generation."
    };
  }

  async batchGate(projectId: string) {
    await this.referenceGate(projectId);
    await this.browserGate(projectId);
    const scenes = await this.orderedScenes(projectId);
    const canarySceneIds = new Set([scenes[0]!.id, scenes[scenes.length - 1]!.id]);
    const before = await this.runtime.status(projectId);
    const canaryAssets = before.assets.filter(asset => asset.owner.type === "SCENE" && canarySceneIds.has(asset.owner.id));
    if (canaryAssets.length !== 2 || !canaryAssets.every(canaryPassed)) {
      return {
        gate: "BATCH",
        status: "BLOCKED",
        nextAction: "Canary Scene 1 and final Scene must both be IMAGE_QC-passed and APPROVED before batch generation.",
        canary: canaryAssets.map(asset => ({ sceneId: asset.owner.id, assetId: asset.id, assetStatus: asset.assetStatus }))
      };
    }

    const remaining = before.assets.filter(asset => asset.owner.type === "SCENE" && !canarySceneIds.has(asset.owner.id));
    const lifecycle = await this.executeLifecycleAware(projectId, remaining.map(asset => asset.id));
    const after = await this.runtime.status(projectId);
    const remainingAfter = after.assets.filter(asset => asset.owner.type === "SCENE" && !canarySceneIds.has(asset.owner.id));
    const incomplete = remainingAfter.filter(asset => !terminalReusable(asset));
    return {
      gate: "BATCH",
      status: incomplete.length === 0 ? "PASS" : "PARTIAL",
      requestedAssets: remaining.length,
      reusedAssets: lifecycle.states.filter(item => item.reused).length,
      incompleteAssets: incomplete.map(asset => ({ assetId: asset.id, sceneId: asset.owner.id, assetStatus: asset.assetStatus })),
      lifecycle,
      nextAction: incomplete.length === 0 ? "RUN_QC" : "Retry only incomplete/failed assets; completed candidates remain untouched."
    };
  }

  async qcGate(projectId: string) {
    await this.prepared(projectId);
    const status = await this.runtime.status(projectId);
    const pending = status.assets.filter(asset => ["CANDIDATE_AVAILABLE", "NEEDS_REVIEW"].includes(asset.assetStatus));
    const blocked = status.assets.filter(asset => ["BLOCKED", "REGENERATE_REQUIRED"].includes(asset.assetStatus) || asset.stale);
    return {
      gate: "QC",
      status: blocked.length > 0 ? "BLOCKED" : pending.length > 0 ? "AWAITING_QC" : status.assets.every(asset => asset.assetStatus === "APPROVED") ? "PASS" : "PENDING",
      pending: pending.map(asset => ({
        sceneId: asset.owner.id,
        assetId: asset.id,
        candidateMediaIds: asset.candidateMediaIds,
        requiredChecks: ["REFERENCE_QC", "COMPOSITION_QC", "HISTORICAL_QC", "TECHNICAL_QC"]
      })),
      blocked: blocked.map(asset => ({ sceneId: asset.owner.id, assetId: asset.id, assetStatus: asset.assetStatus, stale: asset.stale })),
      approvedCount: status.approvedCount,
      assetCount: status.assetCount
    };
  }

  async run(projectId: string, phase: Wf09HardenPhase) {
    if (phase === "reference") return await this.referenceGate(projectId);
    if (phase === "browser") return await this.browserGate(projectId);
    if (phase === "canary") return await this.canaryGate(projectId);
    if (phase === "batch") return await this.batchGate(projectId);
    if (phase === "qc") return await this.qcGate(projectId);
    if (phase !== "all") throw new Wf09HardenError("WF09_HARDEN_USAGE", `Unsupported hardening phase: ${phase}`);

    const reference = await this.referenceGate(projectId);
    const browser = await this.browserGate(projectId);
    const canary = await this.canaryGate(projectId);
    if (canary.status !== "PASS") {
      return {
        projectId,
        completed: false,
        stoppedAt: "CANARY",
        reference,
        browser,
        canary,
        nextAction: canary.nextAction
      };
    }
    const batch = await this.batchGate(projectId);
    if (batch.status !== "PASS") {
      return {
        projectId,
        completed: false,
        stoppedAt: "BATCH",
        reference,
        browser,
        canary,
        batch,
        nextAction: batch.nextAction
      };
    }
    const qc = await this.qcGate(projectId);
    return {
      projectId,
      completed: qc.status === "PASS",
      stoppedAt: qc.status === "PASS" ? null : "QC",
      reference,
      browser,
      canary,
      batch,
      qc,
      nextAction: qc.status === "PASS" ? "WF09_COMPLETE" : "Review pending images, apply IMAGE_QC, and approve passing candidates."
    };
  }
}
