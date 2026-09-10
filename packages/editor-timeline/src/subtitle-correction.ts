import type {EditorContentPlan} from "@vpf/domain";
import {
  EditorContentPlanService,
  type EditorContentPlanRepository,
  type TimelineAssemblyClock,
  type TimelineAssemblyIdFactory
} from "./index.js";

export class SubtitleCorrectionError extends Error {
  constructor(
    public readonly code:
      | "CONTENT_PLAN_REQUIRED"
      | "SUBTITLE_CUE_NOT_FOUND"
      | "SUBTITLE_CORRECTION_INVALID",
    message: string
  ) {
    super(message);
    this.name = "SubtitleCorrectionError";
  }
}

export class SubtitleCorrectionService {
  private readonly plans: EditorContentPlanService;

  constructor(
    private readonly repository: EditorContentPlanRepository,
    clock: TimelineAssemblyClock,
    ids: TimelineAssemblyIdFactory
  ) {
    this.plans = new EditorContentPlanService(repository, clock, ids);
  }

  async correctCue(input: {
    projectId: string;
    cueId: string;
    text: string;
    startMs: number;
    endMs: number;
  }): Promise<EditorContentPlan> {
    const previous = await this.repository.getLatestEditorContentPlan(input.projectId);
    if (previous === null) {
      throw new SubtitleCorrectionError(
        "CONTENT_PLAN_REQUIRED",
        "A current EditorContentPlan is required before subtitle correction."
      );
    }
    const cueIndex = previous.subtitles.findIndex(cue => cue.id === input.cueId);
    if (cueIndex < 0) {
      throw new SubtitleCorrectionError(
        "SUBTITLE_CUE_NOT_FOUND",
        `Subtitle cue does not exist in the current content plan: ${input.cueId}`
      );
    }
    if (
      !input.text.trim() ||
      !Number.isFinite(input.startMs) ||
      !Number.isFinite(input.endMs) ||
      input.startMs < 0 ||
      input.endMs <= input.startMs
    ) {
      throw new SubtitleCorrectionError(
        "SUBTITLE_CORRECTION_INVALID",
        "Manual subtitle correction requires non-empty text and a positive timing window."
      );
    }

    const subtitles = structuredClone(previous.subtitles);
    const source = subtitles[cueIndex]!;
    subtitles[cueIndex] = {
      ...source,
      text: input.text,
      startMs: input.startMs,
      endMs: input.endMs,
      generationSource: "MANUAL"
    };

    return await this.plans.savePlan({
      projectId: input.projectId,
      planStatus: "DRAFT",
      audio: previous.audio,
      subtitles,
      textOverlays: previous.textOverlays,
      graphics: previous.graphics
    });
  }
}
