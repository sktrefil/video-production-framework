import type {
  Chapter, FactRecord, ResearchSource, Scene, ScriptVersion, Sequence
} from "@vpf/domain";

export interface StoryRepository {
  addResearchSource(source: ResearchSource): Promise<void>;
  addFact(fact: FactRecord): Promise<void>;
  saveScript(version: ScriptVersion): Promise<void>;
  saveChapter(chapter: Chapter): Promise<void>;
  saveSequence(sequence: Sequence): Promise<void>;
  saveScene(scene: Scene): Promise<void>;
  listFacts(projectId: string): Promise<FactRecord[]>;
  listScenes(projectId: string): Promise<Scene[]>;
}

export interface StoryClock { nowIso(): string; }
export interface IdFactory {
  next(prefix: "src" | "fact" | "script" | "ch" | "seq" | "sc"): string;
}

export class StoryValidationError extends Error {
  constructor(
    public readonly code:
      | "FACT_SOURCE_REQUIRED"
      | "SCENE_STATE_REQUIRED"
      | "SCENE_ORDER_INVALID"
      | "STORY_STRUCTURE_INVALID",
    message: string
  ) {
    super(message);
    this.name = "StoryValidationError";
  }
}

export class StoryPipeline {
  constructor(
    private readonly repository: StoryRepository,
    private readonly clock: StoryClock,
    private readonly ids: IdFactory
  ) {}

  async addResearchSource(input: {
    projectId: string;
    title: string;
    sourceType: ResearchSource["sourceType"];
    url?: string;
    citation?: string;
    notes?: string;
  }): Promise<ResearchSource> {
    const now = this.clock.nowIso();
    const source: ResearchSource = {
      id: this.ids.next("src"),
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      title: input.title,
      sourceType: input.sourceType,
      ...(input.url === undefined ? {} : { url: input.url }),
      ...(input.citation === undefined ? {} : { citation: input.citation }),
      ...(input.notes === undefined ? {} : { notes: input.notes })
    };
    await this.repository.addResearchSource(source);
    return source;
  }

  async addFact(input: {
    projectId: string;
    statement: string;
    classification: FactRecord["classification"];
    sourceIds?: string[];
  }): Promise<FactRecord> {
    const sourceIds = input.sourceIds ?? [];
    if (input.classification === "FACT" && sourceIds.length === 0) {
      throw new StoryValidationError(
        "FACT_SOURCE_REQUIRED",
        "FACT records require at least one supporting source."
      );
    }
    const now = this.clock.nowIso();
    const fact: FactRecord = {
      id: this.ids.next("fact"),
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      statement: input.statement,
      classification: input.classification,
      sourceIds,
      status: "DRAFT"
    };
    await this.repository.addFact(fact);
    return fact;
  }

  async saveScript(input: {
    projectId: string;
    body: string;
    kind: ScriptVersion["kind"];
    approvalState?: ScriptVersion["approvalState"];
  }): Promise<ScriptVersion> {
    const now = this.clock.nowIso();
    const script: ScriptVersion = {
      id: this.ids.next("script"),
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      body: input.body,
      kind: input.kind,
      approvalState: input.approvalState ?? "PENDING"
    };
    await this.repository.saveScript(script);
    return script;
  }

  async saveStructure(input: {
    chapter: Chapter;
    sequences: Sequence[];
    scenes: Scene[];
  }): Promise<void> {
    validateStoryStructure(input.chapter, input.sequences, input.scenes);
    await this.repository.saveChapter(input.chapter);
    for (const sequence of input.sequences) await this.repository.saveSequence(sequence);
    for (const scene of input.scenes) await this.repository.saveScene(scene);
  }
}

export function validateStoryStructure(
  chapter: Chapter,
  sequences: Sequence[],
  scenes: Scene[]
): void {
  const sequenceIds = new Set(sequences.map((item) => item.id));
  const sceneIds = new Set(scenes.map((item) => item.id));

  if (chapter.sequenceIds.some((id) => !sequenceIds.has(id))) {
    throw new StoryValidationError(
      "STORY_STRUCTURE_INVALID",
      "Chapter references a sequence that was not provided."
    );
  }

  for (const sequence of sequences) {
    if (sequence.chapterId !== chapter.id) {
      throw new StoryValidationError(
        "STORY_STRUCTURE_INVALID",
        `Sequence ${sequence.id} belongs to a different chapter.`
      );
    }
    if (sequence.sceneIds.some((id) => !sceneIds.has(id))) {
      throw new StoryValidationError(
        "STORY_STRUCTURE_INVALID",
        `Sequence ${sequence.id} references a scene that was not provided.`
      );
    }
  }

  for (const scene of scenes) {
    if (!sequenceIds.has(scene.sequenceId)) {
      throw new StoryValidationError(
        "STORY_STRUCTURE_INVALID",
        `Scene ${scene.id} references an unknown sequence.`
      );
    }
    if (!scene.stateIn.trim() || !scene.stateCurrent.trim() || !scene.stateOut.trim()) {
      throw new StoryValidationError(
        "SCENE_STATE_REQUIRED",
        `Scene ${scene.id} requires STATE_IN, STATE_CURRENT and STATE_OUT.`
      );
    }
  }

  const orderedSequences = [...sequences].sort((a, b) => a.displayNumber - b.displayNumber);
  for (let index = 0; index < orderedSequences.length; index += 1) {
    if (orderedSequences[index]?.displayNumber !== index + 1) {
      throw new StoryValidationError(
        "SCENE_ORDER_INVALID",
        "Sequence display numbers must be contiguous and start at 1."
      );
    }
  }

  for (const sequence of sequences) {
    const orderedScenes = scenes
      .filter((scene) => scene.sequenceId === sequence.id)
      .sort((a, b) => a.displayNumber - b.displayNumber);
    for (let index = 0; index < orderedScenes.length; index += 1) {
      if (orderedScenes[index]?.displayNumber !== index + 1) {
        throw new StoryValidationError(
          "SCENE_ORDER_INVALID",
          `Scene display numbers in sequence ${sequence.id} must be contiguous and start at 1.`
        );
      }
    }
  }
}
