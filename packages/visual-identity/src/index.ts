import type {
  ApprovalRecord,
  FactRecord,
  IdentityAnchor,
  ProjectFormat,
  ProjectStyle,
  Scene,
  ScriptVersion
} from "@vpf/domain";
import type {
  AnchorPlanDecision,
  ChannelVisualBibleSnapshot,
  ProjectStyleDecision,
  VisualIdentityDecisionPort
} from "@vpf/production-system";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";

export interface VisualIdentityContextPort {
  getLatestApprovedFinalScript(projectId: string): Promise<ScriptVersion | null>;
  listApprovedFacts(projectId: string): Promise<FactRecord[]>;
  listActiveScenes(projectId: string): Promise<Scene[]>;
  listApprovedScenes(projectId: string): Promise<Scene[]>;
}

export interface ChannelVisualBiblePort {
  resolve(version: string): Promise<ChannelVisualBibleSnapshot | null>;
}

export interface VisualIdentityRepository {
  getLatestProjectStyle(projectId: string): Promise<ProjectStyle | null>;
  getApprovedProjectStyle(projectId: string): Promise<ProjectStyle | null>;
  commitProjectStyle(input: {
    previous: ProjectStyle | null;
    next: ProjectStyle;
    staleAnchorIds: string[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  commitProjectStyleApproval(input: {
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  listActiveAnchors(projectId: string): Promise<IdentityAnchor[]>;
  getLatestAnchor(projectId: string, anchorId: string): Promise<IdentityAnchor | null>;
  commitAnchorPlan(input: {
    previousAnchors: IdentityAnchor[];
    nextAnchors: IdentityAnchor[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  commitAnchorRevision(input: {
    previous: IdentityAnchor;
    next: IdentityAnchor;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  commitAnchorApprovals(input: {
    approvals: ApprovalRecord[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  markAnchorsStale(input: {
    anchorIds: string[];
    reason: string;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  getLatestApproval(
    projectId: string,
    targetType: ApprovalRecord["targetType"],
    targetId: string
  ): Promise<ApprovalRecord | null>;
}

export interface VisualIdentityClock {
  nowIso(): string;
}

export interface VisualIdentityIdFactory {
  next(prefix: "sty" | "anc" | "apr" | "evt" | "outbox"): string;
}

export interface IdentityReadiness {
  projectStyleApproved: boolean;
  projectStyleId?: string;
  projectStyleRevision?: number;
  requiredAnchorIds: string[];
  approvedAnchorIds: string[];
  missingApprovalAnchorIds: string[];
  staleAnchorIds: string[];
  ready: boolean;
}

export class VisualIdentityValidationError extends Error {
  constructor(
    public readonly code:
      | "FINAL_SCRIPT_APPROVAL_REQUIRED"
      | "STORY_SCENES_REQUIRED"
      | "APPROVED_SCENES_REQUIRED"
      | "CHANNEL_VISUAL_BIBLE_NOT_FOUND"
      | "PROJECT_STYLE_NOT_FOUND"
      | "PROJECT_STYLE_APPROVAL_REQUIRED"
      | "PROJECT_STYLE_DECISION_INVALID"
      | "ANCHOR_PLAN_INVALID"
      | "ANCHOR_NOT_FOUND"
      | "ANCHOR_STALE",
    message: string
  ) {
    super(message);
    this.name = "VisualIdentityValidationError";
  }
}

function durableEvent(
  ids: VisualIdentityIdFactory,
  clock: VisualIdentityClock,
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

function normalizeIdentityName(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function validateProjectStyleDecision(decision: ProjectStyleDecision): void {
  const requiredStrings: Array<[string, string]> = [
    ["eraRegion", decision.eraRegion],
    ["visualApproach", decision.visualApproach],
    ["realismLevel", decision.realismLevel],
    ["colorLanguage", decision.colorLanguage],
    ["lightingLanguage", decision.lightingLanguage],
    ["materialLanguage", decision.materialLanguage],
    ["environmentLanguage", decision.environmentLanguage],
    ["characterRenderingPrinciple", decision.characterRenderingPrinciple],
    ["cameraCompositionTendency", decision.cameraCompositionTendency]
  ];
  const invalid = requiredStrings.find(([, value]) => !value.trim());
  if (invalid !== undefined || decision.moodRange.length === 0) {
    throw new VisualIdentityValidationError(
      "PROJECT_STYLE_DECISION_INVALID",
      "Project Style decision is missing required visual identity fields."
    );
  }
}

export function validateAnchorPlan(
  decision: AnchorPlanDecision,
  scenes: Scene[]
): void {
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const keys = new Set<string>();
  const identities = new Set<string>();

  for (const anchor of decision.anchors) {
    const identityKey = `${anchor.anchorType}::${normalizeIdentityName(anchor.name)}`;
    const uniqueSceneIds = [...new Set(anchor.requiredBySceneIds)];

    if (
      !anchor.key.trim() ||
      keys.has(anchor.key) ||
      !anchor.name.trim() ||
      identities.has(identityKey) ||
      !anchor.rationale.trim() ||
      anchor.specification.locked.length === 0
    ) {
      throw new VisualIdentityValidationError(
        "ANCHOR_PLAN_INVALID",
        "Anchor plan contains a duplicate, unnamed or insufficiently specified identity."
      );
    }

    if (uniqueSceneIds.some((sceneId) => !sceneIds.has(sceneId))) {
      throw new VisualIdentityValidationError(
        "ANCHOR_PLAN_INVALID",
        `Anchor ${anchor.name} references a Scene that is not in the approved story.`
      );
    }

    if (
      anchor.continuityReason === "RECURRING" &&
      uniqueSceneIds.length < 2
    ) {
      throw new VisualIdentityValidationError(
        "ANCHOR_PLAN_INVALID",
        `Recurring anchor ${anchor.name} must be required by at least two Scenes.`
      );
    }

    if (
      anchor.continuityReason === "CRITICAL_CONTINUITY" &&
      uniqueSceneIds.length < 1
    ) {
      throw new VisualIdentityValidationError(
        "ANCHOR_PLAN_INVALID",
        `Critical continuity anchor ${anchor.name} must be tied to at least one Scene.`
      );
    }

    keys.add(anchor.key);
    identities.add(identityKey);
  }
}

function projectStyleFromDecision(input: {
  projectId: string;
  script: ScriptVersion;
  channelVisualBibleVersion: string;
  decision: ProjectStyleDecision;
  previous: ProjectStyle | null;
  now: string;
  ids: VisualIdentityIdFactory;
}): ProjectStyle {
  return {
    id: input.previous?.id ?? input.ids.next("sty"),
    projectId: input.projectId,
    revision: input.previous === null ? 1 : input.previous.revision + 1,
    lifecycleStatus: "ACTIVE",
    createdAt: input.previous?.createdAt ?? input.now,
    updatedAt: input.now,
    channelVisualBibleVersion: input.channelVisualBibleVersion,
    sourceScriptId: input.script.id,
    sourceScriptRevision: input.script.revision,
    eraRegion: input.decision.eraRegion.trim(),
    visualApproach: input.decision.visualApproach.trim(),
    realismLevel: input.decision.realismLevel.trim(),
    colorLanguage: input.decision.colorLanguage.trim(),
    lightingLanguage: input.decision.lightingLanguage.trim(),
    materialLanguage: input.decision.materialLanguage.trim(),
    environmentLanguage: input.decision.environmentLanguage.trim(),
    characterRenderingPrinciple: input.decision.characterRenderingPrinciple.trim(),
    cameraCompositionTendency: input.decision.cameraCompositionTendency.trim(),
    moodRange: [...input.decision.moodRange],
    factualConstraints: [...input.decision.factualConstraints],
    avoidances: [...input.decision.avoidances],
    stale: false
  };
}

function materializeAnchors(input: {
  projectId: string;
  projectStyle: ProjectStyle;
  channelVisualBibleVersion: string;
  decision: AnchorPlanDecision;
  previous: IdentityAnchor[];
  now: string;
  ids: VisualIdentityIdFactory;
}): IdentityAnchor[] {
  const previousByIdentity = new Map(
    input.previous.map((anchor) => [
      `${anchor.anchorType}::${normalizeIdentityName(anchor.name)}`,
      anchor
    ])
  );

  return input.decision.anchors.map((design) => {
    const previous = previousByIdentity.get(
      `${design.anchorType}::${normalizeIdentityName(design.name)}`
    );
    return {
      id: previous?.id ?? input.ids.next("anc"),
      projectId: input.projectId,
      revision: previous === undefined ? 1 : previous.revision + 1,
      lifecycleStatus: "ACTIVE",
      createdAt: previous?.createdAt ?? input.now,
      updatedAt: input.now,
      anchorType: design.anchorType,
      name: design.name.trim(),
      rationale: design.rationale.trim(),
      continuityReason: design.continuityReason,
      productionPriority: design.productionPriority,
      specification: {
        locked: [...design.specification.locked],
        contextual: [...design.specification.contextual],
        temporary: [...design.specification.temporary]
      },
      requiredBySceneIds: [...new Set(design.requiredBySceneIds)],
      referenceMediaIds: previous?.referenceMediaIds ?? [],
      sourceProjectStyleId: input.projectStyle.id,
      sourceProjectStyleRevision: input.projectStyle.revision,
      sourceChannelVisualBibleVersion: input.channelVisualBibleVersion,
      stale: false
    };
  });
}

export class VisualIdentityPipeline {
  constructor(
    private readonly repository: VisualIdentityRepository,
    private readonly context: VisualIdentityContextPort,
    private readonly bible: ChannelVisualBiblePort,
    private readonly decisions: VisualIdentityDecisionPort,
    private readonly clock: VisualIdentityClock,
    private readonly ids: VisualIdentityIdFactory
  ) {}

  async generateProjectStyle(input: {
    projectId: string;
    format: ProjectFormat;
    channelVisualBibleVersion: string;
  }): Promise<ProjectStyle> {
    const script = await this.context.getLatestApprovedFinalScript(input.projectId);
    if (script === null) {
      throw new VisualIdentityValidationError(
        "FINAL_SCRIPT_APPROVAL_REQUIRED",
        "Approve a FINAL script before designing Project Style."
      );
    }
    const scenes = await this.context.listActiveScenes(input.projectId);
    if (scenes.length === 0) {
      throw new VisualIdentityValidationError(
        "STORY_SCENES_REQUIRED",
        "Generate the story Scenes before designing Project Style."
      );
    }
    const channelVisualBible = await this.bible.resolve(input.channelVisualBibleVersion);
    if (channelVisualBible === null) {
      throw new VisualIdentityValidationError(
        "CHANNEL_VISUAL_BIBLE_NOT_FOUND",
        "The pinned Channel Visual Bible version could not be resolved."
      );
    }

    const facts = await this.context.listApprovedFacts(input.projectId);
    const decision = await this.decisions.designProjectStyle({
      projectId: input.projectId,
      format: input.format,
      script,
      facts,
      scenes,
      channelVisualBible
    });
    validateProjectStyleDecision(decision);

    const previous = await this.repository.getLatestProjectStyle(input.projectId);
    const next = projectStyleFromDecision({
      projectId: input.projectId,
      script,
      channelVisualBibleVersion: channelVisualBible.version,
      decision,
      previous,
      now: this.clock.nowIso(),
      ids: this.ids
    });
    const staleAnchorIds = (await this.repository.listActiveAnchors(input.projectId))
      .map((anchor) => anchor.id);
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "PROJECT_STYLE_DESIGNED",
      targetType: "PROJECT_STYLE",
      targetId: next.id,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        revision: next.revision,
        channelVisualBibleVersion: next.channelVisualBibleVersion,
        staleAnchorIds
      }
    });
    await this.repository.commitProjectStyle({
      previous,
      next,
      staleAnchorIds,
      event,
      outbox
    });
    return next;
  }

  async reviseProjectStyle(input: {
    projectId: string;
    patch: Partial<Omit<
      ProjectStyle,
      "id" | "projectId" | "revision" | "lifecycleStatus" |
      "createdAt" | "updatedAt" | "stale"
    >>;
  }): Promise<ProjectStyle> {
    const previous = await this.repository.getLatestProjectStyle(input.projectId);
    if (previous === null) {
      throw new VisualIdentityValidationError(
        "PROJECT_STYLE_NOT_FOUND",
        "Generate Project Style before revising it."
      );
    }

    const now = this.clock.nowIso();
    const next: ProjectStyle = {
      ...previous,
      ...input.patch,
      id: previous.id,
      projectId: previous.projectId,
      revision: previous.revision + 1,
      lifecycleStatus: "ACTIVE",
      createdAt: previous.createdAt,
      updatedAt: now,
      stale: false
    };
    validateProjectStyleDecision(next);

    const staleAnchorIds = (await this.repository.listActiveAnchors(input.projectId))
      .map((anchor) => anchor.id);
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "PROJECT_STYLE_REVISED",
      targetType: "PROJECT_STYLE",
      targetId: next.id,
      trigger: "USER",
      payload: {
        previousRevision: previous.revision,
        revision: next.revision,
        staleAnchorIds
      }
    });
    await this.repository.commitProjectStyle({
      previous,
      next,
      staleAnchorIds,
      event,
      outbox
    });
    return next;
  }

  async approveProjectStyle(input: {
    projectId: string;
    approvedById?: string;
  }): Promise<ApprovalRecord> {
    const style = await this.repository.getLatestProjectStyle(input.projectId);
    if (style === null) {
      throw new VisualIdentityValidationError(
        "PROJECT_STYLE_NOT_FOUND",
        "Generate Project Style before approving it."
      );
    }
    const approval: ApprovalRecord = {
      id: this.ids.next("apr"),
      projectId: input.projectId,
      targetType: "PROJECT_STYLE",
      targetId: style.id,
      targetRevision: style.revision,
      approvalState: "HUMAN_APPROVED",
      reason: "PROJECT_STYLE_APPROVED",
      approvedByType: "USER",
      ...(input.approvedById === undefined ? {} : { approvedById: input.approvedById }),
      createdAt: this.clock.nowIso()
    };
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "PROJECT_STYLE_APPROVED",
      targetType: "PROJECT_STYLE",
      targetId: style.id,
      trigger: "USER",
      payload: { revision: style.revision }
    });
    await this.repository.commitProjectStyleApproval({ approval, event, outbox });
    return approval;
  }

  async planIdentityAnchors(input: {
    projectId: string;
    format: ProjectFormat;
  }): Promise<IdentityAnchor[]> {
    const projectStyle = await this.repository.getApprovedProjectStyle(input.projectId);
    if (projectStyle === null) {
      throw new VisualIdentityValidationError(
        "PROJECT_STYLE_APPROVAL_REQUIRED",
        "Approve Project Style before planning Identity Anchors."
      );
    }
    const script = await this.context.getLatestApprovedFinalScript(input.projectId);
    if (script === null) {
      throw new VisualIdentityValidationError(
        "FINAL_SCRIPT_APPROVAL_REQUIRED",
        "Approved final script is required for Identity Anchor planning."
      );
    }
    const scenes = await this.context.listApprovedScenes(input.projectId);
    if (scenes.length === 0) {
      throw new VisualIdentityValidationError(
        "APPROVED_SCENES_REQUIRED",
        "Approve Scene designs before planning Identity Anchors."
      );
    }
    const channelVisualBible = await this.bible.resolve(
      projectStyle.channelVisualBibleVersion
    );
    if (channelVisualBible === null) {
      throw new VisualIdentityValidationError(
        "CHANNEL_VISUAL_BIBLE_NOT_FOUND",
        "The Project Style Channel Visual Bible version could not be resolved."
      );
    }
    const facts = await this.context.listApprovedFacts(input.projectId);
    const decision = await this.decisions.planIdentityAnchors({
      projectId: input.projectId,
      format: input.format,
      script,
      facts,
      scenes,
      channelVisualBible,
      projectStyle
    });
    validateAnchorPlan(decision, scenes);

    const previousAnchors = await this.repository.listActiveAnchors(input.projectId);
    const nextAnchors = materializeAnchors({
      projectId: input.projectId,
      projectStyle,
      channelVisualBibleVersion: channelVisualBible.version,
      decision,
      previous: previousAnchors,
      now: this.clock.nowIso(),
      ids: this.ids
    });

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "IDENTITY_ANCHOR_PLAN_COMMITTED",
      targetType: "PROJECT_STYLE",
      targetId: projectStyle.id,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        projectStyleRevision: projectStyle.revision,
        anchorIds: nextAnchors.map((anchor) => anchor.id)
      }
    });
    await this.repository.commitAnchorPlan({
      previousAnchors,
      nextAnchors,
      event,
      outbox
    });
    return nextAnchors;
  }

  async reviseAnchor(input: {
    projectId: string;
    anchorId: string;
    patch: Partial<Pick<
      IdentityAnchor,
      "name" | "rationale" | "productionPriority" |
      "specification" | "requiredBySceneIds" | "referenceMediaIds"
    >>;
  }): Promise<IdentityAnchor> {
    const previous = await this.repository.getLatestAnchor(
      input.projectId,
      input.anchorId
    );
    if (previous === null) {
      throw new VisualIdentityValidationError(
        "ANCHOR_NOT_FOUND",
        "The requested Identity Anchor does not exist."
      );
    }
    const next: IdentityAnchor = {
      ...previous,
      ...input.patch,
      id: previous.id,
      projectId: previous.projectId,
      revision: previous.revision + 1,
      lifecycleStatus: "ACTIVE",
      createdAt: previous.createdAt,
      updatedAt: this.clock.nowIso(),
      stale: false
    };
    validateAnchorPlan({
      anchors: [{
        key: next.id,
        anchorType: next.anchorType,
        name: next.name,
        rationale: next.rationale,
        continuityReason: next.continuityReason,
        productionPriority: next.productionPriority,
        requiredBySceneIds: next.requiredBySceneIds,
        specification: next.specification
      }]
    }, await this.context.listApprovedScenes(input.projectId));

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "IDENTITY_ANCHOR_REVISED",
      targetType: "IDENTITY_ANCHOR",
      targetId: next.id,
      trigger: "USER",
      payload: {
        previousRevision: previous.revision,
        revision: next.revision
      }
    });
    await this.repository.commitAnchorRevision({
      previous,
      next,
      event,
      outbox
    });
    return next;
  }

  async approveAnchors(input: {
    projectId: string;
    anchorIds: string[];
    approvedById?: string;
  }): Promise<ApprovalRecord[]> {
    const approvals: ApprovalRecord[] = [];
    for (const anchorId of [...new Set(input.anchorIds)]) {
      const anchor = await this.repository.getLatestAnchor(input.projectId, anchorId);
      if (anchor === null) {
        throw new VisualIdentityValidationError(
          "ANCHOR_NOT_FOUND",
          `Identity Anchor ${anchorId} does not exist.`
        );
      }
      if (anchor.stale) {
        throw new VisualIdentityValidationError(
          "ANCHOR_STALE",
          `Identity Anchor ${anchor.name} must be regenerated or revised before approval.`
        );
      }
      approvals.push({
        id: this.ids.next("apr"),
        projectId: input.projectId,
        targetType: "IDENTITY_ANCHOR",
        targetId: anchor.id,
        targetRevision: anchor.revision,
        approvalState: "HUMAN_APPROVED",
        reason: "IDENTITY_ANCHOR_APPROVED",
        approvedByType: "USER",
        ...(input.approvedById === undefined ? {} : { approvedById: input.approvedById }),
        createdAt: this.clock.nowIso()
      });
    }
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "IDENTITY_ANCHORS_APPROVED",
      targetType: "PROJECT",
      targetId: input.projectId,
      trigger: "USER",
      payload: { anchorIds: approvals.map((approval) => approval.targetId) }
    });
    await this.repository.commitAnchorApprovals({ approvals, event, outbox });
    return approvals;
  }

  async reconcileStoryChange(projectId: string): Promise<string[]> {
    const approvedSceneIds = new Set(
      (await this.context.listApprovedScenes(projectId)).map((scene) => scene.id)
    );
    const anchors = await this.repository.listActiveAnchors(projectId);
    const staleAnchorIds = anchors
      .filter((anchor) =>
        anchor.requiredBySceneIds.some((sceneId) => !approvedSceneIds.has(sceneId))
      )
      .map((anchor) => anchor.id);

    if (staleAnchorIds.length === 0) return [];

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId,
      eventType: "IDENTITY_ANCHORS_STALE_FROM_STORY_CHANGE",
      targetType: "PROJECT",
      targetId: projectId,
      trigger: "WORKFLOW_ENGINE",
      payload: { anchorIds: staleAnchorIds }
    });
    await this.repository.markAnchorsStale({
      anchorIds: staleAnchorIds,
      reason: "REQUIRED_SCENE_CHANGED",
      event,
      outbox
    });
    return staleAnchorIds;
  }

  async getReadiness(projectId: string): Promise<IdentityReadiness> {
    const style = await this.repository.getApprovedProjectStyle(projectId);
    const anchors = await this.repository.listActiveAnchors(projectId);
    const approvedAnchorIds: string[] = [];
    const staleAnchorIds = anchors.filter((anchor) => anchor.stale).map((anchor) => anchor.id);

    for (const anchor of anchors) {
      const approval = await this.repository.getLatestApproval(
        projectId,
        "IDENTITY_ANCHOR",
        anchor.id
      );
      if (
        approval?.approvalState === "HUMAN_APPROVED" &&
        approval.targetRevision === anchor.revision &&
        !anchor.stale
      ) {
        approvedAnchorIds.push(anchor.id);
      }
    }

    const requiredAnchorIds = anchors.map((anchor) => anchor.id);
    const approved = new Set(approvedAnchorIds);
    const missingApprovalAnchorIds = requiredAnchorIds.filter(
      (anchorId) => !approved.has(anchorId)
    );

    return {
      projectStyleApproved: style !== null,
      ...(style === null
        ? {}
        : {
            projectStyleId: style.id,
            projectStyleRevision: style.revision
          }),
      requiredAnchorIds,
      approvedAnchorIds,
      missingApprovalAnchorIds,
      staleAnchorIds,
      ready:
        style !== null &&
        staleAnchorIds.length === 0 &&
        missingApprovalAnchorIds.length === 0
    };
  }
}

export interface VisualIdentityCommandResult<T> {
  ok: boolean;
  value?: T;
  code?: string;
  userMessage: string;
  recommendedAction?: string;
}

export class VisualIdentityCommandFacade {
  constructor(private readonly pipeline: VisualIdentityPipeline) {}

  async generateProjectStyle(
    input: Parameters<VisualIdentityPipeline["generateProjectStyle"]>[0]
  ): Promise<VisualIdentityCommandResult<ProjectStyle>> {
    try {
      const value = await this.pipeline.generateProjectStyle(input);
      return {
        ok: true,
        value,
        userMessage: "프로젝트 스타일 초안을 만들었습니다.",
        recommendedAction: "REVIEW_PROJECT_STYLE"
      };
    } catch (error) {
      return mapVisualIdentityError(error);
    }
  }

  async planIdentityAnchors(
    input: Parameters<VisualIdentityPipeline["planIdentityAnchors"]>[0]
  ): Promise<VisualIdentityCommandResult<IdentityAnchor[]>> {
    try {
      const value = await this.pipeline.planIdentityAnchors(input);
      return {
        ok: true,
        value,
        userMessage: `연속성에 필요한 기준 대상 ${value.length}개를 준비했습니다.`,
        recommendedAction: value.length === 0
          ? "CONTINUE_TO_SCENE_ASSETS"
          : "REVIEW_IDENTITY_ANCHORS"
      };
    } catch (error) {
      return mapVisualIdentityError(error);
    }
  }
}

function mapVisualIdentityError(
  error: unknown
): VisualIdentityCommandResult<never> {
  if (!(error instanceof VisualIdentityValidationError)) {
    return {
      ok: false,
      code: "VISUAL_IDENTITY_SYSTEM_ERROR",
      userMessage: "스타일/기준 대상 처리 중 시스템 오류가 발생했습니다.",
      recommendedAction: "RETRY"
    };
  }

  const mapping: Record<
    VisualIdentityValidationError["code"],
    { message: string; action: string }
  > = {
    FINAL_SCRIPT_APPROVAL_REQUIRED: {
      message: "먼저 최종 대본을 승인해야 합니다.",
      action: "APPROVE_FINAL_SCRIPT"
    },
    STORY_SCENES_REQUIRED: {
      message: "먼저 장면 구성을 생성해야 합니다.",
      action: "GENERATE_STORY_STRUCTURE"
    },
    APPROVED_SCENES_REQUIRED: {
      message: "기준 대상 계획 전에 장면 구성을 승인해야 합니다.",
      action: "APPROVE_SCENES"
    },
    CHANNEL_VISUAL_BIBLE_NOT_FOUND: {
      message: "프로젝트에 지정된 채널 비주얼 바이블 버전을 찾을 수 없습니다.",
      action: "RESOLVE_CHANNEL_VISUAL_BIBLE"
    },
    PROJECT_STYLE_NOT_FOUND: {
      message: "먼저 프로젝트 스타일을 만들어야 합니다.",
      action: "GENERATE_PROJECT_STYLE"
    },
    PROJECT_STYLE_APPROVAL_REQUIRED: {
      message: "기준 대상 계획 전에 프로젝트 스타일 승인이 필요합니다.",
      action: "APPROVE_PROJECT_STYLE"
    },
    PROJECT_STYLE_DECISION_INVALID: {
      message: "프로젝트 스타일 결과가 불완전합니다.",
      action: "REGENERATE_PROJECT_STYLE"
    },
    ANCHOR_PLAN_INVALID: {
      message: "기준 대상 계획에 중복되거나 연결할 수 없는 항목이 있습니다.",
      action: "REGENERATE_IDENTITY_ANCHORS"
    },
    ANCHOR_NOT_FOUND: {
      message: "해당 기준 대상을 찾을 수 없습니다.",
      action: "REFRESH_IDENTITY_ANCHORS"
    },
    ANCHOR_STALE: {
      message: "이 기준 대상은 이전 스타일 또는 장면 기준으로 만들어져 다시 확인해야 합니다.",
      action: "REGENERATE_IDENTITY_ANCHORS"
    }
  };
  const mapped = mapping[error.code];
  return {
    ok: false,
    code: error.code,
    userMessage: mapped.message,
    recommendedAction: mapped.action
  };
}
