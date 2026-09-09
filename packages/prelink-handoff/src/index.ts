import type {
  ApprovalRecord,
  LinkScope,
  MediaArtifact,
  ProductionAsset,
  ProductionLink,
  ProjectFormat,
  QcResult,
  Scene
} from "@vpf/domain";
import type {
  HandoffQcDecision,
  LinkDecisionPort,
  PreLinkDecision,
  ProductionDecisionWithMeta
} from "@vpf/production-system";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";

export interface OrderedScene {
  scene: Scene;
  chapterId: string;
  chapterDisplayNumber: number;
  sequenceId: string;
  sequenceDisplayNumber: number;
}

export interface PreLinkHandoffContextPort {
  listApprovedSceneChain(projectId: string): Promise<OrderedScene[]>;
  getScene(projectId: string, sceneId: string): Promise<Scene | null>;
  getApprovedPrimaryAsset(
    projectId: string,
    sceneId: string
  ): Promise<ProductionAsset | null>;
  getAsset(
    projectId: string,
    assetId: string
  ): Promise<ProductionAsset | null>;
  getMedia(
    projectId: string,
    mediaId: string
  ): Promise<MediaArtifact | null>;
}

export interface PreLinkHandoffRepository {
  getLatestLink(projectId: string, linkId: string): Promise<ProductionLink | null>;
  getLinkByScenes(
    projectId: string,
    fromSceneId: string,
    toSceneId: string
  ): Promise<ProductionLink | null>;
  listActiveLinks(projectId: string): Promise<ProductionLink[]>;

  commitLinkGraph(input: {
    changes: Array<{
      previous: ProductionLink | null;
      next: ProductionLink;
    }>;
    staleLinkIds: string[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  commitPreLink(input: {
    previous: ProductionLink;
    next: ProductionLink;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  commitPreLinkApproval(input: {
    previous: ProductionLink;
    next: ProductionLink;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  commitAssetBinding(input: {
    previous: ProductionLink;
    next: ProductionLink;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  commitHandoffQc(input: {
    previous: ProductionLink;
    next: ProductionLink;
    qc: QcResult;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  commitHandoffReviewApproval(input: {
    previous: ProductionLink;
    next: ProductionLink;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  commitDependencyReconciliation(input: {
    staleLinkIds: string[];
    resets: Array<{
      previous: ProductionLink;
      next: ProductionLink;
    }>;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
}

export interface PreLinkHandoffClock {
  nowIso(): string;
}

export interface PreLinkHandoffIdFactory {
  next(prefix: "lnk" | "qc" | "apr" | "evt" | "outbox"): string;
}

export interface LinkReadiness {
  linkId: string;
  preLinkReady: boolean;
  assetsBound: boolean;
  handoffQcReady: boolean;
  handoffPassed: boolean;
  finalClipDesignReady: boolean;
  status: ProductionLink["linkStatus"];
}

export class PreLinkHandoffValidationError extends Error {
  constructor(
    public readonly code:
      | "INSUFFICIENT_SCENES"
      | "LINK_NOT_FOUND"
      | "LINK_STALE"
      | "PRE_LINK_NOT_DESIGNED"
      | "PRE_LINK_APPROVAL_REQUIRED"
      | "PRE_LINK_DECISION_INVALID"
      | "PRE_LINK_NOT_REVIEWABLE"
      | "APPROVED_ASSETS_REQUIRED"
      | "APPROVED_MEDIA_REQUIRED"
      | "HANDOFF_QC_NOT_READY"
      | "HANDOFF_QC_DECISION_INVALID"
      | "HANDOFF_REVIEW_NOT_APPROVABLE"
      | "BOUND_ASSET_STALE",
    message: string
  ) {
    super(message);
    this.name = "PreLinkHandoffValidationError";
  }
}

function durableEvent(
  ids: PreLinkHandoffIdFactory,
  clock: PreLinkHandoffClock,
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

function scopeFor(
  format: ProjectFormat,
  from: OrderedScene,
  to: OrderedScene
): LinkScope {
  if (format === "SHORTFORM") return "FULL_VIDEO_PRIMARY";
  if (from.sequenceId === to.sequenceId) return "SEQUENCE_LOCAL";
  if (from.chapterId === to.chapterId) return "SEQUENCE_BOUNDARY";
  return "CHAPTER_BOUNDARY";
}

function validatePreLinkDecision(decision: PreLinkDecision): void {
  const requiredText = [
    decision.continuityLevel,
    decision.stateChange,
    decision.handoffIntent,
    decision.transitionIntent
  ];
  if (requiredText.some((value) => !value.trim())) {
    throw new PreLinkHandoffValidationError(
      "PRE_LINK_DECISION_INVALID",
      "PRE_LINK requires continuity, state-change, handoff, and transition intent."
    );
  }
  const channels = new Set(decision.handoffChannels);
  if (channels.size !== decision.handoffChannels.length) {
    throw new PreLinkHandoffValidationError(
      "PRE_LINK_DECISION_INVALID",
      "PRE_LINK handoff channels must not contain duplicates."
    );
  }
  if (
    decision.preLinkRequired &&
    decision.handoffChannels.length === 0
  ) {
    throw new PreLinkHandoffValidationError(
      "PRE_LINK_DECISION_INVALID",
      "Required PRE_LINK must identify at least one handoff channel."
    );
  }
}

function validateHandoffQcDecision(decision: HandoffQcDecision): void {
  if (decision.confidence < 0 || decision.confidence > 1) {
    throw new PreLinkHandoffValidationError(
      "HANDOFF_QC_DECISION_INVALID",
      "Handoff QC confidence must be between 0 and 1."
    );
  }
  if (
    (decision.qcStatus === "PASS" ||
      decision.qcStatus === "PASS_WITH_NOTE") &&
    (!decision.continuityUsable || decision.preLinkMatch === "MISMATCH")
  ) {
    throw new PreLinkHandoffValidationError(
      "HANDOFF_QC_DECISION_INVALID",
      "Passing Handoff QC must be usable and cannot report PRE_LINK mismatch."
    );
  }
}

function blankLink(input: {
  id: string;
  projectId: string;
  from: OrderedScene;
  to: OrderedScene;
  scope: LinkScope;
  now: string;
}): ProductionLink {
  return {
    id: input.id,
    projectId: input.projectId,
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: input.now,
    updatedAt: input.now,
    stale: false,
    fromSceneId: input.from.scene.id,
    fromSceneRevision: input.from.scene.revision,
    fromStateRef: {
      entityType: "SCENE",
      entityId: input.from.scene.id,
      entityRevision: input.from.scene.revision,
      stateField: "STATE_OUT"
    },
    toSceneId: input.to.scene.id,
    toSceneRevision: input.to.scene.revision,
    toStateRef: {
      entityType: "SCENE",
      entityId: input.to.scene.id,
      entityRevision: input.to.scene.revision,
      stateField: "STATE_IN"
    },
    linkScope: input.scope,
    preLinkRequired: false,
    continuityLevel: "",
    stateChange: "",
    handoffIntent: "",
    handoffAnchor: [],
    handoffChannels: [],
    transitionIntent: "",
    preLinkMatch: "NOT_EVALUATED",
    linkStatus: "NOT_PLANNED"
  };
}

function resetForStoryRevision(
  previous: ProductionLink,
  from: OrderedScene,
  to: OrderedScene,
  scope: LinkScope,
  now: string
): ProductionLink {
  return {
    ...blankLink({
      id: previous.id,
      projectId: previous.projectId,
      from,
      to,
      scope,
      now
    }),
    revision: previous.revision + 1,
    createdAt: previous.createdAt
  };
}

export class PreLinkHandoffPipeline {
  constructor(
    private readonly repository: PreLinkHandoffRepository,
    private readonly context: PreLinkHandoffContextPort,
    private readonly decisions: LinkDecisionPort,
    private readonly clock: PreLinkHandoffClock,
    private readonly ids: PreLinkHandoffIdFactory
  ) {}

  async buildLinkGraph(input: {
    projectId: string;
    format: ProjectFormat;
  }): Promise<ProductionLink[]> {
    const scenes = await this.context.listApprovedSceneChain(input.projectId);
    const activeLinks = await this.repository.listActiveLinks(input.projectId);

    if (scenes.length < 2) {
      if (activeLinks.length > 0) {
        const { event, outbox } = durableEvent(this.ids, this.clock, {
          projectId: input.projectId,
          eventType: "LINK_GRAPH_RECONCILED_EMPTY",
          targetType: "PROJECT",
          targetId: input.projectId,
          trigger: "WORKFLOW_ENGINE",
          payload: { staleLinkIds: activeLinks.map((link) => link.id) }
        });
        await this.repository.commitLinkGraph({
          changes: [],
          staleLinkIds: activeLinks.map((link) => link.id),
          event,
          outbox
        });
      }
      return [];
    }

    const desiredPairs = scenes.slice(0, -1).map((from, index) => ({
      from,
      to: scenes[index + 1]!
    }));
    const desiredKeys = new Set(
      desiredPairs.map(({ from, to }) => `${from.scene.id}->${to.scene.id}`)
    );
    const changes: Array<{
      previous: ProductionLink | null;
      next: ProductionLink;
    }> = [];
    const output: ProductionLink[] = [];
    const now = this.clock.nowIso();

    for (const { from, to } of desiredPairs) {
      const scope = scopeFor(input.format, from, to);
      const previous = await this.repository.getLinkByScenes(
        input.projectId,
        from.scene.id,
        to.scene.id
      );

      if (
        previous !== null &&
        !previous.stale &&
        previous.fromSceneRevision === from.scene.revision &&
        previous.toSceneRevision === to.scene.revision &&
        previous.linkScope === scope
      ) {
        output.push(previous);
        continue;
      }

      const next =
        previous === null
          ? blankLink({
              id: this.ids.next("lnk"),
              projectId: input.projectId,
              from,
              to,
              scope,
              now
            })
          : resetForStoryRevision(previous, from, to, scope, now);

      changes.push({ previous, next });
      output.push(next);
    }

    const staleLinkIds = activeLinks
      .filter(
        (link) =>
          !desiredKeys.has(`${link.fromSceneId}->${link.toSceneId}`)
      )
      .map((link) => link.id);

    if (changes.length > 0 || staleLinkIds.length > 0) {
      const { event, outbox } = durableEvent(this.ids, this.clock, {
        projectId: input.projectId,
        eventType: "LINK_GRAPH_REBUILT",
        targetType: "PROJECT",
        targetId: input.projectId,
        trigger: "WORKFLOW_ENGINE",
        payload: {
          changedLinkIds: changes.map((item) => item.next.id),
          staleLinkIds
        }
      });
      await this.repository.commitLinkGraph({
        changes,
        staleLinkIds,
        event,
        outbox
      });
    }

    return output;
  }

  async designPreLink(input: {
    projectId: string;
    linkId: string;
    format: ProjectFormat;
  }): Promise<{
    link: ProductionLink;
    approval?: ApprovalRecord;
    decisionMeta: ProductionDecisionWithMeta<PreLinkDecision>;
  }> {
    const link = await this.requireCurrentLink(input.projectId, input.linkId);
    const fromScene = await this.requireScene(input.projectId, link.fromSceneId);
    const toScene = await this.requireScene(input.projectId, link.toSceneId);

    const result = await this.decisions.designPreLink({
      projectId: input.projectId,
      format: input.format,
      link,
      fromScene,
      toScene
    });
    validatePreLinkDecision(result.decision);

    const now = this.clock.nowIso();
    let next = nextLinkRevision(
      link,
      {
        stale: false,
        preLinkRequired: result.decision.preLinkRequired,
        continuityLevel: result.decision.continuityLevel.trim(),
        stateChange: result.decision.stateChange.trim(),
        handoffIntent: result.decision.handoffIntent.trim(),
        handoffAnchor: [...result.decision.handoffAnchor],
        handoffChannels: [...result.decision.handoffChannels],
        transitionIntent: result.decision.transitionIntent.trim(),
        preLinkMatch: "NOT_EVALUATED",
        linkStatus: result.requiresHumanReview
          ? "PRE_LINK_DRAFT"
          : "WAITING_FOR_ASSETS"
      },
      now
    );

    delete next.preLinkApprovalId;
    delete next.fromAssetId;
    delete next.fromAssetRevision;
    delete next.fromMediaId;
    delete next.toAssetId;
    delete next.toAssetRevision;
    delete next.toMediaId;
    delete next.handoffQcId;
    delete next.handoffUsable;
    delete next.handoffReviewApprovalId;

    let approval: ApprovalRecord | undefined;
    if (!result.requiresHumanReview) {
      approval = {
        id: this.ids.next("apr"),
        projectId: input.projectId,
        targetType: "LINK",
        targetId: next.id,
        targetRevision: next.revision,
        approvalState: next.preLinkRequired
          ? "AUTO_APPROVED"
          : "NOT_REQUIRED",
        reason: next.preLinkRequired
          ? "PRE_LINK_AUTO_APPROVED"
          : "PRE_LINK_NOT_REQUIRED",
        approvedByType: "SYSTEM",
        createdAt: now
      };
      next = {
        ...next,
        preLinkApprovalId: approval.id
      };
    }

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: result.requiresHumanReview
        ? "PRE_LINK_NEEDS_REVIEW"
        : "PRE_LINK_READY",
      targetType: "LINK",
      targetId: next.id,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        decisionId: result.decisionId,
        revision: next.revision,
        preLinkRequired: next.preLinkRequired,
        requiresHumanReview: result.requiresHumanReview
      }
    });

    await this.repository.commitPreLink({
      previous: link,
      next,
      ...(approval === undefined ? {} : { approval }),
      event,
      outbox
    });

    return {
      link: next,
      ...(approval === undefined ? {} : { approval }),
      decisionMeta: result
    };
  }

  async approvePreLink(input: {
    projectId: string;
    linkId: string;
    approvedById?: string;
  }): Promise<{ link: ProductionLink; approval: ApprovalRecord }> {
    const link = await this.requireCurrentLink(input.projectId, input.linkId);
    if (link.linkStatus !== "PRE_LINK_DRAFT") {
      throw new PreLinkHandoffValidationError(
        "PRE_LINK_NOT_REVIEWABLE",
        "Only PRE_LINK_DRAFT can receive explicit Pre-Link approval."
      );
    }

    const now = this.clock.nowIso();
    let next = nextLinkRevision(
      link,
      { linkStatus: "WAITING_FOR_ASSETS" },
      now
    );
    const approval: ApprovalRecord = {
      id: this.ids.next("apr"),
      projectId: input.projectId,
      targetType: "LINK",
      targetId: next.id,
      targetRevision: next.revision,
      approvalState: "HUMAN_APPROVED",
      reason: "PRE_LINK_APPROVED",
      approvedByType: "USER",
      ...(input.approvedById === undefined
        ? {}
        : { approvedById: input.approvedById }),
      createdAt: now
    };
    next = { ...next, preLinkApprovalId: approval.id };

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "PRE_LINK_APPROVED",
      targetType: "LINK",
      targetId: next.id,
      trigger: "USER",
      payload: { revision: next.revision }
    });
    await this.repository.commitPreLinkApproval({
      previous: link,
      next,
      approval,
      event,
      outbox
    });
    return { link: next, approval };
  }

  async bindApprovedAssets(input: {
    projectId: string;
    linkId: string;
  }): Promise<ProductionLink> {
    const link = await this.requireCurrentLink(input.projectId, input.linkId);
    if (link.preLinkApprovalId === undefined) {
      throw new PreLinkHandoffValidationError(
        "PRE_LINK_APPROVAL_REQUIRED",
        "Pre-Link must be ready before approved Assets can be bound."
      );
    }

    const fromAsset = await this.context.getApprovedPrimaryAsset(
      input.projectId,
      link.fromSceneId
    );
    const toAsset = await this.context.getApprovedPrimaryAsset(
      input.projectId,
      link.toSceneId
    );
    if (fromAsset === null || toAsset === null) {
      throw new PreLinkHandoffValidationError(
        "APPROVED_ASSETS_REQUIRED",
        "Both Link endpoints require approved PRIMARY_SCENE Assets."
      );
    }
    if (
      fromAsset.stale ||
      toAsset.stale ||
      fromAsset.approvedMediaId === undefined ||
      toAsset.approvedMediaId === undefined
    ) {
      throw new PreLinkHandoffValidationError(
        "APPROVED_ASSETS_REQUIRED",
        "Bound Assets must be current and have approved media."
      );
    }

    const fromMedia = await this.context.getMedia(
      input.projectId,
      fromAsset.approvedMediaId
    );
    const toMedia = await this.context.getMedia(
      input.projectId,
      toAsset.approvedMediaId
    );
    if (
      fromMedia === null ||
      toMedia === null ||
      fromMedia.mediaStatus !== "AVAILABLE" ||
      toMedia.mediaStatus !== "AVAILABLE"
    ) {
      throw new PreLinkHandoffValidationError(
        "APPROVED_MEDIA_REQUIRED",
        "Approved Link media must be available."
      );
    }

    const next = nextLinkRevision(
      link,
      {
        fromAssetId: fromAsset.id,
        fromAssetRevision: fromAsset.revision,
        fromMediaId: fromMedia.id,
        toAssetId: toAsset.id,
        toAssetRevision: toAsset.revision,
        toMediaId: toMedia.id,
        preLinkMatch: "NOT_EVALUATED",
        linkStatus: "HANDOFF_QC_PENDING"
      },
      this.clock.nowIso()
    );
    delete next.handoffQcId;
    delete next.handoffUsable;
    delete next.handoffReviewApprovalId;

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "LINK_ASSETS_BOUND",
      targetType: "LINK",
      targetId: next.id,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        fromAssetId: fromAsset.id,
        fromAssetRevision: fromAsset.revision,
        toAssetId: toAsset.id,
        toAssetRevision: toAsset.revision
      }
    });
    await this.repository.commitAssetBinding({
      previous: link,
      next,
      event,
      outbox
    });
    return next;
  }

  async runHandoffQc(input: {
    projectId: string;
    linkId: string;
    format: ProjectFormat;
  }): Promise<{
    link: ProductionLink;
    qc: QcResult;
    decisionMeta: ProductionDecisionWithMeta<HandoffQcDecision>;
  }> {
    const link = await this.requireCurrentLink(input.projectId, input.linkId);
    if (
      link.linkStatus !== "HANDOFF_QC_PENDING" ||
      link.fromAssetId === undefined ||
      link.fromAssetRevision === undefined ||
      link.fromMediaId === undefined ||
      link.toAssetId === undefined ||
      link.toAssetRevision === undefined ||
      link.toMediaId === undefined
    ) {
      throw new PreLinkHandoffValidationError(
        "HANDOFF_QC_NOT_READY",
        "Actual Asset Handoff QC requires current bound endpoint Assets and Media."
      );
    }

    const fromScene = await this.requireScene(input.projectId, link.fromSceneId);
    const toScene = await this.requireScene(input.projectId, link.toSceneId);
    const fromAsset = await this.context.getAsset(
      input.projectId,
      link.fromAssetId
    );
    const toAsset = await this.context.getAsset(
      input.projectId,
      link.toAssetId
    );
    const fromMedia = await this.context.getMedia(
      input.projectId,
      link.fromMediaId
    );
    const toMedia = await this.context.getMedia(
      input.projectId,
      link.toMediaId
    );

    if (
      fromAsset === null ||
      toAsset === null ||
      fromAsset.revision !== link.fromAssetRevision ||
      toAsset.revision !== link.toAssetRevision ||
      fromAsset.stale ||
      toAsset.stale
    ) {
      throw new PreLinkHandoffValidationError(
        "BOUND_ASSET_STALE",
        "Bound Handoff Assets changed after Link binding."
      );
    }
    if (
      fromMedia === null ||
      toMedia === null ||
      fromMedia.mediaStatus !== "AVAILABLE" ||
      toMedia.mediaStatus !== "AVAILABLE"
    ) {
      throw new PreLinkHandoffValidationError(
        "APPROVED_MEDIA_REQUIRED",
        "Bound Handoff media is unavailable."
      );
    }

    const result = await this.decisions.runHandoffQc({
      projectId: input.projectId,
      format: input.format,
      link,
      fromScene,
      toScene,
      qcType: "HANDOFF_QC",
      fromAsset,
      fromMedia,
      toAsset,
      toMedia
    });
    validateHandoffQcDecision(result.decision);

    const now = this.clock.nowIso();
    const qc: QcResult = {
      id: this.ids.next("qc"),
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      qcType: "HANDOFF_QC",
      targetType: "LINK",
      targetId: link.id,
      targetRevision: link.revision,
      qcStatus: result.decision.qcStatus,
      severity: result.decision.severity,
      confidence: result.decision.confidence,
      ...(result.decision.symptom === undefined
        ? {}
        : { symptom: result.decision.symptom }),
      ...(result.decision.rootCause === undefined
        ? {}
        : { rootCause: result.decision.rootCause }),
      ...(result.decision.recommendedAction === undefined
        ? {}
        : { recommendedAction: result.decision.recommendedAction }),
      ...(result.decision.fallback === undefined
        ? {}
        : { fallback: result.decision.fallback })
    };

    let linkStatus: ProductionLink["linkStatus"];
    if (
      result.requiresHumanReview &&
      result.decision.continuityUsable
    ) {
      linkStatus = "HANDOFF_NEEDS_REVIEW";
    } else if (
      result.decision.qcStatus === "PASS" ||
      result.decision.qcStatus === "PASS_WITH_NOTE"
    ) {
      linkStatus = "HANDOFF_PASS";
    } else if (
      result.decision.qcStatus === "FIXABLE" &&
      result.decision.continuityUsable
    ) {
      linkStatus = "HANDOFF_NEEDS_REVIEW";
    } else {
      linkStatus = "REWORK_REQUIRED";
    }

    const next = nextLinkRevision(
      link,
      {
        handoffQcId: qc.id,
        handoffUsable: result.decision.continuityUsable,
        preLinkMatch: result.decision.preLinkMatch,
        linkStatus
      },
      now
    );
    delete next.handoffReviewApprovalId;
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "HANDOFF_QC_COMPLETED",
      targetType: "LINK",
      targetId: link.id,
      trigger: "QC_RESULT",
      payload: {
        decisionId: result.decisionId,
        qcId: qc.id,
        qcStatus: qc.qcStatus,
        preLinkMatch: next.preLinkMatch,
        linkStatus
      }
    });
    await this.repository.commitHandoffQc({
      previous: link,
      next,
      qc,
      event,
      outbox
    });

    return { link: next, qc, decisionMeta: result };
  }

  async approveHandoffReview(input: {
    projectId: string;
    linkId: string;
    approvedById?: string;
  }): Promise<{ link: ProductionLink; approval: ApprovalRecord }> {
    const link = await this.requireCurrentLink(input.projectId, input.linkId);
    if (
      link.linkStatus !== "HANDOFF_NEEDS_REVIEW" ||
      link.handoffQcId === undefined ||
      link.handoffUsable !== true
    ) {
      throw new PreLinkHandoffValidationError(
        "HANDOFF_REVIEW_NOT_APPROVABLE",
        "Only a usable Handoff QC review item can be accepted."
      );
    }

    const now = this.clock.nowIso();
    let next = nextLinkRevision(
      link,
      { linkStatus: "HANDOFF_PASS" },
      now
    );
    const approval: ApprovalRecord = {
      id: this.ids.next("apr"),
      projectId: input.projectId,
      targetType: "LINK",
      targetId: next.id,
      targetRevision: next.revision,
      approvalState: "HUMAN_APPROVED",
      reason: "HANDOFF_QC_REVIEW_ACCEPTED",
      approvedByType: "USER",
      ...(input.approvedById === undefined
        ? {}
        : { approvedById: input.approvedById }),
      createdAt: now
    };
    next = {
      ...next,
      handoffReviewApprovalId: approval.id
    };

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "HANDOFF_QC_REVIEW_ACCEPTED",
      targetType: "LINK",
      targetId: next.id,
      trigger: "USER",
      payload: {
        revision: next.revision,
        handoffQcId: next.handoffQcId
      }
    });
    await this.repository.commitHandoffReviewApproval({
      previous: link,
      next,
      approval,
      event,
      outbox
    });
    return { link: next, approval };
  }

  async getReadiness(
    projectId: string,
    linkId: string
  ): Promise<LinkReadiness> {
    const link = await this.repository.getLatestLink(projectId, linkId);
    if (link === null) {
      throw new PreLinkHandoffValidationError(
        "LINK_NOT_FOUND",
        "Link does not exist."
      );
    }
    if (link.stale) {
      throw new PreLinkHandoffValidationError(
        "LINK_STALE",
        "Link readiness cannot be evaluated from stale production state."
      );
    }
    const preLinkReady =
      link.preLinkApprovalId !== undefined &&
      link.linkStatus !== "PRE_LINK_DRAFT" &&
      link.linkStatus !== "NOT_PLANNED";
    const assetsBound =
      link.fromAssetId !== undefined &&
      link.toAssetId !== undefined &&
      link.fromMediaId !== undefined &&
      link.toMediaId !== undefined;
    const handoffQcReady =
      assetsBound && link.linkStatus === "HANDOFF_QC_PENDING";
    const handoffPassed = link.linkStatus === "HANDOFF_PASS";
    return {
      linkId: link.id,
      preLinkReady,
      assetsBound,
      handoffQcReady,
      handoffPassed,
      finalClipDesignReady: handoffPassed,
      status: link.linkStatus
    };
  }

  async reconcileDependencies(projectId: string): Promise<{
    staleLinkIds: string[];
    resetHandoffLinkIds: string[];
  }> {
    const links = await this.repository.listActiveLinks(projectId);
    const staleLinkIds: string[] = [];
    const resets: Array<{
      previous: ProductionLink;
      next: ProductionLink;
    }> = [];

    for (const link of links) {
      const fromScene = await this.context.getScene(projectId, link.fromSceneId);
      const toScene = await this.context.getScene(projectId, link.toSceneId);

      if (
        fromScene === null ||
        toScene === null ||
        fromScene.stale ||
        toScene.stale ||
        fromScene.revision !== link.fromSceneRevision ||
        toScene.revision !== link.toSceneRevision
      ) {
        staleLinkIds.push(link.id);
        continue;
      }

      if (
        link.fromAssetId === undefined &&
        link.toAssetId === undefined
      ) {
        continue;
      }

      const currentFrom = await this.context.getApprovedPrimaryAsset(
        projectId,
        link.fromSceneId
      );
      const currentTo = await this.context.getApprovedPrimaryAsset(
        projectId,
        link.toSceneId
      );

      const assetChanged =
        currentFrom === null ||
        currentTo === null ||
        currentFrom.id !== link.fromAssetId ||
        currentTo.id !== link.toAssetId ||
        currentFrom.revision !== link.fromAssetRevision ||
        currentTo.revision !== link.toAssetRevision ||
        currentFrom.approvedMediaId !== link.fromMediaId ||
        currentTo.approvedMediaId !== link.toMediaId;

      if (assetChanged) {
        const resetLink = nextLinkRevision(
          link,
          {
            preLinkMatch: "NOT_EVALUATED",
            linkStatus: link.preLinkApprovalId === undefined
              ? "PRE_LINK_DRAFT"
              : "WAITING_FOR_ASSETS"
          },
          this.clock.nowIso()
        );
        delete resetLink.fromAssetId;
        delete resetLink.fromAssetRevision;
        delete resetLink.fromMediaId;
        delete resetLink.toAssetId;
        delete resetLink.toAssetRevision;
        delete resetLink.toMediaId;
        delete resetLink.handoffQcId;
        delete resetLink.handoffUsable;
        delete resetLink.handoffReviewApprovalId;
        resets.push({
          previous: link,
          next: resetLink
        });
      }
    }

    if (staleLinkIds.length > 0 || resets.length > 0) {
      const { event, outbox } = durableEvent(this.ids, this.clock, {
        projectId,
        eventType: "LINK_DEPENDENCIES_RECONCILED",
        targetType: "PROJECT",
        targetId: projectId,
        trigger: "WORKFLOW_ENGINE",
        payload: {
          staleLinkIds,
          resetHandoffLinkIds: resets.map((item) => item.next.id)
        }
      });
      await this.repository.commitDependencyReconciliation({
        staleLinkIds,
        resets,
        event,
        outbox
      });
    }

    return {
      staleLinkIds,
      resetHandoffLinkIds: resets.map((item) => item.next.id)
    };
  }

  private async requireCurrentLink(
    projectId: string,
    linkId: string
  ): Promise<ProductionLink> {
    const link = await this.repository.getLatestLink(projectId, linkId);
    if (link === null) {
      throw new PreLinkHandoffValidationError(
        "LINK_NOT_FOUND",
        "Link does not exist."
      );
    }
    if (link.stale) {
      throw new PreLinkHandoffValidationError(
        "LINK_STALE",
        "Link is stale and must be rebuilt from the current Story chain."
      );
    }
    return link;
  }

  private async requireScene(
    projectId: string,
    sceneId: string
  ): Promise<Scene> {
    const scene = await this.context.getScene(projectId, sceneId);
    if (scene === null || scene.stale) {
      throw new PreLinkHandoffValidationError(
        "LINK_STALE",
        "A Link endpoint Scene is missing or stale."
      );
    }
    return scene;
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

export class PreLinkHandoffBatchService {
  constructor(private readonly pipeline: PreLinkHandoffPipeline) {}

  async designPreLinks(input: {
    projectId: string;
    linkIds: string[];
    format: ProjectFormat;
  }): Promise<BatchResult<Awaited<ReturnType<PreLinkHandoffPipeline["designPreLink"]>>>> {
    return this.run(
      [...new Set(input.linkIds)],
      (linkId) => this.pipeline.designPreLink({
        projectId: input.projectId,
        linkId,
        format: input.format
      })
    );
  }

  async bindApprovedAssets(input: {
    projectId: string;
    linkIds: string[];
  }): Promise<BatchResult<ProductionLink>> {
    return this.run(
      [...new Set(input.linkIds)],
      (linkId) => this.pipeline.bindApprovedAssets({
        projectId: input.projectId,
        linkId
      })
    );
  }

  async runHandoffQc(input: {
    projectId: string;
    linkIds: string[];
    format: ProjectFormat;
  }): Promise<BatchResult<Awaited<ReturnType<PreLinkHandoffPipeline["runHandoffQc"]>>>> {
    return this.run(
      [...new Set(input.linkIds)],
      (linkId) => this.pipeline.runHandoffQc({
        projectId: input.projectId,
        linkId,
        format: input.format
      })
    );
  }

  private async run<T>(
    targets: string[],
    runner: (targetId: string) => Promise<T>
  ): Promise<BatchResult<T>> {
    const items: BatchItemResult<T>[] = [];
    for (const targetId of targets) {
      try {
        items.push({
          targetId,
          ok: true,
          value: await runner(targetId)
        });
      } catch (error) {
        items.push({
          targetId,
          ok: false,
          ...(error instanceof PreLinkHandoffValidationError
            ? { code: error.code, message: error.message }
            : { code: "PRELINK_HANDOFF_SYSTEM_ERROR", message: "Unexpected error" })
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

export interface PreLinkHandoffCommandResult<T> {
  ok: boolean;
  value?: T;
  code?: string;
  userMessage: string;
  recommendedAction?: string;
}

export class PreLinkHandoffCommandFacade {
  constructor(private readonly pipeline: PreLinkHandoffPipeline) {}

  async bindApprovedAssets(
    input: Parameters<PreLinkHandoffPipeline["bindApprovedAssets"]>[0]
  ): Promise<PreLinkHandoffCommandResult<ProductionLink>> {
    try {
      const value = await this.pipeline.bindApprovedAssets(input);
      return {
        ok: true,
        value,
        userMessage: "두 장면의 승인 이미지를 연결 검사 대상으로 준비했습니다.",
        recommendedAction: "RUN_HANDOFF_QC"
      };
    } catch (error) {
      return mapError(error);
    }
  }
}

function mapError(error: unknown): PreLinkHandoffCommandResult<never> {
  if (!(error instanceof PreLinkHandoffValidationError)) {
    return {
      ok: false,
      code: "PRELINK_HANDOFF_SYSTEM_ERROR",
      userMessage: "장면 연결 처리 중 시스템 오류가 발생했습니다.",
      recommendedAction: "RETRY"
    };
  }

  const map: Record<
    PreLinkHandoffValidationError["code"],
    { message: string; action: string }
  > = {
    INSUFFICIENT_SCENES: {
      message: "연결할 장면이 두 개 이상 필요합니다.",
      action: "REVIEW_SCENES"
    },
    LINK_NOT_FOUND: {
      message: "장면 연결 정보를 찾을 수 없습니다.",
      action: "REBUILD_LINK_GRAPH"
    },
    LINK_STALE: {
      message: "이 장면 연결은 이전 장면 기준이므로 다시 설계해야 합니다.",
      action: "REBUILD_LINK_GRAPH"
    },
    PRE_LINK_NOT_DESIGNED: {
      message: "먼저 장면 사이 연결 의도를 설계해야 합니다.",
      action: "DESIGN_PRE_LINK"
    },
    PRE_LINK_APPROVAL_REQUIRED: {
      message: "이미지를 연결하기 전에 Pre-Link 검토를 완료해야 합니다.",
      action: "REVIEW_PRE_LINK"
    },
    PRE_LINK_DECISION_INVALID: {
      message: "Pre-Link 설계 결과가 불완전합니다.",
      action: "REGENERATE_PRE_LINK"
    },
    PRE_LINK_NOT_REVIEWABLE: {
      message: "현재 상태의 Pre-Link는 수동 승인 대상이 아닙니다.",
      action: "REFRESH_LINK"
    },
    APPROVED_ASSETS_REQUIRED: {
      message: "양쪽 장면의 승인 이미지가 모두 필요합니다.",
      action: "COMPLETE_SCENE_IMAGES"
    },
    APPROVED_MEDIA_REQUIRED: {
      message: "승인 이미지 파일을 찾을 수 없습니다.",
      action: "RESTORE_OR_RESELECT_MEDIA"
    },
    HANDOFF_QC_NOT_READY: {
      message: "연결 검사를 실행할 준비가 되지 않았습니다.",
      action: "BIND_APPROVED_ASSETS"
    },
    HANDOFF_QC_DECISION_INVALID: {
      message: "장면 연결 품질 검사 결과가 서로 모순됩니다.",
      action: "RERUN_HANDOFF_QC"
    },
    HANDOFF_REVIEW_NOT_APPROVABLE: {
      message: "이 연결 결과는 현재 상태로 승인할 수 없습니다.",
      action: "FOLLOW_HANDOFF_REWORK_ACTION"
    },
    BOUND_ASSET_STALE: {
      message: "연결 검사 전에 승인 이미지가 변경되었습니다.",
      action: "REBIND_APPROVED_ASSETS"
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
