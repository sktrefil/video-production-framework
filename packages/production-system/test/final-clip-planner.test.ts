import assert from "node:assert/strict";
import test from "node:test";
import type {
  MediaArtifact,
  ProductionAsset,
  ProductionClip,
  ProductionLink,
  Scene
} from "@vpf/domain";
import {
  ProductionFinalClipPlanner,
  type ProductionDecisionEnvelope,
  type ProductionSystemAdapter,
  type ProductionTaskRequest
} from "../src/index.js";

const now = "2026-09-09T15:00:00.000Z";

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

const fromScene = scene("sc_1");
const toScene = scene("sc_2");

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

const asset = (
  id: string,
  sceneId: string,
  mediaId: string
): ProductionAsset => ({
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
  fromSceneId: fromScene.id,
  fromSceneRevision: 1,
  fromStateRef: {
    entityType: "SCENE",
    entityId: fromScene.id,
    entityRevision: 1,
    stateField: "STATE_OUT"
  },
  toSceneId: toScene.id,
  toSceneRevision: 1,
  toStateRef: {
    entityType: "SCENE",
    entityId: toScene.id,
    entityRevision: 1,
    stateField: "STATE_IN"
  },
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
  fromAssetRevision: 3,
  fromMediaId: "med_1",
  toAssetId: "ast_2",
  toAssetRevision: 3,
  toMediaId: "med_2",
  handoffQcId: "qc_1",
  handoffUsable: true,
  preLinkMatch: "MATCH",
  linkStatus: "HANDOFF_PASS"
};

const clip: ProductionClip = {
  id: "clp_1",
  projectId: "prj_1",
  revision: 1,
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
  startAssetRevision: 3,
  startMediaId: "med_1",
  endAssetId: "ast_2",
  endAssetRevision: 3,
  endMediaId: "med_2",
  transitionMethod: "DIRECT",
  cameraMove: "LOW",
  subjectMotion: "LOW",
  environmentMotion: "LOW",
  durationMs: 5000,
  providerExecutionRequired: true,
  finalDesignApprovalId: "apr_clip",
  candidateMediaIds: [],
  clipStatus: "DESIGNED"
};

test("ProductionFinalClipPlanner uses canonical task/target mapping", async () => {
  const seen: Array<{ taskType: string; targetType: string }> = [];

  const adapter: ProductionSystemAdapter = {
    async execute<TDecision, TContext>(
      request: ProductionTaskRequest<TContext>
    ): Promise<ProductionDecisionEnvelope<TDecision>> {
      seen.push({
        taskType: request.taskType,
        targetType: request.target.type
      });

      let decision: unknown;
      if (request.taskType === "FINAL_CLIP_DESIGN") {
        decision = {
          implementationType: "CLIP",
          clipMode: "DIRECT_START_END_I2V",
          transitionMethod: "DIRECT",
          durationMs: 5000,
          cameraMove: "LOW",
          subjectMotion: "LOW",
          environmentMotion: "LOW",
          rationale: "direct endpoint transition",
          additionalAssetRequired: false
        };
      } else if (request.taskType === "PROVIDER_PRE_QC") {
        decision = {
          status: "PASS",
          safetySafe: true,
          capabilityCompatible: true,
          requiresAlternativeRepresentation: false,
          issueCodes: []
        };
      } else {
        decision = {
          prompt: "provider execution prompt",
          negativePrompt: "modern objects"
        };
      }

      return {
        decisionId: `dec_${request.taskType}`,
        taskId: request.taskId,
        taskType: request.taskType,
        status: "SUCCESS",
        confidence: 0.98,
        decision: decision as TDecision,
        decisionSummary: "ok",
        requiresHumanReview: false,
        warnings: []
      };
    }
  };

  let n = 0;
  const planner = new ProductionFinalClipPlanner(adapter, {
    nextTaskId: () => `task_${++n}`
  });

  const base = {
    projectId: "prj_1",
    format: "LONGFORM" as const,
    link,
    fromScene,
    toScene,
    fromAsset: asset("ast_1", "sc_1", "med_1"),
    fromMedia: media("med_1"),
    toAsset: asset("ast_2", "sc_2", "med_2"),
    toMedia: media("med_2")
  };

  await planner.designFinalClip(base);
  await planner.runProviderPreQc({
    ...base,
    clip,
    provider: "GOOGLE_FLOW",
    providerProfileVersion: "flow-v1"
  });
  await planner.compileVideoPrompt({
    ...base,
    clip,
    provider: "GOOGLE_FLOW",
    providerProfileVersion: "flow-v1"
  });

  assert.deepEqual(seen, [
    { taskType: "FINAL_CLIP_DESIGN", targetType: "LINK" },
    { taskType: "PROVIDER_PRE_QC", targetType: "CLIP" },
    { taskType: "VIDEO_PROMPT", targetType: "CLIP" }
  ]);
});
