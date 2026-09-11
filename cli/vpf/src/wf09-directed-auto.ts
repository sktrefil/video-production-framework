import { rename, writeFile } from "node:fs/promises";
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
import { Wf09AutoError, Wf09AutoService } from "./wf09-auto.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const resourcesRoot = path.join(repositoryRoot, "resources");

const targetChannel = { resourceId: "HISTORY_MYSTERY_V1", version: "1.3.0" } as const;
const targetImageProvider = { resourceId: "IMAGE_PROVIDER_EXECUTION_V1", version: "1.1.0" } as const;
const targetVisualBible = { resourceId: "HISTORY_MYSTERY_VISUAL_BIBLE", version: "1.1.0" } as const;

function findPin(
  status: ProjectStatus,
  resourceType: ResourcePin["resourceType"],
  resourceId: string
): ResourcePin | undefined {
  return status.resourcePins.find(pin =>
    pin.resourceType === resourceType && pin.resourceId === resourceId
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

function migrationAllowed(input: {
  channelVersion: string;
  providerVersion: string;
  bibleVersion: string;
}): boolean {
  return (
    input.channelVersion === "1.1.0" &&
    input.providerVersion === "1.0.0" &&
    input.bibleVersion === "1.0.0"
  ) || (
    input.channelVersion === "1.2.0" &&
    input.providerVersion === "1.1.0" &&
    input.bibleVersion === "1.0.0"
  ) || (
    input.channelVersion === "1.3.0" &&
    input.providerVersion === "1.1.0" &&
    input.bibleVersion === "1.0.0"
  );
}

/**
 * WF-09 AUTO execution policy for Visual Direction Grammar V1.
 *
 * The parent service owns prompt-to-image execution. This subclass only makes
 * the explicit, versioned resource transition required before that execution:
 * Channel 1.3.0 + Visual Bible 1.1.0 + Browser Image Provider 1.1.0.
 */
export class Wf09VisualDirectionAutoService extends Wf09AutoService {
  private readonly directionRegistry = new FileSystemResourceRegistry(resourcesRoot);

  constructor(private readonly directedProjects: ProjectBootstrapService) {
    super(directedProjects);
  }

  override async ensureBrowserProviderPins(projectId: string): Promise<{
    status: ProjectStatus;
    repinned: boolean;
  }> {
    const status = await this.directedProjects.getStatus(projectId);
    const currentChannel = findPin(status, "CHANNEL_PROFILE", targetChannel.resourceId);
    const currentProvider = findPin(status, "PROVIDER_PROFILE", targetImageProvider.resourceId);
    const currentBible = findPin(status, "CHANNEL_VISUAL_BIBLE", targetVisualBible.resourceId);

    if (
      currentChannel?.version === targetChannel.version &&
      currentProvider?.version === targetImageProvider.version &&
      currentBible?.version === targetVisualBible.version
    ) {
      return { status, repinned: false };
    }

    if (
      currentChannel === undefined ||
      currentProvider === undefined ||
      currentBible === undefined ||
      !migrationAllowed({
        channelVersion: currentChannel.version,
        providerVersion: currentProvider.version,
        bibleVersion: currentBible.version
      })
    ) {
      throw new Wf09AutoError(
        "WF09_AUTO_RESOURCE_PIN",
        `WF-09 AUTO Visual Direction migration supports only known HISTORY_MYSTERY resource states; current channel=${currentChannel?.version ?? "missing"}, image=${currentProvider?.version ?? "missing"}, visualBible=${currentBible?.version ?? "missing"}.`
      );
    }

    const [channelResource, providerResource, bibleResource] = await Promise.all([
      this.directionRegistry.resolve({
        resourceType: "CHANNEL_PROFILE",
        resourceId: targetChannel.resourceId,
        version: targetChannel.version
      }),
      this.directionRegistry.resolve({
        resourceType: "PROVIDER_PROFILE",
        resourceId: targetImageProvider.resourceId,
        version: targetImageProvider.version
      }),
      this.directionRegistry.resolve({
        resourceType: "CHANNEL_VISUAL_BIBLE",
        resourceId: targetVisualBible.resourceId,
        version: targetVisualBible.version
      })
    ]);

    if (channelResource === null || providerResource === null || bibleResource === null) {
      throw new Wf09AutoError(
        "WF09_AUTO_RESOURCE_PIN",
        "WF-09 AUTO Visual Direction canonical resources could not be resolved."
      );
    }

    const now = new Date().toISOString();
    const versions: VersionPins = structuredClone(status.project.versions);
    const resourceHashes = versions.resourceHashes ?? {};
    versions.channelVisualBibleVersion = bibleResource.version;
    versions.providerProfileVersions = {
      ...versions.providerProfileVersions,
      IMAGE: providerResource.version
    };
    versions.resourceHashes = {
      ...resourceHashes,
      channelVisualBible: bibleResource.contentHash,
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
      if (pin.resourceType === "CHANNEL_VISUAL_BIBLE" && pin.resourceId === targetVisualBible.resourceId) {
        return {
          resourceType: "CHANNEL_VISUAL_BIBLE" as const,
          resourceId: bibleResource.resourceId,
          version: bibleResource.version,
          contentHash: bibleResource.contentHash
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

    const updated = await this.directedProjects.getStatus(projectId);
    await writeProjectSnapshot(updated);
    return { status: updated, repinned: true };
  }
}
