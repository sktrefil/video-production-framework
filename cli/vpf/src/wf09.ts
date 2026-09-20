import { createHash, randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ProductionAsset } from "@vpf/domain";
import type { ProjectStatus } from "@vpf/project-bootstrap";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import type {
  AssetPlanDecision,
  ImageAssetDesignDecision,
  ImagePromptDecision,
  ImageQcDecision,
  SceneAssetDecisionPort
} from "@vpf/production-system";
import {
  ChannelVisualBibleRegistryAdapter,
  FileSystemResourceRegistry,
  FormatProfileRegistryAdapter,
  type ResourcePin,
  type ResourceType
} from "@vpf/resource-registry";
import {
  SceneAssetPipeline,
  type ImageApprovalPolicy,
  type SceneAssetIdFactory
} from "@vpf/scene-assets";
import { SqliteSceneAssetRepository } from "@vpf/storage/scene-assets";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";

export class Wf09CliError extends Error {
  constructor(
    public readonly code:
      | "WF09_USAGE"
      | "WF09_INPUT_PATH"
      | "WF09_INPUT_INVALID"
      | "WF09_RESOURCE_PIN"
      | "WF09_NOT_READY"
      | "WF09_ASSET_STATE"
      | "WF09_MEDIA_INVALID",
    message: string
  ) {
    super(message);
    this.name = "Wf09CliError";
  }
}

interface Wf09ImageAssetDesignInput {
  visualGoal: string;
  composition: string;
  continuityRequirements: string[];
  factualConstraints: string[];
  avoidances: string[];
}

export interface Wf09SceneAssetInput {
  sceneId: string;
  assetPlan: AssetPlanDecision;
  imageAssetDesign: Wf09ImageAssetDesignInput;
  imagePrompt?: ImagePromptDecision;
}

export interface Wf09SceneAssetPlan {
  scenes: Wf09SceneAssetInput[];
}

interface Wf09ImportCandidateInput {
  sceneId: string;
  relativePath: string;
}

interface Wf09ImportPlan {
  sceneAssetPlanFile: string;
  imports: Wf09ImportCandidateInput[];
}

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const canonicalResourcesRoot = path.join(repositoryRoot, "resources");
const systemClock = { nowIso: () => new Date().toISOString() };
const neverAutoApprove: ImageApprovalPolicy = { shouldAutoApprove: () => false };

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
    throw new Wf09CliError(
      "WF09_INPUT_PATH",
      "WF-09 input files must remain inside the current project workspace."
    );
  }

  let realInput: string;
  try {
    realInput = await realpath(resolvedInput);
  } catch {
    throw new Wf09CliError(
      "WF09_INPUT_PATH",
      `WF-09 input file does not exist or is unreadable: ${inputPath}`
    );
  }
  if (!isInside(resolvedRoot, realInput)) {
    throw new Wf09CliError(
      "WF09_INPUT_PATH",
      "WF-09 input symlink resolves outside the current project workspace."
    );
  }

  try {
    return JSON.parse(await readFile(realInput, "utf8")) as unknown;
  } catch {
    throw new Wf09CliError(
      "WF09_INPUT_INVALID",
      `WF-09 input must contain valid JSON: ${inputPath}`
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Wf09CliError(
      "WF09_INPUT_INVALID",
      `${label}.${key} must be a non-empty string.`
    );
  }
  return value.trim();
}

function requireStringArray(record: Record<string, unknown>, key: string, label: string): string[] {
  const value = record[key];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.trim().length === 0)
  ) {
    throw new Wf09CliError(
      "WF09_INPUT_INVALID",
      `${label}.${key} must be an array of non-empty strings.`
    );
  }
  return value.map((item) => (item as string).trim());
}

function requireEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  label: string,
  allowed: readonly T[]
): T {
  const value = requireString(record, key, label);
  if (!allowed.includes(value as T)) {
    throw new Wf09CliError(
      "WF09_INPUT_INVALID",
      `${label}.${key} must be one of: ${allowed.join(", ")}.`
    );
  }
  return value as T;
}

export function parseSceneAssetPlan(value: unknown): Wf09SceneAssetPlan {
  if (!isRecord(value) || !Array.isArray(value.scenes) || value.scenes.length === 0) {
    throw new Wf09CliError(
      "WF09_INPUT_INVALID",
      "scene-assets.json must contain a non-empty scenes array."
    );
  }

  const seen = new Set<string>();
  const scenes = value.scenes.map((candidate, index): Wf09SceneAssetInput => {
    const label = `scene-assets.json.scenes[${index}]`;
    if (
      !isRecord(candidate) ||
      !isRecord(candidate.assetPlan) ||
      !isRecord(candidate.imageAssetDesign)
    ) {
      throw new Wf09CliError(
        "WF09_INPUT_INVALID",
        `${label} must contain assetPlan and imageAssetDesign objects.`
      );
    }

    const sceneId = requireString(candidate, "sceneId", label);
    if (seen.has(sceneId)) {
      throw new Wf09CliError(
        "WF09_INPUT_INVALID",
        `${label}.sceneId duplicates ${sceneId}.`
      );
    }
    seen.add(sceneId);

    const planLabel = `${label}.assetPlan`;
    const sourceStrategy = requireEnum(candidate.assetPlan, "sourceStrategy", planLabel, [
      "GENERATE", "IMPORT", "REUSE"
    ] as const);
    const assetClass = requireEnum(candidate.assetPlan, "assetClass", planLabel, [
      "PRIMARY_SCENE"
    ] as const);
    const assetPlan: AssetPlanDecision = {
      assetClass,
      assetRole: requireEnum(candidate.assetPlan, "assetRole", planLabel, [
        "HERO", "STORY_ANCHOR", "STANDARD"
      ] as const),
      productionPriority: requireEnum(candidate.assetPlan, "productionPriority", planLabel, [
        "CRITICAL", "IMPORTANT", "SUPPORTING"
      ] as const),
      sourceStrategy,
      stateField: requireEnum(candidate.assetPlan, "stateField", planLabel, [
        "STATE_IN", "STATE_CURRENT", "STATE_OUT"
      ] as const),
      rationale: requireString(candidate.assetPlan, "rationale", planLabel)
    };

    const designLabel = `${label}.imageAssetDesign`;
    const imageAssetDesign: Wf09ImageAssetDesignInput = {
      visualGoal: requireString(candidate.imageAssetDesign, "visualGoal", designLabel),
      composition: requireString(candidate.imageAssetDesign, "composition", designLabel),
      continuityRequirements: requireStringArray(
        candidate.imageAssetDesign,
        "continuityRequirements",
        designLabel
      ),
      factualConstraints: requireStringArray(
        candidate.imageAssetDesign,
        "factualConstraints",
        designLabel
      ),
      avoidances: requireStringArray(candidate.imageAssetDesign, "avoidances", designLabel)
    };

    let imagePrompt: ImagePromptDecision | undefined;
    if (candidate.imagePrompt !== undefined) {
      if (!isRecord(candidate.imagePrompt)) {
        throw new Wf09CliError(
          "WF09_INPUT_INVALID",
          `${label}.imagePrompt must be an object when provided.`
        );
      }
      const prompt = requireString(candidate.imagePrompt, "prompt", `${label}.imagePrompt`);
      const negativePromptValue = candidate.imagePrompt.negativePrompt;
      if (
        negativePromptValue !== undefined &&
        (typeof negativePromptValue !== "string" || negativePromptValue.trim().length === 0)
      ) {
        throw new Wf09CliError(
          "WF09_INPUT_INVALID",
          `${label}.imagePrompt.negativePrompt must be a non-empty string when provided.`
        );
      }
      imagePrompt = {
        prompt,
        ...(negativePromptValue === undefined
          ? {}
          : { negativePrompt: negativePromptValue.trim() })
      };
    }

    if (sourceStrategy === "GENERATE" && imagePrompt === undefined) {
      throw new Wf09CliError(
        "WF09_INPUT_INVALID",
        `${label}.imagePrompt is required for GENERATE assets.`
      );
    }

    return {
      sceneId,
      assetPlan,
      imageAssetDesign,
      ...(imagePrompt === undefined ? {} : { imagePrompt })
    };
  });

  return { scenes };
}

function parseImportPlan(value: unknown): Wf09ImportPlan {
  if (!isRecord(value) || !Array.isArray(value.imports)) {
    throw new Wf09CliError(
      "WF09_INPUT_INVALID",
      "image-imports.json must contain sceneAssetPlanFile and a non-empty imports array."
    );
  }
  const sceneAssetPlanFile = requireString(value, "sceneAssetPlanFile", "image-imports.json");
  if (value.imports.length === 0) {
    throw new Wf09CliError("WF09_INPUT_INVALID", "image-imports.json.imports must not be empty.");
  }
  const seenScenes = new Set<string>();
  const seenPaths = new Set<string>();
  const imports = value.imports.map((candidate, index) => {
    const label = `image-imports.json.imports[${index}]`;
    if (!isRecord(candidate)) {
      throw new Wf09CliError("WF09_INPUT_INVALID", `${label} must be an object.`);
    }
    const sceneId = requireString(candidate, "sceneId", label);
    const relativePath = requireString(candidate, "relativePath", label).replace(/\\/g, "/");
    if (seenScenes.has(sceneId)) {
      throw new Wf09CliError("WF09_INPUT_INVALID", `${label}.sceneId duplicates ${sceneId}.`);
    }
    if (seenPaths.has(relativePath)) {
      throw new Wf09CliError("WF09_INPUT_INVALID", `${label}.relativePath duplicates ${relativePath}.`);
    }
    seenScenes.add(sceneId);
    seenPaths.add(relativePath);
    return { sceneId, relativePath };
  });
  return { sceneAssetPlanFile, imports };
}

function imageMetadata(bytes: Buffer, relativePath: string): {
  mimeType: string;
  width?: number;
  height?: number;
} {
  const extension = path.extname(relativePath).toLowerCase();
  if (extension !== ".png" || bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47) {
    throw new Wf09CliError(
      "WF09_MEDIA_INVALID",
      `Imported image must be a valid PNG file: ${relativePath}`
    );
  }
  return {
    mimeType: "image/png",
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

function createIds(): SceneAssetIdFactory {
  return {
    next(prefix) {
      return `${prefix}_${randomUUID().replaceAll("-", "")}`;
    }
  };
}

function unavailableDecisions(): SceneAssetDecisionPort {
  const fail = async (): Promise<never> => {
    throw new Wf09CliError(
      "WF09_USAGE",
      "A WF-09 production decision was requested without a scene-assets decision file."
    );
  };
  return {
    planAsset: fail,
    designImageAsset: fail,
    compileImagePrompt: fail,
    runImageQc: fail
  };
}

function fileBackedDecisions(item: Wf09SceneAssetInput): SceneAssetDecisionPort {
  return {
    async planAsset() {
      return { ...item.assetPlan };
    },
    async designImageAsset(input) {
      const decision: ImageAssetDesignDecision = {
        ...item.imageAssetDesign,
        identityAnchorIds: input.identityAnchors.map((anchor) => anchor.id)
      };
      return decision;
    },
    async compileImagePrompt() {
      if (item.imagePrompt === undefined) {
        throw new Wf09CliError(
          "WF09_INPUT_INVALID",
          `Scene ${item.sceneId} does not provide an IMAGE_PROMPT decision.`
        );
      }
      return { ...item.imagePrompt };
    },
    async runImageQc(): Promise<ImageQcDecision> {
      throw new Wf09CliError(
        "WF09_USAGE",
        "IMAGE_QC belongs to WF-09B and is not available in the WF-09A CLI."
      );
    }
  };
}

function resourcePin(status: ProjectStatus, type: ResourceType): ResourcePin {
  const pin = status.resourcePins.find((candidate) => candidate.resourceType === type);
  if (pin === undefined) {
    throw new Wf09CliError(
      "WF09_RESOURCE_PIN",
      `Project is missing its pinned ${type} resource.`
    );
  }
  return pin;
}

export class Wf09CliService {
  private readonly registry = new FileSystemResourceRegistry(canonicalResourcesRoot);

  constructor(private readonly projects: ProjectBootstrapService) {}

  private async withRepository<T>(
    projectId: string,
    fn: (repo: SqliteSceneAssetRepository, status: ProjectStatus) => Promise<T>
  ): Promise<T> {
    const status = await this.projects.getStatus(projectId);
    const repo = new SqliteSceneAssetRepository(status.projectDbPath);
    try {
      return await fn(repo, status);
    } finally {
      repo.close();
    }
  }

  private pipeline(
    repo: SqliteSceneAssetRepository,
    status: ProjectStatus,
    decisions: SceneAssetDecisionPort
  ): SceneAssetPipeline {
    const biblePin = resourcePin(status, "CHANNEL_VISUAL_BIBLE");
    const formatPin = resourcePin(status, "FORMAT_PROFILE");
    const bible = new ChannelVisualBibleRegistryAdapter(
      this.registry,
      biblePin.resourceId,
      { [biblePin.version]: biblePin.contentHash }
    );
    const formats = new FormatProfileRegistryAdapter(
      this.registry,
      formatPin.resourceId,
      { [formatPin.version]: formatPin.contentHash }
    );
    return new SceneAssetPipeline(
      repo,
      repo,
      bible,
      formats,
      decisions,
      neverAutoApprove,
      systemClock,
      createIds()
    );
  }

  private async loadPlan(status: ProjectStatus, file: string): Promise<Wf09SceneAssetPlan> {
    return parseSceneAssetPlan(await readProjectJson(status.projectRoot, file));
  }

  private async loadImportPlan(status: ProjectStatus, file: string): Promise<Wf09ImportPlan> {
    return parseImportPlan(await readProjectJson(status.projectRoot, file));
  }

  private async readImportedImage(status: ProjectStatus, relativePath: string): Promise<{
    checksum: string;
    mimeType: string;
    width?: number;
    height?: number;
  }> {
    const root = await realpath(status.projectRoot);
    const requested = path.resolve(root, relativePath);
    if (!isInside(root, requested)) {
      throw new Wf09CliError(
        "WF09_INPUT_PATH",
        `Imported image path must remain inside the current project workspace: ${relativePath}`
      );
    }

    let resolved: string;
    try {
      resolved = await realpath(requested);
    } catch {
      throw new Wf09CliError("WF09_MEDIA_INVALID", `Imported image is missing or unreadable: ${relativePath}`);
    }
    if (!isInside(root, resolved)) {
      throw new Wf09CliError(
        "WF09_INPUT_PATH",
        `Imported image symlink resolves outside the current project workspace: ${relativePath}`
      );
    }

    const bytes = await readFile(resolved);
    const metadata = imageMetadata(bytes, relativePath);
    if (metadata.width === 0 || metadata.height === 0) {
      throw new Wf09CliError("WF09_MEDIA_INVALID", `Imported image has invalid dimensions: ${relativePath}`);
    }
    return {
      ...metadata,
      checksum: `sha256:${createHash("sha256").update(bytes).digest("hex")}`
    };
  }

  private async readinessRows(
    repo: SqliteSceneAssetRepository,
    status: ProjectStatus,
    plan: Wf09SceneAssetPlan
  ) {
    const formatPin = resourcePin(status, "FORMAT_PROFILE");
    const pipeline = this.pipeline(repo, status, unavailableDecisions());
    return Promise.all(plan.scenes.map(async (item) => ({
      sceneId: item.sceneId,
      readiness: await pipeline.getReadiness({
        projectId: status.project.projectId,
        sceneId: item.sceneId,
        formatProfileVersion: formatPin.version
      })
    })));
  }

  private assertAllReady(rows: Awaited<ReturnType<Wf09CliService["readinessRows"]>>): void {
    const blocked = rows.filter((row) => !row.readiness.ready);
    if (blocked.length === 0) return;
    const detail = blocked.map((row) => {
      const missing = [
        !row.readiness.sceneApproved ? "SCENE_APPROVAL" : null,
        !row.readiness.projectStyleApproved ? "PROJECT_STYLE_APPROVAL" : null,
        row.readiness.missingAnchorApprovalIds.length > 0
          ? `IDENTITY_ANCHORS:${row.readiness.missingAnchorApprovalIds.join(",")}`
          : null,
        !row.readiness.channelVisualBibleResolved ? "VISUAL_BIBLE" : null,
        !row.readiness.formatProfileResolved ? "FORMAT_PROFILE" : null
      ].filter((value): value is string => value !== null);
      return `${row.sceneId}(${missing.join("|")})`;
    });
    throw new Wf09CliError(
      "WF09_NOT_READY",
      `WF-09 prerequisites are incomplete: ${detail.join("; ")}`
    );
  }

  async readiness(projectId: string, file: string) {
    return this.withRepository(projectId, async (repo, status) => {
      const plan = await this.loadPlan(status, file);
      const scenes = await this.readinessRows(repo, status, plan);
      return {
        projectId,
        sceneCount: scenes.length,
        readyCount: scenes.filter((row) => row.readiness.ready).length,
        ready: scenes.every((row) => row.readiness.ready),
        scenes
      };
    });
  }

  async applyDesigns(projectId: string, file: string) {
    return this.withRepository(projectId, async (repo, status) => {
      const plan = await this.loadPlan(status, file);
      const readiness = await this.readinessRows(repo, status, plan);
      this.assertAllReady(readiness);

      for (const item of plan.scenes) {
        const existing = await repo.getPrimarySceneAsset(projectId, item.sceneId);
        if (
          existing !== null &&
          existing.assetStatus !== "DESIGNED"
        ) {
          throw new Wf09CliError(
            "WF09_ASSET_STATE",
            `Scene ${item.sceneId} already has an Asset in ${existing.assetStatus}; redesign must not overwrite a production-stage Asset.`
          );
        }
      }

      const formatPin = resourcePin(status, "FORMAT_PROFILE");
      const assets: ProductionAsset[] = [];
      for (const item of plan.scenes) {
        const pipeline = this.pipeline(repo, status, fileBackedDecisions(item));
        assets.push(await pipeline.designPrimarySceneAsset({
          projectId,
          sceneId: item.sceneId,
          format: status.project.format,
          formatProfileVersion: formatPin.version
        }));
      }
      return {
        projectId,
        sceneCount: plan.scenes.length,
        designedCount: assets.length,
        assets
      };
    });
  }

  async materializePrompts(projectId: string, file: string) {
    return this.withRepository(projectId, async (repo, status) => {
      const plan = await this.loadPlan(status, file);
      const readiness = await this.readinessRows(repo, status, plan);
      this.assertAllReady(readiness);

      const pending: Array<{
        item: Wf09SceneAssetInput;
        asset: ProductionAsset;
        prompt: ImagePromptDecision;
      }> = [];

      for (const item of plan.scenes) {
        if (item.assetPlan.sourceStrategy !== "GENERATE") continue;
        if (item.imagePrompt === undefined) {
          throw new Wf09CliError(
            "WF09_INPUT_INVALID",
            `Scene ${item.sceneId} is GENERATE but has no IMAGE_PROMPT.`
          );
        }
        const asset = await repo.getPrimarySceneAsset(projectId, item.sceneId);
        if (asset === null) {
          throw new Wf09CliError(
            "WF09_ASSET_STATE",
            `Scene ${item.sceneId} has no PRIMARY_SCENE Asset. Run asset design apply first.`
          );
        }
        if (
          asset.stale ||
          (asset.assetStatus !== "DESIGNED" && asset.assetStatus !== "REGENERATE_REQUIRED") ||
          asset.sourceStrategy !== "GENERATE"
        ) {
          throw new Wf09CliError(
            "WF09_ASSET_STATE",
            `Scene ${item.sceneId} Asset must be current, DESIGNED/REGENERATE_REQUIRED and GENERATE before prompt materialization.`
          );
        }
        pending.push({ item, asset, prompt: item.imagePrompt });
      }

      const assets: ProductionAsset[] = [];
      for (const entry of pending) {
        const prompt = entry.prompt.prompt.trim();
        const negativePrompt = entry.prompt.negativePrompt?.trim();
        const unchanged =
          entry.asset.design.imagePrompt === prompt &&
          entry.asset.design.negativePrompt === negativePrompt;
        if (unchanged) {
          if (entry.asset.assetStatus === "REGENERATE_REQUIRED") {
            throw new Wf09CliError(
              "WF09_ASSET_STATE",
              `Scene ${entry.item.sceneId} requires a revised IMAGE_PROMPT after creative QC failure; use runtime retry only for technical failure.`
            );
          }
          assets.push(entry.asset);
          continue;
        }

        const now = systemClock.nowIso();
        const { negativePrompt: _oldNegativePrompt, ...design } = entry.asset.design;
        const next: ProductionAsset = {
          ...entry.asset,
          revision: entry.asset.revision + 1,
          updatedAt: now,
          assetStatus: "DESIGNED",
          design: {
            ...design,
            imagePrompt: prompt,
            ...(negativePrompt === undefined ? {} : { negativePrompt })
          }
        };
        const event: WorkflowEvent = {
          eventId: `evt_${randomUUID().replaceAll("-", "")}`,
          projectId,
          eventType: entry.asset.assetStatus === "REGENERATE_REQUIRED"
            ? "IMAGE_PROMPT_REVISED"
            : "IMAGE_PROMPT_MATERIALIZED",
          targetType: "ASSET",
          targetId: next.id,
          trigger: "WORKFLOW_ENGINE",
          payload: {
            sceneId: entry.item.sceneId,
            assetRevision: next.revision,
            previousAssetStatus: entry.asset.assetStatus,
            promptSha256: createHash("sha256").update(prompt).digest("hex"),
            providerJobCreated: false
          },
          createdAt: now
        };
        const outbox: OutboxRecord = {
          outboxId: `outbox_${randomUUID().replaceAll("-", "")}`,
          eventId: event.eventId,
          status: "PENDING",
          attempts: 0,
          createdAt: now
        };
        await repo.commitAssetDesign({
          previous: entry.asset,
          next,
          event,
          outbox
        });
        assets.push(next);
      }

      return {
        projectId,
        generateAssetCount: pending.length,
        promptMaterializedCount: assets.filter((asset) =>
          typeof asset.design.imagePrompt === "string" && asset.design.imagePrompt.length > 0
        ).length,
        providerJobsCreated: 0,
        assets
      };
    });
  }

  async applyImports(projectId: string, file: string) {
    return this.withRepository(projectId, async (repo, status) => {
      const importPlan = await this.loadImportPlan(status, file);
      const sourcePlan = await this.loadPlan(status, importPlan.sceneAssetPlanFile);
      const sourceByScene = new Map(sourcePlan.scenes.map((item) => [item.sceneId, item]));
      const importByScene = new Map(importPlan.imports.map((item) => [item.sceneId, item]));

      if (sourceByScene.size !== importByScene.size || [...sourceByScene.keys()].some((sceneId) => !importByScene.has(sceneId))) {
        throw new Wf09CliError(
          "WF09_INPUT_INVALID",
          "image-imports.json must provide exactly one selected image for every Scene in sceneAssetPlanFile."
        );
      }

      const importItems = sourcePlan.scenes.map((item): Wf09SceneAssetInput => ({
        sceneId: item.sceneId,
        assetPlan: { ...item.assetPlan, sourceStrategy: "IMPORT" },
        imageAssetDesign: item.imageAssetDesign
      }));
      const readiness = await this.readinessRows(repo, status, { scenes: importItems });
      this.assertAllReady(readiness);

      const existing = await Promise.all(importItems.map(async (item) => ({
        sceneId: item.sceneId,
        asset: await repo.getPrimarySceneAsset(projectId, item.sceneId)
      })));
      const alreadyImported = existing.filter(({ asset }) =>
        asset !== null && asset.sourceStrategy === "IMPORT" && asset.candidateMediaIds.length > 0
      );
      if (alreadyImported.length > 0) {
        throw new Wf09CliError(
          "WF09_ASSET_STATE",
          `Selected images are already registered for: ${alreadyImported.map(({ sceneId }) => sceneId).join(", ")}.`
        );
      }

      const formatPin = resourcePin(status, "FORMAT_PROFILE");
      const designed: ProductionAsset[] = [];
      for (const item of importItems) {
        const pipeline = this.pipeline(repo, status, fileBackedDecisions(item));
        designed.push(await pipeline.designPrimarySceneAsset({
          projectId,
          sceneId: item.sceneId,
          format: status.project.format,
          formatProfileVersion: formatPin.version
        }));
      }

      const registered = [];
      for (const asset of designed) {
        const input = importByScene.get(asset.owner.id);
        if (input === undefined) throw new Wf09CliError("WF09_INPUT_INVALID", `Missing image import for Scene ${asset.owner.id}.`);
        const image = await this.readImportedImage(status, input.relativePath);
        const pipeline = this.pipeline(repo, status, unavailableDecisions());
        registered.push(await pipeline.registerImportedImageCandidate({
          projectId,
          assetId: asset.id,
          relativePath: input.relativePath,
          ...image
        }));
      }

      return {
        projectId,
        importedCount: registered.length,
        assets: registered.map(({ asset, media }) => ({
          sceneId: asset.owner.id,
          assetId: asset.id,
          assetRevision: asset.revision,
          mediaId: media.id,
          relativePath: media.relativePath,
          checksum: media.checksum,
          width: media.width,
          height: media.height
        }))
      };
    });
  }

  async status(projectId: string) {
    return this.withRepository(projectId, async (repo, status) => {
      const formatPin = resourcePin(status, "FORMAT_PROFILE");
      const assets = (await repo.listAssets(projectId)).filter((asset) =>
        asset.assetClass === "PRIMARY_SCENE" && asset.owner.type === "SCENE"
      );
      const pipeline = this.pipeline(repo, status, unavailableDecisions());
      const sceneReadiness = await Promise.all(assets.map(async (asset) => ({
        sceneId: asset.owner.id,
        assetId: asset.id,
        assetRevision: asset.revision,
        ready: (await pipeline.getReadiness({
          projectId,
          sceneId: asset.owner.id,
          formatProfileVersion: formatPin.version
        })).ready
      })));
      const providerJobCount = (
        repo.db.prepare(
          `SELECT COUNT(*) AS count FROM provider_jobs WHERE project_id = ?`
        ).get(projectId) as { count: number }
      ).count;
      const promptMaterializedCount = assets.filter((asset) =>
        typeof asset.design.imagePrompt === "string" && asset.design.imagePrompt.trim().length > 0
      ).length;
      return {
        projectId,
        assetCount: assets.length,
        promptMaterializedCount,
        providerJobCount,
        wf09aReady: assets.length > 0 &&
          promptMaterializedCount === assets.filter((asset) => asset.sourceStrategy === "GENERATE").length &&
          assets.every((asset) => !asset.stale && asset.assetStatus === "DESIGNED") &&
          sceneReadiness.every((row) => row.ready),
        sceneReadiness,
        assets
      };
    });
  }
}
