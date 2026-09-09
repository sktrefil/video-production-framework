import assert from "node:assert/strict";
import test from "node:test";
import type {
  Chapter, FactRecord, ResearchSource, Scene, ScriptVersion, Sequence
} from "@vpf/domain";
import {
  StoryPipeline, StoryValidationError, type IdFactory, type StoryClock, type StoryRepository
} from "../src/index.js";

class MemoryRepository implements StoryRepository {
  sources: ResearchSource[] = [];
  facts: FactRecord[] = [];
  scripts: ScriptVersion[] = [];
  chapters: Chapter[] = [];
  sequences: Sequence[] = [];
  scenes: Scene[] = [];
  async addResearchSource(v: ResearchSource) { this.sources.push(v); }
  async addFact(v: FactRecord) { this.facts.push(v); }
  async saveScript(v: ScriptVersion) { this.scripts.push(v); }
  async saveChapter(v: Chapter) { this.chapters.push(v); }
  async saveSequence(v: Sequence) { this.sequences.push(v); }
  async saveScene(v: Scene) { this.scenes.push(v); }
  async listFacts(projectId: string) { return this.facts.filter(v => v.projectId === projectId); }
  async listScenes(projectId: string) { return this.scenes.filter(v => v.projectId === projectId); }
}

const clock: StoryClock = { nowIso: () => "2026-09-09T06:00:00.000Z" };
let n = 0;
const ids: IdFactory = { next: prefix => `${prefix}_${++n}` };

test("FACT requires at least one source", async () => {
  const pipeline = new StoryPipeline(new MemoryRepository(), clock, ids);
  await assert.rejects(
    () => pipeline.addFact({
      projectId: "prj_1",
      statement: "Supported historical statement",
      classification: "FACT"
    }),
    (error: unknown) =>
      error instanceof StoryValidationError && error.code === "FACT_SOURCE_REQUIRED"
  );
});

test("research source can be reused by a FACT", async () => {
  const repository = new MemoryRepository();
  const pipeline = new StoryPipeline(repository, clock, ids);
  const source = await pipeline.addResearchSource({
    projectId: "prj_1",
    title: "Primary source",
    sourceType: "ARCHIVE"
  });
  const fact = await pipeline.addFact({
    projectId: "prj_1",
    statement: "Supported historical statement",
    classification: "FACT",
    sourceIds: [source.id]
  });
  assert.deepEqual(fact.sourceIds, [source.id]);
  assert.equal(repository.facts.length, 1);
});
