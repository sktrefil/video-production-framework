import * as path from "node:path";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { Wf09AutoError, Wf09AutoService } from "./wf09-auto.js";
import { prepareHandoffAwareSceneAssetPlan } from "./wf09-handoff.js";

function isInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export class Wf09HandoffAutoService {
  private readonly base: Wf09AutoService;

  constructor(private readonly projects: ProjectBootstrapService) {
    this.base = new Wf09AutoService(projects);
  }

  async run(projectId: string, options: { file?: string | undefined } = {}) {
    const status = await this.projects.getStatus(projectId);
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

    const result = await this.base.run(projectId, { file: handoff.file });
    return {
      ...result,
      handoffAwarePlan: {
        applied: handoff.applied,
        visualLinkCount: handoff.visualLinkCount,
        enrichedSceneCount: handoff.enrichedSceneCount,
        linkIds: handoff.linkIds,
        file: path.relative(status.projectRoot, handoff.file).replaceAll("\\", "/")
      }
    };
  }

  async resume(projectId: string) {
    return this.base.resume(projectId);
  }

  async status(projectId: string) {
    return this.base.status(projectId);
  }
}
