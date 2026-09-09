import type { FactRecord, ProjectFormat, ScriptVersion } from "@vpf/domain";

export type ProductionTaskType =
  | "PROJECT_SETUP"
  | "STRUCTURE_DESIGN"
  | "SEQUENCE_DESIGN"
  | "SCENE_DESIGN"
  | "PROJECT_STYLE"
  | "ANCHOR_PLAN"
  | "ASSET_PLAN"
  | "IMAGE_ASSET_DESIGN"
  | "IMAGE_PROMPT"
  | "PRE_LINK"
  | "IMAGE_QC"
  | "QC"
  | "FINAL_CLIP_DESIGN"
  | "PROVIDER_PRE_QC"
  | "VIDEO_PROMPT"
  | "CLIP_QC"
  | "SEQUENCE_QC"
  | "CHAPTER_QC"
  | "FULL_VIDEO_QC"
  | "EXCEPTION_REVIEW";

export interface ProductionTaskRequest<TContext = unknown> {
  taskId: string;
  taskType: ProductionTaskType;
  projectId: string;
  target: {
    type: "PROJECT" | "SCRIPT" | "SEQUENCE" | "SCENE" | "ASSET" | "LINK" | "CLIP";
    id: string;
    revision?: number;
  };
  context: TContext;
}

export type ProductionDecisionStatus = "SUCCESS" | "NEEDS_REVIEW" | "BLOCKED" | "FAILED";

export interface ProductionDecisionEnvelope<TDecision = unknown> {
  decisionId: string;
  taskId: string;
  taskType: ProductionTaskType;
  status: ProductionDecisionStatus;
  confidence: number;
  decision?: TDecision;
  decisionSummary: string;
  ruleContextSnapshotId?: string;
  requiresHumanReview: boolean;
  warnings: string[];
}

export interface ProductionSystemAdapter {
  execute<TDecision, TContext>(
    request: ProductionTaskRequest<TContext>
  ): Promise<ProductionDecisionEnvelope<TDecision>>;
}

export interface StoryDecisionBaseContext {
  projectId: string;
  format: ProjectFormat;
  script: ScriptVersion;
  facts: FactRecord[];
}

export interface StructureDesignDecision {
  chapters: Array<{
    key: string;
    displayNumber: number;
    title: string;
  }>;
}

export interface SequenceDesignDecision {
  sequences: Array<{
    key: string;
    chapterKey: string;
    displayNumber: number;
    title: string;
    storyPurpose: string;
  }>;
}

export interface SceneDesignDecision {
  scenes: Array<{
    key: string;
    sequenceKey: string;
    displayNumber: number;
    scriptSegment: string;
    stateIn: string;
    stateCurrent: string;
    stateOut: string;
    primaryVisualIdea: string;
    mustBeSeen: string[];
    canBeNarrated: string[];
    canBeImplied: string[];
    requiredIdentityAnchorIds: string[];
  }>;
}

export interface StoryDecisionPort {
  designStructure(input: StoryDecisionBaseContext): Promise<StructureDesignDecision>;
  designSequences(
    input: StoryDecisionBaseContext & { structure: StructureDesignDecision }
  ): Promise<SequenceDesignDecision>;
  designScenes(
    input: StoryDecisionBaseContext & {
      structure: StructureDesignDecision;
      sequences: SequenceDesignDecision;
    }
  ): Promise<SceneDesignDecision>;
}

export interface TaskIdFactory {
  nextTaskId(): string;
}

export class ProductionDecisionError extends Error {
  constructor(
    public readonly code:
      | "PRODUCTION_DECISION_BLOCKED"
      | "PRODUCTION_DECISION_FAILED"
      | "PRODUCTION_DECISION_INVALID",
    message: string
  ) {
    super(message);
    this.name = "ProductionDecisionError";
  }
}

export class ProductionStoryPlanner implements StoryDecisionPort {
  constructor(
    private readonly adapter: ProductionSystemAdapter,
    private readonly taskIds: TaskIdFactory
  ) {}

  async designStructure(input: StoryDecisionBaseContext): Promise<StructureDesignDecision> {
    return this.executeDecision("STRUCTURE_DESIGN", input, input.script.id, input.script.revision);
  }

  async designSequences(
    input: StoryDecisionBaseContext & { structure: StructureDesignDecision }
  ): Promise<SequenceDesignDecision> {
    return this.executeDecision("SEQUENCE_DESIGN", input, input.script.id, input.script.revision);
  }

  async designScenes(
    input: StoryDecisionBaseContext & {
      structure: StructureDesignDecision;
      sequences: SequenceDesignDecision;
    }
  ): Promise<SceneDesignDecision> {
    return this.executeDecision("SCENE_DESIGN", input, input.script.id, input.script.revision);
  }

  private async executeDecision<TDecision, TContext>(
    taskType: ProductionTaskType,
    context: TContext & { projectId: string },
    targetId: string,
    targetRevision: number
  ): Promise<TDecision> {
    const response = await this.adapter.execute<TDecision, TContext>({
      taskId: this.taskIds.nextTaskId(),
      taskType,
      projectId: context.projectId,
      target: { type: "SCRIPT", id: targetId, revision: targetRevision },
      context
    });

    if (response.status === "BLOCKED") {
      throw new ProductionDecisionError("PRODUCTION_DECISION_BLOCKED", response.decisionSummary);
    }
    if (response.status === "FAILED") {
      throw new ProductionDecisionError("PRODUCTION_DECISION_FAILED", response.decisionSummary);
    }
    if (response.decision === undefined) {
      throw new ProductionDecisionError(
        "PRODUCTION_DECISION_INVALID",
        "Production decision did not include a structured decision payload."
      );
    }
    return response.decision;
  }
}
