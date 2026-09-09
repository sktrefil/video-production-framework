import assert from "node:assert/strict";
import test from "node:test";
import type {
  ClipQcRecord,
  MediaArtifact,
  ProductionAsset,
  ProductionClip,
  ProductionLink,
  Scene
} from "@vpf/domain";
import {
  ProductionQcFallbackPlanner,
  type ProductionDecisionEnvelope,
  type ProductionSystemAdapter,
  type ProductionTaskRequest
} from "../src/index.js";

const now = "2026-09-09T17:00:00.000Z";

const scene = (id: string): Scene => ({
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
});

const media = (id: string, type: "IMAGE" | "VIDEO"): MediaArtifact => ({
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
});

const asset = (id: string, sceneId: string, mediaId: string): ProductionAsset => ({
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
});

const link: ProductionLink = {
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

const clip: ProductionClip = {
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

const qc: ClipQcRecord = {
  id: "qc_1",
  projectId: "prj_1",
  revision: 1,
  lifecycleStatus: "ACTIVE",
  createdAt: now,
  updatedAt: now,
  clipId: clip.id,
  clipRevision: clip.revision,
  candidateMediaId: "vid_1",
  status: "REGENERATE",
  severity: "MAJOR",
  confidence: 0.9,
  issues: ["endpoint mismatch"],
  decisionId: "dec_qc"
};

test("ProductionQcFallbackPlanner maps CLIP_QC and fallback selection canonically", async () => {
  const seen: Array<{ taskType: string; targetType: string }> = [];
  const adapter: ProductionSystemAdapter = {
    async execute<TDecision, TContext>(
      request: ProductionTaskRequest<TContext>
    ): Promise<ProductionDecisionEnvelope<TDecision>> {
      seen.push({ taskType: request.taskType, targetType: request.target.type });
      const decision = request.taskType === "CLIP_QC"
        ? {
            status: "TRIM_PASS",
            severity: "MINOR",
            confidence: 0.96,
            usableInMs: 400,
            usableOutMs: 4200,
            issues: ["unstable tail"]
          }
        : {
            action: "EDITORIAL_MOVE",
            rationale: "preserve approved still and avoid unstable morphing"
          };
      return {
        decisionId: `dec_${request.taskType}`,
        taskId: request.taskId,
        taskType: request.taskType,
        status: "SUCCESS",
        confidence: 0.96,
        decision: decision as TDecision,
        decisionSummary: "ok",
        requiresHumanReview: false,
        warnings: []
      };
    }
  };
  let n = 0;
  const planner = new ProductionQcFallbackPlanner(adapter, {
    nextTaskId: () => `task_${++n}`
  });
  const base = {
    projectId: "prj_1",
    format: "LONGFORM" as const,
    link,
    fromScene: scene("sc_1"),
    toScene: scene("sc_2"),
    fromAsset: asset("ast_1", "sc_1", "med_1"),
    fromMedia: media("med_1", "IMAGE"),
    toAsset: asset("ast_2", "sc_2", "med_2"),
    toMedia: media("med_2", "IMAGE")
  };
  const candidate = media("vid_1", "VIDEO");
  await planner.runClipQc({ ...base, clip, candidate });
  await planner.selectClipFallback({ ...base, clip, candidate, qc });
  assert.deepEqual(seen, [
    { taskType: "CLIP_QC", targetType: "CLIP" },
    { taskType: "EXCEPTION_REVIEW", targetType: "CLIP" }
  ]);
});
