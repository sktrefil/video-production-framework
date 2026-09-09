import assert from "node:assert/strict";
import test from "node:test";
import type {
  ApprovalRecord,
  MediaArtifact,
  ProductionAsset,
  ProductionLink,
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
import {
  PreLinkHandoffBatchService,
  PreLinkHandoffPipeline,
  PreLinkHandoffValidationError,
  type OrderedScene,
  type PreLinkHandoffClock,
  type PreLinkHandoffContextPort,
  type PreLinkHandoffIdFactory,
  type PreLinkHandoffRepository
} from "../src/index.js";

const now = "2026-09-09T14:00:00.000Z";
const clock: PreLinkHandoffClock = { nowIso: () => now };

function ids(): PreLinkHandoffIdFactory {
  let n = 0;
  return { next: prefix => `${prefix}_${++n}` };
}

function makeScene(
  id: string,
  sequenceId: string,
  displayNumber: number,
  stateIn: string,
  stateOut: string
): Scene {
  return {
    id,
    projectId: "prj_1",
    sequenceId,
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    displayNumber,
    scriptSegment: id,
    scriptRef: { scriptId: "script_1", scriptRevision: 1 },
    stateIn,
    stateCurrent: id,
    stateOut,
    primaryVisualIdea: id,
    mustBeSeen: [],
    canBeNarrated: [],
    canBeImplied: [],
    requiredIdentityAnchorIds: [],
    sceneStatus: "APPROVED",
    stale: false
  };
}

const sc1 = makeScene("sc_1", "seq_1", 1, "A", "B");
const sc2 = makeScene("sc_2", "seq_1", 2, "B", "C");
const sc3 = makeScene("sc_3", "seq_2", 1, "C", "D");
const sc4 = makeScene("sc_4", "seq_3", 1, "D", "E");

const orderedScenes: OrderedScene[] = [
  {
    scene: sc1,
    chapterId: "ch_1",
    chapterDisplayNumber: 1,
    sequenceId: "seq_1",
    sequenceDisplayNumber: 1
  },
  {
    scene: sc2,
    chapterId: "ch_1",
    chapterDisplayNumber: 1,
    sequenceId: "seq_1",
    sequenceDisplayNumber: 1
  },
  {
    scene: sc3,
    chapterId: "ch_1",
    chapterDisplayNumber: 1,
    sequenceId: "seq_2",
    sequenceDisplayNumber: 2
  },
  {
    scene: sc4,
    chapterId: "ch_2",
    chapterDisplayNumber: 2,
    sequenceId: "seq_3",
    sequenceDisplayNumber: 1
  }
];

function makeMedia(id: string): MediaArtifact {
  return {
    id,
    projectId: "prj_1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    mediaType: "IMAGE",
    relativePath: `06_generated_assets/images/${id}.png`,
    mimeType: "image/png",
    checksum: `sha256:${id}`,
    mediaStatus: "AVAILABLE"
  };
}

function makeAsset(
  id: string,
  sceneId: string,
  mediaId: string,
  revision = 3
): ProductionAsset {
  return {
    id,
    projectId: "prj_1",
    revision,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    stale: false,
    assetClass: "PRIMARY_SCENE",
    assetRole: "STANDARD",
    productionPriority: "CRITICAL",
    sourceStrategy: "GENERATE",
    owner: { type: "SCENE", id: sceneId },
    stateRef: {
      entityType: "SCENE",
      entityId: sceneId,
      entityRevision: 1,
      stateField: "STATE_CURRENT"
    },
    design: {
      visualGoal: sceneId,
      composition: "medium",
      continuityRequirements: [],
      identityAnchorIds: [],
      factualConstraints: [],
      avoidances: []
    },
    candidateMediaIds: [mediaId],
    approvedMediaId: mediaId,
    assetStatus: "APPROVED",
    sourceSceneRevision: 1,
    sourceProjectStyleId: "sty_1",
    sourceProjectStyleRevision: 1,
    sourceIdentityAnchorRevisions: {},
    formatProfileVersion: "fmt_1"
  };
}

class MemoryContext implements PreLinkHandoffContextPort {
  scenes = new Map(orderedScenes.map(item => [item.scene.id, item.scene]));
  chain = [...orderedScenes];
  assets = new Map<string, ProductionAsset>();
  media = new Map<string, MediaArtifact>();

  constructor() {
    for (const [sceneId, assetId, mediaId] of [
      ["sc_1", "ast_1", "med_1"],
      ["sc_2", "ast_2", "med_2"],
      ["sc_3", "ast_3", "med_3"],
      ["sc_4", "ast_4", "med_4"]
    ] as const) {
      const asset = makeAsset(assetId, sceneId, mediaId);
      this.assets.set(sceneId, asset);
      this.assets.set(asset.id, asset);
      this.media.set(mediaId, makeMedia(mediaId));
    }
  }

  async listApprovedSceneChain() {
    return this.chain.filter(item => !item.scene.stale && item.scene.sceneStatus === "APPROVED");
  }

  async getScene(_projectId: string, sceneId: string) {
    return this.scenes.get(sceneId) ?? null;
  }

  async getApprovedPrimaryAsset(_projectId: string, sceneId: string) {
    const asset = this.assets.get(sceneId);
    return asset?.assetStatus === "APPROVED" && !asset.stale ? asset : null;
  }

  async getAsset(_projectId: string, assetId: string) {
    return this.assets.get(assetId) ?? null;
  }

  async getMedia(_projectId: string, mediaId: string) {
    return this.media.get(mediaId) ?? null;
  }

  replaceApprovedAsset(sceneId: string, next: ProductionAsset) {
    const previous = this.assets.get(sceneId);
    if (previous) this.assets.delete(previous.id);
    this.assets.set(sceneId, next);
    this.assets.set(next.id, next);
    if (next.approvedMediaId) {
      this.media.set(next.approvedMediaId, makeMedia(next.approvedMediaId));
    }
  }
}

class MemoryRepository implements PreLinkHandoffRepository {
  links: ProductionLink[] = [];
  approvals: ApprovalRecord[] = [];
  qc: QcResult[] = [];
  events: WorkflowEvent[] = [];
  outbox: OutboxRecord[] = [];

  async getLatestLink(_projectId: string, linkId: string) {
    return [...this.links]
      .filter(link => link.id === linkId && link.lifecycleStatus === "ACTIVE")
      .sort((a, b) => b.revision - a.revision)[0] ?? null;
  }

  async getLinkByScenes(
    _projectId: string,
    fromSceneId: string,
    toSceneId: string
  ) {
    return [...this.links]
      .filter(link =>
        link.fromSceneId === fromSceneId &&
        link.toSceneId === toSceneId &&
        link.lifecycleStatus === "ACTIVE"
      )
      .sort((a, b) => b.revision - a.revision)[0] ?? null;
  }

  async listActiveLinks() {
    return this.links.filter(link => link.lifecycleStatus === "ACTIVE");
  }

  async commitLinkGraph(input: {
    changes: Array<{ previous: ProductionLink | null; next: ProductionLink }>;
    staleLinkIds: string[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    for (const change of input.changes) {
      if (change.previous) this.supersede(change.previous);
      this.links.push(change.next);
    }
    const stale = new Set(input.staleLinkIds);
    this.links = this.links.map(link =>
      stale.has(link.id) && link.lifecycleStatus === "ACTIVE"
        ? { ...link, stale: true, staleReason: "STORY_CHAIN_CHANGED" }
        : link
    );
    this.record(input.event, input.outbox);
  }

  async commitPreLink(input: {
    previous: ProductionLink;
    next: ProductionLink;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersede(input.previous);
    this.links.push(input.next);
    if (input.approval) this.approvals.push(input.approval);
    this.record(input.event, input.outbox);
  }

  async commitPreLinkApproval(input: {
    previous: ProductionLink;
    next: ProductionLink;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersede(input.previous);
    this.links.push(input.next);
    this.approvals.push(input.approval);
    this.record(input.event, input.outbox);
  }

  async commitAssetBinding(input: {
    previous: ProductionLink;
    next: ProductionLink;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersede(input.previous);
    this.links.push(input.next);
    this.record(input.event, input.outbox);
  }

  async commitHandoffQc(input: {
    previous: ProductionLink;
    next: ProductionLink;
    qc: QcResult;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersede(input.previous);
    this.links.push(input.next);
    this.qc.push(input.qc);
    this.record(input.event, input.outbox);
  }

  async commitHandoffReviewApproval(input: {
    previous: ProductionLink;
    next: ProductionLink;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersede(input.previous);
    this.links.push(input.next);
    this.approvals.push(input.approval);
    this.record(input.event, input.outbox);
  }

  async commitDependencyReconciliation(input: {
    staleLinkIds: string[];
    resets: Array<{ previous: ProductionLink; next: ProductionLink }>;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    const stale = new Set(input.staleLinkIds);
    this.links = this.links.map(link =>
      stale.has(link.id) && link.lifecycleStatus === "ACTIVE"
        ? { ...link, stale: true, staleReason: "STORY_STATE_CHANGED" }
        : link
    );
    for (const reset of input.resets) {
      this.supersede(reset.previous);
      this.links.push(reset.next);
    }
    this.record(input.event, input.outbox);
  }

  private supersede(previous: ProductionLink) {
    this.links = this.links.map(link =>
      link.id === previous.id && link.revision === previous.revision
        ? { ...link, lifecycleStatus: "SUPERSEDED" as const }
        : link
    );
  }

  private record(event: WorkflowEvent, outbox: OutboxRecord) {
    this.events.push(event);
    this.outbox.push(outbox);
  }
}

class Decisions implements LinkDecisionPort {
  reviewPreLink = false;
  preLinkDecision: PreLinkDecision = {
    preLinkRequired: true,
    continuityLevel: "STRICT",
    stateChange: "state handoff",
    handoffIntent: "preserve visual continuity",
    handoffAnchor: ["subject direction"],
    handoffChannels: ["VISUAL"],
    transitionIntent: "DIRECT"
  };
  handoffDecision: HandoffQcDecision = {
    qcStatus: "PASS",
    severity: "MINOR",
    confidence: 0.98,
    preLinkMatch: "MATCH",
    continuityUsable: true
  };

  async designPreLink(): Promise<ProductionDecisionWithMeta<PreLinkDecision>> {
    return {
      decision: { ...this.preLinkDecision },
      status: this.reviewPreLink ? "NEEDS_REVIEW" : "SUCCESS",
      confidence: this.reviewPreLink ? 0.6 : 0.98,
      requiresHumanReview: this.reviewPreLink,
      warnings: [],
      decisionId: "dec_pre"
    };
  }

  async runHandoffQc(): Promise<ProductionDecisionWithMeta<HandoffQcDecision>> {
    return {
      decision: { ...this.handoffDecision },
      status: "SUCCESS",
      confidence: this.handoffDecision.confidence,
      requiresHumanReview: false,
      warnings: [],
      decisionId: "dec_qc"
    };
  }
}

function setup() {
  const repository = new MemoryRepository();
  const context = new MemoryContext();
  const decisions = new Decisions();
  const pipeline = new PreLinkHandoffPipeline(
    repository,
    context,
    decisions,
    clock,
    ids()
  );
  return { repository, context, decisions, pipeline };
}

test("Link Graph preserves production order, scopes and structured StateRefs", async () => {
  const { repository, pipeline } = setup();
  const links = await pipeline.buildLinkGraph({
    projectId: "prj_1",
    format: "LONGFORM"
  });

  assert.equal(links.length, 3);
  assert.deepEqual(
    links.map(link => link.linkScope),
    ["SEQUENCE_LOCAL", "SEQUENCE_BOUNDARY", "CHAPTER_BOUNDARY"]
  );
  assert.equal(links[0]!.fromStateRef.stateField, "STATE_OUT");
  assert.equal(links[0]!.toStateRef.stateField, "STATE_IN");

  const eventCount = repository.events.length;
  const again = await pipeline.buildLinkGraph({
    projectId: "prj_1",
    format: "LONGFORM"
  });
  assert.deepEqual(again.map(link => link.id), links.map(link => link.id));
  assert.equal(repository.events.length, eventCount);

  const short = setup();
  const shortLinks = await short.pipeline.buildLinkGraph({
    projectId: "prj_1",
    format: "SHORTFORM"
  });
  assert.equal(
    shortLinks.every(link => link.linkScope === "FULL_VIDEO_PRIMARY"),
    true
  );
});

test("Pre-Link auto-progress and human review remain separate approval paths", async () => {
  const { repository, decisions, pipeline } = setup();
  const [link] = await pipeline.buildLinkGraph({
    projectId: "prj_1",
    format: "LONGFORM"
  });

  const automatic = await pipeline.designPreLink({
    projectId: "prj_1",
    linkId: link!.id,
    format: "LONGFORM"
  });
  assert.equal(automatic.link.linkStatus, "WAITING_FOR_ASSETS");
  assert.equal(automatic.approval?.approvalState, "AUTO_APPROVED");
  assert.ok(automatic.link.preLinkApprovalId);

  const reviewSetup = setup();
  reviewSetup.decisions.reviewPreLink = true;
  const [reviewLink] = await reviewSetup.pipeline.buildLinkGraph({
    projectId: "prj_1",
    format: "LONGFORM"
  });
  const draft = await reviewSetup.pipeline.designPreLink({
    projectId: "prj_1",
    linkId: reviewLink!.id,
    format: "LONGFORM"
  });
  assert.equal(draft.link.linkStatus, "PRE_LINK_DRAFT");
  assert.equal(draft.approval, undefined);

  const approved = await reviewSetup.pipeline.approvePreLink({
    projectId: "prj_1",
    linkId: reviewLink!.id
  });
  assert.equal(approved.link.linkStatus, "WAITING_FOR_ASSETS");
  assert.equal(approved.approval.approvalState, "HUMAN_APPROVED");
  assert.equal(reviewSetup.repository.approvals.length, 1);
  assert.equal(repository.approvals.length, 1);
});

test("approved endpoint Assets bind before actual Handoff QC and PASS opens Final Clip readiness", async () => {
  const { repository, pipeline } = setup();
  const [created] = await pipeline.buildLinkGraph({
    projectId: "prj_1",
    format: "LONGFORM"
  });
  const designed = await pipeline.designPreLink({
    projectId: "prj_1",
    linkId: created!.id,
    format: "LONGFORM"
  });
  const bound = await pipeline.bindApprovedAssets({
    projectId: "prj_1",
    linkId: designed.link.id
  });
  assert.equal(bound.linkStatus, "HANDOFF_QC_PENDING");
  assert.equal(bound.fromAssetId, "ast_1");
  assert.equal(bound.toAssetId, "ast_2");

  const qc = await pipeline.runHandoffQc({
    projectId: "prj_1",
    linkId: bound.id,
    format: "LONGFORM"
  });
  assert.equal(qc.qc.qcType, "HANDOFF_QC");
  assert.equal(qc.qc.targetType, "LINK");
  assert.equal(qc.link.linkStatus, "HANDOFF_PASS");
  assert.equal(qc.link.preLinkMatch, "MATCH");

  const readiness = await pipeline.getReadiness("prj_1", qc.link.id);
  assert.equal(readiness.finalClipDesignReady, true);
  assert.equal(repository.qc.length, 1);
});

test("contradictory Handoff PASS decision is rejected", async () => {
  const { decisions, pipeline } = setup();
  const [created] = await pipeline.buildLinkGraph({
    projectId: "prj_1",
    format: "LONGFORM"
  });
  await pipeline.designPreLink({
    projectId: "prj_1",
    linkId: created!.id,
    format: "LONGFORM"
  });
  await pipeline.bindApprovedAssets({
    projectId: "prj_1",
    linkId: created!.id
  });

  decisions.handoffDecision = {
    qcStatus: "PASS",
    severity: "MINOR",
    confidence: 0.99,
    preLinkMatch: "MISMATCH",
    continuityUsable: true
  };

  await assert.rejects(
    () => pipeline.runHandoffQc({
      projectId: "prj_1",
      linkId: created!.id,
      format: "LONGFORM"
    }),
    (error: unknown) =>
      error instanceof PreLinkHandoffValidationError &&
      error.code === "HANDOFF_QC_DECISION_INVALID"
  );
});

test("Asset changes reset only Handoff stage while Scene changes stale the Link", async () => {
  const { context, pipeline } = setup();
  const [created] = await pipeline.buildLinkGraph({
    projectId: "prj_1",
    format: "LONGFORM"
  });
  const designed = await pipeline.designPreLink({
    projectId: "prj_1",
    linkId: created!.id,
    format: "LONGFORM"
  });
  const bound = await pipeline.bindApprovedAssets({
    projectId: "prj_1",
    linkId: designed.link.id
  });
  await pipeline.runHandoffQc({
    projectId: "prj_1",
    linkId: bound.id,
    format: "LONGFORM"
  });

  context.replaceApprovedAsset(
    "sc_2",
    makeAsset("ast_2", "sc_2", "med_2_v2", 4)
  );
  const assetChange = await pipeline.reconcileDependencies("prj_1");
  assert.deepEqual(assetChange.staleLinkIds, []);
  assert.deepEqual(assetChange.resetHandoffLinkIds, [created!.id]);

  const reset = await pipeline.getReadiness("prj_1", created!.id);
  assert.equal(reset.status, "WAITING_FOR_ASSETS");
  assert.equal(reset.preLinkReady, true);
  assert.equal(reset.assetsBound, false);

  const changedScene = {
    ...context.scenes.get("sc_1")!,
    revision: 2
  };
  context.scenes.set("sc_1", changedScene);
  context.chain[0] = { ...context.chain[0]!, scene: changedScene };

  const storyChange = await pipeline.reconcileDependencies("prj_1");
  assert.deepEqual(storyChange.staleLinkIds, [created!.id]);
});

test("Batch Handoff work preserves partial success", async () => {
  const { context, pipeline } = setup();
  const batch = new PreLinkHandoffBatchService(pipeline);
  const links = await pipeline.buildLinkGraph({
    projectId: "prj_1",
    format: "LONGFORM"
  });
  const designed = await batch.designPreLinks({
    projectId: "prj_1",
    linkIds: links.slice(0, 2).map(link => link.id),
    format: "LONGFORM"
  });
  assert.equal(designed.status, "COMPLETE");

  context.assets.delete("sc_3");
  context.assets.delete("ast_3");

  const binding = await batch.bindApprovedAssets({
    projectId: "prj_1",
    linkIds: links.slice(0, 2).map(link => link.id)
  });
  assert.equal(binding.status, "PARTIAL_COMPLETE");
  assert.equal(binding.succeeded, 1);
  assert.equal(binding.failed, 1);
  assert.equal(binding.items[1]?.code, "APPROVED_ASSETS_REQUIRED");
});


test("Handoff QC requiring human review does not open Final Clip readiness until accepted", async () => {
  const { repository, decisions, pipeline } = setup();
  const [created] = await pipeline.buildLinkGraph({
    projectId: "prj_1",
    format: "LONGFORM"
  });
  await pipeline.designPreLink({
    projectId: "prj_1",
    linkId: created!.id,
    format: "LONGFORM"
  });
  await pipeline.bindApprovedAssets({
    projectId: "prj_1",
    linkId: created!.id
  });

  decisions.runHandoffQc = async () => ({
    decision: {
      qcStatus: "PASS",
      severity: "MINOR",
      confidence: 0.62,
      preLinkMatch: "MATCH",
      continuityUsable: true
    },
    status: "NEEDS_REVIEW",
    confidence: 0.62,
    requiresHumanReview: true,
    warnings: ["low confidence"],
    decisionId: "dec_qc_review"
  });

  const reviewed = await pipeline.runHandoffQc({
    projectId: "prj_1",
    linkId: created!.id,
    format: "LONGFORM"
  });
  assert.equal(reviewed.link.linkStatus, "HANDOFF_NEEDS_REVIEW");
  assert.equal(reviewed.link.handoffUsable, true);

  const before = await pipeline.getReadiness("prj_1", created!.id);
  assert.equal(before.finalClipDesignReady, false);

  const accepted = await pipeline.approveHandoffReview({
    projectId: "prj_1",
    linkId: created!.id
  });
  assert.equal(accepted.link.linkStatus, "HANDOFF_PASS");
  assert.equal(accepted.approval.approvalState, "HUMAN_APPROVED");
  assert.equal(
    accepted.approval.reason,
    "HANDOFF_QC_REVIEW_ACCEPTED"
  );
  assert.ok(accepted.link.handoffReviewApprovalId);

  const after = await pipeline.getReadiness("prj_1", created!.id);
  assert.equal(after.finalClipDesignReady, true);
  assert.equal(
    repository.approvals.some(
      approval => approval.reason === "HANDOFF_QC_REVIEW_ACCEPTED"
    ),
    true
  );
});


test("Pre-Link can be explicitly NOT_REQUIRED without forcing a continuity gate", async () => {
  const { decisions, pipeline } = setup();
  decisions.preLinkDecision = {
    preLinkRequired: false,
    continuityLevel: "RESET_ALLOWED",
    stateChange: "sequence boundary state reset",
    handoffIntent: "no direct visual continuity required",
    handoffAnchor: [],
    handoffChannels: [],
    transitionIntent: "RESET"
  };

  const links = await pipeline.buildLinkGraph({
    projectId: "prj_1",
    format: "LONGFORM"
  });
  const boundary = links.find(link => link.linkScope === "SEQUENCE_BOUNDARY");
  assert.ok(boundary);

  const result = await pipeline.designPreLink({
    projectId: "prj_1",
    linkId: boundary.id,
    format: "LONGFORM"
  });
  assert.equal(result.link.preLinkRequired, false);
  assert.equal(result.link.linkStatus, "WAITING_FOR_ASSETS");
  assert.equal(result.approval?.approvalState, "NOT_REQUIRED");
  assert.equal(result.approval?.reason, "PRE_LINK_NOT_REQUIRED");
});
