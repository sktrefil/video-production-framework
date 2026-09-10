import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ChannelVisualBibleRegistryAdapter,
  FileSystemResourceRegistry
} from "@vpf/resource-registry";
import type {
  ApprovalRecord,
  FactRecord,
  IdentityAnchor,
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
import {
  VisualIdentityPipeline,
  VisualIdentityValidationError,
  validateAnchorPlan,
  type ChannelVisualBiblePort,
  type VisualIdentityClock,
  type VisualIdentityContextPort,
  type VisualIdentityIdFactory,
  type VisualIdentityRepository
} from "../src/index.js";

const now = "2026-09-09T08:00:00.000Z";
const clock: VisualIdentityClock = { nowIso: () => now };

function ids(): VisualIdentityIdFactory {
  let n = 0;
  return { next: prefix => `${prefix}_${++n}` };
}

const script: ScriptVersion = {
  id: "script_1",
  projectId: "prj_1",
  revision: 1,
  lifecycleStatus: "ACTIVE",
  createdAt: now,
  updatedAt: now,
  kind: "FINAL",
  body: "첫 장면. 둘째 장면."
};

function scene(id: string, displayNumber: number): Scene {
  return {
    id,
    projectId: "prj_1",
    sequenceId: "seq_1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    displayNumber,
    scriptSegment: displayNumber === 1 ? "첫 장면." : "둘째 장면.",
    scriptRef: { scriptId: script.id, scriptRevision: script.revision },
    stateIn: "in",
    stateCurrent: "current",
    stateOut: "out",
    primaryVisualIdea: "visual",
    mustBeSeen: [],
    canBeNarrated: [],
    canBeImplied: [],
    requiredIdentityAnchorIds: [],
    sceneStatus: "DESIGNED",
    stale: false
  };
}

const styleDecision: ProjectStyleDecision = {
  eraRegion: "조선 후기",
  visualApproach: "역사 다큐멘터리 재현",
  realismLevel: "사실적",
  colorLanguage: "저채도",
  lightingLanguage: "자연광 중심",
  materialLanguage: "목재와 한지",
  environmentLanguage: "시대 고증 공간",
  characterRenderingPrinciple: "연령과 신분 일관성",
  cameraCompositionTendency: "관찰형",
  moodRange: ["긴장", "절제"],
  factualConstraints: ["현대 요소 금지"],
  avoidances: ["판타지 의상"]
};

const anchorDecision: AnchorPlanDecision = {
  anchors: [{
    key: "person_1",
    anchorType: "CHARACTER",
    name: "주요 인물",
    rationale: "두 장면에 반복 등장하여 얼굴과 복식 연속성이 필요하다.",
    continuityReason: "RECURRING",
    productionPriority: "CRITICAL",
    requiredBySceneIds: ["sc_1", "sc_2"],
    specification: {
      locked: ["얼굴 구조", "연령대", "기본 복식"],
      contextual: ["표정", "자세"],
      temporary: []
    }
  }]
};

class MemoryRepository implements VisualIdentityRepository {
  style: ProjectStyle | null = null;
  anchors: IdentityAnchor[] = [];
  approvals: ApprovalRecord[] = [];
  events: WorkflowEvent[] = [];
  outbox: OutboxRecord[] = [];

  async getLatestProjectStyle() { return this.style; }

  async getApprovedProjectStyle() {
    if (this.style === null || this.style.stale) return null;
    const approval = [...this.approvals].reverse().find(a =>
      a.targetType === "PROJECT_STYLE" &&
      a.targetId === this.style?.id &&
      a.targetRevision === this.style?.revision &&
      a.approvalState === "HUMAN_APPROVED"
    );
    return approval === undefined ? null : this.style;
  }

  async commitProjectStyle(input: {
    previous: ProjectStyle | null;
    next: ProjectStyle;
    staleAnchorIds: string[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.style = input.next;
    const stale = new Set(input.staleAnchorIds);
    this.anchors = this.anchors.map(anchor =>
      stale.has(anchor.id)
        ? { ...anchor, stale: true, staleReason: "PROJECT_STYLE_CHANGED" }
        : anchor
    );
    this.record(input.event, input.outbox);
  }

  async commitProjectStyleApproval(input: {
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.approvals.push(input.approval);
    this.record(input.event, input.outbox);
  }

  async listActiveAnchors() {
    return this.anchors.filter(anchor => anchor.lifecycleStatus === "ACTIVE");
  }

  async getLatestAnchor(_projectId: string, anchorId: string) {
    return this.anchors.find(
      anchor => anchor.id === anchorId && anchor.lifecycleStatus === "ACTIVE"
    ) ?? null;
  }

  async commitAnchorPlan(input: {
    previousAnchors: IdentityAnchor[];
    nextAnchors: IdentityAnchor[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    const previousIds = new Set(input.previousAnchors.map(anchor => anchor.id));
    this.anchors = this.anchors.map(anchor =>
      previousIds.has(anchor.id)
        ? { ...anchor, lifecycleStatus: "SUPERSEDED" as const }
        : anchor
    );
    this.anchors.push(...input.nextAnchors);
    this.record(input.event, input.outbox);
  }

  async commitAnchorRevision(input: {
    previous: IdentityAnchor;
    next: IdentityAnchor;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.anchors = this.anchors.map(anchor =>
      anchor.id === input.previous.id && anchor.revision === input.previous.revision
        ? { ...anchor, lifecycleStatus: "SUPERSEDED" as const }
        : anchor
    );
    this.anchors.push(input.next);
    this.record(input.event, input.outbox);
  }

  async commitAnchorApprovals(input: {
    approvals: ApprovalRecord[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.approvals.push(...input.approvals);
    this.record(input.event, input.outbox);
  }

  async markAnchorsStale(input: {
    anchorIds: string[];
    reason: string;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    const ids = new Set(input.anchorIds);
    this.anchors = this.anchors.map(anchor =>
      ids.has(anchor.id)
        ? { ...anchor, stale: true, staleReason: input.reason }
        : anchor
    );
    this.record(input.event, input.outbox);
  }

  async markProjectStyleAndAnchorsStale(input: {
    projectStyleId: string;
    anchorIds: string[];
    reason: string;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    if (this.style?.id === input.projectStyleId) {
      this.style = { ...this.style, stale: true, staleReason: input.reason };
    }
    const ids = new Set(input.anchorIds);
    this.anchors = this.anchors.map(anchor =>
      ids.has(anchor.id)
        ? { ...anchor, stale: true, staleReason: input.reason }
        : anchor
    );
    this.record(input.event, input.outbox);
  }

  async getLatestApproval(
    _projectId: string,
    targetType: ApprovalRecord["targetType"],
    targetId: string
  ) {
    return [...this.approvals].reverse().find(
      approval => approval.targetType === targetType && approval.targetId === targetId
    ) ?? null;
  }

  private record(event: WorkflowEvent, outbox: OutboxRecord) {
    this.events.push(event);
    this.outbox.push(outbox);
  }
}

class MemoryContext implements VisualIdentityContextPort {
  currentScript: ScriptVersion | null = script;
  facts: FactRecord[] = [];
  scenes: Scene[] = [scene("sc_1", 1), scene("sc_2", 2)];

  async getLatestApprovedFinalScript() { return this.currentScript; }
  async listApprovedFacts() { return this.facts; }
  async listActiveScenes() {
    return this.scenes.filter(item => item.lifecycleStatus === "ACTIVE" && !item.stale);
  }
}

const bibleSnapshot: ChannelVisualBibleSnapshot = {
  version: "2.0.0",
  resourceId: "history-channel",
  contentHash: "sha256:abc",
  payload: { ref: "canonical-channel-bible" }
};

class MemoryBible implements ChannelVisualBiblePort {
  constructor(private readonly available = true) {}
  async resolve(version: string) {
    return this.available && version === bibleSnapshot.version ? bibleSnapshot : null;
  }
}

class Decisions implements VisualIdentityDecisionPort {
  constructor(private readonly anchors: AnchorPlanDecision = anchorDecision) {}
  async designProjectStyle() { return styleDecision; }
  async planIdentityAnchors() { return this.anchors; }
}

function pipeline(
  repository = new MemoryRepository(),
  context = new MemoryContext(),
  decisions: VisualIdentityDecisionPort = new Decisions(),
  bible: ChannelVisualBiblePort = new MemoryBible()
) {
  return {
    repository,
    context,
    service: new VisualIdentityPipeline(
      repository,
      context,
      bible,
      decisions,
      clock,
      ids()
    )
  };
}

test("Project Style uses the pinned Channel Visual Bible and requires approval before Anchor Plan", async () => {
  const { service } = pipeline();
  const style = await service.generateProjectStyle({
    projectId: "prj_1",
    format: "LONGFORM",
    channelVisualBibleVersion: "2.0.0"
  });
  assert.equal(style.channelVisualBibleVersion, "2.0.0");

  await assert.rejects(
    () => service.planIdentityAnchors({ projectId: "prj_1", format: "LONGFORM" }),
    (error: unknown) =>
      error instanceof VisualIdentityValidationError &&
      error.code === "PROJECT_STYLE_APPROVAL_REQUIRED"
  );

  await service.approveProjectStyle({ projectId: "prj_1" });
  const anchors = await service.planIdentityAnchors({
    projectId: "prj_1",
    format: "LONGFORM"
  });
  assert.equal(anchors.length, 1);
});

test("recurring anchors must actually recur", () => {
  assert.throws(
    () => validateAnchorPlan({
      anchors: [{
        ...anchorDecision.anchors[0]!,
        requiredBySceneIds: ["sc_1"]
      }]
    }, [scene("sc_1", 1), scene("sc_2", 2)]),
    (error: unknown) =>
      error instanceof VisualIdentityValidationError &&
      error.code === "ANCHOR_PLAN_INVALID"
  );
});

test("approved style plus approved non-stale anchors makes V1/V2 identity readiness true", async () => {
  const { service } = pipeline();
  await service.generateProjectStyle({
    projectId: "prj_1",
    format: "LONGFORM",
    channelVisualBibleVersion: "2.0.0"
  });
  await service.approveProjectStyle({ projectId: "prj_1" });
  const anchors = await service.planIdentityAnchors({
    projectId: "prj_1",
    format: "LONGFORM"
  });

  let readiness = await service.getReadiness("prj_1");
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.missingApprovalAnchorIds, [anchors[0]!.id]);

  await service.approveAnchors({
    projectId: "prj_1",
    anchorIds: anchors.map(anchor => anchor.id)
  });
  readiness = await service.getReadiness("prj_1");
  assert.equal(readiness.projectStyleApproved, true);
  assert.equal(readiness.ready, true);
});

test("style revision invalidates current Anchor approvals and reference media without deleting history", async () => {
  const { service, repository } = pipeline();
  await service.generateProjectStyle({
    projectId: "prj_1",
    format: "LONGFORM",
    channelVisualBibleVersion: "2.0.0"
  });
  await service.approveProjectStyle({ projectId: "prj_1" });
  let anchors = await service.planIdentityAnchors({
    projectId: "prj_1",
    format: "LONGFORM"
  });
  anchors = [
    await service.reviseAnchor({
      projectId: "prj_1",
      anchorId: anchors[0]!.id,
      patch: { referenceMediaIds: ["med_reference_old"] }
    })
  ];
  await service.approveAnchors({
    projectId: "prj_1",
    anchorIds: anchors.map(anchor => anchor.id)
  });

  const revisedStyle = await service.reviseProjectStyle({
    projectId: "prj_1",
    patch: { colorLanguage: "더 차가운 저채도" }
  });
  assert.equal(revisedStyle.revision, 2);

  await service.approveProjectStyle({ projectId: "prj_1" });
  const replanned = await service.planIdentityAnchors({
    projectId: "prj_1",
    format: "LONGFORM"
  });
  assert.equal(replanned[0]!.id, anchors[0]!.id);
  assert.equal(replanned[0]!.revision, anchors[0]!.revision + 1);
  assert.deepEqual(replanned[0]!.referenceMediaIds, []);

  const readiness = await service.getReadiness("prj_1");
  assert.equal(readiness.ready, false);
  assert.equal(repository.anchors.some(a => a.lifecycleStatus === "SUPERSEDED"), true);
});

test("new approved script marks Project Style and Anchors stale instead of deleting them", async () => {
  const { service, repository, context } = pipeline();
  await service.generateProjectStyle({
    projectId: "prj_1",
    format: "LONGFORM",
    channelVisualBibleVersion: "2.0.0"
  });
  await service.approveProjectStyle({ projectId: "prj_1" });
  const anchors = await service.planIdentityAnchors({
    projectId: "prj_1",
    format: "LONGFORM"
  });

  context.currentScript = { ...script, revision: 2, body: "수정된 대본." };
  const result = await service.reconcileApprovedScriptChange("prj_1");
  assert.equal(result.projectStyleStale, true);
  assert.deepEqual(result.staleAnchorIds, anchors.map(anchor => anchor.id));
  assert.equal(repository.style?.stale, true);
  assert.equal(
    repository.anchors.filter(anchor => anchor.lifecycleStatus === "ACTIVE").every(anchor => anchor.stale),
    true
  );
});


test("WF-08 resolves the canonical History/Mystery Visual Bible through the registry adapter", async () => {
  const resourcesRoot = fileURLToPath(new URL("../../../resources/", import.meta.url));
  const registry = new FileSystemResourceRegistry(resourcesRoot);
  const canonicalBible = new ChannelVisualBibleRegistryAdapter(
    registry,
    "HISTORY_MYSTERY_VISUAL_BIBLE"
  );
  const { service } = pipeline(
    new MemoryRepository(),
    new MemoryContext(),
    new Decisions(),
    canonicalBible
  );

  const projectStyle = await service.generateProjectStyle({
    projectId: "prj_1",
    format: "LONGFORM",
    channelVisualBibleVersion: "1.0.0"
  });

  assert.equal(projectStyle.channelVisualBibleVersion, "1.0.0");
});
