import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
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

interface PromptManifestEntry {
  cutName: string;
  sceneId: string;
  sceneRevision: number;
  assetId: string;
  assetRevision: number;
  promptSha256: string;
  promptFile: string;
  generatedDirectory: string;
  nextCut: string | null;
}

interface PromptManifest {
  schemaVersion: 1;
  projectId: string;
  providerProfile: string;
  entries: PromptManifestEntry[];
  candidates?: Array<{
    cutName: string;
    assetId: string;
    mediaId: string;
    relativePath: string;
  }>;
}

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

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
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

async function writeProjectSnapshot(status: ProjectStatus): Promise<void> {
  const filename = path.join(status.projectRoot, "project.json");
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
  await writeTextAtomic(filename, `${JSON.stringify(snapshot, null, 2)}\n`);
}

function imageExtension(mimeType: string): string {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  throw new Wf09AutoError("WF09_AUTO_PROJECT_STATE", `Unsupported generated image MIME: ${mimeType}`);
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
    if (!isInside(status.projectRoot, filename)) {
      throw new Wf09AutoError(
        "WF09_AUTO_PLAN_MISSING",
        "WF-09 AUTO Scene Asset plan must remain inside the current project workspace."
      );
    }
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

  private async planSceneIds(file: string): Promise<string[]> {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as { scenes?: unknown }).scenes)
    ) {
      throw new Wf09AutoError("WF09_AUTO_PLAN_MISSING", "Scene Asset plan has no scenes array.");
    }
    const ids = ((parsed as { scenes: unknown[] }).scenes).map((item, index) => {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof (item as { sceneId?: unknown }).sceneId !== "string" ||
        !(item as { sceneId: string }).sceneId.trim()
      ) {
        throw new Wf09AutoError(
          "WF09_AUTO_PLAN_MISSING",
          `Scene Asset plan entry ${index + 1} has no sceneId.`
        );
      }
      return (item as { sceneId: string }).sceneId.trim();
    });
    if (new Set(ids).size !== ids.length) {
      throw new Wf09AutoError("WF09_AUTO_PLAN_MISSING", "Scene Asset plan contains duplicate sceneId values.");
    }
    return ids;
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
    const resourceHashes = versions.resourceHashes ?? {};
    versions.providerProfileVersions = {
      ...versions.providerProfileVersions,
      IMAGE: providerResource.version
    };
    versions.resourceHashes = {
      ...resourceHashes,
      channelProfile: channelResource.contentHash,
      providerProfiles: {
        ...(resourceHashes.providerProfiles ?? {}),
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

  private async materializePromptMarkdown(projectId: string, file: string): Promise<PromptManifest> {
    const [status, sceneIds, wf09Status] = await Promise.all([
      this.projects.getStatus(projectId),
      this.planSceneIds(file),
      this.wf09.status(projectId)
    ]);
    const providerPin = imageProviderPin(status);
    if (providerPin === undefined) {
      throw new Wf09AutoError("WF09_AUTO_RESOURCE_PIN", "Image Provider Profile pin is missing.");
    }
    const promptDirectory = path.join(status.projectRoot, "05_images", "prompts");
    await mkdir(promptDirectory, { recursive: true });

    const entries: PromptManifestEntry[] = [];
    for (let index = 0; index < sceneIds.length; index += 1) {
      const sceneId = sceneIds[index]!;
      const asset = wf09Status.assets.find(candidate => candidate.owner.id === sceneId);
      if (asset === undefined) {
        throw new Wf09AutoError(
          "WF09_AUTO_PROJECT_STATE",
          `Scene ${sceneId} has no materialized PRIMARY_SCENE Asset.`
        );
      }
      const prompt = asset.design.imagePrompt?.trim();
      if (!prompt) {
        throw new Wf09AutoError(
          "WF09_AUTO_PROJECT_STATE",
          `Scene ${sceneId} has no materialized IMAGE_PROMPT.`
        );
      }
      const negativePrompt = asset.design.negativePrompt?.trim();
      const cutName = `cut_${String(index + 1).padStart(3, "0")}`;
      const nextCut = index + 1 < sceneIds.length
        ? `cut_${String(index + 2).padStart(3, "0")}`
        : null;
      const promptFile = `05_images/prompts/${cutName}.md`;
      const generatedDirectory = `05_images/generated/${cutName}`;
      const promptSha256 = sha256Text(prompt);
      const markdown = [
        "---",
        "schema_version: 1",
        `project_id: ${projectId}`,
        `cut_name: ${cutName}`,
        `scene_id: ${sceneId}`,
        `scene_revision: ${asset.sourceSceneRevision}`,
        `asset_id: ${asset.id}`,
        `asset_revision: ${asset.revision}`,
        `prompt_sha256: ${promptSha256}`,
        `provider_profile: ${providerPin.resourceId}@${providerPin.version}`,
        `format: ${status.project.format}`,
        `next_cut: ${nextCut ?? "null"}`,
        "status: READY_FOR_GENERATION",
        "---",
        "",
        `# ${cutName}`,
        "",
        "## IMAGE_PROMPT",
        "",
        prompt,
        "",
        ...(negativePrompt ? ["## NEGATIVE_PROMPT", "", negativePrompt, ""] : []),
        "## Generation",
        "",
        "Provider: CHATGPT_BROWSER",
        "Result: PENDING",
        ""
      ].join("\n");
      await writeTextAtomic(path.join(status.projectRoot, promptFile), markdown);
      entries.push({
        cutName,
        sceneId,
        sceneRevision: asset.sourceSceneRevision,
        assetId: asset.id,
        assetRevision: asset.revision,
        promptSha256,
        promptFile,
        generatedDirectory,
        nextCut
      });
    }

    const manifest: PromptManifest = {
      schemaVersion: 1,
      projectId,
      providerProfile: `${providerPin.resourceId}@${providerPin.version}`,
      entries
    };
    await writeTextAtomic(
      path.join(promptDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    return manifest;
  }

  private async mirrorGeneratedCandidates(projectId: string, manifest: PromptManifest) {
    const status = await this.projects.getStatus(projectId);
    const repo = new SqliteSceneAssetRepository(status.projectDbPath);
    const candidates: NonNullable<PromptManifest["candidates"]> = [];
    try {
      for (const entry of manifest.entries) {
        const asset = await repo.getPrimarySceneAsset(projectId, entry.sceneId);
        if (asset === null) continue;
        for (let index = 0; index < asset.candidateMediaIds.length; index += 1) {
          const mediaId = asset.candidateMediaIds[index]!;
          const media = await repo.getMedia(projectId, mediaId);
          if (media === null || media.mediaType !== "IMAGE" || media.mediaStatus !== "AVAILABLE") continue;
          const source = path.resolve(status.projectRoot, media.relativePath);
          if (!isInside(status.projectRoot, source)) {
            throw new Wf09AutoError(
              "WF09_AUTO_PROJECT_STATE",
              `MediaArtifact path escapes the project workspace: ${media.relativePath}`
            );
          }
          const relativePath = `${entry.generatedDirectory}/candidate_${String(index + 1).padStart(3, "0")}${imageExtension(media.mimeType)}`;
          const destination = path.resolve(status.projectRoot, relativePath);
          if (!isInside(status.projectRoot, destination)) {
            throw new Wf09AutoError("WF09_AUTO_PROJECT_STATE", "Cut image mirror path escapes the project workspace.");
          }
          await mkdir(path.dirname(destination), { recursive: true });
          await copyFile(source, destination);
          candidates.push({
            cutName: entry.cutName,
            assetId: asset.id,
            mediaId,
            relativePath
          });
        }
      }
    } finally {
      repo.close();
    }
    const updated: PromptManifest = { ...manifest, candidates };
    await writeTextAtomic(
      path.join(status.projectRoot, "05_images", "prompts", "manifest.json"),
      `${JSON.stringify(updated, null, 2)}\n`
    );
    return { mirroredCandidateCount: candidates.length, candidates };
  }

  async run(projectId: string, options: { file?: string | undefined } = {}) {
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

    const promptManifest = await this.materializePromptMarkdown(projectId, file);
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
    const mirrors = await this.mirrorGeneratedCandidates(projectId, promptManifest);
    const runtimeStatus = await this.wf09b.status(projectId);

    return {
      projectId,
      repinned: pinResult.repinned,
      providerProfileVersion: imageProviderPin(await this.projects.getStatus(projectId))?.version ?? null,
      designedCount,
      promptMaterializedCount,
      promptMarkdownCount: promptManifest.entries.length,
      mirroredCandidateCount: mirrors.mirroredCandidateCount,
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
    const file = await this.planFile(projectId);
    const promptManifest = await this.materializePromptMarkdown(projectId, file);
    const mirrors = await this.mirrorGeneratedCandidates(projectId, promptManifest);
    return {
      projectId,
      retry,
      execution,
      promptMarkdownCount: promptManifest.entries.length,
      mirroredCandidateCount: mirrors.mirroredCandidateCount,
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
