import type {
  FactRecord,
  IdentityAnchor,
  IdentityAnchorType,
  MediaArtifact,
  ProductionAsset,
  ProductionPriority,
  ProjectFormat,
  ProjectStyle,
  Scene,
  ScriptVersion
} from "@vpf/domain";

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
    type: "PROJECT" | "SCRIPT" | "SEQUENCE" | "SCENE" | "PROJECT_STYLE" | "IDENTITY_ANCHOR" | "ASSET" | "MEDIA" | "LINK" | "CLIP";
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


export interface ChannelVisualBibleSnapshot {
  version: string;
  resourceId: string;
  contentHash: string;
  payload: unknown;
}

export interface VisualIdentityBaseContext {
  projectId: string;
  format: ProjectFormat;
  script: ScriptVersion;
  facts: FactRecord[];
  scenes: Scene[];
  channelVisualBible: ChannelVisualBibleSnapshot;
}

export interface ProjectStyleDecision {
  eraRegion: string;
  visualApproach: string;
  realismLevel: string;
  colorLanguage: string;
  lightingLanguage: string;
  materialLanguage: string;
  environmentLanguage: string;
  characterRenderingPrinciple: string;
  cameraCompositionTendency: string;
  moodRange: string[];
  factualConstraints: string[];
  avoidances: string[];
}

export interface AnchorPlanDecision {
  anchors: Array<{
    key: string;
    anchorType: IdentityAnchorType;
    name: string;
    rationale: string;
    continuityReason: "RECURRING" | "CRITICAL_CONTINUITY";
    productionPriority: ProductionPriority;
    requiredBySceneIds: string[];
    specification: {
      locked: string[];
      contextual: string[];
      temporary: string[];
    };
  }>;
}

export interface VisualIdentityDecisionPort {
  designProjectStyle(
    input: VisualIdentityBaseContext
  ): Promise<ProjectStyleDecision>;
  planIdentityAnchors(
    input: VisualIdentityBaseContext & { projectStyle: ProjectStyle }
  ): Promise<AnchorPlanDecision>;
}

export class ProductionVisualIdentityPlanner implements VisualIdentityDecisionPort {
  constructor(
    private readonly adapter: ProductionSystemAdapter,
    private readonly taskIds: TaskIdFactory
  ) {}

  async designProjectStyle(
    input: VisualIdentityBaseContext
  ): Promise<ProjectStyleDecision> {
    return this.executeDecision<ProjectStyleDecision, VisualIdentityBaseContext>(
      "PROJECT_STYLE",
      input,
      { type: "PROJECT", id: input.projectId }
    );
  }

  async planIdentityAnchors(
    input: VisualIdentityBaseContext & { projectStyle: ProjectStyle }
  ): Promise<AnchorPlanDecision> {
    return this.executeDecision<
      AnchorPlanDecision,
      VisualIdentityBaseContext & { projectStyle: ProjectStyle }
    >(
      "ANCHOR_PLAN",
      input,
      {
        type: "PROJECT_STYLE",
        id: input.projectStyle.id,
        revision: input.projectStyle.revision
      }
    );
  }

  private async executeDecision<TDecision, TContext extends { projectId: string }>(
    taskType: ProductionTaskType,
    context: TContext,
    target: ProductionTaskRequest["target"]
  ): Promise<TDecision> {
    const response = await this.adapter.execute<TDecision, TContext>({
      taskId: this.taskIds.nextTaskId(),
      taskType,
      projectId: context.projectId,
      target,
      context
    });

    if (response.status === "BLOCKED") {
      throw new ProductionDecisionError(
        "PRODUCTION_DECISION_BLOCKED",
        response.decisionSummary
      );
    }
    if (response.status === "FAILED") {
      throw new ProductionDecisionError(
        "PRODUCTION_DECISION_FAILED",
        response.decisionSummary
      );
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


export interface FormatProfileSnapshot {
  version: string;
  resourceId: string;
  contentHash: string;
  payload: unknown;
}

export interface SceneAssetBaseContext {
  projectId: string;
  format: ProjectFormat;
  scene: Scene;
  projectStyle: ProjectStyle;
  identityAnchors: IdentityAnchor[];
  channelVisualBible: ChannelVisualBibleSnapshot;
  formatProfile: FormatProfileSnapshot;
}

export interface AssetPlanDecision {
  assetClass: "PRIMARY_SCENE" | "EXTRA_START" | "SPECIAL_END" | "BRIDGE" | "REFERENCE";
  assetRole: "HERO" | "STORY_ANCHOR" | "STANDARD";
  productionPriority: ProductionPriority;
  sourceStrategy: "GENERATE" | "IMPORT" | "REUSE";
  stateField: "STATE_IN" | "STATE_CURRENT" | "STATE_OUT";
  rationale: string;
}

export interface ImageAssetDesignDecision {
  visualGoal: string;
  composition: string;
  continuityRequirements: string[];
  identityAnchorIds: string[];
  factualConstraints: string[];
  avoidances: string[];
}

export interface ImagePromptDecision {
  prompt: string;
  negativePrompt?: string;
}

export interface ImageQcDecision {
  qcStatus: "PASS" | "PASS_WITH_NOTE" | "FIXABLE" | "REGENERATE" | "REDESIGN" | "REJECT";
  severity: "CRITICAL" | "MAJOR" | "MINOR";
  confidence: number;
  symptom?: string;
  rootCause?: string;
  recommendedAction?: string;
  fallback?: string;
}

export interface SceneAssetDecisionPort {
  planAsset(input: SceneAssetBaseContext): Promise<AssetPlanDecision>;
  designImageAsset(
    input: SceneAssetBaseContext & { assetPlan: AssetPlanDecision }
  ): Promise<ImageAssetDesignDecision>;
  compileImagePrompt(
    input: SceneAssetBaseContext & {
      asset: ProductionAsset;
    }
  ): Promise<ImagePromptDecision>;
  runImageQc(
    input: SceneAssetBaseContext & {
      asset: ProductionAsset;
      candidate: MediaArtifact;
    }
  ): Promise<ImageQcDecision>;
}

export class ProductionSceneAssetPlanner implements SceneAssetDecisionPort {
  constructor(
    private readonly adapter: ProductionSystemAdapter,
    private readonly taskIds: TaskIdFactory
  ) {}

  async planAsset(input: SceneAssetBaseContext): Promise<AssetPlanDecision> {
    return this.execute<AssetPlanDecision, SceneAssetBaseContext>(
      "ASSET_PLAN",
      input,
      { type: "SCENE", id: input.scene.id, revision: input.scene.revision }
    );
  }

  async designImageAsset(
    input: SceneAssetBaseContext & { assetPlan: AssetPlanDecision }
  ): Promise<ImageAssetDesignDecision> {
    return this.execute<
      ImageAssetDesignDecision,
      SceneAssetBaseContext & { assetPlan: AssetPlanDecision }
    >(
      "IMAGE_ASSET_DESIGN",
      input,
      { type: "SCENE", id: input.scene.id, revision: input.scene.revision }
    );
  }

  async compileImagePrompt(
    input: SceneAssetBaseContext & { asset: ProductionAsset }
  ): Promise<ImagePromptDecision> {
    return this.execute<
      ImagePromptDecision,
      SceneAssetBaseContext & { asset: ProductionAsset }
    >(
      "IMAGE_PROMPT",
      input,
      { type: "ASSET", id: input.asset.id, revision: input.asset.revision }
    );
  }

  async runImageQc(
    input: SceneAssetBaseContext & {
      asset: ProductionAsset;
      candidate: MediaArtifact;
    }
  ): Promise<ImageQcDecision> {
    return this.execute<
      ImageQcDecision,
      SceneAssetBaseContext & {
        asset: ProductionAsset;
        candidate: MediaArtifact;
      }
    >(
      "IMAGE_QC",
      input,
      { type: "ASSET", id: input.asset.id, revision: input.asset.revision }
    );
  }

  private async execute<TDecision, TContext extends { projectId: string }>(
    taskType: ProductionTaskType,
    context: TContext,
    target: ProductionTaskRequest["target"]
  ): Promise<TDecision> {
    const response = await this.adapter.execute<TDecision, TContext>({
      taskId: this.taskIds.nextTaskId(),
      taskType,
      projectId: context.projectId,
      target,
      context
    });
    if (response.status === "BLOCKED") {
      throw new ProductionDecisionError(
        "PRODUCTION_DECISION_BLOCKED",
        response.decisionSummary
      );
    }
    if (response.status === "FAILED") {
      throw new ProductionDecisionError(
        "PRODUCTION_DECISION_FAILED",
        response.decisionSummary
      );
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
