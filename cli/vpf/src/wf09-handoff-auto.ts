import * as path from "node:path";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { Wf09AutoError } from "./wf09-auto.js";
import { Wf09VisualDirectionAutoService } from "./wf09-directed-auto.js";
import { prepareHandoffAwareSceneAssetPlan } from "./wf09-handoff.js";
import { prepareVisualDirectionSceneAssetPlan } from "./wf09-visual-direction.js";

function isInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export class Wf09HandoffAutoService {
  private readonly base: Wf09VisualDirectionAutoService;

  constructor(private readonly projects: ProjectBootstrapService) {
    this.base = new Wf09VisualDirectionAutoService(projects);
  }

  async run(projectId: string, options: { file?: string | undefined } = {}) {
    // Pin the channel / Visual Bible / image-provider versions before deriving
    // production decisions. The parent run calls the same method again and
    // observes an idempotent no-op.
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

    const result = await this.base.run(projectId, { file: visualDirection.file });
    return {
      ...result,
      repinned: pinResult.repinned || result.repinned,
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
      }
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
