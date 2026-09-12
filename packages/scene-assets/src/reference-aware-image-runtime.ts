import type {
  IdentityAnchor,
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
import type { RuntimeExpectedOutput } from "@vpf/runtime-contracts";
import {
  imageRuntimeExpectedOutputs,
  normalizeImageSha256,
  validateImageRuntimeInput,
  type ImageRuntimeInput,
  type ImageRuntimeReference
} from "@vpf/runtime-contracts/image";
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
import { UnifiedImageRuntimeJobService } from "./image-runtime.js";

export interface SceneRuntimeReferenceSelectionPort {
  selectReferences(input: {
    projectId: string;
    scene: Scene;
    knfBeat?: string;
    maxReferences?: number;
  }): Promise<ImageRuntimeReference[]>;
}

export interface ReferenceAwareImageGenerationJobInput {
  projectId: string;
  assetId: string;
  format: ProjectFormat;
  provider: string;
  providerProfileVersion: string;
  executionMode: ProviderExecutionMode;
  knfBeat?: string;
  maxLibraryReferences?: number;
}

export interface ReferenceAwareImageGenerationJobOutput {
  asset: ProductionAsset;
  job: ProviderJob;
  runtimeInput: ImageRuntimeInput;
  expectedOutputs: RuntimeExpectedOutput[];
}

interface ResolvedContext {
  scene: Scene;
  projectStyle: ProjectStyle;
  identityAnchors: IdentityAnchor[];
  channelVisualBible: ChannelVisualBibleSnapshot;
  formatProfile: FormatProfileSnapshot;
}

function durableEvent(
  ids: SceneAssetIdFactory,
  clock: SceneAssetClock,
  input: Omit<WorkflowEvent, "eventId" | "createdAt">
): { event: WorkflowEvent; outbox: OutboxRecord } {
  const createdAt = clock.nowIso();
  const event: WorkflowEvent = { ...input, eventId: ids.next("evt"), createdAt };
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

function nextAssetRevision(asset: ProductionAsset, now: string): ProductionAsset {
  return {
    ...asset,
    revision: asset.revision + 1,
    lifecycleStatus: "ACTIVE",
    assetStatus: "GENERATING",
    updatedAt: now
  };
}

function dimensions(profile: FormatProfileSnapshot): { width: number; height: number; aspectRatio: string } {
  const payload = profile.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new SceneAssetValidationError("ASSET_DESIGN_INVALID", "Format Profile payload is invalid for image generation.");
  }
  const record = payload as Record<string, unknown>;
  const imageGeneration = record.imageGeneration;
  if (imageGeneration === null || typeof imageGeneration !== "object" || Array.isArray(imageGeneration)) {
    throw new SceneAssetValidationError("ASSET_DESIGN_INVALID", "Format Profile must define imageGeneration dimensions.");
  }
  const image = imageGeneration as Record<string, unknown>;
  const width = image.width;
  const height = image.height;
  const aspectRatio = record.aspectRatio;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || (width as number) <= 0 || (height as number) <= 0 || typeof aspectRatio !== "string" || !aspectRatio.trim()) {
    throw new SceneAssetValidationError("ASSET_DESIGN_INVALID", "Format Profile image generation dimensions/aspect ratio are invalid.");
  }
  return { width: width as number, height: height as number, aspectRatio };
}

function mergeReferences(
  identity: readonly ImageRuntimeReference[],
  library: readonly ImageRuntimeReference[]
): ImageRuntimeReference[] {
  const seen = new Set<string>();
  const result: ImageRuntimeReference[] = [];
  for (const reference of [...identity, ...library]) {
    const normalized = { ...reference, sha256: normalizeImageSha256(reference.sha256) };
    const key = `${normalized.mediaId}\u0000${normalized.role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export class ReferenceAwareUnifiedImageRuntimeJobService {
  private readonly base: UnifiedImageRuntimeJobService;

  constructor(
    private readonly repository: SceneAssetRepository,
    private readonly context: SceneAssetContextPort,
    private readonly visualBibles: ChannelVisualBiblePort,
    private readonly formatProfiles: FormatProfilePort,
    private readonly decisions: SceneAssetDecisionPort,
    private readonly references: SceneRuntimeReferenceSelectionPort,
    private readonly clock: SceneAssetClock,
    private readonly ids: SceneAssetIdFactory
  ) {
    this.base = new UnifiedImageRuntimeJobService(
      repository,
      context,
      visualBibles,
      formatProfiles,
      decisions,
      clock,
      ids
    );
  }

  async prepareGeneration(input: ReferenceAwareImageGenerationJobInput): Promise<ReferenceAwareImageGenerationJobOutput> {
    const asset = await this.requireAsset(input.projectId, input.assetId);
    const resolved = await this.resolveContext(asset);
    const promptDecision = await this.decisions.compileImagePrompt({
      projectId: input.projectId,
      format: input.format,
      scene: resolved.scene,
      projectStyle: resolved.projectStyle,
      identityAnchors: resolved.identityAnchors,
      channelVisualBible: resolved.channelVisualBible,
      formatProfile: resolved.formatProfile,
      asset
    });
    if (!promptDecision.prompt.trim()) {
      throw new SceneAssetValidationError("ASSET_DESIGN_INVALID", "Final IMAGE_PROMPT must not be empty.");
    }

    const identityReferences = await this.resolveIdentityReferences(input.projectId, resolved.identityAnchors);
    const libraryReferences = await this.references.selectReferences({
      projectId: input.projectId,
      scene: resolved.scene,
      ...(input.knfBeat === undefined ? {} : { knfBeat: input.knfBeat }),
      ...(input.maxLibraryReferences === undefined ? {} : { maxReferences: input.maxLibraryReferences })
    });
    const runtimeReferences = mergeReferences(identityReferences, libraryReferences);
    const size = dimensions(resolved.formatProfile);
    const now = this.clock.nowIso();
    const nextAsset = nextAssetRevision(asset, now);
    const runtimeInput: ImageRuntimeInput = {
      prompt: promptDecision.prompt,
      ...(promptDecision.negativePrompt === undefined ? {} : { negativePrompt: promptDecision.negativePrompt }),
      width: size.width,
      height: size.height,
      aspectRatio: size.aspectRatio,
      references: runtimeReferences,
      outputRelativePath: `05_images/generated/${encodeURIComponent(asset.id)}/attempt-1.png`
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
        knfBeat: input.knfBeat ?? null,
        referenceMediaIds: runtimeReferences.map(reference => reference.mediaId),
        referenceSha256: runtimeReferences.map(reference => reference.sha256),
        libraryReferenceCount: libraryReferences.length
      }
    });
    await this.repository.createProviderJob({ job, asset: nextAsset, event, outbox });
    return { asset: nextAsset, job, runtimeInput, expectedOutputs: imageRuntimeExpectedOutputs(runtimeInput) };
  }

  synchronizeRuntimeOutcome(input: { projectId: string; jobId: string }): Promise<ProductionAsset> {
    return this.base.synchronizeRuntimeOutcome(input);
  }

  retryFailedGeneration(input: { projectId: string; jobId: string }) {
    return this.base.retryFailedGeneration(input);
  }

  targetRevisionPort() {
    return this.base.targetRevisionPort();
  }

  private async requireAsset(projectId: string, assetId: string): Promise<ProductionAsset> {
    const asset = await this.repository.getLatestAsset(projectId, assetId);
    if (asset === null) throw new SceneAssetValidationError("ASSET_NOT_FOUND", "Asset does not exist.");
    if (asset.stale) throw new SceneAssetValidationError("ASSET_STALE", "Asset is stale.");
    if (asset.sourceStrategy !== "GENERATE" || asset.owner.type !== "SCENE" || (asset.assetStatus !== "DESIGNED" && asset.assetStatus !== "REGENERATE_REQUIRED")) {
      throw new SceneAssetValidationError("ASSET_GENERATION_NOT_READY", "Scene GENERATE Asset must be DESIGNED or REGENERATE_REQUIRED before image execution.");
    }
    return asset;
  }

  private async resolveContext(asset: ProductionAsset): Promise<ResolvedContext> {
    const scene = await this.context.getScene(asset.projectId, asset.owner.id);
    if (scene === null) throw new SceneAssetValidationError("SCENE_NOT_FOUND", "Scene does not exist.");
    if (scene.stale) throw new SceneAssetValidationError("SCENE_STALE", "Scene is stale.");
    if (scene.sceneStatus !== "APPROVED" && scene.sceneStatus !== "IN_PRODUCTION" && scene.sceneStatus !== "PRODUCTION_COMPLETE") {
      throw new SceneAssetValidationError("SCENE_APPROVAL_REQUIRED", "Scene approval is required before image execution.");
    }
    const projectStyle = await this.context.getApprovedProjectStyle(asset.projectId);
    if (projectStyle === null || projectStyle.stale) {
      throw new SceneAssetValidationError("PROJECT_STYLE_APPROVAL_REQUIRED", "Approved current Project Style is required.");
    }
    const identityAnchors = await this.context.getRequiredIdentityAnchors(asset.projectId, scene.id);
    const anchorsById = new Map(identityAnchors.map(anchor => [anchor.id, anchor] as const));
    for (const anchorId of scene.requiredIdentityAnchorIds) {
      const anchor = anchorsById.get(anchorId);
      if (anchor === undefined || anchor.stale || !(await this.context.isIdentityAnchorApproved(asset.projectId, anchor))) {
        throw new SceneAssetValidationError("IDENTITY_ANCHOR_APPROVAL_REQUIRED", `Approved Identity Anchor is required: ${anchorId}`);
      }
    }
    const channelVisualBible = await this.visualBibles.resolve(projectStyle.channelVisualBibleVersion);
    if (channelVisualBible === null) throw new SceneAssetValidationError("CHANNEL_VISUAL_BIBLE_NOT_FOUND", "Pinned Channel Visual Bible cannot be resolved.");
    const formatProfile = await this.formatProfiles.resolve(asset.formatProfileVersion);
    if (formatProfile === null) throw new SceneAssetValidationError("FORMAT_PROFILE_NOT_FOUND", "Pinned Format Profile cannot be resolved.");
    return { scene, projectStyle, identityAnchors, channelVisualBible, formatProfile };
  }

  private async resolveIdentityReferences(projectId: string, anchors: IdentityAnchor[]): Promise<ImageRuntimeReference[]> {
    const references: ImageRuntimeReference[] = [];
    for (const anchor of anchors) {
      for (const mediaId of anchor.referenceMediaIds) {
        const media = await this.repository.getMedia(projectId, mediaId);
        if (media === null || media.mediaType !== "IMAGE" || media.mediaStatus !== "AVAILABLE") {
          throw new SceneAssetValidationError("MEDIA_NOT_FOUND", `Approved Identity Anchor reference is unavailable: ${mediaId}`);
        }
        references.push({
          mediaId,
          role: `IDENTITY_ANCHOR:${anchor.id}`,
          relativePath: media.relativePath,
          sha256: normalizeImageSha256(media.checksum)
        });
      }
    }
    return references;
  }
}
