import type {
  ApprovalRecord,
  Chapter,
  FactRecord,
  ProjectFormat,
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

export interface StoryGraph {
  chapters: Chapter[];
  sequences: Sequence[];
  scenes: Scene[];
}

export interface StoryImpactReport {
  requiresStructureReview: boolean;
  staleChapterIds: string[];
  staleSequenceIds: string[];
  staleSceneIds: string[];
  preservedSceneIds: string[];
}

export interface StoryRepository {
  addResearchSource(source: ResearchSource): Promise<void>;
  addFact(fact: FactRecord): Promise<void>;
  getLatestFact(projectId: string, factId: string): Promise<FactRecord | null>;
  commitFactRevision(input: {
    previous: FactRecord;
    next: FactRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  saveInitialScript(version: ScriptVersion): Promise<void>;
  getLatestScript(projectId: string, scriptId: string): Promise<ScriptVersion | null>;
  listScripts(projectId: string): Promise<ScriptVersion[]>;
  commitScriptRevision(input: {
    previous: ScriptVersion;
    next: ScriptVersion;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  getLatestApprovedFinalScript(projectId: string): Promise<ScriptVersion | null>;
  getLatestApproval(
    projectId: string,
    targetType: ApprovalRecord["targetType"],
    targetId: string
  ): Promise<ApprovalRecord | null>;
  commitFinalScriptApproval(input: {
    approval: ApprovalRecord;
    impact: StoryImpactReport;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  listFacts(projectId: string): Promise<FactRecord[]>;
  listScenes(projectId: string): Promise<Scene[]>;
  listActiveStory(projectId: string): Promise<StoryGraph>;

  commitStoryGraph(input: {
    graph: StoryGraph;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  commitStructureApproval(input: {
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;

  commitSceneApprovals(input: {
    previousScenes: Scene[];
    approvedScenes: Scene[];
    approvals: ApprovalRecord[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
}

export interface StoryClock {
  nowIso(): string;
}

export interface IdFactory {
  next(
    prefix:
      | "src"
      | "fact"
      | "script"
      | "ch"
      | "seq"
      | "sc"
      | "apr"
      | "evt"
      | "outbox"
  ): string;
}

export class StoryValidationError extends Error {
  constructor(
    public readonly code:
      | "FACT_SOURCE_REQUIRED"
      | "FACT_NOT_FOUND"
      | "FINAL_SCRIPT_REQUIRED"
      | "FINAL_SCRIPT_APPROVAL_REQUIRED"
      | "SCRIPT_NOT_FOUND"
      | "SCENE_STATE_REQUIRED"
      | "SCENE_ORDER_INVALID"
      | "SCENE_SCRIPT_SEGMENT_INVALID"
      | "STORY_STRUCTURE_INVALID"
      | "STORY_NOT_GENERATED"
      | "SCENE_NOT_FOUND",
    message: string
  ) {
    super(message);
    this.name = "StoryValidationError";
  }
}

function cloneSuperseded<T extends { lifecycleStatus: string; updatedAt: string }>(
  value: T,
  now: string
): T {
  return { ...value, lifecycleStatus: "SUPERSEDED", updatedAt: now };
}

function durableEvent(
  ids: IdFactory,
  clock: StoryClock,
  input: Omit<WorkflowEvent, "eventId" | "createdAt">
): { event: WorkflowEvent; outbox: OutboxRecord } {
  const createdAt = clock.nowIso();
  const event: WorkflowEvent = {
    ...input,
    eventId: ids.next("evt"),
    createdAt
  };
  return {
    event,
    outbox: {
      outboxId: ids.next("outbox"),
      eventId: event.eventId,
      status: "PENDING",
      attempts: 0,
      createdAt
    }
  };
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

  async approveFact(projectId: string, factId: string): Promise<FactRecord> {
    const previous = await this.repository.getLatestFact(projectId, factId);
    if (previous === null) {
      throw new StoryValidationError("FACT_NOT_FOUND", "The requested fact does not exist.");
    }
    const now = this.clock.nowIso();
    const next: FactRecord = {
      ...previous,
      revision: previous.revision + 1,
      lifecycleStatus: "ACTIVE",
      status: "APPROVED",
      updatedAt: now
    };
    const previousSuperseded = cloneSuperseded(previous, now);
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId,
      eventType: "FACT_APPROVED",
      targetType: "FACT",
      targetId: factId,
      trigger: "USER",
      payload: { revision: next.revision }
    });
    await this.repository.commitFactRevision({
      previous: previousSuperseded,
      next,
      event,
      outbox
    });
    return next;
  }

  async createScript(input: {
    projectId: string;
    body: string;
    kind?: ScriptVersion["kind"];
  }): Promise<ScriptVersion> {
    const now = this.clock.nowIso();
    const script: ScriptVersion = {
      id: this.ids.next("script"),
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      kind: input.kind ?? "DRAFT",
      body: input.body
    };
    await this.repository.saveInitialScript(script);
    return script;
  }

  async reviseScript(input: {
    projectId: string;
    scriptId: string;
    body: string;
    kind?: ScriptVersion["kind"];
  }): Promise<ScriptVersion> {
    const previous = await this.repository.getLatestScript(input.projectId, input.scriptId);
    if (previous === null) {
      throw new StoryValidationError("SCRIPT_NOT_FOUND", "The requested script does not exist.");
    }
    const now = this.clock.nowIso();
    const next: ScriptVersion = {
      ...previous,
      revision: previous.revision + 1,
      lifecycleStatus: "ACTIVE",
      updatedAt: now,
      kind: input.kind ?? previous.kind,
      body: input.body,
      supersedesRevision: previous.revision
    };
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "SCRIPT_REVISION_CREATED",
      targetType: "SCRIPT",
      targetId: input.scriptId,
      trigger: "USER",
      payload: {
        previousRevision: previous.revision,
        revision: next.revision
      }
    });
    await this.repository.commitScriptRevision({
      previous: cloneSuperseded(previous, now),
      next,
      event,
      outbox
    });
    return next;
  }

  async approveFinalScript(input: {
    projectId: string;
    scriptId: string;
    approvedById?: string;
  }): Promise<{ approval: ApprovalRecord; impact: StoryImpactReport }> {
    const script = await this.repository.getLatestScript(input.projectId, input.scriptId);
    if (script === null) {
      throw new StoryValidationError("SCRIPT_NOT_FOUND", "The requested script does not exist.");
    }
    if (script.kind !== "FINAL") {
      throw new StoryValidationError(
        "FINAL_SCRIPT_REQUIRED",
        "Only a FINAL script revision can be approved for story generation."
      );
    }

    const story = await this.repository.listActiveStory(input.projectId);
    const impact = analyzeScriptChangeImpact(story, script);
    const now = this.clock.nowIso();
    const approval: ApprovalRecord = {
      id: this.ids.next("apr"),
      projectId: input.projectId,
      targetType: "SCRIPT",
      targetId: script.id,
      targetRevision: script.revision,
      approvalState: "HUMAN_APPROVED",
      reason: "FINAL_SCRIPT_APPROVED",
      approvedByType: "USER",
      ...(input.approvedById === undefined ? {} : { approvedById: input.approvedById }),
      createdAt: now
    };
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "FINAL_SCRIPT_APPROVED",
      targetType: "SCRIPT",
      targetId: script.id,
      trigger: "USER",
      payload: {
        revision: script.revision,
        impact
      }
    });
    await this.repository.commitFinalScriptApproval({
      approval,
      impact,
      event,
      outbox
    });
    return { approval, impact };
  }
}

export class StoryGenerationService {
  constructor(
    private readonly repository: StoryRepository,
    private readonly decisions: StoryDecisionPort,
    private readonly clock: StoryClock,
    private readonly ids: IdFactory
  ) {}

  async generate(input: {
    projectId: string;
    format: ProjectFormat;
  }): Promise<StoryGraph> {
    const script = await this.repository.getLatestApprovedFinalScript(input.projectId);
    if (script === null) {
      throw new StoryValidationError(
        "FINAL_SCRIPT_APPROVAL_REQUIRED",
        "Approve a FINAL script before generating story structure."
      );
    }

    const facts = (await this.repository.listFacts(input.projectId))
      .filter((fact) => fact.lifecycleStatus === "ACTIVE" && fact.status === "APPROVED");
    const base = {
      projectId: input.projectId,
      format: input.format,
      script,
      facts
    };

    const structure = await this.decisions.designStructure(base);
    validateStructureDecision(structure);

    const sequencesDecision = await this.decisions.designSequences({
      ...base,
      structure
    });
    validateSequenceDecision(structure, sequencesDecision);

    const scenesDecision = await this.decisions.designScenes({
      ...base,
      structure,
      sequences: sequencesDecision
    });
    validateSceneDecision(sequencesDecision, scenesDecision);

    const existing = await this.repository.listActiveStory(input.projectId);
    const graph = materializeStoryGraph({
      projectId: input.projectId,
      script,
      structure,
      sequenceDecision: sequencesDecision,
      sceneDecision: scenesDecision,
      existing,
      now: this.clock.nowIso(),
      ids: this.ids
    });
    validateStoryStructure(graph.chapters, graph.sequences, graph.scenes);

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "STORY_STRUCTURE_COMMITTED",
      targetType: "PROJECT",
      targetId: input.projectId,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        scriptId: script.id,
        scriptRevision: script.revision,
        chapterCount: graph.chapters.length,
        sequenceCount: graph.sequences.length,
        sceneCount: graph.scenes.length
      }
    });
    await this.repository.commitStoryGraph({ graph, event, outbox });
    return graph;
  }

  async approveStructure(input: {
    projectId: string;
    approvedById?: string;
  }): Promise<ApprovalRecord> {
    const script = await this.repository.getLatestApprovedFinalScript(input.projectId);
    if (script === null) {
      throw new StoryValidationError(
        "FINAL_SCRIPT_APPROVAL_REQUIRED",
        "Approve a FINAL script before approving story structure."
      );
    }
    const graph = await this.repository.listActiveStory(input.projectId);
    if (graph.chapters.length === 0 || graph.sequences.length === 0 || graph.scenes.length === 0) {
      throw new StoryValidationError(
        "STORY_NOT_GENERATED",
        "Generate the story structure before approving it."
      );
    }

    const now = this.clock.nowIso();
    const approval: ApprovalRecord = {
      id: this.ids.next("apr"),
      projectId: input.projectId,
      targetType: "STORY_STRUCTURE",
      targetId: input.projectId,
      targetRevision: script.revision,
      approvalState: "HUMAN_APPROVED",
      reason: "STRUCTURE_APPROVED",
      approvedByType: "USER",
      ...(input.approvedById === undefined ? {} : { approvedById: input.approvedById }),
      createdAt: now
    };
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "STRUCTURE_APPROVED",
      targetType: "PROJECT",
      targetId: input.projectId,
      trigger: "USER",
      payload: { scriptId: script.id, scriptRevision: script.revision }
    });
    await this.repository.commitStructureApproval({ approval, event, outbox });
    return approval;
  }

  async approveScenes(input: {
    projectId: string;
    sceneIds: string[];
    approvedById?: string;
  }): Promise<Scene[]> {
    const graph = await this.repository.listActiveStory(input.projectId);
    const byId = new Map(graph.scenes.map((scene) => [scene.id, scene]));
    const now = this.clock.nowIso();
    const previousScenes: Scene[] = [];
    const approvedScenes: Scene[] = [];
    const approvals: ApprovalRecord[] = [];

    for (const sceneId of input.sceneIds) {
      const previous = byId.get(sceneId);
      if (previous === undefined) {
        throw new StoryValidationError(
          "SCENE_NOT_FOUND",
          `Scene ${sceneId} does not exist in the active story.`
        );
      }
      const next: Scene = {
        ...previous,
        revision: previous.revision + 1,
        lifecycleStatus: "ACTIVE",
        sceneStatus: "APPROVED",
        updatedAt: now
      };
      previousScenes.push(cloneSuperseded(previous, now));
      approvedScenes.push(next);
      approvals.push({
        id: this.ids.next("apr"),
        projectId: input.projectId,
        targetType: "SCENE",
        targetId: sceneId,
        targetRevision: next.revision,
        approvalState: "HUMAN_APPROVED",
        reason: "SCENE_DESIGN_APPROVED",
        approvedByType: "USER",
        ...(input.approvedById === undefined ? {} : { approvedById: input.approvedById }),
        createdAt: now
      });
    }

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "SCENE_DESIGN_APPROVED",
      targetType: "PROJECT",
      targetId: input.projectId,
      trigger: "USER",
      payload: { sceneIds: input.sceneIds }
    });
    await this.repository.commitSceneApprovals({
      previousScenes,
      approvedScenes,
      approvals,
      event,
      outbox
    });
    return approvedScenes;
  }
}

export interface StoryCommandResult<T> {
  ok: boolean;
  value?: T;
  code?: string;
  userMessage: string;
  recommendedAction?: string;
}

export class StoryCommandFacade {
  constructor(
    private readonly pipeline: StoryPipeline,
    private readonly generation: StoryGenerationService
  ) {}

  async approveFinalScript(
    input: Parameters<StoryPipeline["approveFinalScript"]>[0]
  ): Promise<StoryCommandResult<Awaited<ReturnType<StoryPipeline["approveFinalScript"]>>>> {
    try {
      const value = await this.pipeline.approveFinalScript(input);
      return {
        ok: true,
        value,
        userMessage: value.impact.requiresStructureReview
          ? "최종 대본을 승인했습니다. 기존 장면 구성에 영향이 있어 장면 구성을 다시 검토해야 합니다."
          : "최종 대본을 승인했습니다.",
        ...(value.impact.requiresStructureReview
          ? { recommendedAction: "REVIEW_STORY_STRUCTURE" }
          : {})
      };
    } catch (error) {
      return mapStoryError(error);
    }
  }

  async generateStory(
    input: Parameters<StoryGenerationService["generate"]>[0]
  ): Promise<StoryCommandResult<StoryGraph>> {
    try {
      const value = await this.generation.generate(input);
      return {
        ok: true,
        value,
        userMessage: `장면 구성을 생성했습니다. 총 ${value.scenes.length}개 장면입니다.`,
        recommendedAction: "REVIEW_STORY_STRUCTURE"
      };
    } catch (error) {
      return mapStoryError(error);
    }
  }
}

function mapStoryError(error: unknown): StoryCommandResult<never> {
  if (error instanceof StoryValidationError) {
    const messages: Record<StoryValidationError["code"], {
      message: string;
      action: string;
    }> = {
      FACT_SOURCE_REQUIRED: {
        message: "사실로 등록하려면 근거 자료가 필요합니다.",
        action: "ADD_RESEARCH_SOURCE"
      },
      FACT_NOT_FOUND: {
        message: "해당 사실 항목을 찾을 수 없습니다.",
        action: "REFRESH_RESEARCH"
      },
      FINAL_SCRIPT_REQUIRED: {
        message: "최종 대본으로 지정된 버전만 승인할 수 있습니다.",
        action: "MARK_SCRIPT_FINAL"
      },
      FINAL_SCRIPT_APPROVAL_REQUIRED: {
        message: "장면 구성을 만들기 전에 최종 대본 승인이 필요합니다.",
        action: "APPROVE_FINAL_SCRIPT"
      },
      SCRIPT_NOT_FOUND: {
        message: "대본 버전을 찾을 수 없습니다.",
        action: "REFRESH_SCRIPT"
      },
      SCENE_STATE_REQUIRED: {
        message: "장면의 시작·현재·종료 상태가 불완전합니다.",
        action: "REGENERATE_SCENE_DESIGN"
      },
      SCENE_ORDER_INVALID: {
        message: "장면 또는 시퀀스 순서가 올바르지 않습니다.",
        action: "REVIEW_STORY_STRUCTURE"
      },
      SCENE_SCRIPT_SEGMENT_INVALID: {
        message: "생성된 장면이 승인 대본의 실제 문장 구간과 맞지 않습니다.",
        action: "REGENERATE_SCENE_DESIGN"
      },
      STORY_STRUCTURE_INVALID: {
        message: "생성된 장면 구조의 연결 관계가 올바르지 않습니다.",
        action: "REGENERATE_STORY_STRUCTURE"
      },
      STORY_NOT_GENERATED: {
        message: "먼저 장면 구성을 생성해야 합니다.",
        action: "GENERATE_STORY_STRUCTURE"
      },
      SCENE_NOT_FOUND: {
        message: "검토하려는 장면을 찾을 수 없습니다.",
        action: "REFRESH_STORY"
      }
    };
    const mapped = messages[error.code];
    return {
      ok: false,
      code: error.code,
      userMessage: mapped.message,
      recommendedAction: mapped.action
    };
  }

  return {
    ok: false,
    code: "STORY_SYSTEM_ERROR",
    userMessage: "장면 구성 처리 중 시스템 오류가 발생했습니다.",
    recommendedAction: "RETRY"
  };
}

export function analyzeScriptChangeImpact(
  graph: StoryGraph,
  script: ScriptVersion
): StoryImpactReport {
  if (graph.scenes.length === 0) {
    return {
      requiresStructureReview: false,
      staleChapterIds: [],
      staleSequenceIds: [],
      staleSceneIds: [],
      preservedSceneIds: []
    };
  }

  const sourceChanged = graph.scenes.some(
    (scene) =>
      scene.scriptRef.scriptId !== script.id ||
      scene.scriptRef.scriptRevision !== script.revision
  );
  if (!sourceChanged) {
    return {
      requiresStructureReview: false,
      staleChapterIds: [],
      staleSequenceIds: [],
      staleSceneIds: [],
      preservedSceneIds: graph.scenes.map((scene) => scene.id)
    };
  }

  const staleSceneIds: string[] = [];
  const preservedSceneIds: string[] = [];
  for (const scene of graph.scenes) {
    if (containsExactSentenceSpan(script.body, scene.scriptSegment)) {
      preservedSceneIds.push(scene.id);
    } else {
      staleSceneIds.push(scene.id);
    }
  }

  return {
    requiresStructureReview: true,
    staleChapterIds: graph.chapters.map((chapter) => chapter.id),
    staleSequenceIds: graph.sequences.map((sequence) => sequence.id),
    staleSceneIds,
    preservedSceneIds
  };
}

function normalizeSentenceText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sentenceUnits(value: string): string[] {
  return value
    .split(/(?<=[.!?。？！])\s*/)
    .map(normalizeSentenceText)
    .filter((unit) => unit.length > 0);
}

function containsExactSentenceSpan(scriptBody: string, segment: string): boolean {
  const scriptUnits = sentenceUnits(scriptBody);
  const segmentUnits = sentenceUnits(segment);
  if (segmentUnits.length === 0 || segmentUnits.length > scriptUnits.length) return false;

  const expected = segmentUnits.join(" ");
  for (let start = 0; start <= scriptUnits.length - segmentUnits.length; start += 1) {
    const candidate = scriptUnits
      .slice(start, start + segmentUnits.length)
      .join(" ");
    if (candidate === expected) return true;
  }
  return false;
}

function validateStructureDecision(decision: StructureDesignDecision): void {
  if (decision.chapters.length === 0) {
    throw new StoryValidationError(
      "STORY_STRUCTURE_INVALID",
      "Structure decision must contain at least one chapter."
    );
  }
  const keys = new Set<string>();
  [...decision.chapters]
    .sort((a, b) => a.displayNumber - b.displayNumber)
    .forEach((chapter, index) => {
      if (!chapter.key.trim() || keys.has(chapter.key) || chapter.displayNumber !== index + 1) {
        throw new StoryValidationError(
          "STORY_STRUCTURE_INVALID",
          "Chapter keys must be unique and chapter order must be contiguous."
        );
      }
      keys.add(chapter.key);
    });
}

function validateSequenceDecision(
  structure: StructureDesignDecision,
  decision: SequenceDesignDecision
): void {
  const chapterKeys = new Set(structure.chapters.map((chapter) => chapter.key));
  const keys = new Set<string>();
  for (const sequence of decision.sequences) {
    if (
      !sequence.key.trim() ||
      keys.has(sequence.key) ||
      !chapterKeys.has(sequence.chapterKey) ||
      !sequence.storyPurpose.trim()
    ) {
      throw new StoryValidationError(
        "STORY_STRUCTURE_INVALID",
        "Sequence decision contains an invalid key, chapter reference or purpose."
      );
    }
    keys.add(sequence.key);
  }

  for (const chapter of structure.chapters) {
    const ordered = decision.sequences
      .filter((sequence) => sequence.chapterKey === chapter.key)
      .sort((a, b) => a.displayNumber - b.displayNumber);
    if (ordered.length === 0) {
      throw new StoryValidationError(
        "STORY_STRUCTURE_INVALID",
        `Chapter ${chapter.key} must contain at least one sequence.`
      );
    }
    ordered.forEach((sequence, index) => {
      if (sequence.displayNumber !== index + 1) {
        throw new StoryValidationError(
          "SCENE_ORDER_INVALID",
          `Sequence order in chapter ${chapter.key} must start at 1 and be contiguous.`
        );
      }
    });
  }
}

function validateSceneDecision(
  sequences: SequenceDesignDecision,
  decision: SceneDesignDecision
): void {
  const sequenceKeys = new Set(sequences.sequences.map((sequence) => sequence.key));
  const keys = new Set<string>();
  for (const scene of decision.scenes) {
    if (
      !scene.key.trim() ||
      keys.has(scene.key) ||
      !sequenceKeys.has(scene.sequenceKey) ||
      !scene.scriptSegment.trim()
    ) {
      throw new StoryValidationError(
        "STORY_STRUCTURE_INVALID",
        "Scene decision contains an invalid key, sequence reference or script segment."
      );
    }
    if (!scene.stateIn.trim() || !scene.stateCurrent.trim() || !scene.stateOut.trim()) {
      throw new StoryValidationError(
        "SCENE_STATE_REQUIRED",
        `Scene ${scene.key} requires STATE_IN, STATE_CURRENT and STATE_OUT.`
      );
    }
    keys.add(scene.key);
  }

  for (const sequence of sequences.sequences) {
    const ordered = decision.scenes
      .filter((scene) => scene.sequenceKey === sequence.key)
      .sort((a, b) => a.displayNumber - b.displayNumber);
    if (ordered.length === 0) {
      throw new StoryValidationError(
        "STORY_STRUCTURE_INVALID",
        `Sequence ${sequence.key} must contain at least one scene.`
      );
    }
    ordered.forEach((scene, index) => {
      if (scene.displayNumber !== index + 1) {
        throw new StoryValidationError(
          "SCENE_ORDER_INVALID",
          `Scene order in sequence ${sequence.key} must start at 1 and be contiguous.`
        );
      }
    });
  }
}

function findScriptRange(body: string, segment: string, cursor: number): {
  startChar: number;
  endChar: number;
  nextCursor: number;
} {
  const trimmed = segment.trim();
  const startChar = body.indexOf(trimmed, cursor);
  if (startChar < 0) {
    throw new StoryValidationError(
      "SCENE_SCRIPT_SEGMENT_INVALID",
      "Every Scene script segment must exist verbatim in the approved final script and preserve order."
    );
  }
  const endChar = startChar + trimmed.length;
  return { startChar, endChar, nextCursor: endChar };
}

function materializeStoryGraph(input: {
  projectId: string;
  script: ScriptVersion;
  structure: StructureDesignDecision;
  sequenceDecision: SequenceDesignDecision;
  sceneDecision: SceneDesignDecision;
  existing: StoryGraph;
  now: string;
  ids: IdFactory;
}): StoryGraph {
  const chapterByKey = new Map<string, Chapter>();
  const existingChapterBySignature = new Map(
    input.existing.chapters.map((chapter) => [
      `${chapter.displayNumber}::${chapter.title.trim()}`,
      chapter
    ])
  );

  for (const design of [...input.structure.chapters].sort(
    (a, b) => a.displayNumber - b.displayNumber
  )) {
    const existing = existingChapterBySignature.get(
      `${design.displayNumber}::${design.title.trim()}`
    );
    chapterByKey.set(design.key, {
      id: existing?.id ?? input.ids.next("ch"),
      projectId: input.projectId,
      revision: existing === undefined ? 1 : existing.revision + 1,
      lifecycleStatus: "ACTIVE",
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now,
      displayNumber: design.displayNumber,
      title: design.title,
      sourceScriptId: input.script.id,
      sourceScriptRevision: input.script.revision,
      sequenceIds: [],
      stale: false
    });
  }

  const sequenceByKey = new Map<string, Sequence>();
  for (const design of input.sequenceDecision.sequences) {
    const chapter = chapterByKey.get(design.chapterKey);
    if (chapter === undefined) {
      throw new StoryValidationError(
        "STORY_STRUCTURE_INVALID",
        `Unknown chapter key ${design.chapterKey}.`
      );
    }
    const existing = input.existing.sequences.find(
      (candidate) =>
        candidate.chapterId === chapter.id &&
        candidate.displayNumber === design.displayNumber &&
        candidate.title.trim() === design.title.trim()
    );
    const sequence: Sequence = {
      id: existing?.id ?? input.ids.next("seq"),
      projectId: input.projectId,
      chapterId: chapter.id,
      revision: existing === undefined ? 1 : existing.revision + 1,
      lifecycleStatus: "ACTIVE",
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now,
      displayNumber: design.displayNumber,
      title: design.title,
      storyPurpose: design.storyPurpose,
      sourceScriptId: input.script.id,
      sourceScriptRevision: input.script.revision,
      sceneIds: [],
      stale: false
    };
    sequenceByKey.set(design.key, sequence);
    chapter.sequenceIds.push(sequence.id);
  }

  let cursor = 0;
  const scenes: Scene[] = [];
  const sortedScenes = [...input.sceneDecision.scenes].sort((a, b) => {
    const sequenceA = input.sequenceDecision.sequences.find((s) => s.key === a.sequenceKey);
    const sequenceB = input.sequenceDecision.sequences.find((s) => s.key === b.sequenceKey);
    const chapterA = input.structure.chapters.find((c) => c.key === sequenceA?.chapterKey);
    const chapterB = input.structure.chapters.find((c) => c.key === sequenceB?.chapterKey);
    return (
      (chapterA?.displayNumber ?? 0) - (chapterB?.displayNumber ?? 0) ||
      (sequenceA?.displayNumber ?? 0) - (sequenceB?.displayNumber ?? 0) ||
      a.displayNumber - b.displayNumber
    );
  });

  for (const design of sortedScenes) {
    const sequence = sequenceByKey.get(design.sequenceKey);
    if (sequence === undefined) {
      throw new StoryValidationError(
        "STORY_STRUCTURE_INVALID",
        `Unknown sequence key ${design.sequenceKey}.`
      );
    }
    const range = findScriptRange(input.script.body, design.scriptSegment, cursor);
    cursor = range.nextCursor;
    const existing = input.existing.scenes.find(
      (candidate) =>
        candidate.sequenceId === sequence.id &&
        candidate.displayNumber === design.displayNumber &&
        candidate.scriptSegment.trim() === design.scriptSegment.trim()
    );
    const scene: Scene = {
      id: existing?.id ?? input.ids.next("sc"),
      projectId: input.projectId,
      sequenceId: sequence.id,
      revision: existing === undefined ? 1 : existing.revision + 1,
      lifecycleStatus: "ACTIVE",
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now,
      displayNumber: design.displayNumber,
      scriptSegment: design.scriptSegment.trim(),
      scriptRef: {
        scriptId: input.script.id,
        scriptRevision: input.script.revision,
        startChar: range.startChar,
        endChar: range.endChar
      },
      stateIn: design.stateIn,
      stateCurrent: design.stateCurrent,
      stateOut: design.stateOut,
      primaryVisualIdea: design.primaryVisualIdea,
      mustBeSeen: [...design.mustBeSeen],
      canBeNarrated: [...design.canBeNarrated],
      canBeImplied: [...design.canBeImplied],
      requiredIdentityAnchorIds: [...design.requiredIdentityAnchorIds],
      sceneStatus: "DESIGNED",
      stale: false
    };
    scenes.push(scene);
    sequence.sceneIds.push(scene.id);
  }

  return {
    chapters: [...chapterByKey.values()].sort((a, b) => a.displayNumber - b.displayNumber),
    sequences: [...sequenceByKey.values()].sort(
      (a, b) =>
        (chapterOrder(a.chapterId, chapterByKey) - chapterOrder(b.chapterId, chapterByKey)) ||
        a.displayNumber - b.displayNumber
    ),
    scenes
  };
}

function chapterOrder(chapterId: string, chapterByKey: Map<string, Chapter>): number {
  return [...chapterByKey.values()].find((chapter) => chapter.id === chapterId)?.displayNumber ?? 0;
}

export function validateStoryStructure(
  chapters: Chapter[],
  sequences: Sequence[],
  scenes: Scene[]
): void {
  const chapterIds = new Set(chapters.map((item) => item.id));
  const sequenceIds = new Set(sequences.map((item) => item.id));
  const sceneIds = new Set(scenes.map((item) => item.id));

  for (const chapter of chapters) {
    if (chapter.sequenceIds.some((id) => !sequenceIds.has(id))) {
      throw new StoryValidationError(
        "STORY_STRUCTURE_INVALID",
        `Chapter ${chapter.id} references an unknown sequence.`
      );
    }
  }

  for (const sequence of sequences) {
    if (!chapterIds.has(sequence.chapterId)) {
      throw new StoryValidationError(
        "STORY_STRUCTURE_INVALID",
        `Sequence ${sequence.id} references an unknown chapter.`
      );
    }
    if (sequence.sceneIds.some((id) => !sceneIds.has(id))) {
      throw new StoryValidationError(
        "STORY_STRUCTURE_INVALID",
        `Sequence ${sequence.id} references an unknown scene.`
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
}
