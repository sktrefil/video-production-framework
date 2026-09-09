import assert from "node:assert/strict";
import test from "node:test";
import type {
  ApprovalRecord,
  Chapter,
  FactRecord,
  ResearchSource,
  Scene,
  ScriptVersion,
  Sequence
} from "@vpf/domain";
import type {
  SceneDesignDecision,
  SequenceDesignDecision,
  StoryDecisionPort,
  StructureDesignDecision
} from "@vpf/production-system";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import {
  StoryGenerationService,
  StoryPipeline,
  StoryValidationError,
  analyzeScriptChangeImpact,
  type IdFactory,
  type StoryClock,
  type StoryGraph,
  type StoryImpactReport,
  type StoryRepository
} from "../src/index.js";

class MemoryRepository implements StoryRepository {
  sources: ResearchSource[] = [];
  facts: FactRecord[] = [];
  scripts: ScriptVersion[] = [];
  approvals: ApprovalRecord[] = [];
  graph: StoryGraph = { chapters: [], sequences: [], scenes: [] };
  events: WorkflowEvent[] = [];
  outbox: OutboxRecord[] = [];

  async addResearchSource(v: ResearchSource) { this.sources.push(v); }
  async addFact(v: FactRecord) { this.facts.push(v); }

  async getLatestFact(projectId: string, factId: string) {
    return [...this.facts]
      .filter(v => v.projectId === projectId && v.id === factId)
      .sort((a, b) => b.revision - a.revision)[0] ?? null;
  }

  async commitFactRevision(input: {
    previous: FactRecord;
    next: FactRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    const previous = this.facts.find(
      v => v.id === input.previous.id && v.revision === input.previous.revision
    );
    if (previous) Object.assign(previous, input.previous);
    this.facts.push(input.next);
    this.record(input.event, input.outbox);
  }

  async saveInitialScript(v: ScriptVersion) { this.scripts.push(v); }

  async getLatestScript(projectId: string, scriptId: string) {
    return [...this.scripts]
      .filter(v => v.projectId === projectId && v.id === scriptId)
      .sort((a, b) => b.revision - a.revision)[0] ?? null;
  }

  async listScripts(projectId: string) {
    return this.scripts.filter(v => v.projectId === projectId);
  }

  async commitScriptRevision(input: {
    previous: ScriptVersion;
    next: ScriptVersion;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    const previous = this.scripts.find(
      v => v.id === input.previous.id && v.revision === input.previous.revision
    );
    if (previous) Object.assign(previous, input.previous);
    this.scripts.push(input.next);
    this.record(input.event, input.outbox);
  }

  async getLatestApprovedFinalScript(projectId: string) {
    const approved = this.approvals
      .filter(a =>
        a.projectId === projectId &&
        a.targetType === "SCRIPT" &&
        a.approvalState === "HUMAN_APPROVED"
      )
      .sort((a, b) => b.targetRevision - a.targetRevision);
    for (const approval of approved) {
      const script = this.scripts.find(
        s =>
          s.projectId === projectId &&
          s.id === approval.targetId &&
          s.revision === approval.targetRevision &&
          s.kind === "FINAL" &&
          s.lifecycleStatus === "ACTIVE"
      );
      if (script) return script;
    }
    return null;
  }

  async getLatestApproval(
    projectId: string,
    targetType: ApprovalRecord["targetType"],
    targetId: string
  ) {
    return [...this.approvals]
      .filter(a =>
        a.projectId === projectId &&
        a.targetType === targetType &&
        a.targetId === targetId
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }

  async commitFinalScriptApproval(input: {
    approval: ApprovalRecord;
    impact: StoryImpactReport;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.approvals.push(input.approval);
    const staleChapters = new Set(input.impact.staleChapterIds);
    const staleSequences = new Set(input.impact.staleSequenceIds);
    const staleScenes = new Set(input.impact.staleSceneIds);
    this.graph.chapters = this.graph.chapters.map(v =>
      staleChapters.has(v.id) ? { ...v, stale: true, staleReason: "FINAL_SCRIPT_CHANGED" } : v
    );
    this.graph.sequences = this.graph.sequences.map(v =>
      staleSequences.has(v.id) ? { ...v, stale: true, staleReason: "FINAL_SCRIPT_CHANGED" } : v
    );
    this.graph.scenes = this.graph.scenes.map(v =>
      staleScenes.has(v.id) ? { ...v, stale: true, staleReason: "SCRIPT_SEGMENT_CHANGED" } : v
    );
    this.record(input.event, input.outbox);
  }

  async listFacts(projectId: string) {
    return this.facts.filter(v => v.projectId === projectId && v.lifecycleStatus === "ACTIVE");
  }

  async listScenes(projectId: string) {
    return this.graph.scenes.filter(v => v.projectId === projectId && v.lifecycleStatus === "ACTIVE");
  }

  async listActiveStory(projectId: string) {
    return {
      chapters: this.graph.chapters.filter(v => v.projectId === projectId && v.lifecycleStatus === "ACTIVE"),
      sequences: this.graph.sequences.filter(v => v.projectId === projectId && v.lifecycleStatus === "ACTIVE"),
      scenes: this.graph.scenes.filter(v => v.projectId === projectId && v.lifecycleStatus === "ACTIVE")
    };
  }

  async commitStoryGraph(input: {
    graph: StoryGraph;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.graph = input.graph;
    this.record(input.event, input.outbox);
  }

  async commitStructureApproval(input: {
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.approvals.push(input.approval);
    this.record(input.event, input.outbox);
  }

  async commitSceneApprovals(input: {
    previousScenes: Scene[];
    approvedScenes: Scene[];
    approvals: ApprovalRecord[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    const approvedById = new Map(input.approvedScenes.map(v => [v.id, v]));
    this.graph.scenes = this.graph.scenes.map(v => approvedById.get(v.id) ?? v);
    this.approvals.push(...input.approvals);
    this.record(input.event, input.outbox);
  }

  private record(event: WorkflowEvent, outbox: OutboxRecord) {
    this.events.push(event);
    this.outbox.push(outbox);
  }
}

const clock: StoryClock = { nowIso: () => "2026-09-09T06:00:00.000Z" };

function ids(): IdFactory {
  let n = 0;
  return { next: prefix => `${prefix}_${++n}` };
}

const decisions: StoryDecisionPort = {
  async designStructure(): Promise<StructureDesignDecision> {
    return {
      chapters: [{ key: "c1", displayNumber: 1, title: "1장" }]
    };
  },
  async designSequences(): Promise<SequenceDesignDecision> {
    return {
      sequences: [{
        key: "q1",
        chapterKey: "c1",
        displayNumber: 1,
        title: "첫 시퀀스",
        storyPurpose: "사건을 제시한다"
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
          stateIn: "사건 전",
          stateCurrent: "첫 사건",
          stateOut: "첫 사건 직후",
          primaryVisualIdea: "첫 장면",
          mustBeSeen: ["첫 사건"],
          canBeNarrated: [],
          canBeImplied: [],
          requiredIdentityAnchorIds: []
        },
        {
          key: "s2",
          sequenceKey: "q1",
          displayNumber: 2,
          scriptSegment: "둘째 장면.",
          stateIn: "첫 사건 직후",
          stateCurrent: "둘째 사건",
          stateOut: "사건 종료",
          primaryVisualIdea: "둘째 장면",
          mustBeSeen: ["둘째 사건"],
          canBeNarrated: [],
          canBeImplied: [],
          requiredIdentityAnchorIds: []
        }
      ]
    };
  }
};

test("FACT requires at least one source", async () => {
  const pipeline = new StoryPipeline(new MemoryRepository(), clock, ids());
  await assert.rejects(
    () => pipeline.addFact({
      projectId: "prj_1",
      statement: "근거가 필요한 사실",
      classification: "FACT"
    }),
    (error: unknown) =>
      error instanceof StoryValidationError &&
      error.code === "FACT_SOURCE_REQUIRED"
  );
});

test("fact approval and script revision preserve stable ids while incrementing revisions", async () => {
  const repository = new MemoryRepository();
  const pipeline = new StoryPipeline(repository, clock, ids());
  const source = await pipeline.addResearchSource({
    projectId: "prj_1",
    title: "사료",
    sourceType: "ARCHIVE"
  });
  const fact = await pipeline.addFact({
    projectId: "prj_1",
    statement: "검증된 사실",
    classification: "FACT",
    sourceIds: [source.id]
  });
  const approvedFact = await pipeline.approveFact("prj_1", fact.id);
  assert.equal(approvedFact.id, fact.id);
  assert.equal(approvedFact.revision, 2);
  assert.equal(approvedFact.status, "APPROVED");

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
  assert.equal(script2.id, script1.id);
  assert.equal(script2.revision, 2);
  assert.equal(repository.scripts[0]?.lifecycleStatus, "SUPERSEDED");
  assert.equal(repository.events.some(v => v.eventType === "SCRIPT_REVISION_CREATED"), true);
});

test("story generation is blocked until a FINAL script has human approval", async () => {
  const repository = new MemoryRepository();
  const pipeline = new StoryPipeline(repository, clock, ids());
  const generation = new StoryGenerationService(repository, decisions, clock, ids());
  await pipeline.createScript({
    projectId: "prj_1",
    body: "첫 장면. 둘째 장면.",
    kind: "FINAL"
  });

  await assert.rejects(
    () => generation.generate({ projectId: "prj_1", format: "LONGFORM" }),
    (error: unknown) =>
      error instanceof StoryValidationError &&
      error.code === "FINAL_SCRIPT_APPROVAL_REQUIRED"
  );
});

test("approved final script generates validated chapter sequence scene graph", async () => {
  const repository = new MemoryRepository();
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
    scriptId: script.id,
    approvedById: "user_1"
  });

  const graph = await generation.generate({
    projectId: "prj_1",
    format: "LONGFORM"
  });

  assert.equal(graph.chapters.length, 1);
  assert.equal(graph.sequences.length, 1);
  assert.equal(graph.scenes.length, 2);
  assert.equal(graph.scenes[0]?.scriptRef.startChar, 0);
  assert.equal(graph.scenes[0]?.sceneStatus, "DESIGNED");
  assert.equal(graph.scenes[1]?.stateIn, graph.scenes[0]?.stateOut);
  assert.equal(repository.events.some(v => v.eventType === "STORY_STRUCTURE_COMMITTED"), true);

  await generation.approveStructure({ projectId: "prj_1", approvedById: "user_1" });
  const approved = await generation.approveScenes({
    projectId: "prj_1",
    sceneIds: graph.scenes.map(v => v.id),
    approvedById: "user_1"
  });
  assert.equal(approved.every(v => v.sceneStatus === "APPROVED"), true);
});

test("script change impact preserves unchanged scene candidates but marks structure stale", () => {
  const scene = (id: string, segment: string): Scene => ({
    id,
    projectId: "prj_1",
    sequenceId: "seq_1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
    displayNumber: id === "sc_1" ? 1 : 2,
    scriptSegment: segment,
    scriptRef: { scriptId: "script_1", scriptRevision: 1 },
    stateIn: "in",
    stateCurrent: "current",
    stateOut: "out",
    primaryVisualIdea: "visual",
    mustBeSeen: [],
    canBeNarrated: [],
    canBeImplied: [],
    requiredIdentityAnchorIds: [],
    sceneStatus: "APPROVED",
    stale: false
  });

  const graph: StoryGraph = {
    chapters: [{
      id: "ch_1",
      projectId: "prj_1",
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: clock.nowIso(),
      updatedAt: clock.nowIso(),
      displayNumber: 1,
      title: "1장",
      sourceScriptId: "script_1",
      sourceScriptRevision: 1,
      sequenceIds: ["seq_1"],
      stale: false
    }],
    sequences: [{
      id: "seq_1",
      projectId: "prj_1",
      chapterId: "ch_1",
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: clock.nowIso(),
      updatedAt: clock.nowIso(),
      displayNumber: 1,
      title: "시퀀스",
      storyPurpose: "목적",
      sourceScriptId: "script_1",
      sourceScriptRevision: 1,
      sceneIds: ["sc_1", "sc_2"],
      stale: false
    }],
    scenes: [scene("sc_1", "첫 장면."), scene("sc_2", "둘째 장면.")]
  };
  const revised: ScriptVersion = {
    id: "script_1",
    projectId: "prj_1",
    revision: 2,
    lifecycleStatus: "ACTIVE",
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
    kind: "FINAL",
    body: "첫 장면. 완전히 바뀐 둘째 장면.",
    supersedesRevision: 1
  };

  const impact = analyzeScriptChangeImpact(graph, revised);
  assert.equal(impact.requiresStructureReview, true);
  assert.deepEqual(impact.preservedSceneIds, ["sc_1"]);
  assert.deepEqual(impact.staleSceneIds, ["sc_2"]);
  assert.deepEqual(impact.staleSequenceIds, ["seq_1"]);
});
