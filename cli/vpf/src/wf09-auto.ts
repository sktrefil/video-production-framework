import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { VersionPins } from "@vpf/domain";
import {
  ProjectBootstrapService,
  type ProjectStatus
} from "@vpf/project-bootstrap";
import {
  FileSystemResourceRegistry,
  type ResourcePin
} from "@vpf/resource-registry";
import { SqliteSceneAssetRepository } from "@vpf/storage/scene-assets";
import { Wf09CliService } from "./wf09.js";
import { Wf09bCliService } from "./wf09b.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const resourcesRoot = path.join(repositoryRoot, "resources");
const targetChannel = { resourceId: "HISTORY_MYSTERY_V1", version: "1.2.0" } as const;
const targetImageProvider = { resourceId: "IMAGE_PROVIDER_EXECUTION_V1", version: "1.1.0" } as const;

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

function imageProviderPin(status: ProjectStatus): ResourcePin | undefined {
  return status.resourcePins.find(pin =>
    pin.resourceType === "PROVIDER_PROFILE" &&
    pin.resourceId === targetImageProvider.resourceId
  );
}

function channelPin(status: ProjectStatus): ResourcePin | undefined {
  return status.resourcePins.find(pin =>
    pin.resourceType === "CHANNEL_PROFILE" &&
    pin.resourceId === targetChannel.resourceId
  );
}

async function writeProjectSnapshot(status: ProjectStatus): Promise<void> {
  const filename = path.join(status.projectRoot, "project.json");
  const temporary = `${filename}.tmp-${process.pid}-${Date.now()}`;
  const snapshot = {
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
  };
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(temporary, filename);
}

export class Wf09AutoService {
  private readonly registry = new FileSystemResourceRegistry(resourcesRoot);
  private readonly wf09: Wf09CliService;
  private readonly wf09b: Wf09bCliService;

  constructor(private readonly projects: ProjectBootstrapService) {
    this.wf09 = new Wf09CliService(projects);
    this.wf09b = new Wf09bCliService(projects);
  }

  private defaultAdapterModule(): string {
    return path.join(repositoryRoot, "runtimes", "image", "adapters", "chatgpt-browser-adapter.mjs");
  }

  private ensureAdapterModule(): string {
    const configured = process.env.VPF_IMAGE_ADAPTER_MODULE?.trim();
    if (configured) return configured;
    const modulePath = this.defaultAdapterModule();
    process.env.VPF_IMAGE_ADAPTER_MODULE = modulePath;
    return modulePath;
  }

  private async planFile(projectId: string, file?: string): Promise<string> {
    const status = await this.projects.getStatus(projectId);
    const filename = file === undefined
      ? path.join(status.projectRoot, "05_images", "scene-assets.json")
      : path.resolve(file);
    try {
      const info = await readFile(filename, "utf8");
      if (!info.trim()) throw new Error("empty");
    } catch {
      throw new Wf09AutoError(
        "WF09_AUTO_PLAN_MISSING",
        `WF-09 AUTO requires the project-local Scene Asset plan: ${filename}`
      );
    }
    return filename;
  }

  async ensureBrowserProviderPins(projectId: string): Promise<{
    status: ProjectStatus;
    repinned: boolean;
  }> {
    const status = await this.projects.getStatus(projectId);
    const currentChannel = channelPin(status);
    const currentProvider = imageProviderPin(status);
    if (
      currentChannel?.version === targetChannel.version &&
      currentProvider?.version === targetImageProvider.version
    ) {
      return { status, repinned: false };
    }
    if (
      currentChannel === undefined ||
      currentProvider === undefined ||
      currentChannel.version !== "1.1.0" ||
      currentProvider.version !== "1.0.0"
    ) {
      throw new Wf09AutoError(
        "WF09_AUTO_RESOURCE_PIN",
        `WF-09 AUTO only performs the explicit HISTORY_MYSTERY_V1@1.1.0 / IMAGE_PROVIDER_EXECUTION_V1@1.0.0 -> 1.2.0 / 1.1.0 repin; current channel=${currentChannel?.version ?? "missing"}, image=${currentProvider?.version ?? "missing"}.`
      );
    }

    const [channelResource, providerResource] = await Promise.all([
      this.registry.resolve({
        resourceType: "CHANNEL_PROFILE",
        resourceId: targetChannel.resourceId,
        version: targetChannel.version
      }),
      this.registry.resolve({
        resourceType: "PROVIDER_PROFILE",
        resourceId: targetImageProvider.resourceId,
        version: targetImageProvider.version
      })
    ]);
    if (channelResource === null || providerResource === null) {
      throw new Wf09AutoError(
        "WF09_AUTO_RESOURCE_PIN",
        "WF-09 AUTO canonical ChatGPT Browser resources could not be resolved."
      );
    }

    const now = new Date().toISOString();
    const versions: VersionPins = structuredClone(status.project.versions);
    versions.providerProfileVersions = {
      ...versions.providerProfileVersions,
      IMAGE: providerResource.version
    };
    versions.resourceHashes = {
      ...versions.resourceHashes,
      channelProfile: channelResource.contentHash,
      providerProfiles: {
        ...versions.resourceHashes.providerProfiles,
        IMAGE: providerResource.contentHash
      }
    };
    const resourcePins = status.resourcePins.map(pin => {
      if (pin.resourceType === "CHANNEL_PROFILE" && pin.resourceId === targetChannel.resourceId) {
        return {
          resourceType: "CHANNEL_PROFILE" as const,
          resourceId: channelResource.resourceId,
          version: channelResource.version,
          contentHash: channelResource.contentHash
        };
      }
      if (pin.resourceType === "PROVIDER_PROFILE" && pin.resourceId === targetImageProvider.resourceId) {
        return {
          resourceType: "PROVIDER_PROFILE" as const,
          resourceId: providerResource.resourceId,
          version: providerResource.version,
          contentHash: providerResource.contentHash
        };
      }
      return { ...pin };
    });

    const repo = new SqliteSceneAssetRepository(status.projectDbPath);
    try {
      const commit = repo.db.transaction(() => {
        repo.db.prepare(
          "UPDATE projects SET lifecycle_status = 'SUPERSEDED', updated_at = ? WHERE project_id = ? AND lifecycle_status = 'ACTIVE'"
        ).run(now, projectId);
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
      });
      commit();
    } finally {
      repo.close();
    }

    const updated = await this.projects.getStatus(projectId);
    await writeProjectSnapshot(updated);
    return { status: updated, repinned: true };
  }

  async run(projectId: string, options: { file?: string } = {}) {
    const pinResult = await this.ensureBrowserProviderPins(projectId);
    const file = await this.planFile(projectId, options.file);
    let wf09Status = await this.wf09.status(projectId);
    let designedCount = 0;
    let promptMaterializedCount = wf09Status.promptMaterializedCount;

    if (wf09Status.assetCount === 0) {
      const readiness = await this.wf09.readiness(projectId, file);
      if (!readiness.ready) {
        throw new Wf09AutoError(
          "WF09_AUTO_PROJECT_STATE",
          `WF-09 AUTO prerequisites are not ready: ${readiness.readyCount}/${readiness.sceneCount}.`
        );
      }
      const designed = await this.wf09.applyDesigns(projectId, file);
      designedCount = designed.designedCount;
      const prompts = await this.wf09.materializePrompts(projectId, file);
      promptMaterializedCount = prompts.promptMaterializedCount;
      wf09Status = await this.wf09.status(projectId);
    } else if (
      wf09Status.providerJobCount === 0 &&
      wf09Status.assets.every(asset => asset.assetStatus === "DESIGNED") &&
      wf09Status.promptMaterializedCount < wf09Status.assets.filter(asset => asset.sourceStrategy === "GENERATE").length
    ) {
      const prompts = await this.wf09.materializePrompts(projectId, file);
      promptMaterializedCount = prompts.promptMaterializedCount;
      wf09Status = await this.wf09.status(projectId);
    }

    this.ensureAdapterModule();
    const designedAssets = wf09Status.assets.filter(asset =>
      asset.sourceStrategy === "GENERATE" &&
      asset.assetStatus === "DESIGNED" &&
      !asset.stale &&
      Boolean(asset.design.imagePrompt?.trim())
    );
    const execution = designedAssets.length > 0
      ? await this.wf09b.execute(projectId, "ALL")
      : { projectId, requested: 0, completed: 0, failed: 0, results: [] };
    const runtimeStatus = await this.wf09b.status(projectId);

    return {
      projectId,
      repinned: pinResult.repinned,
      providerProfileVersion: imageProviderPin(await this.projects.getStatus(projectId))?.version ?? null,
      designedCount,
      promptMaterializedCount,
      execution,
      runtimeStatus
    };
  }

  async resume(projectId: string) {
    await this.ensureBrowserProviderPins(projectId);
    this.ensureAdapterModule();
    const before = await this.wf09b.status(projectId);
    const retry = before.failedJobCount > 0
      ? await this.wf09b.retryFailed(projectId, "ALL")
      : null;
    const wf09Status = await this.wf09.status(projectId);
    const hasDesigned = wf09Status.assets.some(asset =>
      asset.sourceStrategy === "GENERATE" &&
      asset.assetStatus === "DESIGNED" &&
      !asset.stale &&
      Boolean(asset.design.imagePrompt?.trim())
    );
    const execution = hasDesigned
      ? await this.wf09b.execute(projectId, "ALL")
      : null;
    return {
      projectId,
      retry,
      execution,
      runtimeStatus: await this.wf09b.status(projectId)
    };
  }

  async status(projectId: string) {
    const status = await this.projects.getStatus(projectId);
    return {
      projectId,
      channelProfileVersion: channelPin(status)?.version ?? null,
      imageProviderProfileVersion: imageProviderPin(status)?.version ?? null,
      wf09: await this.wf09.status(projectId),
      runtime: await this.wf09b.status(projectId)
    };
  }
}
