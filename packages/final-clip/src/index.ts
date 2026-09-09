import type {
  ApprovalRecord,
  LinkCutImplementation,
  MediaArtifact,
  ProductionAsset,
  ProductionClip,
  ProductionLink,
  ProjectFormat,
  ProviderExecutionMode,
  ProviderJob,
  ProviderPreflightRecord,
  Scene
} from "@vpf/domain";
import type {
  FinalClipDesignDecision,
  FinalClipDecisionPort,
  ProductionDecisionWithMeta,
  ProviderPreQcDecision,
  VideoPromptDecision
} from "@vpf/production-system";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";

export interface FinalClipContextPort {
  getLink(projectId: string, linkId: string): Promise<ProductionLink | null>;
  getScene(projectId: string, sceneId: string): Promise<Scene | null>;
  getAsset(projectId: string, assetId: string): Promise<ProductionAsset | null>;
  getMedia(projectId: string, mediaId: string): Promise<MediaArtifact | null>;
}

export interface FinalClipRepository {
  getActiveClipByLink(projectId: string, linkId: string): Promise<ProductionClip | null>;
  getLatestClip(projectId: string, clipId: string): Promise<ProductionClip | null>;
  listActiveClips(projectId: string): Promise<ProductionClip[]>;
  getActiveCutByLink(projectId: string, linkId: string): Promise<LinkCutImplementation | null>;
  getLatestCut(projectId: string, cutId: string): Promise<LinkCutImplementation | null>;
  listActiveCuts(projectId: string): Promise<LinkCutImplementation[]>;

  commitAdditionalAssetRequirement(input: {
    previousLink: ProductionLink;
    nextLink: ProductionLink;
    reason: string;
    decisionId: string;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  commitClipDesign(input: {
    previousLink: ProductionLink;
    nextLink: ProductionLink;
    previousClip: ProductionClip | null;
    previousCut: LinkCutImplementation | null;
    clip: ProductionClip;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  commitCutDesign(input: {
    previousLink: ProductionLink;
    nextLink: ProductionLink;
    previousClip: ProductionClip | null;
    previousCut: LinkCutImplementation | null;
    cut: LinkCutImplementation;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  commitClipDesignApproval(input: {
    previousLink: ProductionLink;
    nextLink: ProductionLink;
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  commitCutDesignApproval(input: {
    previousLink: ProductionLink;
    nextLink: ProductionLink;
    previousCut: LinkCutImplementation;
    nextCut: LinkCutImplementation;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  getProviderPreflight(
    projectId: string,
    preflightId: string
  ): Promise<ProviderPreflightRecord | null>;

  commitProviderPreflight(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    preflight: ProviderPreflightRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  commitProviderPreflightReview(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    previousPreflight: ProviderPreflightRecord;
    nextPreflight: ProviderPreflightRecord;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  createVideoProviderJob(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    job: ProviderJob;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  getLatestProviderJob(
    projectId: string,
    jobId: string
  ): Promise<ProviderJob | null>;

  commitVideoProviderFailure(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    previousJob: ProviderJob;
    nextJob: ProviderJob;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  createRetryVideoProviderJob(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    job: ProviderJob;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  commitVideoProviderResult(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    previousJob: ProviderJob;
    nextJob: ProviderJob;
    media: MediaArtifact;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  markImplementationsStale(input: {
    clipIds: string[];
    cutIds: string[];
    reason: string;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
}

export interface FinalClipClock {
  nowIso(): string;
}

export interface FinalClipIdFactory {
  next(
    prefix:
      | "clp"
      | "cut"
      | "preflight"
      | "job"
      | "med"
      | "apr"
      | "evt"
      | "outbox"
  ): string;
}

export interface VideoJobPackItem {
  jobId: string;
  clipId: string;
  clipRevision: number;
  provider: string;
  providerProfileVersion: string;
  clipMode: ProductionClip["clipMode"];
  durationMs: number;
  prompt: string;
  negativePrompt?: string;
  startMediaId: string;
  startMediaPath: string;
  endMediaId?: string;
  endMediaPath?: string;
  resultKey: string;
}

export interface VideoJobPack {
  schemaVersion: "1.0";
  projectId: string;
  createdAt: string;
  jobs: VideoJobPackItem[];
}

export interface VideoResultImportItem {
  jobId: string;
  relativePath: string;
  mimeType: string;
  checksum: string;
  durationMs: number;
  width?: number;
  height?: number;
}

export type FinalDesignOutcome =
  | {
      kind: "ADDITIONAL_ASSET_REQUIRED";
      link: ProductionLink;
      reason: string;
    }
  | {
      kind: "CUT";
      link: ProductionLink;
      cut: LinkCutImplementation;
      approval?: ApprovalRecord;
    }
  | {
      kind: "CLIP";
      link: ProductionLink;
      clip: ProductionClip;
      approval?: ApprovalRecord;
    };

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

export class FinalClipValidationError extends Error {
  constructor(
    public readonly code:
      | "LINK_NOT_FOUND"
      | "HANDOFF_PASS_REQUIRED"
      | "LINK_BOUND_ASSETS_REQUIRED"
      | "LINK_BOUND_MEDIA_REQUIRED"
      | "FINAL_CLIP_DECISION_INVALID"
      | "ADDITIONAL_ASSET_REQUIRED"
      | "CLIP_NOT_FOUND"
      | "CUT_NOT_FOUND"
      | "FINAL_DESIGN_APPROVAL_REQUIRED"
      | "FINAL_DESIGN_NOT_REVIEWABLE"
      | "PROVIDER_EXECUTION_NOT_REQUIRED"
      | "PROVIDER_PREFLIGHT_NOT_READY"
      | "PROVIDER_PREFLIGHT_BLOCKED"
      | "PROVIDER_PREFLIGHT_REVIEW_NOT_APPROVABLE"
      | "PROVIDER_PREFLIGHT_NOT_FOUND"
      | "VIDEO_JOB_NOT_READY"
      | "PROVIDER_JOB_NOT_FOUND"
      | "PROVIDER_JOB_NOT_FAILED"
      | "PROVIDER_JOB_RESULT_NOT_ALLOWED"
      | "MEDIA_PATH_INVALID"
      | "VIDEO_MEDIA_REQUIRED"
      | "MEDIA_CHECKSUM_REQUIRED"
      | "VIDEO_DURATION_INVALID"
      | "IMPLEMENTATION_STALE",
    message: string
  ) {
    super(message);
    this.name = "FinalClipValidationError";
  }
}

function durableEvent(
  ids: FinalClipIdFactory,
  clock: FinalClipClock,
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

function nextLinkRevision(
  link: ProductionLink,
  patch: Partial<ProductionLink>,
  now: string
): ProductionLink {
  return {
    ...link,
    ...patch,
    id: link.id,
    projectId: link.projectId,
    revision: link.revision + 1,
    lifecycleStatus: "ACTIVE",
    createdAt: link.createdAt,
    updatedAt: now
  };
}

function nextClipRevision(
  clip: ProductionClip,
  patch: Partial<ProductionClip>,
  now: string
): ProductionClip {
  return {
    ...clip,
    ...patch,
    id: clip.id,
    projectId: clip.projectId,
    revision: clip.revision + 1,
    lifecycleStatus: "ACTIVE",
    createdAt: clip.createdAt,
    updatedAt: now
  };
}

function nextCutRevision(
  cut: LinkCutImplementation,
  patch: Partial<LinkCutImplementation>,
  now: string
): LinkCutImplementation {
  return {
    ...cut,
    ...patch,
    id: cut.id,
    projectId: cut.projectId,
    revision: cut.revision + 1,
    lifecycleStatus: "ACTIVE",
    createdAt: cut.createdAt,
    updatedAt: now
  };
}

function validateFinalDecision(decision: FinalClipDesignDecision): void {
  if (!decision.rationale.trim()) {
    throw new FinalClipValidationError(
      "FINAL_CLIP_DECISION_INVALID",
      "Final Clip Design requires rationale."
    );
  }

  if (decision.additionalAssetRequired) {
    if (!decision.additionalAssetReason?.trim()) {
      throw new FinalClipValidationError(
        "FINAL_CLIP_DECISION_INVALID",
        "Additional Asset requirement must include a reason."
      );
    }
    return;
  }

  if (decision.implementationType === "CUT") {
    if (
      decision.clipMode !== undefined ||
      decision.durationMs !== undefined ||
      decision.singleImageSource !== undefined
    ) {
      throw new FinalClipValidationError(
        "FINAL_CLIP_DECISION_INVALID",
        "CUT implementation cannot include Clip-only fields."
      );
    }
    return;
  }

  if (
    decision.clipMode === undefined ||
    decision.durationMs === undefined ||
    !Number.isFinite(decision.durationMs) ||
    decision.durationMs <= 0
  ) {
    throw new FinalClipValidationError(
      "FINAL_CLIP_DECISION_INVALID",
      "CLIP implementation requires clipMode and positive durationMs."
    );
  }

  if (
    decision.clipMode !== "DIRECT_START_END_I2V" &&
    decision.singleImageSource === undefined
  ) {
    throw new FinalClipValidationError(
      "FINAL_CLIP_DECISION_INVALID",
      "Single-source Clip modes require singleImageSource."
    );
  }

  const motion = [
    decision.cameraMove,
    decision.subjectMotion,
    decision.environmentMotion
  ];
  if (motion.some((value) => value === undefined || !value.trim())) {
    throw new FinalClipValidationError(
      "FINAL_CLIP_DECISION_INVALID",
      "CLIP implementation requires explicit camera, subject, and environment motion fields."
    );
  }
}

function normalizePreflight(
  meta: ProductionDecisionWithMeta<ProviderPreQcDecision>
): ProviderPreQcDecision["status"] {
  const decision = meta.decision;
  if (
    decision.status === "BLOCKED" ||
    !decision.safetySafe ||
    !decision.capabilityCompatible
  ) {
    return "BLOCKED";
  }
  if (
    decision.status === "NEEDS_REVIEW" ||
    decision.requiresAlternativeRepresentation ||
    meta.requiresHumanReview
  ) {
    return "NEEDS_REVIEW";
  }
  return "PASS";
}

function validateRelativeMediaPath(relativePath: string): void {
  const normalized = relativePath.replace(/\\/g, "/").trim();
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new FinalClipValidationError(
      "MEDIA_PATH_INVALID",
      "Media path must be a normalized project-relative path without traversal."
    );
  }
}

function providerExecutionRequired(mode: ProductionClip["clipMode"]): boolean {
  return (
    mode === "DIRECT_START_END_I2V" ||
    mode === "SINGLE_IMAGE_I2V"
  );
}

interface ResolvedLinkContext {
  projectId: string;
  format: ProjectFormat;
  link: ProductionLink;
  fromScene: Scene;
  toScene: Scene;
  fromAsset: ProductionAsset;
  fromMedia: MediaArtifact;
  toAsset: ProductionAsset;
  toMedia: MediaArtifact;
}

export class FinalClipPipeline {
  constructor(
    private readonly repository: FinalClipRepository,
    private readonly context: FinalClipContextPort,
    private readonly decisions: FinalClipDecisionPort,
    private readonly clock: FinalClipClock,
    private readonly ids: FinalClipIdFactory
  ) {}

  async designFinalImplementation(input: {
    projectId: string;
    linkId: string;
    format: ProjectFormat;
  }): Promise<FinalDesignOutcome> {
    const resolved = await this.resolveLinkContext(input);
    const result = await this.decisions.designFinalClip(resolved);
    validateFinalDecision(result.decision);

    const previousClip = await this.repository.getActiveClipByLink(
      input.projectId,
      input.linkId
    );
    const previousCut = await this.repository.getActiveCutByLink(
      input.projectId,
      input.linkId
    );
    const now = this.clock.nowIso();

    if (result.decision.additionalAssetRequired) {
      let nextLink = nextLinkRevision(
        resolved.link,
        { linkStatus: "REWORK_REQUIRED" },
        now
      );
      delete nextLink.implementationType;
      delete nextLink.implementationRefId;

      const reason = result.decision.additionalAssetReason!;
      const { event, outbox } = durableEvent(this.ids, this.clock, {
        projectId: input.projectId,
        eventType: "FINAL_CLIP_ADDITIONAL_ASSET_REQUIRED",
        targetType: "LINK",
        targetId: nextLink.id,
        trigger: "WORKFLOW_ENGINE",
        payload: {
          decisionId: result.decisionId,
          reason
        }
      });
      await this.repository.commitAdditionalAssetRequirement({
        previousLink: resolved.link,
        nextLink,
        reason,
        decisionId: result.decisionId,
        event,
        outbox
      });
      return {
        kind: "ADDITIONAL_ASSET_REQUIRED",
        link: nextLink,
        reason
      };
    }

    if (result.decision.implementationType === "CUT") {
      const cutId = previousCut?.id ?? this.ids.next("cut");
      let nextLink = nextLinkRevision(
        resolved.link,
        {
          implementationType: "CUT",
          implementationRefId: cutId,
          linkStatus: result.requiresHumanReview
            ? "HANDOFF_PASS"
            : "FINAL_DESIGN_READY"
        },
        now
      );

      let cut: LinkCutImplementation = {
        id: cutId,
        projectId: input.projectId,
        revision: previousCut === null ? 1 : previousCut.revision + 1,
        lifecycleStatus: "ACTIVE",
        createdAt: previousCut?.createdAt ?? now,
        updatedAt: now,
        stale: false,
        linkId: nextLink.id,
        linkRevision: nextLink.revision,
        transitionMethod: result.decision.transitionMethod,
        rationale: result.decision.rationale.trim(),
        ready: !result.requiresHumanReview
      };

      let approval: ApprovalRecord | undefined;
      if (!result.requiresHumanReview) {
        approval = {
          id: this.ids.next("apr"),
          projectId: input.projectId,
          targetType: "LINK",
          targetId: nextLink.id,
          targetRevision: nextLink.revision,
          approvalState: "AUTO_APPROVED",
          reason: "FINAL_CUT_DESIGN_AUTO_APPROVED",
          approvedByType: "SYSTEM",
          createdAt: now
        };
        cut = {
          ...cut,
          finalDesignApprovalId: approval.id
        };
      }

      const { event, outbox } = durableEvent(this.ids, this.clock, {
        projectId: input.projectId,
        eventType: result.requiresHumanReview
          ? "FINAL_CUT_DESIGN_NEEDS_REVIEW"
          : "FINAL_CUT_DESIGN_READY",
        targetType: "LINK",
        targetId: nextLink.id,
        trigger: "WORKFLOW_ENGINE",
        payload: {
          decisionId: result.decisionId,
          cutId: cut.id,
          transitionMethod: cut.transitionMethod
        }
      });
      await this.repository.commitCutDesign({
        previousLink: resolved.link,
        nextLink,
        previousClip,
        previousCut,
        cut,
        ...(approval === undefined ? {} : { approval }),
        event,
        outbox
      });
      return {
        kind: "CUT",
        link: nextLink,
        cut,
        ...(approval === undefined ? {} : { approval })
      };
    }

    const clipMode = result.decision.clipMode!;
    const clipId = previousClip?.id ?? this.ids.next("clp");
    const nextLink = nextLinkRevision(
      resolved.link,
      {
        implementationType: "CLIP",
        implementationRefId: clipId,
        linkStatus: result.requiresHumanReview
          ? "HANDOFF_PASS"
          : "FINAL_DESIGN_READY"
      },
      now
    );

    const singleSource =
      result.decision.singleImageSource === "TO"
        ? {
            startAsset: resolved.toAsset,
            startMedia: resolved.toMedia
          }
        : {
            startAsset: resolved.fromAsset,
            startMedia: resolved.fromMedia
          };

    const requiresProvider = providerExecutionRequired(clipMode);
    let clip: ProductionClip = {
      id: clipId,
      projectId: input.projectId,
      revision: previousClip === null ? 1 : previousClip.revision + 1,
      lifecycleStatus: "ACTIVE",
      createdAt: previousClip?.createdAt ?? now,
      updatedAt: now,
      stale: false,
      linkId: nextLink.id,
      linkRevision: nextLink.revision,
      clipMode,
      clipStartStateRef: nextLink.fromStateRef,
      clipEndStateTarget: nextLink.toStateRef,
      startAssetId:
        clipMode === "DIRECT_START_END_I2V"
          ? resolved.fromAsset.id
          : singleSource.startAsset.id,
      startAssetRevision:
        clipMode === "DIRECT_START_END_I2V"
          ? resolved.fromAsset.revision
          : singleSource.startAsset.revision,
      startMediaId:
        clipMode === "DIRECT_START_END_I2V"
          ? resolved.fromMedia.id
          : singleSource.startMedia.id,
      ...(clipMode === "DIRECT_START_END_I2V"
        ? {
            endAssetId: resolved.toAsset.id,
            endAssetRevision: resolved.toAsset.revision,
            endMediaId: resolved.toMedia.id
          }
        : {}),
      transitionMethod: result.decision.transitionMethod,
      cameraMove: result.decision.cameraMove!.trim(),
      subjectMotion: result.decision.subjectMotion!.trim(),
      environmentMotion: result.decision.environmentMotion!.trim(),
      durationMs: result.decision.durationMs!,
      providerExecutionRequired: requiresProvider,
      candidateMediaIds: [],
      clipStatus: result.requiresHumanReview
        ? "DESIGNED"
        : requiresProvider
          ? "DESIGNED"
          : "READY"
    };

    let approval: ApprovalRecord | undefined;
    if (!result.requiresHumanReview) {
      approval = {
        id: this.ids.next("apr"),
        projectId: input.projectId,
        targetType: "CLIP",
        targetId: clip.id,
        targetRevision: clip.revision,
        approvalState: "AUTO_APPROVED",
        reason: "FINAL_CLIP_DESIGN_AUTO_APPROVED",
        approvedByType: "SYSTEM",
        createdAt: now
      };
      clip = { ...clip, finalDesignApprovalId: approval.id };
    }

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: result.requiresHumanReview
        ? "FINAL_CLIP_DESIGN_NEEDS_REVIEW"
        : "FINAL_CLIP_DESIGN_READY",
      targetType: "CLIP",
      targetId: clip.id,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        decisionId: result.decisionId,
        clipMode: clip.clipMode,
        providerExecutionRequired: clip.providerExecutionRequired
      }
    });
    await this.repository.commitClipDesign({
      previousLink: resolved.link,
      nextLink,
      previousClip,
      previousCut,
      clip,
      ...(approval === undefined ? {} : { approval }),
      event,
      outbox
    });
    return {
      kind: "CLIP",
      link: nextLink,
      clip,
      ...(approval === undefined ? {} : { approval })
    };
  }

  async approveFinalClipDesign(input: {
    projectId: string;
    clipId: string;
    approvedById?: string;
  }): Promise<{ clip: ProductionClip; link: ProductionLink; approval: ApprovalRecord }> {
    const clip = await this.requireCurrentClip(input.projectId, input.clipId);
    if (clip.finalDesignApprovalId !== undefined || clip.clipStatus !== "DESIGNED") {
      throw new FinalClipValidationError(
        "FINAL_DESIGN_NOT_REVIEWABLE",
        "Clip design is not awaiting explicit review."
      );
    }
    const link = await this.requireCurrentLink(input.projectId, clip.linkId);
    if (link.revision !== clip.linkRevision) {
      throw new FinalClipValidationError(
        "IMPLEMENTATION_STALE",
        "Clip design no longer matches the current Link revision."
      );
    }

    const now = this.clock.nowIso();
    const nextLink = nextLinkRevision(
      link,
      { linkStatus: "FINAL_DESIGN_READY" },
      now
    );
    let nextClip = nextClipRevision(
      clip,
      {
        linkRevision: nextLink.revision,
        clipStatus: clip.providerExecutionRequired ? "DESIGNED" : "READY"
      },
      now
    );
    const approval: ApprovalRecord = {
      id: this.ids.next("apr"),
      projectId: input.projectId,
      targetType: "CLIP",
      targetId: clip.id,
      targetRevision: nextClip.revision,
      approvalState: "HUMAN_APPROVED",
      reason: "FINAL_CLIP_DESIGN_APPROVED",
      approvedByType: "USER",
      ...(input.approvedById === undefined
        ? {}
        : { approvedById: input.approvedById }),
      createdAt: now
    };
    nextClip = { ...nextClip, finalDesignApprovalId: approval.id };

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "FINAL_CLIP_DESIGN_APPROVED",
      targetType: "CLIP",
      targetId: clip.id,
      trigger: "USER",
      payload: {
        clipRevision: nextClip.revision,
        linkRevision: nextLink.revision
      }
    });
    await this.repository.commitClipDesignApproval({
      previousLink: link,
      nextLink,
      previousClip: clip,
      nextClip,
      approval,
      event,
      outbox
    });
    return { clip: nextClip, link: nextLink, approval };
  }

  async approveFinalCutDesign(input: {
    projectId: string;
    cutId: string;
    approvedById?: string;
  }): Promise<{ cut: LinkCutImplementation; link: ProductionLink; approval: ApprovalRecord }> {
    const cut = await this.repository.getLatestCut(input.projectId, input.cutId);
    if (cut === null) {
      throw new FinalClipValidationError("CUT_NOT_FOUND", "Cut design does not exist.");
    }
    if (cut.stale || cut.ready || cut.finalDesignApprovalId !== undefined) {
      throw new FinalClipValidationError(
        "FINAL_DESIGN_NOT_REVIEWABLE",
        "Cut design is not awaiting explicit review."
      );
    }
    const link = await this.requireCurrentLink(input.projectId, cut.linkId);
    if (link.revision !== cut.linkRevision) {
      throw new FinalClipValidationError(
        "IMPLEMENTATION_STALE",
        "Cut design no longer matches the current Link revision."
      );
    }

    const now = this.clock.nowIso();
    const nextLink = nextLinkRevision(
      link,
      { linkStatus: "FINAL_DESIGN_READY" },
      now
    );
    let nextCut = nextCutRevision(
      cut,
      {
        linkRevision: nextLink.revision,
        ready: true
      },
      now
    );
    const approval: ApprovalRecord = {
      id: this.ids.next("apr"),
      projectId: input.projectId,
      targetType: "LINK",
      targetId: nextLink.id,
      targetRevision: nextLink.revision,
      approvalState: "HUMAN_APPROVED",
      reason: "FINAL_CUT_DESIGN_APPROVED",
      approvedByType: "USER",
      ...(input.approvedById === undefined
        ? {}
        : { approvedById: input.approvedById }),
      createdAt: now
    };
    nextCut = { ...nextCut, finalDesignApprovalId: approval.id };

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "FINAL_CUT_DESIGN_APPROVED",
      targetType: "LINK",
      targetId: nextLink.id,
      trigger: "USER",
      payload: {
        cutId: nextCut.id,
        cutRevision: nextCut.revision
      }
    });
    await this.repository.commitCutDesignApproval({
      previousLink: link,
      nextLink,
      previousCut: cut,
      nextCut,
      approval,
      event,
      outbox
    });
    return { cut: nextCut, link: nextLink, approval };
  }

  async runProviderPreQc(input: {
    projectId: string;
    clipId: string;
    format: ProjectFormat;
    provider: string;
    providerProfileVersion: string;
  }): Promise<{
    clip: ProductionClip;
    preflight: ProviderPreflightRecord;
    decisionMeta: ProductionDecisionWithMeta<ProviderPreQcDecision>;
  }> {
    const clip = await this.requireCurrentClip(input.projectId, input.clipId);
    if (!clip.providerExecutionRequired) {
      throw new FinalClipValidationError(
        "PROVIDER_EXECUTION_NOT_REQUIRED",
        "Editorial Clip modes do not use Provider Pre-QC."
      );
    }
    if (clip.finalDesignApprovalId === undefined) {
      throw new FinalClipValidationError(
        "FINAL_DESIGN_APPROVAL_REQUIRED",
        "Final Clip Design must be approved before Provider Pre-QC."
      );
    }
    const resolved = await this.resolveClipContext(
      input.projectId,
      clip,
      input.format
    );
    const result = await this.decisions.runProviderPreQc({
      ...resolved,
      clip,
      provider: input.provider,
      providerProfileVersion: input.providerProfileVersion
    });

    const normalizedStatus = normalizePreflight(result);
    const now = this.clock.nowIso();
    const nextClip = nextClipRevision(
      clip,
      {
        clipStatus:
          normalizedStatus === "PASS"
            ? "READY"
            : normalizedStatus === "NEEDS_REVIEW" &&
                result.decision.safetySafe &&
                result.decision.capabilityCompatible &&
                !result.decision.requiresAlternativeRepresentation
              ? "NEEDS_REVIEW"
              : "BLOCKED"
      },
      now
    );
    const preflight: ProviderPreflightRecord = {
      id: this.ids.next("preflight"),
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      clipId: clip.id,
      clipRevision: nextClip.revision,
      provider: input.provider,
      providerProfileVersion: input.providerProfileVersion,
      status: normalizedStatus,
      safetySafe: result.decision.safetySafe,
      capabilityCompatible: result.decision.capabilityCompatible,
      requiresAlternativeRepresentation:
        result.decision.requiresAlternativeRepresentation,
      issueCodes: [...result.decision.issueCodes],
      ...(result.decision.recommendedAction === undefined
        ? {}
        : { recommendedAction: result.decision.recommendedAction }),
      decisionId: result.decisionId
    };
    const clipWithPreflight = {
      ...nextClip,
      providerPreflightId: preflight.id
    };

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType:
        normalizedStatus === "PASS"
          ? "PROVIDER_PRE_QC_PASSED"
          : normalizedStatus === "NEEDS_REVIEW"
            ? "PROVIDER_PRE_QC_NEEDS_REVIEW"
            : "PROVIDER_PRE_QC_BLOCKED",
      targetType: "CLIP",
      targetId: clip.id,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        preflightId: preflight.id,
        provider: input.provider,
        providerProfileVersion: input.providerProfileVersion,
        status: normalizedStatus,
        safetySafe: preflight.safetySafe,
        capabilityCompatible: preflight.capabilityCompatible,
        requiresAlternativeRepresentation:
          preflight.requiresAlternativeRepresentation
      }
    });
    await this.repository.commitProviderPreflight({
      previousClip: clip,
      nextClip: clipWithPreflight,
      preflight,
      event,
      outbox
    });
    return {
      clip: clipWithPreflight,
      preflight,
      decisionMeta: result
    };
  }

  async approveProviderPreflightReview(input: {
    projectId: string;
    clipId: string;
    approvedById?: string;
  }): Promise<{
    clip: ProductionClip;
    preflight: ProviderPreflightRecord;
    approval: ApprovalRecord;
  }> {
    const clip = await this.requireCurrentClip(input.projectId, input.clipId);
    if (
      clip.providerPreflightId === undefined ||
      clip.clipStatus !== "NEEDS_REVIEW"
    ) {
      throw new FinalClipValidationError(
        "PROVIDER_PREFLIGHT_REVIEW_NOT_APPROVABLE",
        "Clip does not have a reviewable Provider Pre-QC result."
      );
    }
    const preflight = await this.repository.getProviderPreflight(
      input.projectId,
      clip.providerPreflightId
    );
    if (preflight === null) {
      throw new FinalClipValidationError(
        "PROVIDER_PREFLIGHT_NOT_FOUND",
        "Provider Pre-QC record does not exist."
      );
    }
    if (
      preflight.status !== "NEEDS_REVIEW" ||
      !preflight.safetySafe ||
      !preflight.capabilityCompatible ||
      preflight.requiresAlternativeRepresentation
    ) {
      throw new FinalClipValidationError(
        "PROVIDER_PREFLIGHT_REVIEW_NOT_APPROVABLE",
        "Unsafe, incompatible, or alternative-representation Pre-QC cannot be overridden."
      );
    }

    const now = this.clock.nowIso();
    let nextClip = nextClipRevision(
      clip,
      { clipStatus: "READY" },
      now
    );
    const approval: ApprovalRecord = {
      id: this.ids.next("apr"),
      projectId: input.projectId,
      targetType: "CLIP",
      targetId: clip.id,
      targetRevision: nextClip.revision,
      approvalState: "HUMAN_APPROVED",
      reason: "PROVIDER_PRE_QC_REVIEW_ACCEPTED",
      approvedByType: "USER",
      ...(input.approvedById === undefined
        ? {}
        : { approvedById: input.approvedById }),
      createdAt: now
    };
    const nextPreflight: ProviderPreflightRecord = {
      ...preflight,
      revision: preflight.revision + 1,
      lifecycleStatus: "ACTIVE",
      updatedAt: now,
      clipRevision: nextClip.revision,
      status: "PASS",
      reviewApprovalId: approval.id
    };
    nextClip = {
      ...nextClip,
      providerPreflightId: nextPreflight.id
    };

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "PROVIDER_PRE_QC_REVIEW_ACCEPTED",
      targetType: "CLIP",
      targetId: clip.id,
      trigger: "USER",
      payload: {
        preflightId: nextPreflight.id,
        provider: nextPreflight.provider
      }
    });
    await this.repository.commitProviderPreflightReview({
      previousClip: clip,
      nextClip,
      previousPreflight: preflight,
      nextPreflight,
      approval,
      event,
      outbox
    });
    return {
      clip: nextClip,
      preflight: nextPreflight,
      approval
    };
  }

  async createVideoGenerationJob(input: {
    projectId: string;
    clipId: string;
    format: ProjectFormat;
    provider: string;
    providerProfileVersion: string;
    executionMode: ProviderExecutionMode;
  }): Promise<{ clip: ProductionClip; job: ProviderJob }> {
    const clip = await this.requireCurrentClip(input.projectId, input.clipId);
    if (
      !clip.providerExecutionRequired ||
      clip.clipStatus !== "READY" ||
      clip.providerPreflightId === undefined
    ) {
      throw new FinalClipValidationError(
        "VIDEO_JOB_NOT_READY",
        "Clip is not ready for provider execution."
      );
    }
    const preflight = await this.repository.getProviderPreflight(
      input.projectId,
      clip.providerPreflightId
    );
    if (
      preflight === null ||
      preflight.status !== "PASS" ||
      !preflight.safetySafe ||
      !preflight.capabilityCompatible ||
      preflight.requiresAlternativeRepresentation ||
      preflight.provider !== input.provider ||
      preflight.providerProfileVersion !== input.providerProfileVersion
    ) {
      throw new FinalClipValidationError(
        "PROVIDER_PREFLIGHT_NOT_READY",
        "Current Provider/Profile does not have a passing Pre-QC."
      );
    }

    const resolved = await this.resolveClipContext(
      input.projectId,
      clip,
      input.format
    );
    const promptResult = await this.decisions.compileVideoPrompt({
      ...resolved,
      clip,
      provider: input.provider,
      providerProfileVersion: input.providerProfileVersion
    });
    if (!promptResult.decision.prompt.trim()) {
      throw new FinalClipValidationError(
        "FINAL_CLIP_DECISION_INVALID",
        "VIDEO_PROMPT returned an empty execution prompt."
      );
    }

    const startMedia = await this.requireMedia(input.projectId, clip.startMediaId);
    const endMedia =
      clip.endMediaId === undefined
        ? null
        : await this.requireMedia(input.projectId, clip.endMediaId);

    const now = this.clock.nowIso();
    const job: ProviderJob = {
      id: this.ids.next("job"),
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      jobType: "VIDEO_GENERATION",
      provider: input.provider,
      providerProfileVersion: input.providerProfileVersion,
      targetType: "CLIP",
      targetId: clip.id,
      targetRevision: clip.revision,
      executionMode: input.executionMode,
      status:
        input.executionMode === "AUTOMATED"
          ? "READY"
          : "WAITING_EXTERNAL",
      attempt: 1,
      inputPayload: {
        clipMode: clip.clipMode,
        transitionMethod: clip.transitionMethod,
        durationMs: clip.durationMs,
        prompt: promptResult.decision.prompt,
        ...(promptResult.decision.negativePrompt === undefined
          ? {}
          : { negativePrompt: promptResult.decision.negativePrompt }),
        startMediaId: startMedia.id,
        startMediaPath: startMedia.relativePath,
        ...(endMedia === null
          ? {}
          : {
              endMediaId: endMedia.id,
              endMediaPath: endMedia.relativePath
            })
      },
      resultMediaIds: []
    };
    const nextClip = nextClipRevision(
      clip,
      { clipStatus: "GENERATING" },
      now
    );

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "VIDEO_GENERATION_JOB_CREATED",
      targetType: "CLIP",
      targetId: clip.id,
      trigger: "USER",
      payload: {
        jobId: job.id,
        provider: job.provider,
        providerProfileVersion: job.providerProfileVersion,
        executionMode: job.executionMode
      }
    });
    await this.repository.createVideoProviderJob({
      previousClip: clip,
      nextClip,
      job,
      event,
      outbox
    });
    return { clip: nextClip, job };
  }

  async markVideoJobFailed(input: {
    projectId: string;
    jobId: string;
    errorCode: string;
    errorDetail?: string;
  }): Promise<{ clip: ProductionClip; job: ProviderJob }> {
    const previousJob = await this.repository.getLatestProviderJob(
      input.projectId,
      input.jobId
    );
    if (previousJob === null) {
      throw new FinalClipValidationError(
        "PROVIDER_JOB_NOT_FOUND",
        "Provider Job does not exist."
      );
    }
    if (
      previousJob.jobType !== "VIDEO_GENERATION" ||
      previousJob.status === "COMPLETE" ||
      previousJob.status === "FAILED" ||
      previousJob.status === "CANCELLED"
    ) {
      throw new FinalClipValidationError(
        "PROVIDER_JOB_RESULT_NOT_ALLOWED",
        "Provider Job cannot be marked failed from its current state."
      );
    }
    const clip = await this.requireCurrentClip(
      input.projectId,
      previousJob.targetId
    );
    if (
      clip.revision !== previousJob.targetRevision + 1 ||
      clip.clipStatus !== "GENERATING"
    ) {
      throw new FinalClipValidationError(
        "IMPLEMENTATION_STALE",
        "Provider failure targets an older Clip execution revision."
      );
    }
    const now = this.clock.nowIso();
    const nextJob: ProviderJob = {
      ...previousJob,
      revision: previousJob.revision + 1,
      lifecycleStatus: "ACTIVE",
      updatedAt: now,
      status: "FAILED",
      errorCode: input.errorCode,
      ...(input.errorDetail === undefined
        ? {}
        : { errorDetail: input.errorDetail })
    };
    const nextClip = nextClipRevision(
      clip,
      { clipStatus: "REGENERATE_REQUIRED" },
      now
    );

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "VIDEO_GENERATION_JOB_FAILED",
      targetType: "CLIP",
      targetId: clip.id,
      trigger: "PROVIDER_RESULT",
      payload: {
        jobId: previousJob.id,
        errorCode: input.errorCode
      }
    });
    await this.repository.commitVideoProviderFailure({
      previousClip: clip,
      nextClip,
      previousJob,
      nextJob,
      event,
      outbox
    });
    return { clip: nextClip, job: nextJob };
  }

  async retryVideoGenerationJob(input: {
    projectId: string;
    failedJobId: string;
    format: ProjectFormat;
    executionMode?: ProviderExecutionMode;
  }): Promise<{ clip: ProductionClip; job: ProviderJob }> {
    const failedJob = await this.repository.getLatestProviderJob(
      input.projectId,
      input.failedJobId
    );
    if (failedJob === null) {
      throw new FinalClipValidationError(
        "PROVIDER_JOB_NOT_FOUND",
        "Failed Provider Job does not exist."
      );
    }
    if (failedJob.status !== "FAILED") {
      throw new FinalClipValidationError(
        "PROVIDER_JOB_NOT_FAILED",
        "Only FAILED video jobs can use Retry Failed."
      );
    }
    const clip = await this.requireCurrentClip(
      input.projectId,
      failedJob.targetId
    );
    if (clip.clipStatus !== "REGENERATE_REQUIRED" || clip.stale) {
      throw new FinalClipValidationError(
        "VIDEO_JOB_NOT_READY",
        "Clip is not ready for failed-job retry."
      );
    }
    const preflight =
      clip.providerPreflightId === undefined
        ? null
        : await this.repository.getProviderPreflight(
            input.projectId,
            clip.providerPreflightId
          );
    if (
      preflight === null ||
      preflight.status !== "PASS" ||
      preflight.provider !== failedJob.provider ||
      preflight.providerProfileVersion !== failedJob.providerProfileVersion
    ) {
      throw new FinalClipValidationError(
        "PROVIDER_PREFLIGHT_NOT_READY",
        "Retry requires the same passing Provider Pre-QC context."
      );
    }

    const resolved = await this.resolveClipContext(
      input.projectId,
      clip,
      input.format
    );
    const promptResult = await this.decisions.compileVideoPrompt({
      ...resolved,
      clip,
      provider: failedJob.provider,
      providerProfileVersion: failedJob.providerProfileVersion
    });
    if (!promptResult.decision.prompt.trim()) {
      throw new FinalClipValidationError(
        "FINAL_CLIP_DECISION_INVALID",
        "VIDEO_PROMPT returned an empty execution prompt."
      );
    }

    const startMedia = await this.requireMedia(input.projectId, clip.startMediaId);
    const endMedia =
      clip.endMediaId === undefined
        ? null
        : await this.requireMedia(input.projectId, clip.endMediaId);
    const executionMode = input.executionMode ?? failedJob.executionMode;
    const now = this.clock.nowIso();
    const job: ProviderJob = {
      id: this.ids.next("job"),
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      jobType: "VIDEO_GENERATION",
      provider: failedJob.provider,
      providerProfileVersion: failedJob.providerProfileVersion,
      targetType: "CLIP",
      targetId: clip.id,
      targetRevision: clip.revision,
      executionMode,
      status:
        executionMode === "AUTOMATED"
          ? "READY"
          : "WAITING_EXTERNAL",
      attempt: failedJob.attempt + 1,
      retryOfJobId: failedJob.id,
      inputPayload: {
        clipMode: clip.clipMode,
        transitionMethod: clip.transitionMethod,
        durationMs: clip.durationMs,
        prompt: promptResult.decision.prompt,
        ...(promptResult.decision.negativePrompt === undefined
          ? {}
          : { negativePrompt: promptResult.decision.negativePrompt }),
        startMediaId: startMedia.id,
        startMediaPath: startMedia.relativePath,
        ...(endMedia === null
          ? {}
          : {
              endMediaId: endMedia.id,
              endMediaPath: endMedia.relativePath
            })
      },
      resultMediaIds: []
    };
    const nextClip = nextClipRevision(
      clip,
      { clipStatus: "GENERATING" },
      now
    );

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "VIDEO_GENERATION_JOB_RETRIED",
      targetType: "CLIP",
      targetId: clip.id,
      trigger: "USER",
      payload: {
        failedJobId: failedJob.id,
        retryJobId: job.id,
        attempt: job.attempt
      }
    });
    await this.repository.createRetryVideoProviderJob({
      previousClip: clip,
      nextClip,
      job,
      event,
      outbox
    });
    return { clip: nextClip, job };
  }

  async registerVideoResult(input: VideoResultImportItem & {
    projectId: string;
  }): Promise<{
    clip: ProductionClip;
    job: ProviderJob;
    media: MediaArtifact;
  }> {
    validateRelativeMediaPath(input.relativePath);
    if (!input.mimeType.toLowerCase().startsWith("video/")) {
      throw new FinalClipValidationError(
        "VIDEO_MEDIA_REQUIRED",
        "Video generation result must use a video MIME type."
      );
    }
    if (!input.checksum.trim()) {
      throw new FinalClipValidationError(
        "MEDIA_CHECKSUM_REQUIRED",
        "Generated video requires a checksum."
      );
    }
    if (!Number.isFinite(input.durationMs) || input.durationMs <= 0) {
      throw new FinalClipValidationError(
        "VIDEO_DURATION_INVALID",
        "Generated video requires a positive duration."
      );
    }

    const previousJob = await this.repository.getLatestProviderJob(
      input.projectId,
      input.jobId
    );
    if (previousJob === null) {
      throw new FinalClipValidationError(
        "PROVIDER_JOB_NOT_FOUND",
        "Provider Job does not exist."
      );
    }
    if (
      previousJob.jobType !== "VIDEO_GENERATION" ||
      previousJob.status === "COMPLETE" ||
      previousJob.status === "FAILED" ||
      previousJob.status === "BLOCKED" ||
      previousJob.status === "CANCELLED"
    ) {
      throw new FinalClipValidationError(
        "PROVIDER_JOB_RESULT_NOT_ALLOWED",
        "Provider Job cannot accept a successful video result."
      );
    }
    const clip = await this.requireCurrentClip(
      input.projectId,
      previousJob.targetId
    );
    if (
      clip.revision !== previousJob.targetRevision + 1 ||
      clip.clipStatus !== "GENERATING"
    ) {
      throw new FinalClipValidationError(
        "IMPLEMENTATION_STALE",
        "Provider result targets an older Clip execution revision."
      );
    }
    if (clip.stale) {
      throw new FinalClipValidationError(
        "IMPLEMENTATION_STALE",
        "Video result targets a stale Clip."
      );
    }

    const now = this.clock.nowIso();
    const media: MediaArtifact = {
      id: this.ids.next("med"),
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      mediaType: "VIDEO",
      relativePath: input.relativePath.replace(/\\/g, "/"),
      mimeType: input.mimeType,
      ...(input.width === undefined ? {} : { width: input.width }),
      ...(input.height === undefined ? {} : { height: input.height }),
      durationMs: input.durationMs,
      checksum: input.checksum,
      sourceJobId: previousJob.id,
      mediaStatus: "AVAILABLE"
    };
    const nextJob: ProviderJob = {
      ...previousJob,
      revision: previousJob.revision + 1,
      lifecycleStatus: "ACTIVE",
      updatedAt: now,
      status: "COMPLETE",
      resultMediaIds: [...previousJob.resultMediaIds, media.id]
    };
    const nextClip = nextClipRevision(
      clip,
      {
        clipStatus: "CANDIDATE_AVAILABLE",
        candidateMediaIds: [...clip.candidateMediaIds, media.id]
      },
      now
    );

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "VIDEO_RESULT_REGISTERED",
      targetType: "CLIP",
      targetId: clip.id,
      trigger: "PROVIDER_RESULT",
      payload: {
        jobId: previousJob.id,
        mediaId: media.id,
        durationMs: media.durationMs
      }
    });
    await this.repository.commitVideoProviderResult({
      previousClip: clip,
      nextClip,
      previousJob,
      nextJob,
      media,
      event,
      outbox
    });
    return { clip: nextClip, job: nextJob, media };
  }

  async exportVideoJobPack(input: {
    projectId: string;
    jobIds: string[];
  }): Promise<VideoJobPack> {
    const jobs: VideoJobPackItem[] = [];
    for (const jobId of [...new Set(input.jobIds)]) {
      const job = await this.repository.getLatestProviderJob(
        input.projectId,
        jobId
      );
      if (
        job === null ||
        job.jobType !== "VIDEO_GENERATION" ||
        job.executionMode !== "MANUAL_EXTERNAL" ||
        job.status !== "WAITING_EXTERNAL"
      ) {
        throw new FinalClipValidationError(
          "VIDEO_JOB_NOT_READY",
          `Job ${jobId} is not an exportable manual video job.`
        );
      }
      const payload =
        typeof job.inputPayload === "object" && job.inputPayload !== null
          ? job.inputPayload as Record<string, unknown>
          : {};
      const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
      const clipMode =
        typeof payload.clipMode === "string"
          ? payload.clipMode as ProductionClip["clipMode"]
          : undefined;
      const durationMs =
        typeof payload.durationMs === "number"
          ? payload.durationMs
          : undefined;
      const startMediaId =
        typeof payload.startMediaId === "string"
          ? payload.startMediaId
          : undefined;
      const startMediaPath =
        typeof payload.startMediaPath === "string"
          ? payload.startMediaPath
          : undefined;

      if (
        !prompt.trim() ||
        clipMode === undefined ||
        durationMs === undefined ||
        startMediaId === undefined ||
        startMediaPath === undefined
      ) {
        throw new FinalClipValidationError(
          "FINAL_CLIP_DECISION_INVALID",
          `Job ${jobId} is missing provider execution data.`
        );
      }

      jobs.push({
        jobId: job.id,
        clipId: job.targetId,
        clipRevision: job.targetRevision,
        provider: job.provider,
        providerProfileVersion: job.providerProfileVersion,
        clipMode,
        durationMs,
        prompt,
        ...(typeof payload.negativePrompt === "string"
          ? { negativePrompt: payload.negativePrompt }
          : {}),
        startMediaId,
        startMediaPath,
        ...(typeof payload.endMediaId === "string"
          ? { endMediaId: payload.endMediaId }
          : {}),
        ...(typeof payload.endMediaPath === "string"
          ? { endMediaPath: payload.endMediaPath }
          : {}),
        resultKey: job.id
      });
    }

    return {
      schemaVersion: "1.0",
      projectId: input.projectId,
      createdAt: this.clock.nowIso(),
      jobs
    };
  }

  async reconcileDependencies(projectId: string): Promise<string[]> {
    const clips = await this.repository.listActiveClips(projectId);
    const staleClipIds: string[] = [];
    for (const clip of clips) {
      const link = await this.context.getLink(projectId, clip.linkId);
      if (
        link === null ||
        link.stale ||
        link.revision !== clip.linkRevision ||
        link.implementationType !== "CLIP" ||
        link.implementationRefId !== clip.id
      ) {
        staleClipIds.push(clip.id);
      }
    }

    const cuts = await this.repository.listActiveCuts(projectId);
    const staleCutIds: string[] = [];
    for (const cut of cuts) {
      const link = await this.context.getLink(projectId, cut.linkId);
      if (
        link === null ||
        link.stale ||
        link.revision !== cut.linkRevision ||
        link.implementationType !== "CUT" ||
        link.implementationRefId !== cut.id
      ) {
        staleCutIds.push(cut.id);
      }
    }

    if (staleClipIds.length === 0 && staleCutIds.length === 0) return [];

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId,
      eventType: "FINAL_IMPLEMENTATIONS_STALE_FROM_LINK_CHANGE",
      targetType: "PROJECT",
      targetId: projectId,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        clipIds: staleClipIds,
        cutIds: staleCutIds
      }
    });
    await this.repository.markImplementationsStale({
      clipIds: staleClipIds,
      cutIds: staleCutIds,
      reason: "LINK_REVISION_CHANGED",
      event,
      outbox
    });
    return [...staleClipIds, ...staleCutIds];
  }

  private async resolveLinkContext(input: {
    projectId: string;
    linkId: string;
    format: ProjectFormat;
  }): Promise<ResolvedLinkContext> {
    const link = await this.requireCurrentLink(input.projectId, input.linkId);
    if (
      link.linkStatus !== "HANDOFF_PASS" &&
      link.linkStatus !== "FINAL_DESIGN_READY"
    ) {
      throw new FinalClipValidationError(
        "HANDOFF_PASS_REQUIRED",
        "Final Clip Design requires HANDOFF_PASS."
      );
    }
    if (
      link.fromAssetId === undefined ||
      link.fromAssetRevision === undefined ||
      link.fromMediaId === undefined ||
      link.toAssetId === undefined ||
      link.toAssetRevision === undefined ||
      link.toMediaId === undefined ||
      link.handoffQcId === undefined ||
      link.handoffUsable !== true
    ) {
      throw new FinalClipValidationError(
        "LINK_BOUND_ASSETS_REQUIRED",
        "Final Clip Design requires current bound endpoint Assets."
      );
    }

    const fromScene = await this.requireScene(input.projectId, link.fromSceneId);
    const toScene = await this.requireScene(input.projectId, link.toSceneId);
    const fromAsset = await this.requireAsset(
      input.projectId,
      link.fromAssetId,
      link.fromAssetRevision
    );
    const toAsset = await this.requireAsset(
      input.projectId,
      link.toAssetId,
      link.toAssetRevision
    );
    const fromMedia = await this.requireMedia(input.projectId, link.fromMediaId);
    const toMedia = await this.requireMedia(input.projectId, link.toMediaId);

    return {
      projectId: input.projectId,
      format: input.format,
      link,
      fromScene,
      toScene,
      fromAsset,
      fromMedia,
      toAsset,
      toMedia
    };
  }

  private async resolveClipContext(
    projectId: string,
    clip: ProductionClip,
    format: ProjectFormat
  ): Promise<ResolvedLinkContext> {
    const link = await this.requireCurrentLink(projectId, clip.linkId);
    if (link.revision !== clip.linkRevision) {
      throw new FinalClipValidationError(
        "IMPLEMENTATION_STALE",
        "Clip no longer matches current Link revision."
      );
    }
    return this.resolveLinkContext({
      projectId,
      linkId: link.id,
      format
    });
  }

  private async requireCurrentLink(
    projectId: string,
    linkId: string
  ): Promise<ProductionLink> {
    const link = await this.context.getLink(projectId, linkId);
    if (link === null) {
      throw new FinalClipValidationError(
        "LINK_NOT_FOUND",
        "Link does not exist."
      );
    }
    if (link.stale) {
      throw new FinalClipValidationError(
        "IMPLEMENTATION_STALE",
        "Link is stale."
      );
    }
    return link;
  }

  private async requireCurrentClip(
    projectId: string,
    clipId: string
  ): Promise<ProductionClip> {
    const clip = await this.repository.getLatestClip(projectId, clipId);
    if (clip === null) {
      throw new FinalClipValidationError(
        "CLIP_NOT_FOUND",
        "Clip does not exist."
      );
    }
    if (clip.stale) {
      throw new FinalClipValidationError(
        "IMPLEMENTATION_STALE",
        "Clip is stale."
      );
    }
    return clip;
  }

  private async requireScene(
    projectId: string,
    sceneId: string
  ): Promise<Scene> {
    const scene = await this.context.getScene(projectId, sceneId);
    if (scene === null || scene.stale) {
      throw new FinalClipValidationError(
        "IMPLEMENTATION_STALE",
        "Link endpoint Scene is unavailable."
      );
    }
    return scene;
  }

  private async requireAsset(
    projectId: string,
    assetId: string,
    revision: number
  ): Promise<ProductionAsset> {
    const asset = await this.context.getAsset(projectId, assetId);
    if (
      asset === null ||
      asset.stale ||
      asset.revision !== revision ||
      asset.assetStatus !== "APPROVED" ||
      asset.approvedMediaId === undefined
    ) {
      throw new FinalClipValidationError(
        "LINK_BOUND_ASSETS_REQUIRED",
        "Bound Asset is unavailable or changed."
      );
    }
    return asset;
  }

  private async requireMedia(
    projectId: string,
    mediaId: string
  ): Promise<MediaArtifact> {
    const media = await this.context.getMedia(projectId, mediaId);
    if (media === null || media.mediaStatus !== "AVAILABLE") {
      throw new FinalClipValidationError(
        "LINK_BOUND_MEDIA_REQUIRED",
        "Bound Media is unavailable."
      );
    }
    return media;
  }
}

export class FinalClipBatchService {
  constructor(private readonly pipeline: FinalClipPipeline) {}

  async designFinalImplementations(input: {
    projectId: string;
    linkIds: string[];
    format: ProjectFormat;
  }): Promise<BatchResult<FinalDesignOutcome>> {
    return this.run(
      [...new Set(input.linkIds)],
      (linkId) => this.pipeline.designFinalImplementation({
        projectId: input.projectId,
        linkId,
        format: input.format
      })
    );
  }

  async runProviderPreQc(input: {
    projectId: string;
    clipIds: string[];
    format: ProjectFormat;
    provider: string;
    providerProfileVersion: string;
  }): Promise<BatchResult<Awaited<ReturnType<FinalClipPipeline["runProviderPreQc"]>>>> {
    return this.run(
      [...new Set(input.clipIds)],
      (clipId) => this.pipeline.runProviderPreQc({
        projectId: input.projectId,
        clipId,
        format: input.format,
        provider: input.provider,
        providerProfileVersion: input.providerProfileVersion
      })
    );
  }

  async createVideoJobs(input: {
    projectId: string;
    clipIds: string[];
    format: ProjectFormat;
    provider: string;
    providerProfileVersion: string;
    executionMode: ProviderExecutionMode;
  }): Promise<BatchResult<Awaited<ReturnType<FinalClipPipeline["createVideoGenerationJob"]>>>> {
    return this.run(
      [...new Set(input.clipIds)],
      (clipId) => this.pipeline.createVideoGenerationJob({
        projectId: input.projectId,
        clipId,
        format: input.format,
        provider: input.provider,
        providerProfileVersion: input.providerProfileVersion,
        executionMode: input.executionMode
      })
    );
  }

  async importVideoResults(input: {
    projectId: string;
    items: VideoResultImportItem[];
  }): Promise<BatchResult<Awaited<ReturnType<FinalClipPipeline["registerVideoResult"]>>>> {
    return this.run(
      input.items,
      (item) => this.pipeline.registerVideoResult({
        projectId: input.projectId,
        ...item
      }),
      (item) => item.jobId
    );
  }

  async retryFailedJobs(input: {
    projectId: string;
    failedJobIds: string[];
    format: ProjectFormat;
  }): Promise<BatchResult<Awaited<ReturnType<FinalClipPipeline["retryVideoGenerationJob"]>>>> {
    return this.run(
      [...new Set(input.failedJobIds)],
      (jobId) => this.pipeline.retryVideoGenerationJob({
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
          ...(error instanceof FinalClipValidationError
            ? { code: error.code, message: error.message }
            : { code: "FINAL_CLIP_SYSTEM_ERROR", message: "Unexpected error" })
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
