import type {
  ApprovalRecord,
  IdentityAnchor,
  MediaArtifact,
  ProductionAsset,
  ProjectFormat,
  ProjectStyle,
  ProviderExecutionMode,
  ProviderJob,
  QcResult,
  Scene
} from "@vpf/domain";
import type {
  AssetPlanDecision,
  ChannelVisualBibleSnapshot,
  FormatProfileSnapshot,
  ImageAssetDesignDecision,
  ImagePromptDecision,
  ImageQcDecision,
  SceneAssetDecisionPort
} from "@vpf/production-system";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";

export interface SceneAssetContextPort {
  getScene(projectId: string, sceneId: string): Promise<Scene | null>;
  getApprovedProjectStyle(projectId: string): Promise<ProjectStyle | null>;
  getRequiredIdentityAnchors(
    projectId: string,
    sceneId: string
  ): Promise<IdentityAnchor[]>;
  isIdentityAnchorApproved(
    projectId: string,
    anchor: IdentityAnchor
  ): Promise<boolean>;
}

export interface ChannelVisualBiblePort {
  resolve(version: string): Promise<ChannelVisualBibleSnapshot | null>;
}

export interface FormatProfilePort {
  resolve(version: string): Promise<FormatProfileSnapshot | null>;
}

export interface ImageApprovalPolicy {
  shouldAutoApprove(input: {
    asset: ProductionAsset;
    candidate: MediaArtifact;
    qc: QcResult;
  }): boolean;
}

export interface SceneAssetRepository {
  getLatestAsset(projectId: string, assetId: string): Promise<ProductionAsset | null>;
  getPrimarySceneAsset(projectId: string, sceneId: string): Promise<ProductionAsset | null>;
  listAssets(projectId: string): Promise<ProductionAsset[]>;
  commitAssetDesign(input: {
    previous: ProductionAsset | null;
    next: ProductionAsset;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  createProviderJob(input: {
    job: ProviderJob;
    asset: ProductionAsset;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  getLatestProviderJob(projectId: string, jobId: string): Promise<ProviderJob | null>;
  commitProviderResult(input: {
    previousJob: ProviderJob;
    nextJob: ProviderJob;
    previousAsset: ProductionAsset;
    nextAsset: ProductionAsset;
    media: MediaArtifact;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  commitProviderJobFailure(input: {
    previousJob: ProviderJob;
    nextJob: ProviderJob;
    previousAsset: ProductionAsset;
    nextAsset: ProductionAsset;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  createRetryProviderJob(input: {
    job: ProviderJob;
    previousAsset: ProductionAsset;
    nextAsset: ProductionAsset;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  getMedia(projectId: string, mediaId: string): Promise<MediaArtifact | null>;
  getLatestQcForMedia(
    projectId: string,
    assetId: string,
    mediaId: string
  ): Promise<QcResult | null>;
  commitImageQc(input: {
    previousAsset: ProductionAsset;
    nextAsset: ProductionAsset;
    qc: QcResult;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  commitAssetApproval(input: {
    previousAsset: ProductionAsset;
    nextAsset: ProductionAsset;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  markAssetsStale(input: {
    assetIds: string[];
    reason: string;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
}

export interface SceneAssetClock {
  nowIso(): string;
}

export interface SceneAssetIdFactory {
  next(
    prefix: "ast" | "job" | "med" | "qc" | "apr" | "evt" | "outbox"
  ): string;
}

export interface SceneAssetReadiness {
  sceneApproved: boolean;
  projectStyleApproved: boolean;
  requiredAnchorIds: string[];
  approvedAnchorIds: string[];
  missingAnchorApprovalIds: string[];
  channelVisualBibleResolved: boolean;
  formatProfileResolved: boolean;
  ready: boolean;
}

export class SceneAssetValidationError extends Error {
  constructor(
    public readonly code:
      | "SCENE_NOT_FOUND"
      | "SCENE_APPROVAL_REQUIRED"
      | "SCENE_STALE"
      | "PROJECT_STYLE_APPROVAL_REQUIRED"
      | "IDENTITY_ANCHOR_APPROVAL_REQUIRED"
      | "CHANNEL_VISUAL_BIBLE_NOT_FOUND"
      | "FORMAT_PROFILE_NOT_FOUND"
      | "ASSET_PLAN_INVALID"
      | "ASSET_DESIGN_INVALID"
      | "ASSET_NOT_FOUND"
      | "ASSET_GENERATION_NOT_READY"
      | "PROVIDER_JOB_NOT_FOUND"
      | "PROVIDER_JOB_NOT_COMPLETE"
      | "PROVIDER_JOB_NOT_FAILED"
      | "MEDIA_PATH_INVALID"
      | "MEDIA_TYPE_INVALID"
      | "MEDIA_CHECKSUM_REQUIRED"
      | "MEDIA_NOT_FOUND"
      | "MEDIA_NOT_CANDIDATE"
      | "IMAGE_QC_REQUIRED"
      | "IMAGE_QC_NOT_APPROVABLE"
      | "ASSET_STALE",
    message: string
  ) {
    super(message);
    this.name = "SceneAssetValidationError";
  }
}

function durableEvent(
  ids: SceneAssetIdFactory,
  clock: SceneAssetClock,
  input: Omit<WorkflowEvent, "eventId" | "createdAt">
): { event: WorkflowEvent; outbox: OutboxRecord } {
  const createdAt = clock.nowIso();
  const event: WorkflowEvent = {
    ...input,
    eventId: ids.next("evt"),
    createdAt
  };
  return {
    event,
    outbox: {
      outboxId: ids.next("outbox"),
      eventId: event.eventId,
      status: "PENDING",
      attempts: 0,
      createdAt
    }
  };
}

function validatePlan(plan: AssetPlanDecision): void {
  if (
    plan.assetClass === "REFERENCE" ||
    !plan.rationale.trim()
  ) {
    throw new SceneAssetValidationError(
      "ASSET_PLAN_INVALID",
      "Scene production Asset Plan cannot be a REFERENCE asset and requires rationale."
    );
  }
}

function validateDesign(
  design: ImageAssetDesignDecision,
  requiredAnchorIds: string[]
): void {
  if (!design.visualGoal.trim() || !design.composition.trim()) {
    throw new SceneAssetValidationError(
      "ASSET_DESIGN_INVALID",
      "Image Asset Design requires visual goal and composition."
    );
  }
  const designed = new Set(design.identityAnchorIds);
  const missing = requiredAnchorIds.filter((anchorId) => !designed.has(anchorId));
  if (missing.length > 0) {
    throw new SceneAssetValidationError(
      "ASSET_DESIGN_INVALID",
      `Image Asset Design omitted required Identity Anchors: ${missing.join(", ")}`
    );
  }
}

function validateRelativeMediaPath(relativePath: string): void {
  const normalized = relativePath.replace(/\\/g, "/").trim();
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new SceneAssetValidationError(
      "MEDIA_PATH_INVALID",
      "Media path must be a normalized project-relative path without traversal."
    );
  }
}

function nextAssetRevision(
  asset: ProductionAsset,
  patch: Partial<ProductionAsset>,
  now: string
): ProductionAsset {
  return {
    ...asset,
    ...patch,
    id: asset.id,
    projectId: asset.projectId,
    revision: asset.revision + 1,
    lifecycleStatus: "ACTIVE",
    createdAt: asset.createdAt,
    updatedAt: now
  };
}

export class SceneAssetPipeline {
  constructor(
    private readonly repository: SceneAssetRepository,
    private readonly context: SceneAssetContextPort,
    private readonly bible: ChannelVisualBiblePort,
    private readonly formatProfiles: FormatProfilePort,
    private readonly decisions: SceneAssetDecisionPort,
    private readonly approvalPolicy: ImageApprovalPolicy,
    private readonly clock: SceneAssetClock,
    private readonly ids: SceneAssetIdFactory
  ) {}

  async getReadiness(input: {
    projectId: string;
    sceneId: string;
    formatProfileVersion: string;
  }): Promise<SceneAssetReadiness> {
    const scene = await this.context.getScene(input.projectId, input.sceneId);
    const style = await this.context.getApprovedProjectStyle(input.projectId);
    const anchors = scene === null
      ? []
      : await this.context.getRequiredIdentityAnchors(input.projectId, input.sceneId);
    const approvedAnchorIds: string[] = [];

    for (const anchor of anchors) {
      if (
        !anchor.stale &&
        await this.context.isIdentityAnchorApproved(input.projectId, anchor)
      ) {
        approvedAnchorIds.push(anchor.id);
      }
    }

    const requiredAnchorIds = anchors.map((anchor) => anchor.id);
    const approved = new Set(approvedAnchorIds);
    const missingAnchorApprovalIds = requiredAnchorIds.filter(
      (anchorId) => !approved.has(anchorId)
    );
    const channelVisualBible =
      style === null
        ? null
        : await this.bible.resolve(style.channelVisualBibleVersion);
    const formatProfile = await this.formatProfiles.resolve(input.formatProfileVersion);
    const sceneApproved =
      scene !== null &&
      scene.sceneStatus === "APPROVED" &&
      !scene.stale;

    return {
      sceneApproved,
      projectStyleApproved: style !== null,
      requiredAnchorIds,
      approvedAnchorIds,
      missingAnchorApprovalIds,
      channelVisualBibleResolved: channelVisualBible !== null,
      formatProfileResolved: formatProfile !== null,
      ready:
        sceneApproved &&
        style !== null &&
        missingAnchorApprovalIds.length === 0 &&
        channelVisualBible !== null &&
        formatProfile !== null
    };
  }

  async designPrimarySceneAsset(input: {
    projectId: string;
    sceneId: string;
    format: ProjectFormat;
    formatProfileVersion: string;
  }): Promise<ProductionAsset> {
    const resolved = await this.resolveContext(input);
    const existing = await this.repository.getPrimarySceneAsset(
      input.projectId,
      input.sceneId
    );

    const plan = await this.decisions.planAsset(resolved);
    validatePlan(plan);
    if (plan.assetClass !== "PRIMARY_SCENE") {
      throw new SceneAssetValidationError(
        "ASSET_PLAN_INVALID",
        "The primary Scene Asset workflow requires assetClass PRIMARY_SCENE."
      );
    }

    const design = await this.decisions.designImageAsset({
      ...resolved,
      assetPlan: plan
    });
    validateDesign(
      design,
      resolved.identityAnchors.map((anchor) => anchor.id)
    );

    const now = this.clock.nowIso();
    const next: ProductionAsset = {
      id: existing?.id ?? this.ids.next("ast"),
      projectId: input.projectId,
      revision: existing === null ? 1 : existing.revision + 1,
      lifecycleStatus: "ACTIVE",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      stale: false,
      assetClass: "PRIMARY_SCENE",
      assetRole: plan.assetRole,
      productionPriority: plan.productionPriority,
      sourceStrategy: plan.sourceStrategy,
      owner: { type: "SCENE", id: resolved.scene.id },
      stateRef: {
        entityType: "SCENE",
        entityId: resolved.scene.id,
        stateField: plan.stateField,
        entityRevision: resolved.scene.revision
      },
      design: {
        visualGoal: design.visualGoal.trim(),
        composition: design.composition.trim(),
        continuityRequirements: [...design.continuityRequirements],
        identityAnchorIds: [...design.identityAnchorIds],
        factualConstraints: [...design.factualConstraints],
        avoidances: [...design.avoidances]
      },
      candidateMediaIds: [],
      assetStatus: "DESIGNED",
      sourceSceneRevision: resolved.scene.revision,
      sourceProjectStyleId: resolved.projectStyle.id,
      sourceProjectStyleRevision: resolved.projectStyle.revision,
      sourceIdentityAnchorRevisions: Object.fromEntries(
        resolved.identityAnchors.map((anchor) => [anchor.id, anchor.revision])
      ),
      formatProfileVersion: resolved.formatProfile.version
    };

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "SCENE_ASSET_DESIGNED",
      targetType: "ASSET",
      targetId: next.id,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        sceneId: resolved.scene.id,
        assetRevision: next.revision
      }
    });
    await this.repository.commitAssetDesign({
      previous: existing,
      next,
      event,
      outbox
    });
    return next;
  }

  async createImageGenerationJob(input: {
    projectId: string;
    assetId: string;
    format: ProjectFormat;
    provider: string;
    providerProfileVersion: string;
    executionMode: ProviderExecutionMode;
  }): Promise<{ asset: ProductionAsset; job: ProviderJob }> {
    const asset = await this.repository.getLatestAsset(input.projectId, input.assetId);
    if (asset === null) {
      throw new SceneAssetValidationError("ASSET_NOT_FOUND", "Asset does not exist.");
    }
    if (
      asset.stale ||
      (asset.assetStatus !== "DESIGNED" &&
        asset.assetStatus !== "REGENERATE_REQUIRED")
    ) {
      throw new SceneAssetValidationError(
        "ASSET_GENERATION_NOT_READY",
        "Asset must be current and DESIGNED or REGENERATE_REQUIRED before image generation."
      );
    }

    const resolved = await this.resolveContext({
      projectId: input.projectId,
      sceneId: asset.owner.id,
      format: input.format,
      formatProfileVersion: asset.formatProfileVersion
    });
    const promptDecision = await this.decisions.compileImagePrompt({
      ...resolved,
      asset
    });
    if (!promptDecision.prompt.trim()) {
      throw new SceneAssetValidationError(
        "ASSET_DESIGN_INVALID",
        "IMAGE_PROMPT returned an empty provider execution prompt."
      );
    }

    const now = this.clock.nowIso();
    const job: ProviderJob = {
      id: this.ids.next("job"),
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      jobType: "IMAGE_GENERATION",
      provider: input.provider,
      providerProfileVersion: input.providerProfileVersion,
      targetType: "ASSET",
      targetId: asset.id,
      targetRevision: asset.revision,
      executionMode: input.executionMode,
      status: input.executionMode === "AUTOMATED" ? "READY" : "WAITING_EXTERNAL",
      attempt: 1,
      inputPayload: {
        prompt: promptDecision.prompt,
        ...(promptDecision.negativePrompt === undefined
          ? {}
          : { negativePrompt: promptDecision.negativePrompt })
      },
      resultMediaIds: []
    };
    const nextAsset = nextAssetRevision(
      asset,
      { assetStatus: "GENERATING" },
      now
    );
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "IMAGE_GENERATION_JOB_CREATED",
      targetType: "ASSET",
      targetId: asset.id,
      trigger: "USER",
      payload: {
        jobId: job.id,
        executionMode: job.executionMode,
        provider: job.provider
      }
    });
    await this.repository.createProviderJob({
      job,
      asset: nextAsset,
      event,
      outbox
    });
    return { asset: nextAsset, job };
  }

  async markImageJobFailed(input: {
    projectId: string;
    jobId: string;
    errorCode: string;
    errorDetail?: string;
  }): Promise<{ asset: ProductionAsset; job: ProviderJob }> {
    const previousJob = await this.repository.getLatestProviderJob(
      input.projectId,
      input.jobId
    );
    if (previousJob === null) {
      throw new SceneAssetValidationError(
        "PROVIDER_JOB_NOT_FOUND",
        "Provider Job does not exist."
      );
    }
    if (
      previousJob.status === "COMPLETE" ||
      previousJob.status === "FAILED" ||
      previousJob.status === "CANCELLED"
    ) {
      throw new SceneAssetValidationError(
        "PROVIDER_JOB_NOT_COMPLETE",
        "Completed or cancelled Provider Job cannot be marked failed."
      );
    }
    const previousAsset = await this.repository.getLatestAsset(
      input.projectId,
      previousJob.targetId
    );
    if (previousAsset === null) {
      throw new SceneAssetValidationError("ASSET_NOT_FOUND", "Target Asset does not exist.");
    }

    const now = this.clock.nowIso();
    const nextJob: ProviderJob = {
      ...previousJob,
      revision: previousJob.revision + 1,
      updatedAt: now,
      status: "FAILED",
      errorCode: input.errorCode,
      ...(input.errorDetail === undefined
        ? {}
        : { errorDetail: input.errorDetail })
    };
    const nextAsset = nextAssetRevision(
      previousAsset,
      { assetStatus: "REGENERATE_REQUIRED" },
      now
    );
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "IMAGE_GENERATION_JOB_FAILED",
      targetType: "ASSET",
      targetId: previousAsset.id,
      trigger: "PROVIDER_RESULT",
      payload: {
        jobId: previousJob.id,
        errorCode: input.errorCode
      }
    });
    await this.repository.commitProviderJobFailure({
      previousJob,
      nextJob,
      previousAsset,
      nextAsset,
      event,
      outbox
    });
    return { asset: nextAsset, job: nextJob };
  }

  async retryImageGenerationJob(input: {
    projectId: string;
    failedJobId: string;
    format: ProjectFormat;
    executionMode?: ProviderExecutionMode;
  }): Promise<{ asset: ProductionAsset; job: ProviderJob }> {
    const failedJob = await this.repository.getLatestProviderJob(
      input.projectId,
      input.failedJobId
    );
    if (failedJob === null) {
      throw new SceneAssetValidationError(
        "PROVIDER_JOB_NOT_FOUND",
        "Failed Provider Job does not exist."
      );
    }
    if (failedJob.status !== "FAILED") {
      throw new SceneAssetValidationError(
        "PROVIDER_JOB_NOT_FAILED",
        "Only FAILED Provider Jobs can use Retry Failed."
      );
    }
    const asset = await this.repository.getLatestAsset(
      input.projectId,
      failedJob.targetId
    );
    if (
      asset === null ||
      asset.stale ||
      asset.assetStatus !== "REGENERATE_REQUIRED"
    ) {
      throw new SceneAssetValidationError(
        "ASSET_GENERATION_NOT_READY",
        "Target Asset is not ready for a failed-job retry."
      );
    }

    const resolved = await this.resolveContext({
      projectId: input.projectId,
      sceneId: asset.owner.id,
      format: input.format,
      formatProfileVersion: asset.formatProfileVersion
    });
    const prompt = await this.decisions.compileImagePrompt({
      ...resolved,
      asset
    });
    if (!prompt.prompt.trim()) {
      throw new SceneAssetValidationError(
        "ASSET_DESIGN_INVALID",
        "IMAGE_PROMPT returned an empty provider execution prompt."
      );
    }

    const executionMode = input.executionMode ?? failedJob.executionMode;
    const now = this.clock.nowIso();
    const job: ProviderJob = {
      id: this.ids.next("job"),
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      jobType: "IMAGE_GENERATION",
      provider: failedJob.provider,
      providerProfileVersion: failedJob.providerProfileVersion,
      targetType: "ASSET",
      targetId: asset.id,
      targetRevision: asset.revision,
      executionMode,
      status: executionMode === "AUTOMATED" ? "READY" : "WAITING_EXTERNAL",
      attempt: failedJob.attempt + 1,
      retryOfJobId: failedJob.id,
      inputPayload: {
        prompt: prompt.prompt,
        ...(prompt.negativePrompt === undefined
          ? {}
          : { negativePrompt: prompt.negativePrompt })
      },
      resultMediaIds: []
    };
    const nextAsset = nextAssetRevision(
      asset,
      { assetStatus: "GENERATING" },
      now
    );
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "IMAGE_GENERATION_JOB_RETRIED",
      targetType: "ASSET",
      targetId: asset.id,
      trigger: "USER",
      payload: {
        failedJobId: failedJob.id,
        retryJobId: job.id,
        attempt: job.attempt
      }
    });
    await this.repository.createRetryProviderJob({
      job,
      previousAsset: asset,
      nextAsset,
      event,
      outbox
    });
    return { asset: nextAsset, job };
  }

  async registerImageResult(input: {
    projectId: string;
    jobId: string;
    relativePath: string;
    mimeType: string;
    checksum: string;
    width?: number;
    height?: number;
  }): Promise<{ asset: ProductionAsset; job: ProviderJob; media: MediaArtifact }> {
    validateRelativeMediaPath(input.relativePath);
    if (!input.mimeType.toLowerCase().startsWith("image/")) {
      throw new SceneAssetValidationError(
        "MEDIA_TYPE_INVALID",
        "Image generation result must use an image MIME type."
      );
    }
    if (!input.checksum.trim()) {
      throw new SceneAssetValidationError(
        "MEDIA_CHECKSUM_REQUIRED",
        "Generated media requires a checksum."
      );
    }

    const previousJob = await this.repository.getLatestProviderJob(
      input.projectId,
      input.jobId
    );
    if (previousJob === null) {
      throw new SceneAssetValidationError(
        "PROVIDER_JOB_NOT_FOUND",
        "Provider Job does not exist."
      );
    }
    if (
      previousJob.jobType !== "IMAGE_GENERATION" ||
      previousJob.status === "CANCELLED" ||
      previousJob.status === "BLOCKED" ||
      previousJob.status === "FAILED"
    ) {
      throw new SceneAssetValidationError(
        "PROVIDER_JOB_NOT_COMPLETE",
        "Provider Job cannot accept a successful image result."
      );
    }

    const previousAsset = await this.repository.getLatestAsset(
      input.projectId,
      previousJob.targetId
    );
    if (previousAsset === null) {
      throw new SceneAssetValidationError("ASSET_NOT_FOUND", "Target Asset does not exist.");
    }

    const now = this.clock.nowIso();
    const media: MediaArtifact = {
      id: this.ids.next("med"),
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      mediaType: "IMAGE",
      relativePath: input.relativePath.replace(/\\/g, "/"),
      mimeType: input.mimeType,
      ...(input.width === undefined ? {} : { width: input.width }),
      ...(input.height === undefined ? {} : { height: input.height }),
      checksum: input.checksum,
      sourceJobId: previousJob.id,
      mediaStatus: "AVAILABLE"
    };
    const nextJob: ProviderJob = {
      ...previousJob,
      revision: previousJob.revision + 1,
      updatedAt: now,
      status: "COMPLETE",
      resultMediaIds: [...previousJob.resultMediaIds, media.id]
    };
    const nextAsset = nextAssetRevision(
      previousAsset,
      {
        assetStatus: "CANDIDATE_AVAILABLE",
        candidateMediaIds: [...previousAsset.candidateMediaIds, media.id]
      },
      now
    );
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "IMAGE_RESULT_REGISTERED",
      targetType: "ASSET",
      targetId: previousAsset.id,
      trigger: "PROVIDER_RESULT",
      payload: { jobId: previousJob.id, mediaId: media.id }
    });
    await this.repository.commitProviderResult({
      previousJob,
      nextJob,
      previousAsset,
      nextAsset,
      media,
      event,
      outbox
    });
    return { asset: nextAsset, job: nextJob, media };
  }

  async runImageQc(input: {
    projectId: string;
    assetId: string;
    mediaId: string;
    format: ProjectFormat;
  }): Promise<{ asset: ProductionAsset; qc: QcResult; approval?: ApprovalRecord }> {
    const asset = await this.repository.getLatestAsset(input.projectId, input.assetId);
    if (asset === null) {
      throw new SceneAssetValidationError("ASSET_NOT_FOUND", "Asset does not exist.");
    }
    if (asset.stale) {
      throw new SceneAssetValidationError("ASSET_STALE", "Asset is stale.");
    }
    if (!asset.candidateMediaIds.includes(input.mediaId)) {
      throw new SceneAssetValidationError(
        "MEDIA_NOT_CANDIDATE",
        "Media is not a candidate of the selected Asset."
      );
    }
    const candidate = await this.repository.getMedia(input.projectId, input.mediaId);
    if (candidate === null || candidate.mediaStatus !== "AVAILABLE") {
      throw new SceneAssetValidationError("MEDIA_NOT_FOUND", "Candidate media is unavailable.");
    }

    const resolved = await this.resolveContext({
      projectId: input.projectId,
      sceneId: asset.owner.id,
      format: input.format,
      formatProfileVersion: asset.formatProfileVersion
    });
    const decision = await this.decisions.runImageQc({
      ...resolved,
      asset,
      candidate
    });
    const now = this.clock.nowIso();
    const qc: QcResult = {
      id: this.ids.next("qc"),
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      qcType: "IMAGE_QC",
      targetType: "ASSET",
      targetId: asset.id,
      targetRevision: asset.revision,
      mediaId: candidate.id,
      qcStatus: decision.qcStatus,
      severity: decision.severity,
      confidence: decision.confidence,
      ...(decision.symptom === undefined ? {} : { symptom: decision.symptom }),
      ...(decision.rootCause === undefined ? {} : { rootCause: decision.rootCause }),
      ...(decision.recommendedAction === undefined
        ? {}
        : { recommendedAction: decision.recommendedAction }),
      ...(decision.fallback === undefined ? {} : { fallback: decision.fallback })
    };

    let status: ProductionAsset["assetStatus"];
    if (decision.qcStatus === "PASS" || decision.qcStatus === "PASS_WITH_NOTE") {
      status = "NEEDS_REVIEW";
    } else if (decision.qcStatus === "FIXABLE") {
      status = "NEEDS_REVIEW";
    } else if (decision.qcStatus === "REGENERATE") {
      status = "REGENERATE_REQUIRED";
    } else if (decision.qcStatus === "REDESIGN") {
      status = "REDESIGN_REQUIRED";
    } else {
      status = "BLOCKED";
    }

    let nextAsset = nextAssetRevision(asset, { assetStatus: status }, now);
    let approval: ApprovalRecord | undefined;

    if (
      (decision.qcStatus === "PASS" || decision.qcStatus === "PASS_WITH_NOTE") &&
      this.approvalPolicy.shouldAutoApprove({ asset: nextAsset, candidate, qc })
    ) {
      approval = {
        id: this.ids.next("apr"),
        projectId: input.projectId,
        targetType: "ASSET",
        targetId: nextAsset.id,
        targetRevision: nextAsset.revision,
        approvalState: "AUTO_APPROVED",
        reason: "IMAGE_QC_AUTO_APPROVED",
        approvedByType: "SYSTEM",
        selectedMediaId: candidate.id,
        createdAt: now
      };
      nextAsset = {
        ...nextAsset,
        approvedMediaId: candidate.id,
        assetStatus: "APPROVED"
      };
    }

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "IMAGE_QC_COMPLETED",
      targetType: "ASSET",
      targetId: asset.id,
      trigger: "QC_RESULT",
      payload: {
        mediaId: candidate.id,
        qcStatus: qc.qcStatus,
        autoApproved: approval !== undefined
      }
    });
    await this.repository.commitImageQc({
      previousAsset: asset,
      nextAsset,
      qc,
      ...(approval === undefined ? {} : { approval }),
      event,
      outbox
    });
    return {
      asset: nextAsset,
      qc,
      ...(approval === undefined ? {} : { approval })
    };
  }

  async approveAsset(input: {
    projectId: string;
    assetId: string;
    mediaId: string;
    approvedById?: string;
  }): Promise<{ asset: ProductionAsset; approval: ApprovalRecord }> {
    const asset = await this.repository.getLatestAsset(input.projectId, input.assetId);
    if (asset === null) {
      throw new SceneAssetValidationError("ASSET_NOT_FOUND", "Asset does not exist.");
    }
    if (asset.stale) {
      throw new SceneAssetValidationError("ASSET_STALE", "Asset is stale.");
    }
    if (!asset.candidateMediaIds.includes(input.mediaId)) {
      throw new SceneAssetValidationError(
        "MEDIA_NOT_CANDIDATE",
        "Media is not a candidate of the selected Asset."
      );
    }
    const media = await this.repository.getMedia(input.projectId, input.mediaId);
    if (media === null || media.mediaStatus !== "AVAILABLE") {
      throw new SceneAssetValidationError("MEDIA_NOT_FOUND", "Candidate media is unavailable.");
    }
    const qc = await this.repository.getLatestQcForMedia(
      input.projectId,
      asset.id,
      input.mediaId
    );
    if (qc === null) {
      throw new SceneAssetValidationError(
        "IMAGE_QC_REQUIRED",
        "Run Image QC before approving a candidate."
      );
    }
    if (qc.qcStatus !== "PASS" && qc.qcStatus !== "PASS_WITH_NOTE") {
      throw new SceneAssetValidationError(
        "IMAGE_QC_NOT_APPROVABLE",
        "Only PASS or PASS_WITH_NOTE candidates can be approved."
      );
    }

    const now = this.clock.nowIso();
    const nextAsset = nextAssetRevision(
      asset,
      {
        approvedMediaId: media.id,
        assetStatus: "APPROVED"
      },
      now
    );
    const approval: ApprovalRecord = {
      id: this.ids.next("apr"),
      projectId: input.projectId,
      targetType: "ASSET",
      targetId: nextAsset.id,
      targetRevision: nextAsset.revision,
      approvalState: "HUMAN_APPROVED",
      reason: "IMAGE_CANDIDATE_APPROVED",
      approvedByType: "USER",
      ...(input.approvedById === undefined ? {} : { approvedById: input.approvedById }),
      selectedMediaId: media.id,
      createdAt: now
    };
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "ASSET_APPROVED",
      targetType: "ASSET",
      targetId: nextAsset.id,
      trigger: "USER",
      payload: {
        assetRevision: nextAsset.revision,
        selectedMediaId: media.id
      }
    });
    await this.repository.commitAssetApproval({
      previousAsset: asset,
      nextAsset,
      approval,
      event,
      outbox
    });
    return { asset: nextAsset, approval };
  }

  async reconcileDependencies(projectId: string): Promise<string[]> {
    const assets = await this.repository.listAssets(projectId);
    const staleIds: string[] = [];

    for (const asset of assets.filter((item) => item.lifecycleStatus === "ACTIVE")) {
      const scene = await this.context.getScene(projectId, asset.owner.id);
      const style = await this.context.getApprovedProjectStyle(projectId);
      const anchors = scene === null
        ? []
        : await this.context.getRequiredIdentityAnchors(projectId, scene.id);
      const anchorRevisionMap = Object.fromEntries(
        anchors.map((anchor) => [anchor.id, anchor.revision])
      );

      const dependencyChanged =
        scene === null ||
        scene.stale ||
        scene.revision !== asset.sourceSceneRevision ||
        style === null ||
        style.id !== asset.sourceProjectStyleId ||
        style.revision !== asset.sourceProjectStyleRevision ||
        Object.keys(asset.sourceIdentityAnchorRevisions).length !== anchors.length ||
        Object.entries(asset.sourceIdentityAnchorRevisions).some(
          ([anchorId, revision]) => anchorRevisionMap[anchorId] !== revision
        );

      if (dependencyChanged) staleIds.push(asset.id);
    }

    if (staleIds.length === 0) return [];

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId,
      eventType: "SCENE_ASSETS_STALE_FROM_DEPENDENCY_CHANGE",
      targetType: "PROJECT",
      targetId: projectId,
      trigger: "WORKFLOW_ENGINE",
      payload: { assetIds: staleIds }
    });
    await this.repository.markAssetsStale({
      assetIds: staleIds,
      reason: "UPSTREAM_PRODUCTION_CONTEXT_CHANGED",
      event,
      outbox
    });
    return staleIds;
  }

  private async resolveContext(input: {
    projectId: string;
    sceneId: string;
    format: ProjectFormat;
    formatProfileVersion: string;
  }) {
    const scene = await this.context.getScene(input.projectId, input.sceneId);
    if (scene === null) {
      throw new SceneAssetValidationError("SCENE_NOT_FOUND", "Scene does not exist.");
    }
    if (scene.stale) {
      throw new SceneAssetValidationError("SCENE_STALE", "Scene is stale.");
    }
    if (scene.sceneStatus !== "APPROVED") {
      throw new SceneAssetValidationError(
        "SCENE_APPROVAL_REQUIRED",
        "Scene must be approved before Scene Asset design."
      );
    }

    const projectStyle = await this.context.getApprovedProjectStyle(input.projectId);
    if (projectStyle === null) {
      throw new SceneAssetValidationError(
        "PROJECT_STYLE_APPROVAL_REQUIRED",
        "Approved Project Style is required."
      );
    }

    const identityAnchors = await this.context.getRequiredIdentityAnchors(
      input.projectId,
      input.sceneId
    );
    const missing: string[] = [];
    for (const anchor of identityAnchors) {
      if (
        anchor.stale ||
        !(await this.context.isIdentityAnchorApproved(input.projectId, anchor))
      ) {
        missing.push(anchor.id);
      }
    }
    if (missing.length > 0) {
      throw new SceneAssetValidationError(
        "IDENTITY_ANCHOR_APPROVAL_REQUIRED",
        `Required Identity Anchors are not approved: ${missing.join(", ")}`
      );
    }

    const channelVisualBible = await this.bible.resolve(
      projectStyle.channelVisualBibleVersion
    );
    if (channelVisualBible === null) {
      throw new SceneAssetValidationError(
        "CHANNEL_VISUAL_BIBLE_NOT_FOUND",
        "Pinned Channel Visual Bible could not be resolved."
      );
    }
    const formatProfile = await this.formatProfiles.resolve(input.formatProfileVersion);
    if (formatProfile === null) {
      throw new SceneAssetValidationError(
        "FORMAT_PROFILE_NOT_FOUND",
        "Pinned Format Profile could not be resolved."
      );
    }

    return {
      projectId: input.projectId,
      format: input.format,
      scene,
      projectStyle,
      identityAnchors,
      channelVisualBible,
      formatProfile
    };
  }
}

export interface BatchItemResult<T> {
  targetId: string;
  ok: boolean;
  value?: T;
  code?: string;
  message?: string;
}

export interface BatchResult<T> {
  status: "COMPLETE" | "PARTIAL_COMPLETE" | "FAILED";
  total: number;
  succeeded: number;
  failed: number;
  items: BatchItemResult<T>[];
}

export class SceneAssetBatchService {
  constructor(private readonly pipeline: SceneAssetPipeline) {}

  async designPrimarySceneAssets(input: {
    projectId: string;
    sceneIds: string[];
    format: ProjectFormat;
    formatProfileVersion: string;
  }): Promise<BatchResult<ProductionAsset>> {
    return this.run(
      [...new Set(input.sceneIds)],
      (sceneId) => this.pipeline.designPrimarySceneAsset({
        projectId: input.projectId,
        sceneId,
        format: input.format,
        formatProfileVersion: input.formatProfileVersion
      })
    );
  }

  async createImageGenerationJobs(input: {
    projectId: string;
    assetIds: string[];
    format: ProjectFormat;
    provider: string;
    providerProfileVersion: string;
    executionMode: ProviderExecutionMode;
  }): Promise<BatchResult<{ asset: ProductionAsset; job: ProviderJob }>> {
    return this.run(
      [...new Set(input.assetIds)],
      (assetId) => this.pipeline.createImageGenerationJob({
        projectId: input.projectId,
        assetId,
        format: input.format,
        provider: input.provider,
        providerProfileVersion: input.providerProfileVersion,
        executionMode: input.executionMode
      })
    );
  }

  async runImageQc(input: {
    projectId: string;
    items: Array<{ assetId: string; mediaId: string }>;
    format: ProjectFormat;
  }): Promise<BatchResult<{
    asset: ProductionAsset;
    qc: QcResult;
    approval?: ApprovalRecord;
  }>> {
    return this.run(
      input.items,
      (item) => this.pipeline.runImageQc({
        projectId: input.projectId,
        assetId: item.assetId,
        mediaId: item.mediaId,
        format: input.format
      }),
      (item) => item.assetId
    );
  }

  async approveAssets(input: {
    projectId: string;
    items: Array<{ assetId: string; mediaId: string }>;
    approvedById?: string;
  }): Promise<BatchResult<{
    asset: ProductionAsset;
    approval: ApprovalRecord;
  }>> {
    return this.run(
      input.items,
      (item) => this.pipeline.approveAsset({
        projectId: input.projectId,
        assetId: item.assetId,
        mediaId: item.mediaId,
        ...(input.approvedById === undefined
          ? {}
          : { approvedById: input.approvedById })
      }),
      (item) => item.assetId
    );
  }

  async retryFailedJobs(input: {
    projectId: string;
    failedJobIds: string[];
    format: ProjectFormat;
  }): Promise<BatchResult<{ asset: ProductionAsset; job: ProviderJob }>> {
    return this.run(
      [...new Set(input.failedJobIds)],
      (jobId) => this.pipeline.retryImageGenerationJob({
        projectId: input.projectId,
        failedJobId: jobId,
        format: input.format
      })
    );
  }

  private async run<TInput, TOutput>(
    inputs: TInput[],
    runner: (input: TInput) => Promise<TOutput>,
    targetId: (input: TInput) => string = (input) => String(input)
  ): Promise<BatchResult<TOutput>> {
    const items: BatchItemResult<TOutput>[] = [];
    for (const input of inputs) {
      try {
        items.push({
          targetId: targetId(input),
          ok: true,
          value: await runner(input)
        });
      } catch (error) {
        items.push({
          targetId: targetId(input),
          ok: false,
          ...(error instanceof SceneAssetValidationError
            ? { code: error.code, message: error.message }
            : { code: "SCENE_ASSET_SYSTEM_ERROR", message: "Unexpected error" })
        });
      }
    }
    const succeeded = items.filter((item) => item.ok).length;
    const failed = items.length - succeeded;
    return {
      status:
        failed === 0
          ? "COMPLETE"
          : succeeded === 0
            ? "FAILED"
            : "PARTIAL_COMPLETE",
      total: items.length,
      succeeded,
      failed,
      items
    };
  }
}

export interface SceneAssetCommandResult<T> {
  ok: boolean;
  value?: T;
  code?: string;
  userMessage: string;
  recommendedAction?: string;
}

export class SceneAssetCommandFacade {
  constructor(private readonly pipeline: SceneAssetPipeline) {}

  async designPrimarySceneAsset(
    input: Parameters<SceneAssetPipeline["designPrimarySceneAsset"]>[0]
  ): Promise<SceneAssetCommandResult<ProductionAsset>> {
    try {
      const value = await this.pipeline.designPrimarySceneAsset(input);
      return {
        ok: true,
        value,
        userMessage: "장면 이미지 설계를 준비했습니다.",
        recommendedAction: "GENERATE_IMAGE"
      };
    } catch (error) {
      return mapSceneAssetError(error);
    }
  }
}

function mapSceneAssetError(error: unknown): SceneAssetCommandResult<never> {
  if (!(error instanceof SceneAssetValidationError)) {
    return {
      ok: false,
      code: "SCENE_ASSET_SYSTEM_ERROR",
      userMessage: "장면 이미지 처리 중 시스템 오류가 발생했습니다.",
      recommendedAction: "RETRY"
    };
  }

  const map: Record<
    SceneAssetValidationError["code"],
    { message: string; action: string }
  > = {
    SCENE_NOT_FOUND: {
      message: "장면을 찾을 수 없습니다.",
      action: "REFRESH_SCENES"
    },
    SCENE_APPROVAL_REQUIRED: {
      message: "이미지를 만들기 전에 장면 구성을 승인해야 합니다.",
      action: "APPROVE_SCENE"
    },
    SCENE_STALE: {
      message: "이 장면은 대본 변경으로 다시 검토해야 합니다.",
      action: "REVIEW_SCENE"
    },
    PROJECT_STYLE_APPROVAL_REQUIRED: {
      message: "프로젝트 스타일 승인이 필요합니다.",
      action: "APPROVE_PROJECT_STYLE"
    },
    IDENTITY_ANCHOR_APPROVAL_REQUIRED: {
      message: "이 장면에 필요한 인물·장소·소품 기준을 먼저 승인해야 합니다.",
      action: "REVIEW_IDENTITY_ANCHORS"
    },
    CHANNEL_VISUAL_BIBLE_NOT_FOUND: {
      message: "지정된 채널 비주얼 바이블 버전을 찾을 수 없습니다.",
      action: "RESOLVE_CHANNEL_VISUAL_BIBLE"
    },
    FORMAT_PROFILE_NOT_FOUND: {
      message: "지정된 영상 포맷 설정을 찾을 수 없습니다.",
      action: "RESOLVE_FORMAT_PROFILE"
    },
    ASSET_PLAN_INVALID: {
      message: "장면 이미지 계획이 올바르지 않습니다.",
      action: "REGENERATE_ASSET_PLAN"
    },
    ASSET_DESIGN_INVALID: {
      message: "장면 이미지 설계가 불완전합니다.",
      action: "REGENERATE_ASSET_DESIGN"
    },
    ASSET_NOT_FOUND: {
      message: "장면 이미지 작업을 찾을 수 없습니다.",
      action: "REFRESH_ASSETS"
    },
    ASSET_GENERATION_NOT_READY: {
      message: "현재 이미지 설계 상태에서는 생성을 시작할 수 없습니다.",
      action: "REVIEW_ASSET_DESIGN"
    },
    PROVIDER_JOB_NOT_FOUND: {
      message: "이미지 생성 작업을 찾을 수 없습니다.",
      action: "REFRESH_PROVIDER_JOBS"
    },
    PROVIDER_JOB_NOT_COMPLETE: {
      message: "이 생성 작업에는 결과를 등록할 수 없습니다.",
      action: "RETRY_IMAGE_JOB"
    },
    PROVIDER_JOB_NOT_FAILED: {
      message: "실패한 작업만 '실패 작업 재시도'를 사용할 수 있습니다.",
      action: "REFRESH_PROVIDER_JOBS"
    },
    MEDIA_PATH_INVALID: {
      message: "가져온 이미지 파일 경로가 안전한 프로젝트 경로가 아닙니다.",
      action: "IMPORT_IMAGE_AGAIN"
    },
    MEDIA_TYPE_INVALID: {
      message: "이미지 결과 파일 형식이 아닙니다.",
      action: "IMPORT_IMAGE_AGAIN"
    },
    MEDIA_CHECKSUM_REQUIRED: {
      message: "이미지 파일 검증 정보가 없습니다.",
      action: "IMPORT_IMAGE_AGAIN"
    },
    MEDIA_NOT_FOUND: {
      message: "이미지 후보 파일을 찾을 수 없습니다.",
      action: "REFRESH_MEDIA"
    },
    MEDIA_NOT_CANDIDATE: {
      message: "선택한 파일은 이 장면의 이미지 후보가 아닙니다.",
      action: "SELECT_ASSET_CANDIDATE"
    },
    IMAGE_QC_REQUIRED: {
      message: "이미지를 승인하기 전에 품질 검사가 필요합니다.",
      action: "RUN_IMAGE_QC"
    },
    IMAGE_QC_NOT_APPROVABLE: {
      message: "이 이미지는 현재 품질 검사 결과로 승인할 수 없습니다.",
      action: "REGENERATE_OR_REDESIGN_IMAGE"
    },
    ASSET_STALE: {
      message: "이 이미지는 이전 장면 또는 스타일 기준으로 만들어져 다시 생성해야 합니다.",
      action: "REDESIGN_SCENE_ASSET"
    }
  };
  const item = map[error.code];
  return {
    ok: false,
    code: error.code,
    userMessage: item.message,
    recommendedAction: item.action
  };
}
