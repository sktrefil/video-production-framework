import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Scene, VersionPins } from "@vpf/domain";
import {
  ProjectBootstrapService,
  type ProjectStatus
} from "@vpf/project-bootstrap";
import {
  FileSystemResourceRegistry,
  type ResourcePin
} from "@vpf/resource-registry";
import { SqliteSceneAssetRepository } from "@vpf/storage/scene-assets";
import { Wf07CliService } from "./wf07.js";
import { Wf08CliService } from "./wf08.js";
import { Wf09CliService } from "./wf09.js";
import { Wf09bCliService } from "./wf09b.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const resourcesRoot = path.join(repositoryRoot, "resources");
const targetChannel = { resourceId: "HISTORY_MYSTERY_V1", version: "1.4.0" } as const;
const targetVisualBible = { resourceId: "HISTORY_MYSTERY_VISUAL_BIBLE", version: "1.1.0" } as const;
const targetImageProvider = { resourceId: "IMAGE_PROVIDER_EXECUTION_V1", version: "1.2.0" } as const;

export class Wf09AutoError extends Error {
  constructor(
    public readonly code:
      | "WF09_AUTO_RESOURCE_PIN"
      | "WF09_AUTO_PROJECT_STATE"
      | "WF09_AUTO_PLAN_MISSING",
    message: string
  ) {
    super(message);
    this.name = "Wf09AutoError";
  }
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function writeTextAtomic(filename: string, value: string): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, value, "utf8");
  await rename(temporary, filename);
}

async function writeJsonAtomic(filename: string, value: unknown): Promise<void> {
  await writeTextAtomic(filename, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeProjectSnapshot(status: ProjectStatus): Promise<void> {
  await writeJsonAtomic(path.join(status.projectRoot, "project.json"), {
    schemaVersion: 1,
    projectId: status.project.projectId,
    title: status.project.title,
    format: status.project.format,
    revision: status.project.revision,
    lifecycleStatus: status.project.lifecycleStatus,
    pipeline: status.pipeline,
    legacyAllowed: status.legacyAllowed,
    versions: status.project.versions,
    resourcePins: status.resourcePins
  });
}

function pin(status: ProjectStatus, resourceType: ResourcePin["resourceType"], resourceId: string): ResourcePin | undefined {
  return status.resourcePins.find(candidate => candidate.resourceType === resourceType && candidate.resourceId === resourceId);
}

function imageProviderPin(status: ProjectStatus): ResourcePin | undefined {
  return pin(status, "PROVIDER_PROFILE", targetImageProvider.resourceId);
}

function channelPin(status: ProjectStatus): ResourcePin | undefined {
  return pin(status, "CHANNEL_PROFILE", targetChannel.resourceId);
}

function visualBiblePin(status: ProjectStatus): ResourcePin | undefined {
  return pin(status, "CHANNEL_VISUAL_BIBLE", targetVisualBible.resourceId);
}

function projectStyleDecision() {
  return {
    eraRegion: "Early second-century Roman Britain, especially northern Britannia, with archaeology-led reconstruction rather than legendary certainty",
    visualApproach: "Story-first, environment-first historical reconstruction; evidence and uncertainty are visually separated; restrained painterly matte finish",
    realismLevel: "Grounded historically plausible reconstruction with natural human proportions and materially credible stone, timber, wool, leather and iron",
    colorLanguage: "Subdued cold earth, slate, weathered stone, muted wool and iron tones; restrained warm accents only when motivated by practical light",
    lightingLanguage: "Natural overcast northern daylight, mist and low-contrast atmospheric depth; practical fire or lamp light only when contextually justified",
    materialLanguage: "Weathered stone, timber, wool, leather, iron, parchment and archaeological surfaces; no glossy synthetic or game-render materials",
    environmentLanguage: "Large readable landscapes, roads, forts, ruins, maps and evidence spaces with strong foreground-midground-background depth",
    characterRenderingPrinciple: "Roman personnel remain small-to-medium in frame, historically plausible, non-heroic, with no unsupported Ninth Legion emblem or invented heraldry",
    cameraCompositionTendency: "Medium-wide to wide by default; essential story information in central 60-70%; upper and lower margins remain atmospheric and crop-safe",
    moodRange: [
      "investigative historical mystery",
      "cold northern frontier uncertainty",
      "evidence-led reconstruction",
      "restrained unresolved ending"
    ],
    factualConstraints: [
      "Preserve uncertainty where historical evidence is incomplete",
      "Use plausible early second-century Roman military equipment and architecture",
      "Do not assert a final battlefield or disappearance mechanism as fact",
      "Generated imagery must not contain readable invented historical text"
    ],
    avoidances: [
      "fantasy armor or magical disappearance effects",
      "unsupported Ninth Legion insignia, heraldry or bright invented banners",
      "modern objects or weapons",
      "superhero anatomy or spectacle-only composition",
      "glossy game-render or photographic hyperreal finish",
      "readable generated Latin, dates, map labels or other historical text"
    ]
  };
}

function scenePriority(scene: Scene, index: number, count: number): "CRITICAL" | "IMPORTANT" | "SUPPORTING" {
  const text = [scene.scriptSegment, scene.primaryVisualIdea, ...scene.mustBeSeen].join(" ");
  if (index === 0 || index === count - 1) return "CRITICAL";
  if (/비문|기록|증거|타임라인|전투|가설|inscription|evidence|record/u.test(text)) return "IMPORTANT";
  return "SUPPORTING";
}

function sceneRole(scene: Scene, index: number, count: number): "HERO" | "STORY_ANCHOR" | "STANDARD" {
  if (index === 0) return "HERO";
  const text = [scene.scriptSegment, scene.primaryVisualIdea, ...scene.mustBeSeen].join(" ");
  if (index === count - 1 || /비문|기록|증거|타임라인|가설|inscription|evidence|record/u.test(text)) return "STORY_ANCHOR";
  return "STANDARD";
}

function scenePrompt(scene: Scene): { prompt: string; negativePrompt: string } {
  const visual = scene.primaryVisualIdea.trim();
  const mustSee = scene.mustBeSeen
    .filter(item => !/^(AD\s*)?\d{2,4}$/iu.test(item.trim()))
    .join(", ");
  const prompt = [
    visual,
    mustSee ? `Essential visible elements: ${mustSee}.` : "",
    "Early second-century Roman Britain, grounded archaeological reconstruction, historically plausible materials and equipment.",
    "Story-first environment-first medium-wide or wide framing, people and objects small-to-medium in frame, readable foreground-midground-background depth.",
    "Restrained painterly matte surface, subdued natural earth and slate tones, cold overcast or contextually motivated natural light.",
    "Essential story information stays in the central 60-70%; upper and lower margins remain atmospheric and lower-detail for vertical 9:16 crop continuity.",
    "Preserve historical uncertainty; no readable generated historical text or labels."
  ].filter(Boolean).join(" ");
  const negativePrompt = [
    "fantasy armor",
    "magical effects",
    "modern objects",
    "unsupported Ninth Legion emblem",
    "invented heraldry",
    "readable generated Latin, dates or map labels",
    "superhero anatomy",
    "glossy game render",
    "photographic hyperreal finish",
    "spectacle-only composition"
  ].join(", ");
  return { prompt, negativePrompt };
}

function buildSceneAssetPlan(scenes: Scene[]) {
  return {
    schemaVersion: 1,
    scenes: scenes.map((scene, index) => {
      const prompt = scenePrompt(scene);
      return {
        sceneId: scene.id,
        assetPlan: {
          assetClass: "PRIMARY_SCENE",
          assetRole: sceneRole(scene, index, scenes.length),
          productionPriority: scenePriority(scene, index, scenes.length),
          sourceStrategy: "GENERATE",
          stateField: "STATE_CURRENT",
          rationale: `Primary visual for approved Scene ${index + 1}; generated from the current Scene state and approved project visual identity.`
        },
        imageAssetDesign: {
          visualGoal: scene.primaryVisualIdea,
          composition: "Environment-first medium-wide/wide composition with central story information and crop-safe atmospheric margins.",
          continuityRequirements: [
            `Enter from: ${scene.stateIn}`,
            `Current state: ${scene.stateCurrent}`,
            `Hand off toward: ${scene.stateOut}`
          ],
          factualConstraints: [
            ...scene.mustBeSeen.map(item => `Scene requirement: ${item}`),
            "Historically plausible early second-century Roman Britain",
            "No readable generated historical text; dates and labels are editorial overlays"
          ],
          avoidances: [
            "unsupported insignia or heraldry",
            "fantasy or supernatural certainty",
            "modern objects",
            "glossy game-render finish",
            "oversized subject without narrative reason"
          ]
        },
        imagePrompt: prompt
      };
    })
  };
}

export class Wf09AutoService {
  private readonly registry = new FileSystemResourceRegistry(resourcesRoot);
  private readonly wf07: Wf07CliService;
  private readonly wf08: Wf08CliService;
  private readonly wf09: Wf09CliService;
  private readonly wf09b: Wf09bCliService;

  constructor(private readonly projects: ProjectBootstrapService) {
    this.wf07 = new Wf07CliService(projects);
    this.wf08 = new Wf08CliService(projects);
    this.wf09 = new Wf09CliService(projects);
    this.wf09b = new Wf09bCliService(projects);
  }

  private defaultAdapterModule(): string {
    return path.join(repositoryRoot, "runtimes", "image", "adapters", "chatgpt-browser-adapter.mjs");
  }

  ensureAdapterModule(): string {
    const configured = process.env.VPF_IMAGE_ADAPTER_MODULE?.trim();
    if (configured) return configured;
    const modulePath = this.defaultAdapterModule();
    process.env.VPF_IMAGE_ADAPTER_MODULE = modulePath;
    return modulePath;
  }

  async ensureReferenceAwarePins(projectId: string): Promise<{ status: ProjectStatus; repinned: boolean }> {
    const status = await this.projects.getStatus(projectId);
    const currentChannel = channelPin(status);
    const currentBible = visualBiblePin(status);
    const currentProvider = imageProviderPin(status);
    if (
      currentChannel?.version === targetChannel.version &&
      currentBible?.version === targetVisualBible.version &&
      currentProvider?.version === targetImageProvider.version
    ) {
      return { status, repinned: false };
    }
    if (currentChannel === undefined || currentBible === undefined || currentProvider === undefined) {
      throw new Wf09AutoError("WF09_AUTO_RESOURCE_PIN", "WF-09 requires channel, visual bible and image provider resource pins.");
    }

    const [channelResource, bibleResource, providerResource] = await Promise.all([
      this.registry.resolve({ resourceType: "CHANNEL_PROFILE", resourceId: targetChannel.resourceId, version: targetChannel.version }),
      this.registry.resolve({ resourceType: "CHANNEL_VISUAL_BIBLE", resourceId: targetVisualBible.resourceId, version: targetVisualBible.version }),
      this.registry.resolve({ resourceType: "PROVIDER_PROFILE", resourceId: targetImageProvider.resourceId, version: targetImageProvider.version })
    ]);
    if (channelResource === null || bibleResource === null || providerResource === null) {
      throw new Wf09AutoError("WF09_AUTO_RESOURCE_PIN", "Reference-aware WF-09 canonical resources could not be resolved.");
    }

    const now = new Date().toISOString();
    const versions: VersionPins = structuredClone(status.project.versions);
    const resourceHashes = versions.resourceHashes ?? {};
    versions.channelVisualBibleVersion = bibleResource.version;
    versions.providerProfileVersions = { ...versions.providerProfileVersions, IMAGE: providerResource.version };
    versions.resourceHashes = {
      ...resourceHashes,
      channelProfile: channelResource.contentHash,
      channelVisualBible: bibleResource.contentHash,
      providerProfiles: {
        ...(resourceHashes.providerProfiles ?? {}),
        IMAGE: providerResource.contentHash
      }
    };
    const resourcePins = status.resourcePins.map(existing => {
      if (existing.resourceType === "CHANNEL_PROFILE" && existing.resourceId === targetChannel.resourceId) {
        return { resourceType: "CHANNEL_PROFILE" as const, resourceId: channelResource.resourceId, version: channelResource.version, contentHash: channelResource.contentHash };
      }
      if (existing.resourceType === "CHANNEL_VISUAL_BIBLE" && existing.resourceId === targetVisualBible.resourceId) {
        return { resourceType: "CHANNEL_VISUAL_BIBLE" as const, resourceId: bibleResource.resourceId, version: bibleResource.version, contentHash: bibleResource.contentHash };
      }
      if (existing.resourceType === "PROVIDER_PROFILE" && existing.resourceId === targetImageProvider.resourceId) {
        return { resourceType: "PROVIDER_PROFILE" as const, resourceId: providerResource.resourceId, version: providerResource.version, contentHash: providerResource.contentHash };
      }
      return { ...existing };
    });

    const repo = new SqliteSceneAssetRepository(status.projectDbPath);
    try {
      repo.db.transaction(() => {
        repo.db.prepare("UPDATE projects SET lifecycle_status = 'SUPERSEDED', updated_at = ? WHERE project_id = ? AND lifecycle_status = 'ACTIVE'").run(now, projectId);
        repo.db.prepare(`
          INSERT INTO projects
          (id, project_id, revision, lifecycle_status, title, format, versions_json,
           resource_pins_json, pipeline, legacy_allowed, created_at, updated_at)
          VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, 0, ?, ?)
        `).run(
          status.project.id,
          projectId,
          status.project.revision + 1,
          status.project.title,
          status.project.format,
          JSON.stringify(versions),
          JSON.stringify(resourcePins),
          status.pipeline,
          status.project.createdAt,
          now
        );
      })();
    } finally {
      repo.close();
    }
    const updated = await this.projects.getStatus(projectId);
    await writeProjectSnapshot(updated);
    return { status: updated, repinned: true };
  }

  private async ensureProjectStyle(projectId: string): Promise<{ created: boolean; styleId: string | null }> {
    const before = await this.wf08.status(projectId);
    if (before.projectStyle?.approval?.approvalState === "HUMAN_APPROVED" && !before.projectStyle.stale) {
      return { created: false, styleId: before.projectStyle.id };
    }
    const status = await this.projects.getStatus(projectId);
    const styleFile = path.join(status.projectRoot, "04_visual_identity", "project-style.auto.json");
    await writeJsonAtomic(styleFile, projectStyleDecision());
    const style = await this.wf08.applyProjectStyle(projectId, styleFile);
    await this.wf08.approveProjectStyle(projectId, "wf09-auto");
    return { created: true, styleId: style.id };
  }

  private async ensureSceneAssetPlan(projectId: string, requestedFile?: string): Promise<{ file: string; created: boolean; sceneCount: number }> {
    const status = await this.projects.getStatus(projectId);
    const filename = requestedFile === undefined
      ? path.join(status.projectRoot, "05_images", "scene-assets.json")
      : path.resolve(requestedFile);
    if (!isInside(status.projectRoot, filename)) {
      throw new Wf09AutoError("WF09_AUTO_PLAN_MISSING", "WF-09 Scene Asset plan must remain inside the current project workspace.");
    }
    try {
      const raw = await readFile(filename, "utf8");
      const parsed = JSON.parse(raw) as { scenes?: unknown[] };
      if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) throw new Error("empty plan");
      return { file: filename, created: false, sceneCount: parsed.scenes.length };
    } catch {
      if (requestedFile !== undefined) {
        throw new Wf09AutoError("WF09_AUTO_PLAN_MISSING", `Requested WF-09 Scene Asset plan is missing or invalid: ${filename}`);
      }
    }

    const story = await this.wf07.status(projectId);
    const scenes = story.scenes
      .filter(scene => !scene.stale && ["APPROVED", "IN_PRODUCTION", "PRODUCTION_COMPLETE"].includes(scene.sceneStatus))
      .sort((a, b) => {
        if (a.sequenceId !== b.sequenceId) return a.sequenceId.localeCompare(b.sequenceId);
        return a.displayNumber - b.displayNumber;
      });
    if (scenes.length === 0) {
      throw new Wf09AutoError("WF09_AUTO_PROJECT_STATE", "WF-09 requires at least one approved current Scene.");
    }
    await writeJsonAtomic(filename, buildSceneAssetPlan(scenes));
    return { file: filename, created: true, sceneCount: scenes.length };
  }

  async prepare(projectId: string, options: { file?: string | undefined } = {}) {
    const pinResult = await this.ensureReferenceAwarePins(projectId);
    const style = await this.ensureProjectStyle(projectId);
    const plan = await this.ensureSceneAssetPlan(projectId, options.file);
    const readiness = await this.wf09.readiness(projectId, plan.file);
    if (!readiness.ready) {
      throw new Wf09AutoError("WF09_AUTO_PROJECT_STATE", `WF-09 prerequisites are not ready: ${readiness.readyCount}/${readiness.sceneCount}.`);
    }

    let wf09Status = await this.wf09.status(projectId);
    let designedCount = 0;
    if (wf09Status.assetCount === 0) {
      const designed = await this.wf09.applyDesigns(projectId, plan.file);
      designedCount = designed.designedCount;
      await this.wf09.materializePrompts(projectId, plan.file);
      wf09Status = await this.wf09.status(projectId);
    } else if (
      wf09Status.providerJobCount === 0 &&
      wf09Status.assets.every(asset => asset.assetStatus === "DESIGNED") &&
      wf09Status.promptMaterializedCount < wf09Status.assets.filter(asset => asset.sourceStrategy === "GENERATE").length
    ) {
      await this.wf09.materializePrompts(projectId, plan.file);
      wf09Status = await this.wf09.status(projectId);
    }

    this.ensureAdapterModule();
    const projectStatus = await this.projects.getStatus(projectId);
    return {
      projectId,
      repinned: pinResult.repinned,
      channelProfileVersion: channelPin(projectStatus)?.version ?? null,
      visualBibleVersion: visualBiblePin(projectStatus)?.version ?? null,
      imageProviderProfileVersion: imageProviderPin(projectStatus)?.version ?? null,
      projectStyleCreated: style.created,
      sceneAssetPlanCreated: plan.created,
      sceneAssetPlanFile: plan.file,
      sceneCount: plan.sceneCount,
      designedCount,
      promptMaterializedCount: wf09Status.promptMaterializedCount,
      referenceMode: "GLOBAL_VISUAL+KNF_LAYOUT+PROJECT",
      wf09Status
    };
  }

  async run(projectId: string, options: { file?: string | undefined } = {}) {
    const prepared = await this.prepare(projectId, options);
    const before = await this.wf09b.status(projectId);
    const retry = before.failedJobCount > 0 ? await this.wf09b.retryFailed(projectId, "ALL") : null;
    const current = await this.wf09b.status(projectId);
    const designedIds = current.assets
      .filter(asset => asset.sourceStrategy === "GENERATE" && asset.assetStatus === "DESIGNED" && !asset.stale && Boolean(asset.design.imagePrompt?.trim()))
      .map(asset => asset.id);
    const execution = designedIds.length > 0
      ? await this.wf09b.execute(projectId, designedIds)
      : { projectId, requested: 0, completed: 0, failed: 0, results: [] };
    return {
      ...prepared,
      retry,
      execution,
      runtimeStatus: await this.wf09b.status(projectId)
    };
  }

  async resume(projectId: string) {
    await this.prepare(projectId);
    const before = await this.wf09b.status(projectId);
    const retry = before.failedJobCount > 0 ? await this.wf09b.retryFailed(projectId, "ALL") : null;
    const current = await this.wf09b.status(projectId);
    const designedIds = current.assets
      .filter(asset => asset.sourceStrategy === "GENERATE" && asset.assetStatus === "DESIGNED" && !asset.stale && Boolean(asset.design.imagePrompt?.trim()))
      .map(asset => asset.id);
    const execution = designedIds.length > 0 ? await this.wf09b.execute(projectId, designedIds) : null;
    return { projectId, retry, execution, runtimeStatus: await this.wf09b.status(projectId) };
  }

  async status(projectId: string) {
    const status = await this.projects.getStatus(projectId);
    return {
      projectId,
      channelProfileVersion: channelPin(status)?.version ?? null,
      visualBibleVersion: visualBiblePin(status)?.version ?? null,
      imageProviderProfileVersion: imageProviderPin(status)?.version ?? null,
      visual: await this.wf08.status(projectId),
      wf09: await this.wf09.status(projectId),
      runtime: await this.wf09b.status(projectId)
    };
  }
}
