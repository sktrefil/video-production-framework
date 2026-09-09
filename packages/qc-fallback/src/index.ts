import type {
  AggregateQcSummary,
  ApprovalRecord,
  ClipFallbackAction,
  ClipFallbackRecord,
  ClipMode,
  ClipQcRecord,
  LinkCutImplementation,
  MediaArtifact,
  ProductionAsset,
  ProductionClip,
  ProductionLink,
  ProjectFormat,
  Scene
} from "@vpf/domain";
import type {
  ClipFallbackDecision,
  ClipQcDecision,
  ProductionDecisionWithMeta,
  QcFallbackDecisionPort
} from "@vpf/production-system";
import type { FinalClipContextPort, FinalClipRepository } from "@vpf/final-clip";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";

export interface QcFallbackRepository {
  getLatestClipQc(projectId: string, clipId: string): Promise<ClipQcRecord | null>;
  getClipQc(projectId: string, qcId: string): Promise<ClipQcRecord | null>;
  getLatestFallback(projectId: string, clipId: string): Promise<ClipFallbackRecord | null>;
  getFallback(projectId: string, fallbackId: string): Promise<ClipFallbackRecord | null>;

  commitClipQc(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    qc: ClipQcRecord;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  commitQcApproval(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  commitFallbackSelection(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    fallback: ClipFallbackRecord;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  commitFallbackRevision(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    previousFallback: ClipFallbackRecord;
    nextFallback: ClipFallbackRecord;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
}

export interface QcFallbackClock {
  nowIso(): string;
}

export interface QcFallbackIdFactory {
  next(prefix: "qc" | "fallback" | "apr" | "evt" | "outbox"): string;
}

export class QcFallbackValidationError extends Error {
  constructor(
    public readonly code:
      | "CLIP_NOT_FOUND"
      | "CANDIDATE_NOT_FOUND"
      | "CANDIDATE_VIDEO_REQUIRED"
      | "CLIP_QC_NOT_READY"
      | "CLIP_QC_DECISION_INVALID"
      | "TRIM_RANGE_INVALID"
      | "QC_NOT_REVIEWABLE"
      | "FALLBACK_NOT_READY"
      | "FALLBACK_NOT_REVIEWABLE"
      | "IMPLEMENTATION_STALE"
      | "BOUND_CONTEXT_UNAVAILABLE",
    message: string
  ) {
    super(message);
    this.name = "QcFallbackValidationError";
  }
}

export interface ClipQcOutcome {
  clip: ProductionClip;
  qc: ClipQcRecord;
  approval?: ApprovalRecord;
  decisionMeta: ProductionDecisionWithMeta<ClipQcDecision>;
}

export interface ClipFallbackOutcome {
  clip: ProductionClip;
  fallback: ClipFallbackRecord;
  approval?: ApprovalRecord;
  nextAction:
    | "NONE"
    | "CREATE_VIDEO_JOB"
    | "CONTINUE_EDITOR_BINDING"
    | "REBUILD_AS_CUT"
    | "CREATE_ADDITIONAL_ASSET"
    | "REVIEW_FALLBACK"
    | "STOP";
  decisionMeta?: ProductionDecisionWithMeta<ClipFallbackDecision>;
}

interface ResolvedContext {
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

function durableEvent(
  ids: QcFallbackIdFactory,
  clock: QcFallbackClock,
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

function nextClip(
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

function statusAfterQc(
  decision: ClipQcDecision,
  review: boolean
): ProductionClip["clipStatus"] {
  if (review && (decision.status === "PASS" || decision.status === "TRIM_PASS")) {
    return "NEEDS_REVIEW";
  }
  switch (decision.status) {
    case "PASS":
    case "TRIM_PASS":
      return "APPROVED";
    case "EDITORIAL_FIX":
      return "EDITORIAL_FIX_REQUIRED";
    case "REGENERATE":
      return "REGENERATE_REQUIRED";
    case "FALLBACK":
      return "FALLBACK_REQUIRED";
    case "BLOCKED":
      return "BLOCKED";
  }
}

function validateQcDecision(
  decision: ClipQcDecision,
  candidate: MediaArtifact
): void {
  if (!Number.isFinite(decision.confidence) || decision.confidence < 0 || decision.confidence > 1) {
    throw new QcFallbackValidationError(
      "CLIP_QC_DECISION_INVALID",
      "CLIP_QC confidence must be between 0 and 1."
    );
  }
  if (!Array.isArray(decision.issues)) {
    throw new QcFallbackValidationError(
      "CLIP_QC_DECISION_INVALID",
      "CLIP_QC issues must be an array."
    );
  }
  if (decision.status === "TRIM_PASS") {
    const duration = candidate.durationMs ?? 0;
    const from = decision.usableInMs;
    const to = decision.usableOutMs;
    if (
      from === undefined ||
      to === undefined ||
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      from < 0 ||
      to <= from ||
      to > duration
    ) {
      throw new QcFallbackValidationError(
        "TRIM_RANGE_INVALID",
        "TRIM_PASS requires a valid usableInMs/usableOutMs inside the candidate duration."
      );
    }
  }
}

function modeForFallback(action: ClipFallbackAction): ClipMode | null {
  switch (action) {
    case "EDITORIAL_MOVE":
      return "EDITORIAL_MOVE";
    case "STATIC_HOLD":
      return "STATIC_HOLD";
    case "REUSE_REFRAME":
      return "REUSE_REFRAME";
    default:
      return null;
  }
}

function removeProviderState(clip: ProductionClip): ProductionClip {
  const copy = { ...clip };
  delete copy.providerPreflightId;
  delete copy.approvedMediaId;
  return copy;
}

function fallbackNextAction(action: ClipFallbackAction, applied: boolean): ClipFallbackOutcome["nextAction"] {
  if (!applied) {
    if (action === "CUT") return "REBUILD_AS_CUT";
    if (action === "ADDITIONAL_ASSET_REQUIRED") return "CREATE_ADDITIONAL_ASSET";
    return "REVIEW_FALLBACK";
  }
  if (action === "REGENERATE") return "CREATE_VIDEO_JOB";
  if (action === "EDITORIAL_MOVE" || action === "STATIC_HOLD" || action === "REUSE_REFRAME") {
    return "CONTINUE_EDITOR_BINDING";
  }
  if (action === "BLOCK") return "STOP";
  return "NONE";
}

export class QcFallbackPipeline {
  constructor(
    private readonly repository: QcFallbackRepository,
    private readonly finalClips: FinalClipRepository,
    private readonly context: FinalClipContextPort,
    private readonly decisions: QcFallbackDecisionPort,
    private readonly clock: QcFallbackClock,
    private readonly ids: QcFallbackIdFactory
  ) {}

  async runClipQc(input: {
    projectId: string;
    clipId: string;
    candidateMediaId: string;
    format: ProjectFormat;
  }): Promise<ClipQcOutcome> {
    const clip = await this.requireClip(input.projectId, input.clipId);
    if (clip.clipStatus !== "CANDIDATE_AVAILABLE" || clip.stale) {
      throw new QcFallbackValidationError(
        "CLIP_QC_NOT_READY",
        "Only a current CANDIDATE_AVAILABLE Clip can enter CLIP_QC."
      );
    }
    if (!clip.candidateMediaIds.includes(input.candidateMediaId)) {
      throw new QcFallbackValidationError(
        "CANDIDATE_NOT_FOUND",
        "Candidate media is not registered on this Clip."
      );
    }
    const candidate = await this.context.getMedia(input.projectId, input.candidateMediaId);
    if (candidate === null || candidate.mediaStatus !== "AVAILABLE") {
      throw new QcFallbackValidationError(
        "CANDIDATE_NOT_FOUND",
        "Candidate media is unavailable."
      );
    }
    if (candidate.mediaType !== "VIDEO" || !candidate.mimeType.toLowerCase().startsWith("video/")) {
      throw new QcFallbackValidationError(
        "CANDIDATE_VIDEO_REQUIRED",
        "CLIP_QC requires an available video candidate."
      );
    }

    const resolved = await this.resolveContext(input.projectId, clip, input.format);
    const result = await this.decisions.runClipQc({
      ...resolved,
      clip,
      candidate
    });
    validateQcDecision(result.decision, candidate);

    const now = this.clock.nowIso();
    let next = nextClip(
      clip,
      { clipStatus: statusAfterQc(result.decision, result.requiresHumanReview) },
      now
    );

    const qc: ClipQcRecord = {
      id: this.ids.next("qc"),
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      clipId: clip.id,
      clipRevision: next.revision,
      candidateMediaId: candidate.id,
      status: result.decision.status,
      severity: result.decision.severity,
      confidence: result.decision.confidence,
      ...(result.decision.usableInMs === undefined ? {} : { usableInMs: result.decision.usableInMs }),
      ...(result.decision.usableOutMs === undefined ? {} : { usableOutMs: result.decision.usableOutMs }),
      issues: [...result.decision.issues],
      ...(result.decision.regenerationReason === undefined ? {} : { regenerationReason: result.decision.regenerationReason }),
      ...(result.decision.editorialInstruction === undefined ? {} : { editorialInstruction: result.decision.editorialInstruction }),
      ...(result.decision.fallbackReason === undefined ? {} : { fallbackReason: result.decision.fallbackReason }),
      decisionId: result.decisionId
    };

    let approval: ApprovalRecord | undefined;
    if (
      !result.requiresHumanReview &&
      (qc.status === "PASS" || qc.status === "TRIM_PASS")
    ) {
      approval = {
        id: this.ids.next("apr"),
        projectId: input.projectId,
        targetType: "CLIP",
        targetId: clip.id,
        targetRevision: next.revision,
        approvalState: "AUTO_APPROVED",
        reason: qc.status === "TRIM_PASS" ? "CLIP_QC_TRIM_PASS" : "CLIP_QC_PASS",
        approvedByType: "SYSTEM",
        selectedMediaId: candidate.id,
        createdAt: now
      };
      next = { ...next, approvedMediaId: candidate.id };
    }

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: `CLIP_QC_${qc.status}`,
      targetType: "CLIP",
      targetId: clip.id,
      trigger: "QC_RESULT",
      payload: {
        qcId: qc.id,
        candidateMediaId: candidate.id,
        status: qc.status,
        usableInMs: qc.usableInMs ?? null,
        usableOutMs: qc.usableOutMs ?? null,
        requiresHumanReview: result.requiresHumanReview
      }
    });
    await this.repository.commitClipQc({
      previousClip: clip,
      nextClip: next,
      qc,
      ...(approval === undefined ? {} : { approval }),
      event,
      outbox
    });
    return {
      clip: next,
      qc,
      ...(approval === undefined ? {} : { approval }),
      decisionMeta: result
    };
  }

  async approveClipQc(input: {
    projectId: string;
    clipId: string;
    approvedById?: string;
  }): Promise<{ clip: ProductionClip; qc: ClipQcRecord; approval: ApprovalRecord }> {
    const clip = await this.requireClip(input.projectId, input.clipId);
    const qc = await this.repository.getLatestClipQc(input.projectId, clip.id);
    if (
      clip.clipStatus !== "NEEDS_REVIEW" ||
      qc === null ||
      (qc.status !== "PASS" && qc.status !== "TRIM_PASS")
    ) {
      throw new QcFallbackValidationError(
        "QC_NOT_REVIEWABLE",
        "Clip QC is not awaiting PASS/TRIM_PASS review."
      );
    }
    const candidate = await this.context.getMedia(input.projectId, qc.candidateMediaId);
    if (candidate === null || candidate.mediaStatus !== "AVAILABLE") {
      throw new QcFallbackValidationError(
        "CANDIDATE_NOT_FOUND",
        "QC candidate is no longer available."
      );
    }
    const now = this.clock.nowIso();
    const next = nextClip(
      clip,
      { clipStatus: "APPROVED", approvedMediaId: candidate.id },
      now
    );
    const approval: ApprovalRecord = {
      id: this.ids.next("apr"),
      projectId: input.projectId,
      targetType: "CLIP",
      targetId: clip.id,
      targetRevision: next.revision,
      approvalState: "HUMAN_APPROVED",
      reason: qc.status === "TRIM_PASS" ? "CLIP_QC_TRIM_PASS_APPROVED" : "CLIP_QC_PASS_APPROVED",
      approvedByType: "USER",
      ...(input.approvedById === undefined ? {} : { approvedById: input.approvedById }),
      selectedMediaId: candidate.id,
      createdAt: now
    };
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "CLIP_QC_REVIEW_APPROVED",
      targetType: "CLIP",
      targetId: clip.id,
      trigger: "USER",
      payload: { qcId: qc.id, candidateMediaId: candidate.id }
    });
    await this.repository.commitQcApproval({
      previousClip: clip,
      nextClip: next,
      approval,
      event,
      outbox
    });
    return { clip: next, qc, approval };
  }

  async selectFallback(input: {
    projectId: string;
    clipId: string;
    format: ProjectFormat;
  }): Promise<ClipFallbackOutcome> {
    const clip = await this.requireClip(input.projectId, input.clipId);
    if (
      clip.clipStatus !== "EDITORIAL_FIX_REQUIRED" &&
      clip.clipStatus !== "REGENERATE_REQUIRED" &&
      clip.clipStatus !== "FALLBACK_REQUIRED"
    ) {
      throw new QcFallbackValidationError(
        "FALLBACK_NOT_READY",
        "Fallback selection requires a failed/fixable CLIP_QC outcome."
      );
    }
    const qc = await this.repository.getLatestClipQc(input.projectId, clip.id);
    if (qc === null) {
      throw new QcFallbackValidationError(
        "FALLBACK_NOT_READY",
        "Fallback selection requires a persisted CLIP_QC result."
      );
    }
    const candidate = await this.context.getMedia(input.projectId, qc.candidateMediaId);
    if (candidate === null) {
      throw new QcFallbackValidationError("CANDIDATE_NOT_FOUND", "QC candidate is unavailable.");
    }
    const resolved = await this.resolveContext(input.projectId, clip, input.format);
    const result = await this.decisions.selectClipFallback({
      ...resolved,
      clip,
      candidate,
      qc
    });
    return this.persistFallbackDecision(clip, qc, result);
  }

  async approveFallback(input: {
    projectId: string;
    fallbackId: string;
    approvedById?: string;
  }): Promise<ClipFallbackOutcome> {
    const fallback = await this.repository.getFallback(input.projectId, input.fallbackId);
    if (fallback === null || !fallback.requiresHumanReview || fallback.applied) {
      throw new QcFallbackValidationError(
        "FALLBACK_NOT_REVIEWABLE",
        "Fallback record is not awaiting human review."
      );
    }
    const clip = await this.requireClip(input.projectId, fallback.clipId);
    if (clip.clipStatus !== "FALLBACK_REQUIRED") {
      throw new QcFallbackValidationError(
        "IMPLEMENTATION_STALE",
        "Fallback no longer targets the current Clip state."
      );
    }

    const now = this.clock.nowIso();
    const applied = this.applyFallbackPatch(clip, fallback.action, now);
    const nextFallback: ClipFallbackRecord = {
      ...fallback,
      revision: fallback.revision + 1,
      lifecycleStatus: "ACTIVE",
      updatedAt: now,
      clipRevision: applied.clip.revision,
      requiresHumanReview: false,
      applied: applied.applied
    };
    let next = applied.clip;
    let approval: ApprovalRecord | undefined;
    if (applied.applied && modeForFallback(fallback.action) !== null) {
      approval = {
        id: this.ids.next("apr"),
        projectId: input.projectId,
        targetType: "CLIP",
        targetId: clip.id,
        targetRevision: next.revision,
        approvalState: "HUMAN_APPROVED",
        reason: "CLIP_FALLBACK_APPROVED",
        approvedByType: "USER",
        ...(input.approvedById === undefined ? {} : { approvedById: input.approvedById }),
        createdAt: now
      };
      next = { ...next, finalDesignApprovalId: approval.id };
    }

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "CLIP_FALLBACK_REVIEW_APPROVED",
      targetType: "CLIP",
      targetId: clip.id,
      trigger: "USER",
      payload: { fallbackId: fallback.id, action: fallback.action, applied: applied.applied }
    });
    await this.repository.commitFallbackRevision({
      previousClip: clip,
      nextClip: next,
      previousFallback: fallback,
      nextFallback,
      ...(approval === undefined ? {} : { approval }),
      event,
      outbox
    });
    return {
      clip: next,
      fallback: nextFallback,
      ...(approval === undefined ? {} : { approval }),
      nextAction: fallbackNextAction(fallback.action, applied.applied)
    };
  }

  async getReadiness(projectId: string, clipId: string): Promise<{
    clipId: string;
    qcComplete: boolean;
    finalMediaApproved: boolean;
    editorialReady: boolean;
    regenerationReady: boolean;
    fallbackRequired: boolean;
    usableInMs?: number;
    usableOutMs?: number;
  }> {
    const clip = await this.requireClip(projectId, clipId);
    const qc = await this.repository.getLatestClipQc(projectId, clip.id);
    return {
      clipId,
      qcComplete: qc !== null,
      finalMediaApproved: clip.clipStatus === "APPROVED" && clip.approvedMediaId !== undefined,
      editorialReady: clip.clipStatus === "READY" && !clip.providerExecutionRequired,
      regenerationReady: clip.clipStatus === "READY" && clip.providerExecutionRequired,
      fallbackRequired:
        clip.clipStatus === "EDITORIAL_FIX_REQUIRED" ||
        clip.clipStatus === "REGENERATE_REQUIRED" ||
        clip.clipStatus === "FALLBACK_REQUIRED",
      ...(qc?.usableInMs === undefined ? {} : { usableInMs: qc.usableInMs }),
      ...(qc?.usableOutMs === undefined ? {} : { usableOutMs: qc.usableOutMs })
    };
  }

  private async persistFallbackDecision(
    clip: ProductionClip,
    qc: ClipQcRecord,
    result: ProductionDecisionWithMeta<ClipFallbackDecision>
  ): Promise<ClipFallbackOutcome> {
    const action = result.decision.action;
    const now = this.clock.nowIso();
    const shouldApply =
      !result.requiresHumanReview &&
      action !== "CUT" &&
      action !== "ADDITIONAL_ASSET_REQUIRED";
    const applied = shouldApply
      ? this.applyFallbackPatch(clip, action, now)
      : { clip: nextClip(clip, { clipStatus: "FALLBACK_REQUIRED" }, now), applied: false };

    let next = applied.clip;
    let approval: ApprovalRecord | undefined;
    if (applied.applied && modeForFallback(action) !== null) {
      approval = {
        id: this.ids.next("apr"),
        projectId: clip.projectId,
        targetType: "CLIP",
        targetId: clip.id,
        targetRevision: next.revision,
        approvalState: "AUTO_APPROVED",
        reason: "CLIP_FALLBACK_AUTO_APPROVED",
        approvedByType: "SYSTEM",
        createdAt: now
      };
      next = { ...next, finalDesignApprovalId: approval.id };
    }

    const fallback: ClipFallbackRecord = {
      id: this.ids.next("fallback"),
      projectId: clip.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      clipId: clip.id,
      clipRevision: next.revision,
      sourceQcId: qc.id,
      action,
      rationale: result.decision.rationale,
      decisionId: result.decisionId,
      requiresHumanReview: result.requiresHumanReview,
      applied: applied.applied,
      ...(applied.applied
        ? { resultingImplementationType: "CLIP" as const, resultingImplementationRefId: clip.id }
        : {})
    };

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: clip.projectId,
      eventType: applied.applied ? "CLIP_FALLBACK_APPLIED" : "CLIP_FALLBACK_SELECTED",
      targetType: "CLIP",
      targetId: clip.id,
      trigger: "QC_RESULT",
      payload: {
        fallbackId: fallback.id,
        action,
        applied: fallback.applied,
        requiresHumanReview: fallback.requiresHumanReview
      }
    });
    await this.repository.commitFallbackSelection({
      previousClip: clip,
      nextClip: next,
      fallback,
      ...(approval === undefined ? {} : { approval }),
      event,
      outbox
    });
    return {
      clip: next,
      fallback,
      ...(approval === undefined ? {} : { approval }),
      nextAction: result.requiresHumanReview
        ? "REVIEW_FALLBACK"
        : fallbackNextAction(action, fallback.applied),
      decisionMeta: result
    };
  }

  private applyFallbackPatch(
    clip: ProductionClip,
    action: ClipFallbackAction,
    now: string
  ): { clip: ProductionClip; applied: boolean } {
    if (action === "REGENERATE") {
      if (!clip.providerExecutionRequired || clip.providerPreflightId === undefined) {
        return {
          clip: nextClip(clip, { clipStatus: "FALLBACK_REQUIRED" }, now),
          applied: false
        };
      }
      return {
        clip: nextClip(clip, { clipStatus: "READY" }, now),
        applied: true
      };
    }
    const mode = modeForFallback(action);
    if (mode !== null) {
      const base = removeProviderState(clip);
      return {
        clip: nextClip(
          base,
          {
            clipMode: mode,
            providerExecutionRequired: false,
            clipStatus: "READY"
          },
          now
        ),
        applied: true
      };
    }
    if (action === "BLOCK") {
      return {
        clip: nextClip(clip, { clipStatus: "BLOCKED" }, now),
        applied: true
      };
    }
    return {
      clip: nextClip(clip, { clipStatus: "FALLBACK_REQUIRED" }, now),
      applied: false
    };
  }

  private async resolveContext(
    projectId: string,
    clip: ProductionClip,
    format: ProjectFormat
  ): Promise<ResolvedContext> {
    const link = await this.context.getLink(projectId, clip.linkId);
    if (
      link === null ||
      link.stale ||
      link.revision !== clip.linkRevision ||
      link.implementationType !== "CLIP" ||
      link.implementationRefId !== clip.id
    ) {
      throw new QcFallbackValidationError(
        "IMPLEMENTATION_STALE",
        "Clip no longer matches the current Link implementation."
      );
    }
    const fromScene = await this.context.getScene(projectId, link.fromSceneId);
    const toScene = await this.context.getScene(projectId, link.toSceneId);
    if (fromScene === null || toScene === null || fromScene.stale || toScene.stale) {
      throw new QcFallbackValidationError(
        "BOUND_CONTEXT_UNAVAILABLE",
        "Clip endpoint Scenes are unavailable."
      );
    }
    if (
      link.fromAssetId === undefined ||
      link.toAssetId === undefined ||
      link.fromMediaId === undefined ||
      link.toMediaId === undefined
    ) {
      throw new QcFallbackValidationError(
        "BOUND_CONTEXT_UNAVAILABLE",
        "Link does not retain approved endpoint bindings."
      );
    }
    const fromAsset = await this.context.getAsset(projectId, link.fromAssetId);
    const toAsset = await this.context.getAsset(projectId, link.toAssetId);
    const fromMedia = await this.context.getMedia(projectId, link.fromMediaId);
    const toMedia = await this.context.getMedia(projectId, link.toMediaId);
    if (
      fromAsset === null ||
      toAsset === null ||
      fromMedia === null ||
      toMedia === null ||
      fromAsset.stale ||
      toAsset.stale ||
      fromAsset.assetStatus !== "APPROVED" ||
      toAsset.assetStatus !== "APPROVED" ||
      fromMedia.mediaStatus !== "AVAILABLE" ||
      toMedia.mediaStatus !== "AVAILABLE"
    ) {
      throw new QcFallbackValidationError(
        "BOUND_CONTEXT_UNAVAILABLE",
        "Approved endpoint Asset/Media context is unavailable."
      );
    }
    return {
      projectId,
      format,
      link,
      fromScene,
      toScene,
      fromAsset,
      fromMedia,
      toAsset,
      toMedia
    };
  }

  private async requireClip(projectId: string, clipId: string): Promise<ProductionClip> {
    const clip = await this.finalClips.getLatestClip(projectId, clipId);
    if (clip === null) {
      throw new QcFallbackValidationError("CLIP_NOT_FOUND", "Clip does not exist.");
    }
    if (clip.stale || clip.lifecycleStatus !== "ACTIVE") {
      throw new QcFallbackValidationError("IMPLEMENTATION_STALE", "Clip is stale.");
    }
    return clip;
  }
}

export function summarizeQc(
  scopeType: AggregateQcSummary["scopeType"],
  scopeId: string,
  clips: ProductionClip[],
  cuts: LinkCutImplementation[]
): AggregateQcSummary {
  const readyIds: string[] = [];
  const blockedIds: string[] = [];
  const pendingIds: string[] = [];

  for (const clip of clips) {
    if (
      clip.clipStatus === "APPROVED" ||
      (clip.clipStatus === "READY" && !clip.providerExecutionRequired)
    ) {
      readyIds.push(clip.id);
    } else if (clip.clipStatus === "BLOCKED") {
      blockedIds.push(clip.id);
    } else {
      pendingIds.push(clip.id);
    }
  }
  for (const cut of cuts) {
    if (cut.ready && !cut.stale) readyIds.push(cut.id);
    else pendingIds.push(cut.id);
  }

  const total = readyIds.length + blockedIds.length + pendingIds.length;
  return {
    scopeType,
    scopeId,
    status:
      blockedIds.length > 0
        ? "BLOCKED"
        : pendingIds.length > 0
          ? "PARTIAL"
          : "PASS",
    readyImplementations: readyIds.length,
    totalImplementations: total,
    blockedImplementationIds: blockedIds,
    pendingImplementationIds: pendingIds
  };
}

export interface QcFallbackCommandResult<T> {
  ok: boolean;
  value?: T;
  code?: string;
  userMessage: string;
  recommendedAction?: string;
}

export class QcFallbackCommandFacade {
  constructor(private readonly pipeline: QcFallbackPipeline) {}

  async runClipQc(
    input: Parameters<QcFallbackPipeline["runClipQc"]>[0]
  ): Promise<QcFallbackCommandResult<ClipQcOutcome>> {
    try {
      const value = await this.pipeline.runClipQc(input);
      const map: Record<ClipQcRecord["status"], { message: string; action: string }> = {
        PASS: { message: "클립 QC를 통과해 후보 영상을 승인했습니다.", action: "CONTINUE_EDITOR_BINDING" },
        TRIM_PASS: { message: "사용 가능한 구간만 승인했습니다.", action: "USE_QC_TRIM_RANGE" },
        EDITORIAL_FIX: { message: "재생성 없이 편집형 보정이 필요합니다.", action: "SELECT_FALLBACK" },
        REGENERATE: { message: "클립 재생성이 필요합니다.", action: "SELECT_FALLBACK" },
        FALLBACK: { message: "대체 구현 경로를 선택해야 합니다.", action: "SELECT_FALLBACK" },
        BLOCKED: { message: "현재 후보는 사용할 수 없습니다.", action: "STOP_AND_REVIEW" }
      };
      const item = map[value.qc.status];
      return {
        ok: true,
        value,
        userMessage: item.message,
        recommendedAction: value.clip.clipStatus === "NEEDS_REVIEW" ? "REVIEW_CLIP_QC" : item.action
      };
    } catch (error) {
      return mapError(error);
    }
  }

  async selectFallback(
    input: Parameters<QcFallbackPipeline["selectFallback"]>[0]
  ): Promise<QcFallbackCommandResult<ClipFallbackOutcome>> {
    try {
      const value = await this.pipeline.selectFallback(input);
      return {
        ok: true,
        value,
        userMessage: value.fallback.applied
          ? "QC 결과에 맞는 대체 경로를 적용했습니다."
          : "대체 경로를 선택했으며 후속 승인/재설계가 필요합니다.",
        recommendedAction: value.nextAction
      };
    } catch (error) {
      return mapError(error);
    }
  }
}

function mapError(error: unknown): QcFallbackCommandResult<never> {
  if (!(error instanceof QcFallbackValidationError)) {
    return {
      ok: false,
      code: "QC_FALLBACK_SYSTEM_ERROR",
      userMessage: "QC/Fallback 처리 중 예상하지 못한 오류가 발생했습니다."
    };
  }
  const actions: Record<QcFallbackValidationError["code"], string> = {
    CLIP_NOT_FOUND: "REBUILD_OR_REGENERATE_CLIP",
    CANDIDATE_NOT_FOUND: "IMPORT_VIDEO_AGAIN",
    CANDIDATE_VIDEO_REQUIRED: "IMPORT_VIDEO_AGAIN",
    CLIP_QC_NOT_READY: "CHECK_CLIP_STATUS",
    CLIP_QC_DECISION_INVALID: "REVIEW_CLIP_QC",
    TRIM_RANGE_INVALID: "REVIEW_CLIP_QC",
    QC_NOT_REVIEWABLE: "CHECK_CLIP_STATUS",
    FALLBACK_NOT_READY: "RUN_CLIP_QC",
    FALLBACK_NOT_REVIEWABLE: "CHECK_FALLBACK_STATUS",
    IMPLEMENTATION_STALE: "REBUILD_OR_REGENERATE_CLIP",
    BOUND_CONTEXT_UNAVAILABLE: "REBIND_APPROVED_ASSETS"
  };
  return {
    ok: false,
    code: error.code,
    userMessage: error.message,
    recommendedAction: actions[error.code]
  };
}

export class QcFallbackBatchService {
  constructor(private readonly pipeline: QcFallbackPipeline) {}

  async runClipQc(input: {
    projectId: string;
    items: Array<{ clipId: string; candidateMediaId: string }>;
    format: ProjectFormat;
  }): Promise<{
    status: "COMPLETE" | "PARTIAL_COMPLETE" | "FAILED";
    succeeded: number;
    failed: number;
    items: Array<{ clipId: string; ok: boolean; value?: ClipQcOutcome; code?: string }>;
  }> {
    const results: Array<{ clipId: string; ok: boolean; value?: ClipQcOutcome; code?: string }> = [];
    for (const item of input.items) {
      try {
        results.push({
          clipId: item.clipId,
          ok: true,
          value: await this.pipeline.runClipQc({
            projectId: input.projectId,
            clipId: item.clipId,
            candidateMediaId: item.candidateMediaId,
            format: input.format
          })
        });
      } catch (error) {
        results.push({
          clipId: item.clipId,
          ok: false,
          code: error instanceof QcFallbackValidationError ? error.code : "QC_FALLBACK_SYSTEM_ERROR"
        });
      }
    }
    const succeeded = results.filter(item => item.ok).length;
    const failed = results.length - succeeded;
    return {
      status: failed === 0 ? "COMPLETE" : succeeded === 0 ? "FAILED" : "PARTIAL_COMPLETE",
      succeeded,
      failed,
      items: results
    };
  }
}
