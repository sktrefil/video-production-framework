import assert from "node:assert/strict";
import test from "node:test";
import type {
  ProjectStyle,
  Scene,
  ScriptVersion
} from "@vpf/domain";
import {
  ProductionVisualIdentityPlanner,
  type ProductionDecisionEnvelope,
  type ProductionSystemAdapter,
  type ProductionTaskRequest
} from "../src/index.js";

const script: ScriptVersion = {
  id: "script_1",
  projectId: "prj_1",
  revision: 1,
  lifecycleStatus: "ACTIVE",
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
  kind: "FINAL",
  body: "장면 하나. 장면 둘."
};

const scene = (id: string, displayNumber: number): Scene => ({
  id,
  projectId: "prj_1",
  sequenceId: "seq_1",
  revision: 1,
  lifecycleStatus: "ACTIVE",
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
  displayNumber,
  scriptSegment: displayNumber === 1 ? "장면 하나." : "장면 둘.",
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
});

test("visual identity planner uses PROJECT_STYLE and ANCHOR_PLAN", async () => {
  const seen: string[] = [];
  const adapter: ProductionSystemAdapter = {
    async execute<TDecision, TContext>(
      request: ProductionTaskRequest<TContext>
    ): Promise<ProductionDecisionEnvelope<TDecision>> {
      seen.push(request.taskType);
      const decision = request.taskType === "PROJECT_STYLE"
        ? {
            eraRegion: "조선 후기",
            visualApproach: "역사 다큐 재현",
            realismLevel: "절제된 사실적 재현",
            colorLanguage: "저채도",
            lightingLanguage: "자연광",
            materialLanguage: "목재와 한지",
            environmentLanguage: "시대 고증 공간",
            characterRenderingPrinciple: "신분과 연령 유지",
            cameraCompositionTendency: "관찰형",
            moodRange: ["긴장"],
            factualConstraints: [],
            avoidances: []
          }
        : {
            anchors: [{
              key: "a1",
              anchorType: "CHARACTER",
              name: "주요 인물",
              rationale: "반복 등장",
              continuityReason: "RECURRING",
              productionPriority: "CRITICAL",
              requiredBySceneIds: ["sc_1", "sc_2"],
              specification: {
                locked: ["얼굴과 연령"],
                contextual: ["표정"],
                temporary: []
              }
            }]
          };
      return {
        decisionId: "dec_1",
        taskId: request.taskId,
        taskType: request.taskType,
        status: "SUCCESS",
        confidence: 0.95,
        decision: decision as TDecision,
        decisionSummary: "ok",
        requiresHumanReview: false,
        warnings: []
      };
    }
  };

  let n = 0;
  const planner = new ProductionVisualIdentityPlanner(adapter, {
    nextTaskId: () => `task_${++n}`
  });
  const base = {
    projectId: "prj_1",
    format: "LONGFORM" as const,
    script,
    facts: [],
    scenes: [scene("sc_1", 1), scene("sc_2", 2)],
    channelVisualBible: {
      version: "2.0.0",
      resourceId: "channel-default",
      contentHash: "hash",
      payload: {}
    }
  };
  const styleDecision = await planner.designProjectStyle(base);
  const projectStyle: ProjectStyle = {
    id: "sty_1",
    projectId: "prj_1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: script.createdAt,
    updatedAt: script.updatedAt,
    channelVisualBibleVersion: "2.0.0",
    sourceScriptId: script.id,
    sourceScriptRevision: script.revision,
    ...styleDecision,
    stale: false
  };
  await planner.planIdentityAnchors({ ...base, projectStyle });

  assert.deepEqual(seen, ["PROJECT_STYLE", "ANCHOR_PLAN"]);
});
