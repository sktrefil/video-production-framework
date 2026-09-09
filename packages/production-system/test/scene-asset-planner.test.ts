import assert from "node:assert/strict";
import test from "node:test";
import type {
  IdentityAnchor,
  MediaArtifact,
  ProductionAsset,
  ProjectStyle,
  Scene
} from "@vpf/domain";
import {
  ProductionSceneAssetPlanner,
  type ProductionDecisionEnvelope,
  type ProductionSystemAdapter,
  type ProductionTaskRequest
} from "../src/index.js";

const now = "2026-09-09T10:00:00.000Z";

const scene: Scene = {
  id: "sc_1",
  projectId: "prj_1",
  sequenceId: "seq_1",
  revision: 2,
  lifecycleStatus: "ACTIVE",
  createdAt: now,
  updatedAt: now,
  displayNumber: 1,
  scriptSegment: "장면.",
  scriptRef: { scriptId: "script_1", scriptRevision: 1 },
  stateIn: "A",
  stateCurrent: "B",
  stateOut: "C",
  primaryVisualIdea: "인물 장면",
  mustBeSeen: [],
  canBeNarrated: [],
  canBeImplied: [],
  requiredIdentityAnchorIds: ["anc_1"],
  sceneStatus: "APPROVED",
  stale: false
};

const style: ProjectStyle = {
  id: "sty_1",
  projectId: "prj_1",
  revision: 1,
  lifecycleStatus: "ACTIVE",
  createdAt: now,
  updatedAt: now,
  channelVisualBibleVersion: "2.0.0",
  sourceScriptId: "script_1",
  sourceScriptRevision: 1,
  eraRegion: "조선",
  visualApproach: "역사 재현",
  realismLevel: "사실적",
  colorLanguage: "저채도",
  lightingLanguage: "자연광",
  materialLanguage: "목재",
  environmentLanguage: "고증 공간",
  characterRenderingPrinciple: "일관성",
  cameraCompositionTendency: "관찰형",
  moodRange: ["절제"],
  factualConstraints: [],
  avoidances: [],
  stale: false
};

const anchor: IdentityAnchor = {
  id: "anc_1",
  projectId: "prj_1",
  revision: 1,
  lifecycleStatus: "ACTIVE",
  createdAt: now,
  updatedAt: now,
  anchorType: "CHARACTER",
  name: "인물",
  rationale: "반복 등장",
  continuityReason: "RECURRING",
  productionPriority: "CRITICAL",
  specification: { locked: ["얼굴"], contextual: [], temporary: [] },
  requiredBySceneIds: ["sc_1", "sc_2"],
  referenceMediaIds: [],
  sourceProjectStyleId: style.id,
  sourceProjectStyleRevision: style.revision,
  sourceChannelVisualBibleVersion: "2.0.0",
  stale: false
};

const asset: ProductionAsset = {
  id: "ast_1",
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
  owner: { type: "SCENE", id: scene.id },
  stateRef: {
    entityType: "SCENE",
    entityId: scene.id,
    stateField: "STATE_CURRENT",
    entityRevision: scene.revision
  },
  design: {
    visualGoal: "장면 시각화",
    composition: "중경",
    continuityRequirements: [],
    identityAnchorIds: [anchor.id],
    factualConstraints: [],
    avoidances: []
  },
  candidateMediaIds: [],
  assetStatus: "DESIGNED",
  sourceSceneRevision: scene.revision,
  sourceProjectStyleId: style.id,
  sourceProjectStyleRevision: style.revision,
  sourceIdentityAnchorRevisions: { [anchor.id]: anchor.revision },
  formatProfileVersion: "shorts-9x16-v1"
};

const media: MediaArtifact = {
  id: "med_1",
  projectId: "prj_1",
  revision: 1,
  lifecycleStatus: "ACTIVE",
  createdAt: now,
  updatedAt: now,
  mediaType: "IMAGE",
  relativePath: "06_generated_assets/images/med_1.png",
  mimeType: "image/png",
  checksum: "abc",
  mediaStatus: "AVAILABLE"
};

test("scene asset planner uses ASSET_PLAN, IMAGE_ASSET_DESIGN, IMAGE_PROMPT and IMAGE_QC", async () => {
  const seen: string[] = [];
  const adapter: ProductionSystemAdapter = {
    async execute<TDecision, TContext>(
      request: ProductionTaskRequest<TContext>
    ): Promise<ProductionDecisionEnvelope<TDecision>> {
      seen.push(request.taskType);
      let decision: unknown;
      if (request.taskType === "ASSET_PLAN") {
        decision = {
          assetClass: "PRIMARY_SCENE",
          assetRole: "STANDARD",
          productionPriority: "CRITICAL",
          sourceStrategy: "GENERATE",
          stateField: "STATE_CURRENT",
          rationale: "기본 장면 이미지"
        };
      } else if (request.taskType === "IMAGE_ASSET_DESIGN") {
        decision = {
          visualGoal: "장면 시각화",
          composition: "중경",
          continuityRequirements: [],
          identityAnchorIds: ["anc_1"],
          factualConstraints: [],
          avoidances: []
        };
      } else if (request.taskType === "IMAGE_PROMPT") {
        decision = { prompt: "provider prompt", negativePrompt: "modern" };
      } else {
        decision = {
          qcStatus: "PASS",
          severity: "MINOR",
          confidence: 0.98
        };
      }
      return {
        decisionId: "dec_1",
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
  const planner = new ProductionSceneAssetPlanner(adapter, {
    nextTaskId: () => `task_${++n}`
  });
  const base = {
    projectId: "prj_1",
    format: "SHORTFORM" as const,
    scene,
    projectStyle: style,
    identityAnchors: [anchor],
    channelVisualBible: {
      version: "2.0.0",
      resourceId: "channel",
      contentHash: "hash",
      payload: {}
    },
    formatProfile: {
      version: "shorts-9x16-v1",
      resourceId: "shorts",
      contentHash: "hash2",
      payload: {}
    }
  };

  const plan = await planner.planAsset(base);
  await planner.designImageAsset({ ...base, assetPlan: plan });
  await planner.compileImagePrompt({ ...base, asset });
  await planner.runImageQc({ ...base, asset, candidate: media });

  assert.deepEqual(seen, [
    "ASSET_PLAN",
    "IMAGE_ASSET_DESIGN",
    "IMAGE_PROMPT",
    "IMAGE_QC"
  ]);
});
