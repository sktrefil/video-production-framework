import assert from "node:assert/strict";
import test from "node:test";
import type {
  MediaArtifact,
  ProductionAsset,
  ProductionLink,
  Scene
} from "@vpf/domain";
import {
  ProductionLinkPlanner,
  type ProductionDecisionEnvelope,
  type ProductionSystemAdapter,
  type ProductionTaskRequest
} from "../src/index.js";

const now = "2026-09-09T13:00:00.000Z";

const scene = (id: string, stateIn: string, stateOut: string): Scene => ({
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
});

const fromScene = scene("sc_1", "A", "B");
const toScene = scene("sc_2", "B", "C");

const link: ProductionLink = {
  id: "lnk_1",
  projectId: "prj_1",
  revision: 1,
  lifecycleStatus: "ACTIVE",
  createdAt: now,
  updatedAt: now,
  stale: false,
  fromSceneId: fromScene.id,
  fromSceneRevision: fromScene.revision,
  fromStateRef: {
    entityType: "SCENE",
    entityId: fromScene.id,
    entityRevision: fromScene.revision,
    stateField: "STATE_OUT"
  },
  toSceneId: toScene.id,
  toSceneRevision: toScene.revision,
  toStateRef: {
    entityType: "SCENE",
    entityId: toScene.id,
    entityRevision: toScene.revision,
    stateField: "STATE_IN"
  },
  linkScope: "SEQUENCE_LOCAL",
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

const asset = (id: string, sceneId: string, mediaId: string): ProductionAsset => ({
  id,
  projectId: "prj_1",
  revision: 3,
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
    visualGoal: "visual",
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

const media = (id: string): MediaArtifact => ({
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
});

test("ProductionLinkPlanner uses PRE_LINK and QC + LINK + HANDOFF_QC", async () => {
  const seen: Array<{
    taskType: string;
    targetType: string;
    qcType?: unknown;
  }> = [];

  const adapter: ProductionSystemAdapter = {
    async execute<TDecision, TContext>(
      request: ProductionTaskRequest<TContext>
    ): Promise<ProductionDecisionEnvelope<TDecision>> {
      const context = request.context as { qcType?: unknown };
      seen.push({
        taskType: request.taskType,
        targetType: request.target.type,
        ...(context.qcType === undefined ? {} : { qcType: context.qcType })
      });

      const decision = request.taskType === "PRE_LINK"
        ? {
            preLinkRequired: true,
            continuityLevel: "STRICT",
            stateChange: "B to B",
            handoffIntent: "Preserve the same visual state",
            handoffAnchor: ["subject direction"],
            handoffChannels: ["VISUAL"],
            transitionIntent: "DIRECT"
          }
        : {
            qcStatus: "PASS",
            severity: "MINOR",
            confidence: 0.99,
            preLinkMatch: "MATCH",
            continuityUsable: true
          };

      return {
        decisionId: request.taskType === "PRE_LINK" ? "dec_pre" : "dec_qc",
        taskId: request.taskId,
        taskType: request.taskType,
        status: "SUCCESS",
        confidence: 0.99,
        decision: decision as TDecision,
        decisionSummary: "ok",
        requiresHumanReview: false,
        warnings: []
      };
    }
  };

  let n = 0;
  const planner = new ProductionLinkPlanner(adapter, {
    nextTaskId: () => `task_${++n}`
  });

  await planner.designPreLink({
    projectId: "prj_1",
    format: "LONGFORM",
    link,
    fromScene,
    toScene
  });

  const fromAsset = asset("ast_1", fromScene.id, "med_1");
  const toAsset = asset("ast_2", toScene.id, "med_2");
  await planner.runHandoffQc({
    projectId: "prj_1",
    format: "LONGFORM",
    link,
    fromScene,
    toScene,
    qcType: "HANDOFF_QC",
    fromAsset,
    fromMedia: media("med_1"),
    toAsset,
    toMedia: media("med_2")
  });

  assert.deepEqual(seen, [
    { taskType: "PRE_LINK", targetType: "LINK" },
    { taskType: "QC", targetType: "LINK", qcType: "HANDOFF_QC" }
  ]);
});
