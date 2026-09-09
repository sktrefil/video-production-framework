import assert from "node:assert/strict";
import test from "node:test";
import type {
  SceneDesignDecision,
  SequenceDesignDecision,
  StoryDecisionPort,
  StructureDesignDecision
} from "@vpf/production-system";
import {
  StoryGenerationService,
  StoryPipeline,
  type IdFactory,
  type StoryClock
} from "@vpf/story";
import { SqliteStoryRepository } from "../src/index.js";

const clock: StoryClock = { nowIso: () => "2026-09-09T07:00:00.000Z" };

function ids(): IdFactory {
  let n = 0;
  return { next: prefix => `${prefix}_${++n}` };
}

const decisions: StoryDecisionPort = {
  async designStructure(): Promise<StructureDesignDecision> {
    return { chapters: [{ key: "c1", displayNumber: 1, title: "1장" }] };
  },
  async designSequences(): Promise<SequenceDesignDecision> {
    return {
      sequences: [{
        key: "q1",
        chapterKey: "c1",
        displayNumber: 1,
        title: "시퀀스 1",
        storyPurpose: "사건의 진행"
      }]
    };
  },
  async designScenes(): Promise<SceneDesignDecision> {
    return {
      scenes: [
        {
          key: "s1",
          sequenceKey: "q1",
          displayNumber: 1,
          scriptSegment: "첫 장면.",
          stateIn: "A",
          stateCurrent: "B",
          stateOut: "C",
          primaryVisualIdea: "첫 장면",
          mustBeSeen: [],
          canBeNarrated: [],
          canBeImplied: [],
          requiredIdentityAnchorIds: []
        },
        {
          key: "s2",
          sequenceKey: "q1",
          displayNumber: 2,
          scriptSegment: "둘째 장면.",
          stateIn: "C",
          stateCurrent: "D",
          stateOut: "E",
          primaryVisualIdea: "둘째 장면",
          mustBeSeen: [],
          canBeNarrated: [],
          canBeImplied: [],
          requiredIdentityAnchorIds: []
        }
      ]
    };
  }
};

test("sqlite preserves stable ids across revisions and durable approval events", async () => {
  const repository = new SqliteStoryRepository(":memory:");
  try {
    const idFactory = ids();
    const pipeline = new StoryPipeline(repository, clock, idFactory);

    const source = await pipeline.addResearchSource({
      projectId: "prj_1",
      title: "사료",
      sourceType: "ARCHIVE"
    });
    const fact1 = await pipeline.addFact({
      projectId: "prj_1",
      statement: "검증 사실",
      classification: "FACT",
      sourceIds: [source.id]
    });
    const fact2 = await pipeline.approveFact("prj_1", fact1.id);

    assert.equal(fact1.id, fact2.id);
    assert.equal(fact2.revision, 2);
    const factRows = repository.db.prepare(
      "SELECT revision, lifecycle_status FROM facts WHERE id = ? ORDER BY revision"
    ).all(fact1.id) as Array<{revision: number; lifecycle_status: string}>;
    assert.deepEqual(factRows, [
      { revision: 1, lifecycle_status: "SUPERSEDED" },
      { revision: 2, lifecycle_status: "ACTIVE" }
    ]);

    const script1 = await pipeline.createScript({
      projectId: "prj_1",
      body: "첫 장면.",
      kind: "DRAFT"
    });
    const script2 = await pipeline.reviseScript({
      projectId: "prj_1",
      scriptId: script1.id,
      body: "첫 장면. 둘째 장면.",
      kind: "FINAL"
    });
    await pipeline.approveFinalScript({
      projectId: "prj_1",
      scriptId: script2.id,
      approvedById: "user_1"
    });

    const approved = await repository.getLatestApprovedFinalScript("prj_1");
    assert.equal(approved?.id, script1.id);
    assert.equal(approved?.revision, 2);

    const scriptRows = repository.db.prepare(
      "SELECT revision, lifecycle_status FROM scripts WHERE id = ? ORDER BY revision"
    ).all(script1.id) as Array<{revision: number; lifecycle_status: string}>;
    assert.deepEqual(scriptRows, [
      { revision: 1, lifecycle_status: "SUPERSEDED" },
      { revision: 2, lifecycle_status: "ACTIVE" }
    ]);

    const approvalCount = repository.db.prepare(
      "SELECT COUNT(*) AS count FROM approval_records WHERE target_type = 'SCRIPT'"
    ).get() as {count: number};
    const outboxCount = repository.db.prepare(
      "SELECT COUNT(*) AS count FROM event_outbox WHERE status = 'PENDING'"
    ).get() as {count: number};
    assert.equal(approvalCount.count, 1);
    assert.ok(outboxCount.count >= 3);
  } finally {
    repository.close();
  }
});

test("sqlite commits generated graph and scene approvals without destroying history", async () => {
  const repository = new SqliteStoryRepository(":memory:");
  try {
    const idFactory = ids();
    const pipeline = new StoryPipeline(repository, clock, idFactory);
    const generation = new StoryGenerationService(repository, decisions, clock, idFactory);

    const script = await pipeline.createScript({
      projectId: "prj_1",
      body: "첫 장면. 둘째 장면.",
      kind: "FINAL"
    });
    await pipeline.approveFinalScript({
      projectId: "prj_1",
      scriptId: script.id
    });
    const graph = await generation.generate({
      projectId: "prj_1",
      format: "LONGFORM"
    });
    assert.equal(graph.scenes.length, 2);

    await generation.approveStructure({ projectId: "prj_1" });
    await generation.approveScenes({
      projectId: "prj_1",
      sceneIds: graph.scenes.map(v => v.id)
    });

    const active = await repository.listActiveStory("prj_1");
    assert.equal(active.scenes.every(v => v.sceneStatus === "APPROVED"), true);

    const revisions = repository.db.prepare(
      "SELECT id, COUNT(*) AS count FROM scenes GROUP BY id ORDER BY id"
    ).all() as Array<{id: string; count: number}>;
    assert.equal(revisions.every(v => v.count === 2), true);

    const sceneApprovals = repository.db.prepare(
      "SELECT COUNT(*) AS count FROM approval_records WHERE target_type = 'SCENE'"
    ).get() as {count: number};
    assert.equal(sceneApprovals.count, 2);

    const committedEvent = repository.db.prepare(
      "SELECT COUNT(*) AS count FROM workflow_events WHERE event_type = 'STORY_STRUCTURE_COMMITTED'"
    ).get() as {count: number};
    assert.equal(committedEvent.count, 1);
  } finally {
    repository.close();
  }
});
