import type {
  IdentityAnchor,
  MediaArtifact,
  ProductionAsset,
  ProjectFormat,
  ProjectStyle,
  ProviderExecutionMode,
  ProviderJob,
  Scene
} from "@vpf/domain";
import type {
  ChannelVisualBibleSnapshot,
  FormatProfileSnapshot,
  SceneAssetDecisionPort
} from "@vpf/production-system";
import {
  imageRuntimeExpectedOutputs,
  normalizeImageSha256,
  validateImageRuntimeInput,
  type ImageRuntimeInput,
  type ImageRuntimeReference
} from "@vpf/runtime-contracts/image";
import type { RuntimeExpectedOutput } from "@vpf/runtime-contracts";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import {
  SceneAssetValidationError,
  type ChannelVisualBiblePort,
  type FormatProfilePort,
  type SceneAssetClock,
  type SceneAssetContextPort,
  type SceneAssetIdFactory,
  type SceneAssetRepository
} from "./index.js";

interface ResolvedImageContext {
  projectId: string;
  format: ProjectFormat;
  scene: Scene;
  projectStyle: ProjectStyle;
  identityAnchors: IdentityAnchor[];
  channelVisualBible: ChannelVisualBibleSnapshot;
  formatProfile: FormatProfileSnapshot;
}

export interface UnifiedImageGenerationJobInput {
  projectId: string;
  assetId: string;
  format: ProjectFormat;
  provider: string;
  providerProfileVersion: string;
  executionMode: ProviderExecutionMode;
}

export interface UnifiedImageGenerationJobOutput {
  asset: ProductionAsset;
  job: ProviderJob;
  runtimeInput: ImageRuntimeInput;
  expectedOutputs: RuntimeExpectedOutput[];
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

function nextAssetRevision(
  asset: ProductionAsset,
  changes: Partial<ProductionAsset>,
  now: string
): ProductionAsset {
  return {
    ...asset,
    ...changes,
    revision: asset.revision + 1,
    lifecycleStatus: "ACTIVE",
    updatedAt: now
  };
}

function requireFormatDimensions(formatProfile: FormatProfileSnapshot): {
  width: number;
  height: number;
  aspectRatio: string;
} {
  const payload = formatProfile.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new SceneAssetValidationError(
      "ASSET_DESIGN_INVALID",
      "Format Profile payload is invalid for image generation."
    );
  }
  const record = payload as Record<string, unknown>;
  const imageGeneration = record.imageGeneration;
  if (
    imageGeneration === null ||
    typeof imageGeneration !== "object" ||
    Array.isArray(imageGeneration)
  ) {
    throw new SceneAssetValidationError(
      "ASSET_DESIGN_INVALID",
      "Format Profile must define imageGeneration dimensions."
    );
  }
  const image = imageGeneration as Record<string, unknown>;
  const width = image.width;
  const height = image.height;
  const aspectRatio = record.aspectRatio;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    (width as number) <= 0 ||
    (height as number) <= 0 ||
    typeof aspectRatio !== "string" ||
    !aspectRatio.trim()
  ) {
    throw new SceneAssetValidationError(
      "ASSET_DESIGN_INVALID",
      "Format Profile image generation dimensions/aspect ratio are invalid."
    );
  }
  return {
    width: width as number,
    height: height as number,
    aspectRatio
  };
}

function outputPath(assetId: string, attempt: number): string {
  return `05_images/generated/${encodeURIComponent(assetId)}/attempt-${attempt}.png`;
}

function isReferenceOrConfigFailure(job: ProviderJob): boolean {
  return (
    job.status === "BLOCKED" ||
    job.errorCode === "ARTIFACT_HASH_MISMATCH" ||
    job.errorCode === "RUNTIME_INPUT_MISSING" ||
    job.errorCode === "RUNTIME_INPUT_HASH_MISMATCH" ||
    job.errorCode === "RUNTIME_CONFIG_INVALID" ||
    job.errorCode === "ARTIFACT_PATH_INVALID" ||
    job.errorCode === "ARTIFACT_MEDIA_TYPE_MISMATCH"
  );
}

export class UnifiedImageRuntimeJobService {
  constructor(
    private readonly repository: SceneAssetRepository,
    private readonly context: SceneAssetContextPort,
    private readonly visualBibles: ChannelVisualBiblePort,
    private readonly formatProfiles: FormatProfilePort,
    private readonly decisions: SceneAssetDecisionPort,
    private readonly clock: SceneAssetClock,
    private readonly ids: SceneAssetIdFactory
  ) {}

  async prepareGeneration(
    input: UnifiedImageGenerationJobInput
  ): Promise<UnifiedImageGenerationJobOutput> {
    const asset = await this.requireGenerationReadyAsset(input.projectId, input.assetId);
    const resolved = await this.resolveContext(asset, input.format);
    const promptDecision = await this.decisions.compileImagePrompt({
      ...resolved,
      asset
    });
    if (!promptDecision.prompt.trim()) {
      throw new SceneAssetValidationError(
        "ASSET_DESIGN_INVALID",
        "Final IMAGE_PROMPT must not be empty."
      );
    }

    const dimensions = requireFormatDimensions(resolved.formatProfile);
    const references = await this.resolveApprovedReferences(
      input.projectId,
      resolved.identityAnchors
    );
    const now = this.clock.nowIso();
    const nextAsset = nextAssetRevision(
      asset,
      { assetStatus: "GENERATING" },
      now
    );
    const runtimeInput: ImageRuntimeInput = {
      prompt: promptDecision.prompt,
      ...(promptDecision.negativePrompt === undefined
        ? {}
        : { negativePrompt: promptDecision.negativePrompt }),
      width: dimensions.width,
      height: dimensions.height,
      aspectRatio: dimensions.aspectRatio,
      references,
      outputRelativePath: outputPath(asset.id, 1)
    };
    validateImageRuntimeInput(runtimeInput);

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
      // The durable target is the GENERATING revision created in the same
      // transaction, so MIG-02 stale-target protection remains valid.
      targetRevision: nextAsset.revision,
      executionMode: input.executionMode,
      status: input.executionMode === "AUTOMATED" ? "READY" : "WAITING_EXTERNAL",
      attempt: 1,
      inputPayload: runtimeInput,
      resultMediaIds: []
    };

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "IMAGE_RUNTIME_JOB_CREATED",
      targetType: "ASSET",
      targetId: asset.id,
      trigger: "SYSTEM",
      payload: {
        jobId: job.id,
        targetRevision: job.targetRevision,
        executionMode: job.executionMode,
        referenceMediaIds: references.map(reference => reference.mediaId)
      }
    });
    await this.repository.createProviderJob({
      job,
      asset: nextAsset,
      event,
      outbox
    });

    return {
      asset: nextAsset,
      job,
      runtimeInput,
      expectedOutputs: imageRuntimeExpectedOutputs(runtimeInput)
    };
  }

  async synchronizeRuntimeOutcome(input: {
    projectId: string;
    jobId: string;
  }): Promise<ProductionAsset> {
    const job = await this.repository.getLatestProviderJob(input.projectId, input.jobId);
    if (job === null || job.jobType !== "IMAGE_GENERATION" || job.targetType !== "ASSET") {
      throw new SceneAssetValidationError(
        "PROVIDER_JOB_NOT_FOUND",
        "Image runtime Provider Job does not exist."
      );
    }
    const asset = await this.repository.getLatestAsset(input.projectId, job.targetId);
    if (asset === null) {
      throw new SceneAssetValidationError("ASSET_NOT_FOUND", "Target Asset does not exist.");
    }

    if (
      asset.revision > job.targetRevision &&
      (asset.assetStatus === "CANDIDATE_AVAILABLE" ||
        asset.assetStatus === "REGENERATE_REQUIRED" ||
        asset.assetStatus === "BLOCKED")
    ) {
      return asset;
    }
    if (asset.revision !== job.targetRevision || asset.assetStatus !== "GENERATING") {
      throw new SceneAssetValidationError(
        "ASSET_GENERATION_NOT_READY",
        "Image runtime result target no longer matches the active GENERATING Asset revision."
      );
    }

    const now = this.clock.nowIso();
    let nextAsset: ProductionAsset;
    let payload: Record<string, unknown>;
    let trigger: WorkflowEvent["trigger"] = "PROVIDER_RESULT";

    if (job.status === "COMPLETE") {
      if (job.resultMediaIds.length !== 1) {
        throw new SceneAssetValidationError(
          "PROVIDER_JOB_NOT_COMPLETE",
          "Completed image runtime Job must contain exactly one result MediaArtifact."
        );
      }
      const media = await this.repository.getMedia(input.projectId, job.resultMediaIds[0]!);
      if (
        media === null ||
        media.mediaType !== "IMAGE" ||
        media.mediaStatus !== "AVAILABLE" ||
        media.sourceJobId !== job.id
      ) {
        throw new SceneAssetValidationError(
          "MEDIA_NOT_FOUND",
          "Runtime-ingested image MediaArtifact is unavailable or has invalid provenance."
        );
      }
      validateImageRuntimeInput(job.inputPayload);
      const runtimeInput = job.inputPayload as ImageRuntimeInput;
      if (media.width !== runtimeInput.width || media.height !== runtimeInput.height) {
        throw new SceneAssetValidationError(
          "MEDIA_TYPE_INVALID",
          "Runtime image dimensions differ from approved Format Profile dimensions."
        );
      }
      normalizeImageSha256(media.checksum);
      nextAsset = nextAssetRevision(
        asset,
        {
          assetStatus: "CANDIDATE_AVAILABLE",
          candidateMediaIds: asset.candidateMediaIds.includes(media.id)
            ? asset.candidateMediaIds
            : [...asset.candidateMediaIds, media.id]
        },
        now
      );
      payload = { jobId: job.id, mediaId: media.id, status: job.status };
    } else if (job.status === "FAILED" || job.status === "BLOCKED") {
      const blocked = isReferenceOrConfigFailure(job);
      nextAsset = nextAssetRevision(
        asset,
        { assetStatus: blocked ? "BLOCKED" : "REGENERATE_REQUIRED" },
        now
      );
      payload = {
        jobId: job.id,
        status: job.status,
        errorCode: job.errorCode ?? null,
        retryable: !blocked
      };
    } else {
      throw new SceneAssetValidationError(
        "PROVIDER_JOB_NOT_COMPLETE",
        "Image runtime Job has not reached a terminal result."
      );
    }

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "IMAGE_RUNTIME_OUTCOME_SYNCHRONIZED",
      targetType: "ASSET",
      targetId: asset.id,
      trigger,
      payload
    });
    await this.repository.commitAssetCandidate({
      previousAsset: asset,
      nextAsset,
      event,
      outbox
    });
    return nextAsset;
  }

  async retryFailedGeneration(input: {
    projectId: string;
    jobId: string;
  }): Promise<UnifiedImageGenerationJobOutput> {
    const failedJob = await this.repository.getLatestProviderJob(input.projectId, input.jobId);
    if (
      failedJob === null ||
      failedJob.jobType !== "IMAGE_GENERATION" ||
      (failedJob.status !== "FAILED" && failedJob.status !== "BLOCKED")
    ) {
      throw new SceneAssetValidationError(
        "PROVIDER_JOB_NOT_FAILED",
        "Retry requires a terminal failed image Provider Job."
      );
    }
    const asset = await this.repository.getLatestAsset(input.projectId, failedJob.targetId);
    if (asset === null || asset.assetStatus !== "REGENERATE_REQUIRED") {
      throw new SceneAssetValidationError(
        "ASSET_GENERATION_NOT_READY",
        "Only a REGENERATE_REQUIRED Asset can retry image execution."
      );
    }
    validateImageRuntimeInput(failedJob.inputPayload);
    const previousInput = failedJob.inputPayload as ImageRuntimeInput;
    const attempt = failedJob.attempt + 1;
    const runtimeInput: ImageRuntimeInput = {
      ...previousInput,
      references: previousInput.references.map(reference => ({ ...reference })),
      outputRelativePath: outputPath(asset.id, attempt)
    };
    validateImageRuntimeInput(runtimeInput);

    const now = this.clock.nowIso();
    const nextAsset = nextAssetRevision(
      asset,
      { assetStatus: "GENERATING" },
      now
    );
    const job: ProviderJob = {
      id: this.ids.next("job"),
      projectId: failedJob.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      jobType: "IMAGE_GENERATION",
      provider: failedJob.provider,
      providerProfileVersion: failedJob.providerProfileVersion,
      targetType: "ASSET",
      targetId: failedJob.targetId,
      targetRevision: nextAsset.revision,
      executionMode: failedJob.executionMode,
      status: failedJob.executionMode === "AUTOMATED" ? "READY" : "WAITING_EXTERNAL",
      attempt,
      retryOfJobId: failedJob.id,
      inputPayload: runtimeInput,
      resultMediaIds: []
    };
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "IMAGE_RUNTIME_RETRY_CREATED",
      targetType: "ASSET",
      targetId: asset.id,
      trigger: "SYSTEM",
      payload: { jobId: job.id, retryOfJobId: failedJob.id, attempt }
    });
    await this.repository.createRetryProviderJob({
      job,
      previousAsset: asset,
      nextAsset,
      event,
      outbox
    });
    return {
      asset: nextAsset,
      job,
      runtimeInput,
      expectedOutputs: imageRuntimeExpectedOutputs(runtimeInput)
    };
  }

  targetRevisionPort(): {
    getCurrentTargetRevision(input: {
      projectId: string;
      targetType: ProviderJob["targetType"];
      targetId: string;
    }): Promise<number | null>;
  } {
    return {
      getCurrentTargetRevision: async input => {
        if (input.targetType !== "ASSET") return null;
        const asset = await this.repository.getLatestAsset(input.projectId, input.targetId);
        return asset?.revision ?? null;
      }
    };
  }

  private async requireGenerationReadyAsset(
    projectId: string,
    assetId: string
  ): Promise<ProductionAsset> {
    const asset = await this.repository.getLatestAsset(projectId, assetId);
    if (asset === null) {
      throw new SceneAssetValidationError("ASSET_NOT_FOUND", "Asset does not exist.");
    }
    if (asset.stale) {
      throw new SceneAssetValidationError("ASSET_STALE", "Asset is stale.");
    }
    if (asset.sourceStrategy !== "GENERATE") {
      throw new SceneAssetValidationError(
        "ASSET_SOURCE_STRATEGY_INVALID",
        "Unified image runtime is only for GENERATE Assets."
      );
    }
    if (asset.assetStatus !== "DESIGNED" && asset.assetStatus !== "REGENERATE_REQUIRED") {
      throw new SceneAssetValidationError(
        "ASSET_GENERATION_NOT_READY",
        "Asset must be DESIGNED or REGENERATE_REQUIRED before image execution."
      );
    }
    if (asset.owner.type !== "SCENE") {
      throw new SceneAssetValidationError(
        "ASSET_GENERATION_NOT_READY",
        "Unified image runtime currently requires a Scene-owned Asset."
      );
    }
    return asset;
  }

  private async resolveContext(
    asset: ProductionAsset,
    format: ProjectFormat
  ): Promise<ResolvedImageContext> {
    const scene = await this.context.getScene(asset.projectId, asset.owner.id);
    if (scene === null) {
      throw new SceneAssetValidationError("SCENE_NOT_FOUND", "Scene does not exist.");
    }
    if (scene.stale) {
      throw new SceneAssetValidationError("SCENE_STALE", "Scene is stale.");
    }
    if (scene.sceneStatus !== "APPROVED" && scene.sceneStatus !== "IN_PRODUCTION" && scene.sceneStatus !== "PRODUCTION_COMPLETE") {
      throw new SceneAssetValidationError(
        "SCENE_APPROVAL_REQUIRED",
        "Scene approval is required before image execution."
      );
    }
    const projectStyle = await this.context.getApprovedProjectStyle(asset.projectId);
    if (projectStyle === null || projectStyle.stale) {
      throw new SceneAssetValidationError(
        "PROJECT_STYLE_APPROVAL_REQUIRED",
        "Approved current Project Style is required."
      );
    }
    const identityAnchors = await this.context.getRequiredIdentityAnchors(
      asset.projectId,
      scene.id
    );
    const anchorsById = new Map(identityAnchors.map(anchor => [anchor.id, anchor] as const));
    for (const anchorId of scene.requiredIdentityAnchorIds) {
      const identityAnchor = anchorsById.get(anchorId);
      if (
        identityAnchor === undefined ||
        identityAnchor.stale ||
        !(await this.context.isIdentityAnchorApproved(asset.projectId, identityAnchor))
      ) {
        throw new SceneAssetValidationError(
          "IDENTITY_ANCHOR_APPROVAL_REQUIRED",
          `Approved Identity Anchor is required: ${anchorId}`
        );
      }
    }
    const channelVisualBible = await this.visualBibles.resolve(
      projectStyle.channelVisualBibleVersion
    );
    if (channelVisualBible === null) {
      throw new SceneAssetValidationError(
        "CHANNEL_VISUAL_BIBLE_NOT_FOUND",
        "Pinned Channel Visual Bible cannot be resolved."
      );
    }
    const formatProfile = await this.formatProfiles.resolve(asset.formatProfileVersion);
    if (formatProfile === null) {
      throw new SceneAssetValidationError(
        "FORMAT_PROFILE_NOT_FOUND",
        "Pinned Format Profile cannot be resolved."
      );
    }
    return {
      projectId: asset.projectId,
      format,
      scene,
      projectStyle,
      identityAnchors,
      channelVisualBible,
      formatProfile
    };
  }

  private async resolveApprovedReferences(
    projectId: string,
    anchors: IdentityAnchor[]
  ): Promise<ImageRuntimeReference[]> {
    const references: ImageRuntimeReference[] = [];
    for (const identityAnchor of anchors) {
      for (const mediaId of identityAnchor.referenceMediaIds) {
        const media = await this.repository.getMedia(projectId, mediaId);
        if (media === null || media.mediaType !== "IMAGE" || media.mediaStatus !== "AVAILABLE") {
          throw new SceneAssetValidationError(
            "MEDIA_NOT_FOUND",
            `Approved Identity Anchor reference is unavailable: ${mediaId}`
          );
        }
        const sha256 = normalizeImageSha256(media.checksum);
        references.push({
          mediaId,
          role: `IDENTITY_ANCHOR:${identityAnchor.id}`,
          relativePath: media.relativePath,
          sha256
        });
      }
    }
    return references;
  }
}
