import assert from "node:assert/strict";
import test from "node:test";
import type {
  ApprovalRecord,
  ClipFallbackRecord,
  ClipQcRecord,
  MediaArtifact,
  ProductionAsset,
  ProductionClip,
  ProductionLink,
  Scene
} from "@vpf/domain";
import type {
  ClipFallbackDecision,
  ClipQcDecision,
  ProductionDecisionWithMeta,
  QcFallbackDecisionPort
} from "@vpf/production-system";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import {
  QcFallbackPipeline,
  QcFallbackValidationError,
  summarizeQc,
  type QcFallbackClock,
  type QcFallbackContextPort,
  type QcFallbackIdFactory,
  type QcFallbackRepository
} from "../src/index.js";

const now = "2026-09-09T17:20:00.000Z";
const clock: QcFallbackClock = { nowIso: () => now };

function ids(): QcFallbackIdFactory {
  let n = 0;
  return { next: prefix => `${prefix}_${++n}` };
}

function scene(id: string): Scene {
  return {
    id,
    projectId: "prj_1",
    sequenceId: "seq_1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    displayNumber: id === "sc_1" ? 1 : 2,
    scriptSegment: id,
    scriptRef: { scriptId: "script_1", scriptRevision: 1 },
    stateIn: "in",
    stateCurrent: id,
    stateOut: "out",
    primaryVisualIdea: id,
    mustBeSeen: [],
    canBeNarrated: [],
    canBeImplied: [],
    requiredIdentityAnchorIds: [],
    sceneStatus: "APPROVED",
    stale: false
  };
}

function media(id: string, type: "IMAGE" | "VIDEO"): MediaArtifact {
  return {
    id,
    projectId: "prj_1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    mediaType: type,
    relativePath: type === "VIDEO" ? `clips/${id}.mp4` : `images/${id}.png`,
    mimeType: type === "VIDEO" ? "video/mp4" : "image/png",
    ...(type === "VIDEO" ? { durationMs: 5000 } : {}),
    checksum: `sha256:${id}`,
    mediaStatus: "AVAILABLE"
  };
}

function asset(id: string, sceneId: string, mediaId: string): ProductionAsset {
  return {
    id,
    projectId: "prj_1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    stale: false,
    assetClass: "PRIMARY_SCENE",
    assetRole: "STANDARD",
    productionPriority: "CRITICAL",
    sourceStrategy: "GENERATE",
    owner: { type: "SCENE", id: sceneId },
    stateRef: { entityType: "SCENE", entityId: sceneId, stateField: "STATE_CURRENT", entityRevision: 1 },
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

function baseLink(): ProductionLink {
  return {
    id: "lnk_1",
    projectId: "prj_1",
    revision: 4,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    stale: false,
    fromSceneId: "sc_1",
    fromSceneRevision: 1,
    fromStateRef: { entityType: "SCENE", entityId: "sc_1", stateField: "STATE_OUT", entityRevision: 1 },
    toSceneId: "sc_2",
    toSceneRevision: 1,
    toStateRef: { entityType: "SCENE", entityId: "sc_2", stateField: "STATE_IN", entityRevision: 1 },
    linkScope: "SEQUENCE_LOCAL",
    preLinkRequired: true,
    continuityLevel: "STRICT",
    stateChange: "A to B",
    handoffIntent: "continue",
    handoffAnchor: ["subject"],
    handoffChannels: ["VISUAL"],
    transitionIntent: "DIRECT",
    preLinkApprovalId: "apr_pre",
    fromAssetId: "ast_1",
    fromAssetRevision: 1,
    fromMediaId: "med_1",
    toAssetId: "ast_2",
    toAssetRevision: 1,
    toMediaId: "med_2",
    handoffQcId: "qc_handoff",
    handoffUsable: true,
    implementationType: "CLIP",
    implementationRefId: "clp_1",
    preLinkMatch: "MATCH",
    linkStatus: "FINAL_DESIGN_READY"
  };
}

function candidateClip(): ProductionClip {
  const link = baseLink();
  return {
    id: "clp_1",
    projectId: "prj_1",
    revision: 4,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    stale: false,
    linkId: link.id,
    linkRevision: link.revision,
    clipMode: "DIRECT_START_END_I2V",
    clipStartStateRef: link.fromStateRef,
    clipEndStateTarget: link.toStateRef,
    startAssetId: "ast_1",
    startAssetRevision: 1,
    startMediaId: "med_1",
    endAssetId: "ast_2",
    endAssetRevision: 1,
    endMediaId: "med_2",
    transitionMethod: "DIRECT",
    cameraMove: "slow",
    subjectMotion: "low",
    environmentMotion: "low",
    durationMs: 5000,
    providerExecutionRequired: true,
    finalDesignApprovalId: "apr_design",
    providerPreflightId: "preflight_1",
    candidateMediaIds: ["vid_1"],
    clipStatus: "CANDIDATE_AVAILABLE"
  };
}

class MemoryStore implements QcFallbackRepository, QcFallbackContextPort {
  clip = candidateClip();
  link = baseLink();
  scenes = new Map([["sc_1", scene("sc_1")], ["sc_2", scene("sc_2")]]);
  assets = new Map([
    ["ast_1", asset("ast_1", "sc_1", "med_1")],
    ["ast_2", asset("ast_2", "sc_2", "med_2")]
  ]);
  media = new Map([
    ["med_1", media("med_1", "IMAGE")],
    ["med_2", media("med_2", "IMAGE")],
    ["vid_1", media("vid_1", "VIDEO")]
  ]);
  qcs: ClipQcRecord[] = [];
  fallbacks: ClipFallbackRecord[] = [];
  approvals: ApprovalRecord[] = [];
  events: WorkflowEvent[] = [];
  outbox: OutboxRecord[] = [];

  async getLatestClip() { return this.clip; }
  async getLink() { return this.link; }
  async getScene(_projectId: string, id: string) { return this.scenes.get(id) ?? null; }
  async getAsset(_projectId: string, id: string) { return this.assets.get(id) ?? null; }
  async getMedia(_projectId: string, id: string) { return this.media.get(id) ?? null; }
  async getLatestClipQc() { return this.qcs.at(-1) ?? null; }
  async getClipQc(_projectId: string, id: string) { return this.qcs.find(x => x.id === id && x.lifecycleStatus === "ACTIVE") ?? null; }
  async getLatestFallback() { return this.fallbacks.filter(x => x.lifecycleStatus === "ACTIVE").at(-1) ?? null; }
  async getFallback(_projectId: string, id: string) { return this.fallbacks.find(x => x.id === id && x.lifecycleStatus === "ACTIVE") ?? null; }

  async commitClipQc(input: Parameters<QcFallbackRepository["commitClipQc"]>[0]) {
    this.clip = input.nextClip;
    this.qcs.push(input.qc);
    if (input.approval) this.approvals.push(input.approval);
    this.events.push(input.event);
    this.outbox.push(input.outbox);
  }
  async commitQcApproval(input: Parameters<QcFallbackRepository["commitQcApproval"]>[0]) {
    this.clip = input.nextClip;
    this.approvals.push(input.approval);
    this.events.push(input.event);
    this.outbox.push(input.outbox);
  }
  async commitFallbackSelection(input: Parameters<QcFallbackRepository["commitFallbackSelection"]>[0]) {
    this.clip = input.nextClip;
    this.fallbacks.push(input.fallback);
    if (input.approval) this.approvals.push(input.approval);
    this.events.push(input.event);
    this.outbox.push(input.outbox);
  }
  async commitFallbackRevision(input: Parameters<QcFallbackRepository["commitFallbackRevision"]>[0]) {
    input.previousFallback.lifecycleStatus = "SUPERSEDED";
    this.clip = input.nextClip;
    this.fallbacks.push(input.nextFallback);
    if (input.approval) this.approvals.push(input.approval);
    this.events.push(input.event);
    this.outbox.push(input.outbox);
  }
}

function meta<T>(decision: T, review = false): ProductionDecisionWithMeta<T> {
  return {
    decision,
    status: review ? "NEEDS_REVIEW" : "SUCCESS",
    confidence: 0.95,
    requiresHumanReview: review,
    warnings: [],
    decisionId: "dec_1"
  };
}

function decisions(
  qc: ClipQcDecision,
  fallback: ClipFallbackDecision = {
    action: "EDITORIAL_MOVE",
    rationale: "use approved source image"
  },
  review = false
): QcFallbackDecisionPort {
  return {
    async runClipQc() { return meta(qc, review); },
    async selectClipFallback() { return meta(fallback, review); }
  };
}

test("TRIM_PASS approves the candidate but preserves usable range instead of discarding it", async () => {
  const store = new MemoryStore();
  const pipeline = new QcFallbackPipeline(
    store,
    store,
    decisions({
      status: "TRIM_PASS",
      severity: "MINOR",
      confidence: 0.97,
      usableInMs: 500,
      usableOutMs: 4300,
      issues: ["unstable final 700ms"]
    }),
    clock,
    ids()
  );
  const result = await pipeline.runClipQc({
    projectId: "prj_1",
    clipId: "clp_1",
    candidateMediaId: "vid_1",
    format: "LONGFORM"
  });
  assert.equal(result.clip.clipStatus, "APPROVED");
  assert.equal(result.clip.approvedMediaId, "vid_1");
  assert.equal(result.qc.status, "TRIM_PASS");
  assert.equal(result.qc.usableInMs, 500);
  assert.equal(result.qc.usableOutMs, 4300);
  assert.equal(result.approval?.selectedMediaId, "vid_1");
});

test("invalid TRIM_PASS range is rejected before persistence", async () => {
  const store = new MemoryStore();
  const pipeline = new QcFallbackPipeline(
    store,
    store,
    decisions({
      status: "TRIM_PASS",
      severity: "MINOR",
      confidence: 0.9,
      usableInMs: 4200,
      usableOutMs: 6000,
      issues: []
    }),
    clock,
    ids()
  );
  await assert.rejects(
    () => pipeline.runClipQc({
      projectId: "prj_1",
      clipId: "clp_1",
      candidateMediaId: "vid_1",
      format: "LONGFORM"
    }),
    (error: unknown) =>
      error instanceof QcFallbackValidationError &&
      error.code === "TRIM_RANGE_INVALID"
  );
  assert.equal(store.qcs.length, 0);
});

test("REGENERATE QC can fall back to an editorial implementation without approving bad video", async () => {
  const store = new MemoryStore();
  const pipeline = new QcFallbackPipeline(
    store,
    store,
    decisions(
      {
        status: "REGENERATE",
        severity: "MAJOR",
        confidence: 0.92,
        issues: ["identity morphing"],
        regenerationReason: "identity drift"
      },
      {
        action: "EDITORIAL_MOVE",
        rationale: "use the approved still rather than unstable generated motion"
      }
    ),
    clock,
    ids()
  );
  const qcResult = await pipeline.runClipQc({
    projectId: "prj_1",
    clipId: "clp_1",
    candidateMediaId: "vid_1",
    format: "LONGFORM"
  });
  assert.equal(qcResult.clip.clipStatus, "REGENERATE_REQUIRED");
  assert.equal(qcResult.clip.approvedMediaId, undefined);

  const fallback = await pipeline.selectFallback({
    projectId: "prj_1",
    clipId: "clp_1",
    format: "LONGFORM"
  });
  assert.equal(fallback.fallback.applied, true);
  assert.equal(fallback.clip.clipMode, "EDITORIAL_MOVE");
  assert.equal(fallback.clip.providerExecutionRequired, false);
  assert.equal(fallback.clip.clipStatus, "READY");
  assert.equal(fallback.nextAction, "CONTINUE_EDITOR_BINDING");
  assert.equal(fallback.clip.approvedMediaId, undefined);
});

test("REGENERATE fallback rearms the existing provider path for a new WF-11 video job", async () => {
  const store = new MemoryStore();
  const pipeline = new QcFallbackPipeline(
    store,
    store,
    decisions(
      {
        status: "REGENERATE",
        severity: "MAJOR",
        confidence: 0.95,
        issues: ["camera overshoot"]
      },
      { action: "REGENERATE", rationale: "same design is valid; regenerate execution only" }
    ),
    clock,
    ids()
  );
  await pipeline.runClipQc({
    projectId: "prj_1",
    clipId: "clp_1",
    candidateMediaId: "vid_1",
    format: "LONGFORM"
  });
  const fallback = await pipeline.selectFallback({
    projectId: "prj_1",
    clipId: "clp_1",
    format: "LONGFORM"
  });
  assert.equal(fallback.clip.clipStatus, "READY");
  assert.equal(fallback.clip.providerExecutionRequired, true);
  assert.equal(fallback.clip.providerPreflightId, "preflight_1");
  assert.equal(fallback.nextAction, "CREATE_VIDEO_JOB");
});

test("reviewable PASS does not approve media until explicit human acceptance", async () => {
  const store = new MemoryStore();
  const pipeline = new QcFallbackPipeline(
    store,
    store,
    decisions({
      status: "PASS",
      severity: "MINOR",
      confidence: 0.7,
      issues: ["low confidence"]
    }, undefined, true),
    clock,
    ids()
  );
  const first = await pipeline.runClipQc({
    projectId: "prj_1",
    clipId: "clp_1",
    candidateMediaId: "vid_1",
    format: "LONGFORM"
  });
  assert.equal(first.clip.clipStatus, "NEEDS_REVIEW");
  assert.equal(first.clip.approvedMediaId, undefined);

  const approved = await pipeline.approveClipQc({
    projectId: "prj_1",
    clipId: "clp_1",
    approvedById: "user_1"
  });
  assert.equal(approved.clip.clipStatus, "APPROVED");
  assert.equal(approved.clip.approvedMediaId, "vid_1");
  assert.equal(approved.approval.approvalState, "HUMAN_APPROVED");
});

test("aggregate QC rollup exposes PASS, PARTIAL and BLOCKED readiness", () => {
  const ready = candidateClip();
  ready.providerExecutionRequired = false;
  ready.clipMode = "EDITORIAL_MOVE";
  ready.clipStatus = "READY";
  const pending = { ...candidateClip(), id: "clp_2", clipStatus: "REGENERATE_REQUIRED" as const };
  const blocked = { ...candidateClip(), id: "clp_3", clipStatus: "BLOCKED" as const };
  assert.equal(summarizeQc("SEQUENCE", "seq_1", [ready], []).status, "PASS");
  assert.equal(summarizeQc("CHAPTER", "ch_1", [ready, pending], []).status, "PARTIAL");
  assert.equal(summarizeQc("PROJECT", "prj_1", [ready, blocked], []).status, "BLOCKED");
});
