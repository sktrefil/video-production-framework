import * as path from "node:path";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { Wf09CliService } from "./wf09.js";
import { Wf09AutoError } from "./wf09-auto.js";
import { Wf09VisualDirectionAutoService } from "./wf09-directed-auto.js";
import { prepareHandoffAwareSceneAssetPlan } from "./wf09-handoff.js";
import { resetPreVisualDirectionImageState } from "./wf09-reset.js";
import { prepareVisualDirectionSceneAssetPlan } from "./wf09-visual-direction.js";
import { Wf09bCliService } from "./wf09b.js";

function isInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function hasVisualDirection(asset: {
  design: { composition: string; imagePrompt?: string };
}): boolean {
  return (
    asset.design.composition.includes("VISUAL DIRECTION:") &&
    typeof asset.design.imagePrompt === "string" &&
    asset.design.imagePrompt.includes("VISUAL DIRECTION:")
  );
}

export class Wf09HandoffAutoService {
  private readonly base: Wf09VisualDirectionAutoService;
  private readonly wf09: Wf09CliService;
  private readonly wf09b: Wf09bCliService;

  constructor(private readonly projects: ProjectBootstrapService) {
    this.base = new Wf09VisualDirectionAutoService(projects);
    this.wf09 = new Wf09CliService(projects);
    this.wf09b = new Wf09bCliService(projects);
  }

  async resetPreVisualDirection(projectId: string) {
    return resetPreVisualDirectionImageState(this.projects, projectId);
  }

  private async refreshExistingDesignedAssets(projectId: string, file: string) {
    const before = await this.wf09.status(projectId);
    if (before.assetCount === 0) {
      return {
        refreshed: false,
        reason: "NO_EXISTING_ASSETS",
        assetCount: 0,
        promptMaterializedCount: 0
      } as const;
    }

    if (before.assets.every(asset => hasVisualDirection(asset))) {
      return {
        refreshed: false,
        reason: "ALREADY_VISUAL_DIRECTION_V1",
        assetCount: before.assetCount,
        promptMaterializedCount: before.promptMaterializedCount
      } as const;
    }

    // WF-09A's status count includes historical ProviderJob rows for audit
    // visibility. Migration safety must only consider the current ACTIVE image
    // production state, which is exposed by WF-09B runtime status.
    const runtime = await this.wf09b.status(projectId);
    if (runtime.providerJobCount > 0) {
      throw new Wf09AutoError(
        "WF09_AUTO_PROJECT_STATE",
        "Existing Scene Assets predate Visual Direction Grammar V1 but already have active Provider Jobs. WF-09 AUTO will not silently redesign production-stage Assets; run the explicit pre-VDG reset before applying the new grammar."
      );
    }

    if (!before.assets.every(asset => !asset.stale && asset.assetStatus === "DESIGNED")) {
      throw new Wf09AutoError(
        "WF09_AUTO_PROJECT_STATE",
        "Existing Scene Assets predate Visual Direction Grammar V1 and are no longer all current DESIGNED Assets. WF-09 AUTO refuses to overwrite candidate/QC/approved production state."
      );
    }

    const readiness = await this.wf09.readiness(projectId, file);
    if (!readiness.ready) {
      throw new Wf09AutoError(
        "WF09_AUTO_PROJECT_STATE",
        `Existing Scene Assets cannot be migrated to Visual Direction Grammar V1 because WF-09 prerequisites are not ready: ${readiness.readyCount}/${readiness.sceneCount}.`
      );
    }

    const redesigned = await this.wf09.applyDesigns(projectId, file);
    const prompts = await this.wf09.materializePrompts(projectId, file);
    return {
      refreshed: true,
      reason: "MIGRATED_PRE_GRAMMAR_DESIGNS",
      assetCount: redesigned.designedCount,
      promptMaterializedCount: prompts.promptMaterializedCount
    } as const;
  }

  private async prepareInternal(projectId: string, options: { file?: string | undefined } = {}) {
    // Pin the channel / Visual Bible / image-provider versions before deriving
    // production decisions. This phase intentionally performs no provider
    // execution so a real pilot can inspect the production-ready prompt set
    // before spending generation capacity.
    const pinResult = await this.base.ensureBrowserProviderPins(projectId);
    const status = pinResult.status;
    const sourceFile = options.file === undefined
      ? path.join(status.projectRoot, "05_images", "scene-assets.json")
      : path.resolve(options.file);
    if (!isInside(status.projectRoot, sourceFile)) {
      throw new Wf09AutoError(
        "WF09_AUTO_PLAN_MISSING",
        "WF-09 AUTO Scene Asset plan must remain inside the current project workspace."
      );
    }

    let handoff;
    try {
      handoff = await prepareHandoffAwareSceneAssetPlan({ status, sourceFile });
    } catch (error: unknown) {
      throw new Wf09AutoError(
        "WF09_AUTO_PLAN_MISSING",
        error instanceof Error
          ? `WF-09 handoff-aware plan preparation failed: ${error.message}`
          : "WF-09 handoff-aware plan preparation failed."
      );
    }

    let visualDirection;
    try {
      visualDirection = await prepareVisualDirectionSceneAssetPlan({
        status,
        sourceFile: handoff.file
      });
    } catch (error: unknown) {
      throw new Wf09AutoError(
        "WF09_AUTO_PLAN_MISSING",
        error instanceof Error
          ? `WF-09 Visual Direction plan preparation failed: ${error.message}`
          : "WF-09 Visual Direction plan preparation failed."
      );
    }

    const visualDirectionRefresh = await this.refreshExistingDesignedAssets(
      projectId,
      visualDirection.file
    );
    const wf09Status = await this.wf09.status(projectId);

    return {
      projectId,
      status,
      pinResult,
      handoff,
      visualDirection,
      visualDirectionRefresh,
      wf09Status
    };
  }

  private publicPreparationResult(prepared: Awaited<ReturnType<Wf09HandoffAutoService["prepareInternal"]>>) {
    const { projectId, status, pinResult, handoff, visualDirection, visualDirectionRefresh, wf09Status } = prepared;
    return {
      projectId,
      preparedOnly: true,
      repinned: pinResult.repinned,
      handoffAwarePlan: {
        applied: handoff.applied,
        visualLinkCount: handoff.visualLinkCount,
        enrichedSceneCount: handoff.enrichedSceneCount,
        linkIds: handoff.linkIds,
        file: path.relative(status.projectRoot, handoff.file).replaceAll("\\", "/")
      },
      visualDirectionPlan: {
        applied: visualDirection.applied,
        grammarId: visualDirection.grammarId,
        grammarVersion: visualDirection.grammarVersion,
        grammarContentHash: visualDirection.grammarContentHash,
        enrichedSceneCount: visualDirection.enrichedSceneCount,
        file: path.relative(status.projectRoot, visualDirection.file).replaceAll("\\", "/")
      },
      visualDirectionRefresh,
      wf09Status
    };
  }

  async prepare(projectId: string, options: { file?: string | undefined } = {}) {
    return this.publicPreparationResult(await this.prepareInternal(projectId, options));
  }

  async run(projectId: string, options: { file?: string | undefined } = {}) {
    const prepared = await this.prepareInternal(projectId, options);
    const result = await this.base.run(projectId, { file: prepared.visualDirection.file });
    return {
      ...result,
      preparedOnly: false,
      repinned: prepared.pinResult.repinned || result.repinned,
      handoffAwarePlan: {
        applied: prepared.handoff.applied,
        visualLinkCount: prepared.handoff.visualLinkCount,
        enrichedSceneCount: prepared.handoff.enrichedSceneCount,
        linkIds: prepared.handoff.linkIds,
        file: path.relative(prepared.status.projectRoot, prepared.handoff.file).replaceAll("\\", "/")
      },
      visualDirectionPlan: {
        applied: prepared.visualDirection.applied,
        grammarId: prepared.visualDirection.grammarId,
        grammarVersion: prepared.visualDirection.grammarVersion,
        grammarContentHash: prepared.visualDirection.grammarContentHash,
        enrichedSceneCount: prepared.visualDirection.enrichedSceneCount,
        file: path.relative(prepared.status.projectRoot, prepared.visualDirection.file).replaceAll("\\", "/")
      },
      visualDirectionRefresh: prepared.visualDirectionRefresh
    };
  }

  async resume(projectId: string) {
    return this.base.resume(projectId);
  }

  async status(projectId: string) {
    const [result, project] = await Promise.all([
      this.base.status(projectId),
      this.projects.getStatus(projectId)
    ]);
    const visualBible = project.resourcePins.find(pin =>
      pin.resourceType === "CHANNEL_VISUAL_BIBLE" &&
      pin.resourceId === "HISTORY_MYSTERY_VISUAL_BIBLE"
    );
    return {
      ...result,
      visualDirection: {
        grammarId: "HISTORY_MYSTERY_VISUAL_DIRECTION_GRAMMAR_V1",
        grammarVersion: "1.0.0",
        visualBibleVersion: visualBible?.version ?? null,
        visualBibleContentHash: visualBible?.contentHash ?? null
      }
    };
  }
}
