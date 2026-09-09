import assert from "node:assert/strict";
import test from "node:test";
import type { ScriptVersion } from "@vpf/domain";
import {
  ProductionStoryPlanner,
  type ProductionDecisionEnvelope,
  type ProductionSystemAdapter,
  type ProductionTaskRequest
} from "../src/index.js";

const script: ScriptVersion = {
  id: "script_1",
  projectId: "prj_1",
  revision: 2,
  lifecycleStatus: "ACTIVE",
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
  kind: "FINAL",
  body: "첫 장면. 둘째 장면.",
  supersedesRevision: 1
};

test("ProductionStoryPlanner uses canonical v2 story task types", async () => {
  const seen: string[] = [];
  const adapter: ProductionSystemAdapter = {
    async execute<TDecision, TContext>(
      request: ProductionTaskRequest<TContext>
    ): Promise<ProductionDecisionEnvelope<TDecision>> {
      seen.push(request.taskType);
      const decision =
        request.taskType === "STRUCTURE_DESIGN"
          ? { chapters: [{ key: "c1", displayNumber: 1, title: "1장" }] }
          : request.taskType === "SEQUENCE_DESIGN"
            ? {
                sequences: [{
                  key: "q1",
                  chapterKey: "c1",
                  displayNumber: 1,
                  title: "시퀀스",
                  storyPurpose: "사건 제시"
                }]
              }
            : {
                scenes: [{
                  key: "s1",
                  sequenceKey: "q1",
                  displayNumber: 1,
                  scriptSegment: "첫 장면.",
                  stateIn: "시작",
                  stateCurrent: "현재",
                  stateOut: "종료",
                  primaryVisualIdea: "첫 장면",
                  mustBeSeen: [],
                  canBeNarrated: [],
                  canBeImplied: [],
                  requiredIdentityAnchorIds: []
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
  const planner = new ProductionStoryPlanner(adapter, {
    nextTaskId: () => `ptask_${++n}`
  });
  const base = {
    projectId: "prj_1",
    format: "LONGFORM" as const,
    script,
    facts: []
  };
  const structure = await planner.designStructure(base);
  const sequences = await planner.designSequences({ ...base, structure });
  await planner.designScenes({ ...base, structure, sequences });

  assert.deepEqual(seen, [
    "STRUCTURE_DESIGN",
    "SEQUENCE_DESIGN",
    "SCENE_DESIGN"
  ]);
  assert.equal(seen.includes("HANDOFF_QC"), false);
});
