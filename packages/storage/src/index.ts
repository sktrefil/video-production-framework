import Database from "better-sqlite3";
import type {
  Chapter, FactRecord, ResearchSource, Scene, ScriptVersion, Sequence
} from "@vpf/domain";
import type { StoryRepository } from "@vpf/story";

export const FOUNDATION_MIGRATION_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS research_sources (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL, title TEXT NOT NULL, source_type TEXT NOT NULL,
  url TEXT, citation TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL, statement TEXT NOT NULL, classification TEXT NOT NULL,
  source_ids_json TEXT NOT NULL, status TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scripts (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL,
  approval_state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, revision INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL, display_number INTEGER NOT NULL, title TEXT NOT NULL,
  sequence_ids_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sequences (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, chapter_id TEXT NOT NULL,
  revision INTEGER NOT NULL, lifecycle_status TEXT NOT NULL, display_number INTEGER NOT NULL,
  title TEXT NOT NULL, story_purpose TEXT NOT NULL, scene_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, sequence_id TEXT NOT NULL,
  revision INTEGER NOT NULL, lifecycle_status TEXT NOT NULL, display_number INTEGER NOT NULL,
  script_segment TEXT NOT NULL, state_in TEXT NOT NULL, state_current TEXT NOT NULL,
  state_out TEXT NOT NULL, primary_visual_idea TEXT NOT NULL,
  must_be_seen_json TEXT NOT NULL, can_be_narrated_json TEXT NOT NULL,
  can_be_implied_json TEXT NOT NULL, required_identity_anchor_ids_json TEXT NOT NULL,
  primary_asset_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_events (
  event_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, event_type TEXT NOT NULL,
  target_type TEXT NOT NULL, target_id TEXT NOT NULL, trigger_type TEXT NOT NULL,
  payload_json TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_outbox (
  outbox_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, processed_at TEXT,
  FOREIGN KEY(event_id) REFERENCES workflow_events(event_id)
);

CREATE INDEX IF NOT EXISTS idx_sources_project ON research_sources(project_id);
CREATE INDEX IF NOT EXISTS idx_facts_project ON facts(project_id);
CREATE INDEX IF NOT EXISTS idx_scripts_project ON scripts(project_id);
CREATE INDEX IF NOT EXISTS idx_scenes_project ON scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON event_outbox(status);
`;

const encode = (values: string[]) => JSON.stringify(values);

export class SqliteStoryRepository implements StoryRepository {
  readonly db: Database.Database;

  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(FOUNDATION_MIGRATION_SQL);
  }

  close(): void { this.db.close(); }

  async addResearchSource(v: ResearchSource): Promise<void> {
    this.db.prepare(`INSERT INTO research_sources
      (id, project_id, revision, lifecycle_status, title, source_type, url, citation, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(v.id, v.projectId, v.revision, v.lifecycleStatus, v.title, v.sourceType,
        v.url ?? null, v.citation ?? null, v.notes ?? null, v.createdAt, v.updatedAt);
  }

  async addFact(v: FactRecord): Promise<void> {
    this.db.prepare(`INSERT INTO facts
      (id, project_id, revision, lifecycle_status, statement, classification, source_ids_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(v.id, v.projectId, v.revision, v.lifecycleStatus, v.statement,
        v.classification, encode(v.sourceIds), v.status, v.createdAt, v.updatedAt);
  }

  async saveScript(v: ScriptVersion): Promise<void> {
    this.db.prepare(`INSERT INTO scripts
      (id, project_id, revision, lifecycle_status, kind, body, approval_state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(v.id, v.projectId, v.revision, v.lifecycleStatus, v.kind, v.body,
        v.approvalState, v.createdAt, v.updatedAt);
  }

  async saveChapter(v: Chapter): Promise<void> {
    this.db.prepare(`INSERT OR REPLACE INTO chapters
      (id, project_id, revision, lifecycle_status, display_number, title, sequence_ids_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(v.id, v.projectId, v.revision, v.lifecycleStatus, v.displayNumber,
        v.title, encode(v.sequenceIds), v.createdAt, v.updatedAt);
  }

  async saveSequence(v: Sequence): Promise<void> {
    this.db.prepare(`INSERT OR REPLACE INTO sequences
      (id, project_id, chapter_id, revision, lifecycle_status, display_number, title, story_purpose, scene_ids_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(v.id, v.projectId, v.chapterId, v.revision, v.lifecycleStatus,
        v.displayNumber, v.title, v.storyPurpose, encode(v.sceneIds), v.createdAt, v.updatedAt);
  }

  async saveScene(v: Scene): Promise<void> {
    this.db.prepare(`INSERT OR REPLACE INTO scenes
      (id, project_id, sequence_id, revision, lifecycle_status, display_number, script_segment,
       state_in, state_current, state_out, primary_visual_idea, must_be_seen_json,
       can_be_narrated_json, can_be_implied_json, required_identity_anchor_ids_json,
       primary_asset_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(v.id, v.projectId, v.sequenceId, v.revision, v.lifecycleStatus,
        v.displayNumber, v.scriptSegment, v.stateIn, v.stateCurrent, v.stateOut,
        v.primaryVisualIdea, encode(v.mustBeSeen), encode(v.canBeNarrated),
        encode(v.canBeImplied), encode(v.requiredIdentityAnchorIds),
        v.primaryAssetId ?? null, v.createdAt, v.updatedAt);
  }

  async listFacts(projectId: string): Promise<FactRecord[]> {
    const rows = this.db.prepare(
      "SELECT * FROM facts WHERE project_id = ? ORDER BY created_at"
    ).all(projectId) as any[];
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, revision: r.revision,
      lifecycleStatus: r.lifecycle_status, createdAt: r.created_at, updatedAt: r.updated_at,
      statement: r.statement, classification: r.classification,
      sourceIds: JSON.parse(r.source_ids_json), status: r.status
    }));
  }

  async listScenes(projectId: string): Promise<Scene[]> {
    const rows = this.db.prepare(
      "SELECT * FROM scenes WHERE project_id = ? ORDER BY sequence_id, display_number"
    ).all(projectId) as any[];
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, sequenceId: r.sequence_id,
      revision: r.revision, lifecycleStatus: r.lifecycle_status,
      createdAt: r.created_at, updatedAt: r.updated_at,
      displayNumber: r.display_number, scriptSegment: r.script_segment,
      stateIn: r.state_in, stateCurrent: r.state_current, stateOut: r.state_out,
      primaryVisualIdea: r.primary_visual_idea,
      mustBeSeen: JSON.parse(r.must_be_seen_json),
      canBeNarrated: JSON.parse(r.can_be_narrated_json),
      canBeImplied: JSON.parse(r.can_be_implied_json),
      requiredIdentityAnchorIds: JSON.parse(r.required_identity_anchor_ids_json),
      ...(r.primary_asset_id == null ? {} : { primaryAssetId: r.primary_asset_id })
    }));
  }
}
