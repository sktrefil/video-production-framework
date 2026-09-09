import type {
  ClipQcRecord,
  CurrentImplementationRef,
  EditorHandoffManifest,
  FinalMediaBinding,
  LinkCutImplementation,
  MediaArtifact,
  ProductionAsset,
  ProductionClip,
  ProductionLink
} from "@vpf/domain";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";

export interface MediaBindingContextPort {
  getLink(projectId: string, linkId: string): Promise<ProductionLink | null>;
  getAsset(projectId: string, assetId: string): Promise<ProductionAsset | null>;
  getMedia(projectId: string, mediaId: string): Promise<MediaArtifact | null>;
}

export interface MediaBindingRepository {
  getLatestClip(projectId: string, clipId: string): Promise<ProductionClip | null>;
  getLatestCut(projectId: string, cutId: string): Promise<LinkCutImplementation | null>;
  getLatestClipQc(projectId: string, clipId: string): Promise<ClipQcRecord | null>;
  getLatestBindingByImplementation(
    projectId: string,
    implementationType: "CLIP" | "CUT",
    implementationId: string
  ): Promise<FinalMediaBinding | null>;
  listActiveBindings(projectId: string): Promise<FinalMediaBinding[]>;
  listCurrentImplementationRefs(projectId: string): Promise<CurrentImplementationRef[]>;
  hasClipMediaApproval(
    projectId: string,
    clipId: string,
    clipRevision: number,
    mediaId: string
  ): Promise<boolean>;
  commitBinding(input: {
    previousBinding: FinalMediaBinding | null;
    binding: FinalMediaBinding;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  markBindingsStale(input: {
    items: Array<{ bindingId: string; reason: string }>;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
}

export interface MediaBindingClock {
  nowIso(): string;
}

export interface MediaBindingIdFactory {
  next(prefix: "bind" | "evt" | "outbox"): string;
}

export class MediaBindingValidationError extends Error {
  constructor(
    public readonly code:
      | "CLIP_NOT_FOUND"
      | "CUT_NOT_FOUND"
      | "IMPLEMENTATION_STALE"
      | "FINAL_MEDIA_NOT_APPROVED"
      | "FINAL_MEDIA_UNAVAILABLE"
      | "FINAL_MEDIA_VIDEO_REQUIRED"
      | "EDITORIAL_SOURCE_INVALID"
      | "BINDING_QC_REQUIRED"
      | "TRIM_RANGE_INVALID"
      | "CUT_NOT_READY",
    message: string
  ) {
    super(message);
    this.name = "MediaBindingValidationError";
  }
}

export interface BindOutcome {
  binding: FinalMediaBinding;
  created: boolean;
}

export interface MediaBindingBatchResult {
  status: "COMPLETE" | "PARTIAL_COMPLETE" | "FAILED";
  total: number;
  succeeded: number;
  failed: number;
  items: Array<{
    implementationType: "CLIP" | "CUT";
    implementationId: string;
    ok: boolean;
    bindingId?: string;
    code?: string;
    message?: string;
  }>;
}

function durableEvent(
  ids: MediaBindingIdFactory,
  clock: MediaBindingClock,
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

function isEditorialMode(mode: ProductionClip["clipMode"]): boolean {
  return mode === "EDITORIAL_MOVE" || mode === "STATIC_HOLD" || mode === "REUSE_REFRAME";
}

export class MediaBindingPipeline {
  constructor(
    private readonly repository: MediaBindingRepository,
    private readonly context: MediaBindingContextPort,
    private readonly clock: MediaBindingClock,
    private readonly ids: MediaBindingIdFactory
  ) {}

  async bindClip(input: { projectId: string; clipId: string }): Promise<BindOutcome> {
    const clip = await this.requireCurrentClip(input.projectId, input.clipId);
    await this.requireCurrentBoundAssets(clip);

    const previous = await this.repository.getLatestBindingByImplementation(
      input.projectId,
      "CLIP",
      clip.id
    );
    if (
      previous !== null &&
      !previous.stale &&
      previous.bindingStatus === "READY" &&
      previous.linkRevision === clip.linkRevision &&
      previous.implementationRevision === clip.revision
    ) {
      return { binding: previous, created: false };
    }

    const now = this.clock.nowIso();
    let binding: FinalMediaBinding;

    if (clip.providerExecutionRequired) {
      if (clip.clipStatus !== "APPROVED" || clip.approvedMediaId === undefined) {
        throw new MediaBindingValidationError(
          "FINAL_MEDIA_NOT_APPROVED",
          "Provider Clip binding requires WF-12 approved media."
        );
      }
      const approved = await this.repository.hasClipMediaApproval(
        input.projectId,
        clip.id,
        clip.revision,
        clip.approvedMediaId
      );
      if (!approved) {
        throw new MediaBindingValidationError(
          "FINAL_MEDIA_NOT_APPROVED",
          "Approved Clip media must have a durable approval selecting the same media."
        );
      }
      const media = await this.context.getMedia(input.projectId, clip.approvedMediaId);
      if (media === null || media.mediaStatus !== "AVAILABLE") {
        throw new MediaBindingValidationError(
          "FINAL_MEDIA_UNAVAILABLE",
          "Approved Clip media is unavailable."
        );
      }
      if (
        media.mediaType !== "VIDEO" ||
        !media.mimeType.toLowerCase().startsWith("video/") ||
        media.durationMs === undefined ||
        media.durationMs <= 0
      ) {
        throw new MediaBindingValidationError(
          "FINAL_MEDIA_VIDEO_REQUIRED",
          "Provider Clip binding requires an available video artifact with duration."
        );
      }
      const qc = await this.repository.getLatestClipQc(input.projectId, clip.id);
      if (
        qc === null ||
        (qc.status !== "PASS" && qc.status !== "TRIM_PASS") ||
        qc.candidateMediaId !== media.id
      ) {
        throw new MediaBindingValidationError(
          "BINDING_QC_REQUIRED",
          "Provider Clip binding requires the PASS/TRIM_PASS QC that approved this media."
        );
      }
      const sourceInMs = qc.status === "TRIM_PASS" ? qc.usableInMs : 0;
      const sourceOutMs = qc.status === "TRIM_PASS" ? qc.usableOutMs : media.durationMs;
      if (
        sourceInMs === undefined ||
        sourceOutMs === undefined ||
        sourceInMs < 0 ||
        sourceOutMs <= sourceInMs ||
        sourceOutMs > media.durationMs
      ) {
        throw new MediaBindingValidationError(
          "TRIM_RANGE_INVALID",
          "Final binding trim range must remain inside the approved video duration."
        );
      }
      binding = this.makeBinding(previous, {
        projectId: input.projectId,
        now,
        clip,
        bindingKind: "VIDEO",
        mediaId: media.id,
        sourceQcId: qc.id,
        sourceInMs,
        sourceOutMs,
        durationMs: sourceOutMs - sourceInMs
      });
    } else {
      if (
        clip.clipStatus !== "READY" ||
        clip.finalDesignApprovalId === undefined ||
        !isEditorialMode(clip.clipMode)
      ) {
        throw new MediaBindingValidationError(
          "EDITORIAL_SOURCE_INVALID",
          "Editorial binding requires an approved READY editorial Clip."
        );
      }
      const media = await this.context.getMedia(input.projectId, clip.startMediaId);
      if (
        media === null ||
        media.mediaStatus !== "AVAILABLE" ||
        media.mediaType !== "IMAGE" ||
        !media.mimeType.toLowerCase().startsWith("image/")
      ) {
        throw new MediaBindingValidationError(
          "EDITORIAL_SOURCE_INVALID",
          "Editorial binding requires the approved START image."
        );
      }
      binding = this.makeBinding(previous, {
        projectId: input.projectId,
        now,
        clip,
        bindingKind: "EDITORIAL",
        mediaId: media.id,
        sourceAssetId: clip.startAssetId,
        durationMs: clip.durationMs
      });
    }

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "FINAL_MEDIA_BOUND",
      targetType: "CLIP",
      targetId: clip.id,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        bindingId: binding.id,
        bindingRevision: binding.revision,
        mediaId: binding.mediaId ?? null,
        sourceInMs: binding.sourceInMs ?? null,
        sourceOutMs: binding.sourceOutMs ?? null,
        bindingKind: binding.bindingKind
      }
    });
    await this.repository.commitBinding({ previousBinding: previous, binding, event, outbox });
    return { binding, created: true };
  }

  async bindCut(input: { projectId: string; cutId: string }): Promise<BindOutcome> {
    const cut = await this.requireCurrentCut(input.projectId, input.cutId);
    const previous = await this.repository.getLatestBindingByImplementation(
      input.projectId,
      "CUT",
      cut.id
    );
    if (
      previous !== null &&
      !previous.stale &&
      previous.bindingStatus === "READY" &&
      previous.linkRevision === cut.linkRevision &&
      previous.implementationRevision === cut.revision
    ) {
      return { binding: previous, created: false };
    }

    const now = this.clock.nowIso();
    const binding: FinalMediaBinding = {
      id: previous?.id ?? this.ids.next("bind"),
      projectId: input.projectId,
      revision: previous === null ? 1 : previous.revision + 1,
      lifecycleStatus: "ACTIVE",
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      linkId: cut.linkId,
      linkRevision: cut.linkRevision,
      implementationType: "CUT",
      implementationId: cut.id,
      implementationRevision: cut.revision,
      bindingKind: "CUT",
      bindingStatus: "READY",
      stale: false,
      durationMs: 0,
      transitionMethod: cut.transitionMethod
    };
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "FINAL_CUT_BOUND",
      targetType: "LINK",
      targetId: cut.linkId,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        bindingId: binding.id,
        bindingRevision: binding.revision,
        cutId: cut.id,
        transitionMethod: cut.transitionMethod
      }
    });
    await this.repository.commitBinding({ previousBinding: previous, binding, event, outbox });
    return { binding, created: true };
  }

  async bindProject(projectId: string): Promise<MediaBindingBatchResult> {
    const refs = await this.repository.listCurrentImplementationRefs(projectId);
    const items: MediaBindingBatchResult["items"] = [];
    for (const ref of refs) {
      try {
        const outcome = ref.implementationType === "CLIP"
          ? await this.bindClip({ projectId, clipId: ref.implementationId })
          : await this.bindCut({ projectId, cutId: ref.implementationId });
        items.push({
          implementationType: ref.implementationType,
          implementationId: ref.implementationId,
          ok: true,
          bindingId: outcome.binding.id
        });
      } catch (error) {
        const code = error instanceof MediaBindingValidationError ? error.code : "UNKNOWN";
        items.push({
          implementationType: ref.implementationType,
          implementationId: ref.implementationId,
          ok: false,
          code,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    const succeeded = items.filter(item => item.ok).length;
    const failed = items.length - succeeded;
    return {
      status: failed === 0 ? "COMPLETE" : succeeded === 0 ? "FAILED" : "PARTIAL_COMPLETE",
      total: items.length,
      succeeded,
      failed,
      items
    };
  }

  async reconcileStaleBindings(projectId: string): Promise<string[]> {
    const bindings = await this.repository.listActiveBindings(projectId);
    const staleItems: Array<{ bindingId: string; reason: string }> = [];

    for (const binding of bindings) {
      if (binding.stale || binding.bindingStatus !== "READY") continue;
      const link = await this.context.getLink(projectId, binding.linkId);
      if (
        link === null ||
        link.stale ||
        link.revision !== binding.linkRevision ||
        link.implementationType !== binding.implementationType ||
        link.implementationRefId !== binding.implementationId
      ) {
        staleItems.push({
          bindingId: binding.id,
          reason: "UPSTREAM_LINK_IMPLEMENTATION_CHANGED"
        });
        continue;
      }

      if (binding.implementationType === "CLIP") {
        const clip = await this.repository.getLatestClip(projectId, binding.implementationId);
        if (
          clip === null ||
          clip.stale ||
          clip.revision !== binding.implementationRevision
        ) {
          staleItems.push({
            bindingId: binding.id,
            reason: "CLIP_REVISION_CHANGED"
          });
          continue;
        }
      } else {
        const cut = await this.repository.getLatestCut(projectId, binding.implementationId);
        if (
          cut === null ||
          cut.stale ||
          cut.revision !== binding.implementationRevision
        ) {
          staleItems.push({
            bindingId: binding.id,
            reason: "CUT_REVISION_CHANGED"
          });
          continue;
        }
      }

      if (binding.mediaId !== undefined) {
        const media = await this.context.getMedia(projectId, binding.mediaId);
        if (media === null || media.mediaStatus !== "AVAILABLE") {
          staleItems.push({
            bindingId: binding.id,
            reason: "BOUND_MEDIA_UNAVAILABLE"
          });
        }
      }
    }

    if (staleItems.length === 0) return [];
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId,
      eventType: "FINAL_MEDIA_BINDINGS_STALE",
      targetType: "PROJECT",
      targetId: projectId,
      trigger: "WORKFLOW_ENGINE",
      payload: { bindings: staleItems }
    });
    await this.repository.markBindingsStale({ items: staleItems, event, outbox });
    return staleItems.map(item => item.bindingId);
  }

  async buildEditorHandoff(projectId: string): Promise<EditorHandoffManifest> {
    await this.reconcileStaleBindings(projectId);
    const refs = await this.repository.listCurrentImplementationRefs(projectId);
    const bindings = (await this.repository.listActiveBindings(projectId))
      .filter(binding => !binding.stale && binding.bindingStatus === "READY");

    const items: EditorHandoffManifest["items"] = [];
    const blockers: EditorHandoffManifest["blockers"] = [];

    for (const [index, ref] of refs.entries()) {
      const binding = bindings.find(item =>
        item.linkId === ref.linkId &&
        item.linkRevision === ref.linkRevision &&
        item.implementationType === ref.implementationType &&
        item.implementationId === ref.implementationId
      );
      if (binding === undefined) {
        blockers.push({
          implementationType: ref.implementationType,
          implementationId: ref.implementationId,
          reason: "CURRENT_IMPLEMENTATION_NOT_BOUND"
        });
        continue;
      }

      let relativePath: string | undefined;
      let sourceAssetDurationMs: number | undefined;
      if (binding.mediaId !== undefined) {
        const media = await this.context.getMedia(projectId, binding.mediaId);
        if (media === null || media.mediaStatus !== "AVAILABLE") {
          blockers.push({
            implementationType: ref.implementationType,
            implementationId: ref.implementationId,
            reason: "BOUND_MEDIA_UNAVAILABLE"
          });
          continue;
        }
        relativePath = media.relativePath;
        sourceAssetDurationMs = media.durationMs;
      }

      items.push({
        order: index + 1,
        bindingId: binding.id,
        bindingRevision: binding.revision,
        linkId: binding.linkId,
        linkRevision: binding.linkRevision,
        implementationType: binding.implementationType,
        implementationId: binding.implementationId,
        implementationRevision: binding.implementationRevision,
        bindingKind: binding.bindingKind,
        ...(binding.clipMode === undefined ? {} : { clipMode: binding.clipMode }),
        ...(binding.mediaId === undefined ? {} : { mediaId: binding.mediaId }),
        ...(relativePath === undefined ? {} : { relativePath }),
        ...(binding.sourceInMs === undefined ? {} : { sourceInMs: binding.sourceInMs }),
        ...(binding.sourceOutMs === undefined ? {} : { sourceOutMs: binding.sourceOutMs }),
        ...(sourceAssetDurationMs === undefined ? {} : { sourceAssetDurationMs }),
        durationMs: binding.durationMs,
        transitionMethod: binding.transitionMethod,
        ...(binding.cameraMove === undefined ? {} : { cameraMove: binding.cameraMove }),
        ...(binding.subjectMotion === undefined ? {} : { subjectMotion: binding.subjectMotion }),
        ...(binding.environmentMotion === undefined ? {} : { environmentMotion: binding.environmentMotion })
      });
    }

    const status: EditorHandoffManifest["status"] =
      refs.length === 0
        ? "BLOCKED"
        : blockers.length === 0
          ? "READY"
          : items.length === 0
            ? "BLOCKED"
            : "PARTIAL";

    return {
      schemaVersion: "1.0",
      projectId,
      createdAt: this.clock.nowIso(),
      recommendedFileName: "media_binding.json",
      status,
      totalImplementations: refs.length,
      boundImplementations: items.length,
      items,
      blockers
    };
  }

  async getReadiness(projectId: string): Promise<{
    bindingReady: boolean;
    remotionHandoffReady: boolean;
    totalImplementations: number;
    boundImplementations: number;
    blockers: EditorHandoffManifest["blockers"];
  }> {
    const manifest = await this.buildEditorHandoff(projectId);
    return {
      bindingReady: manifest.status === "READY",
      remotionHandoffReady: manifest.status === "READY",
      totalImplementations: manifest.totalImplementations,
      boundImplementations: manifest.boundImplementations,
      blockers: manifest.blockers
    };
  }

  serializeManifest(manifest: EditorHandoffManifest): string {
    return JSON.stringify(manifest, null, 2);
  }

  private makeBinding(
    previous: FinalMediaBinding | null,
    input: {
      projectId: string;
      now: string;
      clip: ProductionClip;
      bindingKind: "VIDEO" | "EDITORIAL";
      mediaId: string;
      durationMs: number;
      sourceAssetId?: string;
      sourceQcId?: string;
      sourceInMs?: number;
      sourceOutMs?: number;
    }
  ): FinalMediaBinding {
    return {
      id: previous?.id ?? this.ids.next("bind"),
      projectId: input.projectId,
      revision: previous === null ? 1 : previous.revision + 1,
      lifecycleStatus: "ACTIVE",
      createdAt: previous?.createdAt ?? input.now,
      updatedAt: input.now,
      linkId: input.clip.linkId,
      linkRevision: input.clip.linkRevision,
      implementationType: "CLIP",
      implementationId: input.clip.id,
      implementationRevision: input.clip.revision,
      bindingKind: input.bindingKind,
      bindingStatus: "READY",
      stale: false,
      clipMode: input.clip.clipMode,
      mediaId: input.mediaId,
      ...(input.sourceAssetId === undefined ? {} : { sourceAssetId: input.sourceAssetId }),
      ...(input.sourceQcId === undefined ? {} : { sourceQcId: input.sourceQcId }),
      ...(input.sourceInMs === undefined ? {} : { sourceInMs: input.sourceInMs }),
      ...(input.sourceOutMs === undefined ? {} : { sourceOutMs: input.sourceOutMs }),
      durationMs: input.durationMs,
      transitionMethod: input.clip.transitionMethod,
      cameraMove: input.clip.cameraMove,
      subjectMotion: input.clip.subjectMotion,
      environmentMotion: input.clip.environmentMotion
    };
  }

  private async requireCurrentClip(projectId: string, clipId: string): Promise<ProductionClip> {
    const clip = await this.repository.getLatestClip(projectId, clipId);
    if (clip === null) {
      throw new MediaBindingValidationError("CLIP_NOT_FOUND", "Clip does not exist.");
    }
    const link = await this.context.getLink(projectId, clip.linkId);
    if (
      clip.stale ||
      link === null ||
      link.stale ||
      link.revision !== clip.linkRevision ||
      link.implementationType !== "CLIP" ||
      link.implementationRefId !== clip.id
    ) {
      throw new MediaBindingValidationError(
        "IMPLEMENTATION_STALE",
        "Clip no longer matches the current Link implementation."
      );
    }
    return clip;
  }

  private async requireCurrentCut(projectId: string, cutId: string): Promise<LinkCutImplementation> {
    const cut = await this.repository.getLatestCut(projectId, cutId);
    if (cut === null) {
      throw new MediaBindingValidationError("CUT_NOT_FOUND", "CUT does not exist.");
    }
    const link = await this.context.getLink(projectId, cut.linkId);
    if (
      cut.stale ||
      link === null ||
      link.stale ||
      link.revision !== cut.linkRevision ||
      link.implementationType !== "CUT" ||
      link.implementationRefId !== cut.id
    ) {
      throw new MediaBindingValidationError(
        "IMPLEMENTATION_STALE",
        "CUT no longer matches the current Link implementation."
      );
    }
    if (!cut.ready || cut.finalDesignApprovalId === undefined) {
      throw new MediaBindingValidationError(
        "CUT_NOT_READY",
        "CUT must have approved final design before binding."
      );
    }
    return cut;
  }

  private async requireCurrentBoundAssets(clip: ProductionClip): Promise<void> {
    const startAsset = await this.context.getAsset(clip.projectId, clip.startAssetId);
    const startMedia = await this.context.getMedia(clip.projectId, clip.startMediaId);
    if (
      startAsset === null ||
      startAsset.stale ||
      startAsset.revision !== clip.startAssetRevision ||
      startAsset.assetStatus !== "APPROVED" ||
      startAsset.approvedMediaId !== clip.startMediaId ||
      startMedia === null ||
      startMedia.mediaStatus !== "AVAILABLE"
    ) {
      throw new MediaBindingValidationError(
        "IMPLEMENTATION_STALE",
        "Clip START Asset/Media binding is no longer current."
      );
    }

    if (
      clip.endAssetId !== undefined ||
      clip.endAssetRevision !== undefined ||
      clip.endMediaId !== undefined
    ) {
      if (
        clip.endAssetId === undefined ||
        clip.endAssetRevision === undefined ||
        clip.endMediaId === undefined
      ) {
        throw new MediaBindingValidationError(
          "IMPLEMENTATION_STALE",
          "Clip END Asset binding is incomplete."
        );
      }
      const endAsset = await this.context.getAsset(clip.projectId, clip.endAssetId);
      const endMedia = await this.context.getMedia(clip.projectId, clip.endMediaId);
      if (
        endAsset === null ||
        endAsset.stale ||
        endAsset.revision !== clip.endAssetRevision ||
        endAsset.assetStatus !== "APPROVED" ||
        endAsset.approvedMediaId !== clip.endMediaId ||
        endMedia === null ||
        endMedia.mediaStatus !== "AVAILABLE"
      ) {
        throw new MediaBindingValidationError(
          "IMPLEMENTATION_STALE",
          "Clip END Asset/Media binding is no longer current."
        );
      }
    }
  }
}
