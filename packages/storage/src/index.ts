import Database from "better-sqlite3";
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
  StoryGraph,
  StoryImpactReport,
  StoryRepository
} from "@vpf/story";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";

export const FOUNDATION_MIGRATION_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS research_sources (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  url TEXT,
  citation TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS facts (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  statement TEXT NOT NULL,
  classification TEXT NOT NULL,
  source_ids_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS scripts (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  supersedes_revision INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS approval_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  approval_state TEXT NOT NULL,
  reason TEXT NOT NULL,
  approved_by_type TEXT NOT NULL,
  approved_by_id TEXT,
  selected_media_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  display_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  source_script_id TEXT NOT NULL,
  source_script_revision INTEGER NOT NULL,
  sequence_ids_json TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0,
  stale_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS sequences (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  display_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  story_purpose TEXT NOT NULL,
  source_script_id TEXT NOT NULL,
  source_script_revision INTEGER NOT NULL,
  scene_ids_json TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0,
  stale_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS scenes (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  sequence_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  display_number INTEGER NOT NULL,
  script_segment TEXT NOT NULL,
  source_script_id TEXT NOT NULL,
  source_script_revision INTEGER NOT NULL,
  source_start_char INTEGER,
  source_end_char INTEGER,
  state_in TEXT NOT NULL,
  state_current TEXT NOT NULL,
  state_out TEXT NOT NULL,
  primary_visual_idea TEXT NOT NULL,
  must_be_seen_json TEXT NOT NULL,
  can_be_narrated_json TEXT NOT NULL,
  can_be_implied_json TEXT NOT NULL,
  required_identity_anchor_ids_json TEXT NOT NULL,
  primary_asset_id TEXT,
  scene_status TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0,
  stale_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS workflow_events (
  event_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_outbox (
  outbox_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  processed_at TEXT,
  FOREIGN KEY(event_id) REFERENCES workflow_events(event_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_fact
  ON facts(id) WHERE lifecycle_status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_script
  ON scripts(id) WHERE lifecycle_status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_chapter
  ON chapters(id) WHERE lifecycle_status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_sequence
  ON sequences(id) WHERE lifecycle_status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_scene
  ON scenes(id) WHERE lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_sources_project ON research_sources(project_id);
CREATE INDEX IF NOT EXISTS idx_facts_project ON facts(project_id);
CREATE INDEX IF NOT EXISTS idx_scripts_project ON scripts(project_id);
CREATE INDEX IF NOT EXISTS idx_approval_target
  ON approval_records(project_id, target_type, target_id, target_revision);
CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id);
CREATE INDEX IF NOT EXISTS idx_sequences_project ON sequences(project_id);
CREATE INDEX IF NOT EXISTS idx_scenes_project ON scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON event_outbox(status);
`;

const encode = (values: string[]) => JSON.stringify(values);
const decode = (value: string): string[] => JSON.parse(value) as string[];

function insertEvent(
  db: Database.Database,
  event: WorkflowEvent,
  outbox: OutboxRecord
): void {
  db.prepare(`INSERT INTO workflow_events
    (event_id, project_id, event_type, target_type, target_id, trigger_type, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      event.eventId,
      event.projectId,
      event.eventType,
      event.targetType,
      event.targetId,
      event.trigger,
      JSON.stringify(event.payload ?? null),
      event.createdAt
    );

  db.prepare(`INSERT INTO event_outbox
    (outbox_id, event_id, status, attempts, created_at, processed_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(
      outbox.outboxId,
      outbox.eventId,
      outbox.status,
      outbox.attempts,
      outbox.createdAt,
      outbox.processedAt ?? null
    );
}

function insertApproval(db: Database.Database, approval: ApprovalRecord): void {
  db.prepare(`INSERT INTO approval_records
    (id, project_id, target_type, target_id, target_revision, approval_state, reason,
     approved_by_type, approved_by_id, selected_media_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      approval.id,
      approval.projectId,
      approval.targetType,
      approval.targetId,
      approval.targetRevision,
      approval.approvalState,
      approval.reason,
      approval.approvedByType,
      approval.approvedById ?? null,
      approval.selectedMediaId ?? null,
      approval.createdAt
    );
}

function mapFact(row: any): FactRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    statement: row.statement,
    classification: row.classification,
    sourceIds: decode(row.source_ids_json),
    status: row.status
  };
}

function mapScript(row: any): ScriptVersion {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    kind: row.kind,
    body: row.body,
    ...(row.supersedes_revision == null
      ? {}
      : { supersedesRevision: row.supersedes_revision })
  };
}

function mapApproval(row: any): ApprovalRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetRevision: row.target_revision,
    approvalState: row.approval_state,
    reason: row.reason,
    approvedByType: row.approved_by_type,
    ...(row.approved_by_id == null ? {} : { approvedById: row.approved_by_id }),
    ...(row.selected_media_id == null ? {} : { selectedMediaId: row.selected_media_id }),
    createdAt: row.created_at
  };
}

function mapChapter(row: any): Chapter {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    displayNumber: row.display_number,
    title: row.title,
    sourceScriptId: row.source_script_id,
    sourceScriptRevision: row.source_script_revision,
    sequenceIds: decode(row.sequence_ids_json),
    stale: row.stale === 1,
    ...(row.stale_reason == null ? {} : { staleReason: row.stale_reason })
  };
}

function mapSequence(row: any): Sequence {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    chapterId: row.chapter_id,
    displayNumber: row.display_number,
    title: row.title,
    storyPurpose: row.story_purpose,
    sourceScriptId: row.source_script_id,
    sourceScriptRevision: row.source_script_revision,
    sceneIds: decode(row.scene_ids_json),
    stale: row.stale === 1,
    ...(row.stale_reason == null ? {} : { staleReason: row.stale_reason })
  };
}

function mapScene(row: any): Scene {
  return {
    id: row.id,
    projectId: row.project_id,
    sequenceId: row.sequence_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    displayNumber: row.display_number,
    scriptSegment: row.script_segment,
    scriptRef: {
      scriptId: row.source_script_id,
      scriptRevision: row.source_script_revision,
      ...(row.source_start_char == null ? {} : { startChar: row.source_start_char }),
      ...(row.source_end_char == null ? {} : { endChar: row.source_end_char })
    },
    stateIn: row.state_in,
    stateCurrent: row.state_current,
    stateOut: row.state_out,
    primaryVisualIdea: row.primary_visual_idea,
    mustBeSeen: decode(row.must_be_seen_json),
    canBeNarrated: decode(row.can_be_narrated_json),
    canBeImplied: decode(row.can_be_implied_json),
    requiredIdentityAnchorIds: decode(row.required_identity_anchor_ids_json),
    ...(row.primary_asset_id == null ? {} : { primaryAssetId: row.primary_asset_id }),
    sceneStatus: row.scene_status,
    stale: row.stale === 1,
    ...(row.stale_reason == null ? {} : { staleReason: row.stale_reason })
  };
}

export class SqliteStoryRepository implements StoryRepository {
  readonly db: Database.Database;

  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(FOUNDATION_MIGRATION_SQL);
  }

  close(): void {
    this.db.close();
  }

  async addResearchSource(v: ResearchSource): Promise<void> {
    this.db.prepare(`INSERT INTO research_sources
      (id, project_id, revision, lifecycle_status, title, source_type, url, citation, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        v.id,
        v.projectId,
        v.revision,
        v.lifecycleStatus,
        v.title,
        v.sourceType,
        v.url ?? null,
        v.citation ?? null,
        v.notes ?? null,
        v.createdAt,
        v.updatedAt
      );
  }

  async addFact(v: FactRecord): Promise<void> {
    this.insertFact(v);
  }

  async getLatestFact(projectId: string, factId: string): Promise<FactRecord | null> {
    const row = this.db.prepare(
      `SELECT * FROM facts
       WHERE project_id = ? AND id = ?
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId, factId) as any;
    return row === undefined ? null : mapFact(row);
  }

  async commitFactRevision(input: {
    previous: FactRecord;
    next: FactRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.updateFactLifecycle(input.previous);
      this.insertFact(input.next);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async saveInitialScript(v: ScriptVersion): Promise<void> {
    this.insertScript(v);
  }

  async getLatestScript(projectId: string, scriptId: string): Promise<ScriptVersion | null> {
    const row = this.db.prepare(
      `SELECT * FROM scripts
       WHERE project_id = ? AND id = ?
       ORDER BY revision DESC LIMIT 1`
    ).get(projectId, scriptId) as any;
    return row === undefined ? null : mapScript(row);
  }

  async listScripts(projectId: string): Promise<ScriptVersion[]> {
    const rows = this.db.prepare(
      `SELECT * FROM scripts WHERE project_id = ? ORDER BY id, revision`
    ).all(projectId) as any[];
    return rows.map(mapScript);
  }

  async commitScriptRevision(input: {
    previous: ScriptVersion;
    next: ScriptVersion;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare(
        `UPDATE scripts SET lifecycle_status = ?, updated_at = ?
         WHERE id = ? AND revision = ?`
      ).run(
        input.previous.lifecycleStatus,
        input.previous.updatedAt,
        input.previous.id,
        input.previous.revision
      );
      this.insertScript(input.next);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async getLatestApprovedFinalScript(projectId: string): Promise<ScriptVersion | null> {
    const row = this.db.prepare(
      `SELECT s.*
       FROM scripts s
       JOIN approval_records a
         ON a.project_id = s.project_id
        AND a.target_type = 'SCRIPT'
        AND a.target_id = s.id
        AND a.target_revision = s.revision
       WHERE s.project_id = ?
         AND s.kind = 'FINAL'
         AND s.lifecycle_status = 'ACTIVE'
         AND a.approval_state = 'HUMAN_APPROVED'
       ORDER BY a.created_at DESC, s.revision DESC
       LIMIT 1`
    ).get(projectId) as any;
    return row === undefined ? null : mapScript(row);
  }

  async getLatestApproval(
    projectId: string,
    targetType: ApprovalRecord["targetType"],
    targetId: string
  ): Promise<ApprovalRecord | null> {
    const row = this.db.prepare(
      `SELECT * FROM approval_records
       WHERE project_id = ? AND target_type = ? AND target_id = ?
       ORDER BY created_at DESC LIMIT 1`
    ).get(projectId, targetType, targetId) as any;
    return row === undefined ? null : mapApproval(row);
  }

  async commitFinalScriptApproval(input: {
    approval: ApprovalRecord;
    impact: StoryImpactReport;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      insertApproval(this.db, input.approval);
      this.markStoryStaleInTransaction(input.impact);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async listFacts(projectId: string): Promise<FactRecord[]> {
    const rows = this.db.prepare(
      `SELECT * FROM facts
       WHERE project_id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY created_at`
    ).all(projectId) as any[];
    return rows.map(mapFact);
  }

  async listScenes(projectId: string): Promise<Scene[]> {
    const rows = this.db.prepare(
      `SELECT * FROM scenes
       WHERE project_id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY sequence_id, display_number`
    ).all(projectId) as any[];
    return rows.map(mapScene);
  }

  async listActiveStory(projectId: string): Promise<StoryGraph> {
    const chapterRows = this.db.prepare(
      `SELECT * FROM chapters
       WHERE project_id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY display_number`
    ).all(projectId) as any[];
    const sequenceRows = this.db.prepare(
      `SELECT * FROM sequences
       WHERE project_id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY chapter_id, display_number`
    ).all(projectId) as any[];
    const sceneRows = this.db.prepare(
      `SELECT * FROM scenes
       WHERE project_id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY sequence_id, display_number`
    ).all(projectId) as any[];
    return {
      chapters: chapterRows.map(mapChapter),
      sequences: sequenceRows.map(mapSequence),
      scenes: sceneRows.map(mapScene)
    };
  }

  async commitStoryGraph(input: {
    graph: StoryGraph;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      const projectId =
        input.graph.chapters[0]?.projectId ??
        input.graph.sequences[0]?.projectId ??
        input.graph.scenes[0]?.projectId;
      if (projectId === undefined) {
        throw new Error("Cannot commit an empty story graph.");
      }
      const now = input.event.createdAt;
      this.db.prepare(
        `UPDATE chapters SET lifecycle_status = 'SUPERSEDED', updated_at = ?
         WHERE project_id = ? AND lifecycle_status = 'ACTIVE'`
      ).run(now, projectId);
      this.db.prepare(
        `UPDATE sequences SET lifecycle_status = 'SUPERSEDED', updated_at = ?
         WHERE project_id = ? AND lifecycle_status = 'ACTIVE'`
      ).run(now, projectId);
      this.db.prepare(
        `UPDATE scenes SET lifecycle_status = 'SUPERSEDED', updated_at = ?, scene_status = 'SUPERSEDED'
         WHERE project_id = ? AND lifecycle_status = 'ACTIVE'`
      ).run(now, projectId);

      for (const chapter of input.graph.chapters) this.insertChapter(chapter);
      for (const sequence of input.graph.sequences) this.insertSequence(sequence);
      for (const scene of input.graph.scenes) this.insertScene(scene);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitStructureApproval(input: {
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      insertApproval(this.db, input.approval);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitSceneApprovals(input: {
    previousScenes: Scene[];
    approvedScenes: Scene[];
    approvals: ApprovalRecord[];
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      for (const previous of input.previousScenes) {
        this.db.prepare(
          `UPDATE scenes
           SET lifecycle_status = ?, updated_at = ?, scene_status = ?
           WHERE id = ? AND revision = ?`
        ).run(
          previous.lifecycleStatus,
          previous.updatedAt,
          previous.sceneStatus,
          previous.id,
          previous.revision
        );
      }
      for (const scene of input.approvedScenes) this.insertScene(scene);
      for (const approval of input.approvals) insertApproval(this.db, approval);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  private insertFact(v: FactRecord): void {
    this.db.prepare(`INSERT INTO facts
      (id, project_id, revision, lifecycle_status, statement, classification,
       source_ids_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        v.id,
        v.projectId,
        v.revision,
        v.lifecycleStatus,
        v.statement,
        v.classification,
        encode(v.sourceIds),
        v.status,
        v.createdAt,
        v.updatedAt
      );
  }

  private updateFactLifecycle(v: FactRecord): void {
    this.db.prepare(
      `UPDATE facts SET lifecycle_status = ?, updated_at = ?
       WHERE id = ? AND revision = ?`
    ).run(v.lifecycleStatus, v.updatedAt, v.id, v.revision);
  }

  private insertScript(v: ScriptVersion): void {
    this.db.prepare(`INSERT INTO scripts
      (id, project_id, revision, lifecycle_status, kind, body, supersedes_revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        v.id,
        v.projectId,
        v.revision,
        v.lifecycleStatus,
        v.kind,
        v.body,
        v.supersedesRevision ?? null,
        v.createdAt,
        v.updatedAt
      );
  }

  private insertChapter(v: Chapter): void {
    this.db.prepare(`INSERT INTO chapters
      (id, project_id, revision, lifecycle_status, display_number, title,
       source_script_id, source_script_revision, sequence_ids_json, stale, stale_reason,
       created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        v.id,
        v.projectId,
        v.revision,
        v.lifecycleStatus,
        v.displayNumber,
        v.title,
        v.sourceScriptId,
        v.sourceScriptRevision,
        encode(v.sequenceIds),
        v.stale ? 1 : 0,
        v.staleReason ?? null,
        v.createdAt,
        v.updatedAt
      );
  }

  private insertSequence(v: Sequence): void {
    this.db.prepare(`INSERT INTO sequences
      (id, project_id, chapter_id, revision, lifecycle_status, display_number, title,
       story_purpose, source_script_id, source_script_revision, scene_ids_json,
       stale, stale_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        v.id,
        v.projectId,
        v.chapterId,
        v.revision,
        v.lifecycleStatus,
        v.displayNumber,
        v.title,
        v.storyPurpose,
        v.sourceScriptId,
        v.sourceScriptRevision,
        encode(v.sceneIds),
        v.stale ? 1 : 0,
        v.staleReason ?? null,
        v.createdAt,
        v.updatedAt
      );
  }

  private insertScene(v: Scene): void {
    this.db.prepare(`INSERT INTO scenes
      (id, project_id, sequence_id, revision, lifecycle_status, display_number,
       script_segment, source_script_id, source_script_revision, source_start_char,
       source_end_char, state_in, state_current, state_out, primary_visual_idea,
       must_be_seen_json, can_be_narrated_json, can_be_implied_json,
       required_identity_anchor_ids_json, primary_asset_id, scene_status, stale,
       stale_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        v.id,
        v.projectId,
        v.sequenceId,
        v.revision,
        v.lifecycleStatus,
        v.displayNumber,
        v.scriptSegment,
        v.scriptRef.scriptId,
        v.scriptRef.scriptRevision,
        v.scriptRef.startChar ?? null,
        v.scriptRef.endChar ?? null,
        v.stateIn,
        v.stateCurrent,
        v.stateOut,
        v.primaryVisualIdea,
        encode(v.mustBeSeen),
        encode(v.canBeNarrated),
        encode(v.canBeImplied),
        encode(v.requiredIdentityAnchorIds),
        v.primaryAssetId ?? null,
        v.sceneStatus,
        v.stale ? 1 : 0,
        v.staleReason ?? null,
        v.createdAt,
        v.updatedAt
      );
  }

  private markStoryStaleInTransaction(impact: StoryImpactReport): void {
    for (const id of impact.staleChapterIds) {
      this.db.prepare(
        `UPDATE chapters SET stale = 1, stale_reason = 'FINAL_SCRIPT_CHANGED'
         WHERE id = ? AND lifecycle_status = 'ACTIVE'`
      ).run(id);
    }
    for (const id of impact.staleSequenceIds) {
      this.db.prepare(
        `UPDATE sequences SET stale = 1, stale_reason = 'FINAL_SCRIPT_CHANGED'
         WHERE id = ? AND lifecycle_status = 'ACTIVE'`
      ).run(id);
    }
    for (const id of impact.staleSceneIds) {
      this.db.prepare(
        `UPDATE scenes SET stale = 1, stale_reason = 'SCRIPT_SEGMENT_CHANGED'
         WHERE id = ? AND lifecycle_status = 'ACTIVE'`
      ).run(id);
    }
  }
}
