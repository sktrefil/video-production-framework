import type {
  EditorContentPlan,
  EditorContentPlanRef,
  TimelineAssemblyRecord
} from "@vpf/domain";
import type {
  EditorContentPlanRepository,
  TimelineAssemblyRepository
} from "@vpf/editor-timeline";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import { SqliteMediaBindingRepository } from "./media-binding.js";

export const EDITOR_TIMELINE_MIGRATION_SQL = "PRAGMA foreign_keys = ON;\n\nCREATE TABLE IF NOT EXISTS editor_timeline_assemblies (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  source_binding_refs_json TEXT NOT NULL,\n  fps INTEGER NOT NULL,\n  width INTEGER NOT NULL,\n  height INTEGER NOT NULL,\n  assembly_status TEXT NOT NULL,\n  stale INTEGER NOT NULL,\n  stale_reason TEXT,\n  edit_project_json TEXT NOT NULL,\n  cut_boundaries_json TEXT NOT NULL,\n  motion_directives_json TEXT NOT NULL,\n  blockers_json TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_editor_timeline_assembly\n  ON editor_timeline_assemblies(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE INDEX IF NOT EXISTS idx_editor_timeline_project\n  ON editor_timeline_assemblies(project_id, revision);\n";

export const EDITOR_CONTENT_MIGRATION_SQL = "PRAGMA foreign_keys = ON;\n\nCREATE TABLE IF NOT EXISTS editor_content_plans (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  plan_status TEXT NOT NULL,\n  audio_json TEXT NOT NULL,\n  subtitles_json TEXT NOT NULL,\n  text_overlays_json TEXT NOT NULL,\n  graphics_json TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_editor_content_plan\n  ON editor_content_plans(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE INDEX IF NOT EXISTS idx_editor_content_plan_project\n  ON editor_content_plans(project_id, revision);\n\nCREATE TABLE IF NOT EXISTS editor_timeline_content_refs (\n  assembly_id TEXT NOT NULL,\n  assembly_revision INTEGER NOT NULL,\n  content_plan_id TEXT NOT NULL,\n  content_plan_revision INTEGER NOT NULL,\n  PRIMARY KEY(assembly_id, assembly_revision)\n);\n\nCREATE INDEX IF NOT EXISTS idx_editor_timeline_content_plan_ref\n  ON editor_timeline_content_refs(content_plan_id, content_plan_revision);\n";

function insertEvent(
  db: SqliteMediaBindingRepository["db"],
  event: WorkflowEvent,
  outbox: OutboxRecord
): void {
  db.prepare("INSERT INTO workflow_events (event_id, project_id, event_type, target_type, target_id, trigger_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
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
  db.prepare("INSERT INTO event_outbox (outbox_id, event_id, status, attempts, created_at, processed_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(
      outbox.outboxId,
      outbox.eventId,
      outbox.status,
      outbox.attempts,
      outbox.createdAt,
      outbox.processedAt ?? null
    );
}

function mapContentPlan(row: any): EditorContentPlan {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    planStatus: row.plan_status,
    audio: JSON.parse(row.audio_json),
    subtitles: JSON.parse(row.subtitles_json),
    textOverlays: JSON.parse(row.text_overlays_json),
    graphics: JSON.parse(row.graphics_json)
  };
}

function mapAssembly(
  row: any,
  contentRef?: EditorContentPlanRef
): TimelineAssemblyRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceBindingRefs: JSON.parse(row.source_binding_refs_json),
    ...(contentRef === undefined ? {} : { sourceContentPlanRef: contentRef }),
    fps: row.fps,
    width: row.width,
    height: row.height,
    assemblyStatus: row.assembly_status,
    stale: row.stale === 1,
    ...(row.stale_reason == null ? {} : { staleReason: row.stale_reason }),
    editProject: JSON.parse(row.edit_project_json),
    cutBoundaries: JSON.parse(row.cut_boundaries_json),
    motionDirectives: JSON.parse(row.motion_directives_json),
    blockers: JSON.parse(row.blockers_json)
  };
}

export class SqliteEditorTimelineRepository
  extends SqliteMediaBindingRepository
  implements TimelineAssemblyRepository, EditorContentPlanRepository {
  constructor(filename: string) {
    super(filename);
    this.db.exec(EDITOR_TIMELINE_MIGRATION_SQL);
    this.db.exec(EDITOR_CONTENT_MIGRATION_SQL);
  }

  async getLatestEditorContentPlan(projectId: string): Promise<EditorContentPlan | null> {
    const row = this.db.prepare(
      "SELECT * FROM editor_content_plans WHERE project_id = ? AND lifecycle_status = 'ACTIVE' ORDER BY revision DESC LIMIT 1"
    ).get(projectId) as any;
    return row === undefined ? null : mapContentPlan(row);
  }

  async getLatestAssembly(projectId: string): Promise<TimelineAssemblyRecord | null> {
    const row = this.db.prepare(
      "SELECT * FROM editor_timeline_assemblies WHERE project_id = ? AND lifecycle_status = 'ACTIVE' ORDER BY revision DESC LIMIT 1"
    ).get(projectId) as any;
    if (row === undefined) return null;
    const refRow = this.db.prepare(
      "SELECT content_plan_id, content_plan_revision FROM editor_timeline_content_refs WHERE assembly_id = ? AND assembly_revision = ?"
    ).get(row.id, row.revision) as
      | { content_plan_id: string; content_plan_revision: number }
      | undefined;
    const contentRef =
      refRow === undefined
        ? undefined
        : {
            contentPlanId: refRow.content_plan_id,
            contentPlanRevision: refRow.content_plan_revision
          };
    return mapAssembly(row, contentRef);
  }

  async commitEditorContentPlan(input: {
    previousPlan: EditorContentPlan | null;
    plan: EditorContentPlan;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      if (input.previousPlan !== null) {
        this.db.prepare(
          "UPDATE editor_content_plans SET lifecycle_status = 'SUPERSEDED', updated_at = ? WHERE id = ? AND revision = ?"
        ).run(
          input.event.createdAt,
          input.previousPlan.id,
          input.previousPlan.revision
        );
      }
      this.db.prepare(
        "INSERT INTO editor_content_plans (id, project_id, revision, lifecycle_status, plan_status, audio_json, subtitles_json, text_overlays_json, graphics_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        input.plan.id,
        input.plan.projectId,
        input.plan.revision,
        input.plan.lifecycleStatus,
        input.plan.planStatus,
        JSON.stringify(input.plan.audio),
        JSON.stringify(input.plan.subtitles),
        JSON.stringify(input.plan.textOverlays),
        JSON.stringify(input.plan.graphics),
        input.plan.createdAt,
        input.plan.updatedAt
      );
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async commitAssembly(input: {
    previousAssembly: TimelineAssemblyRecord | null;
    assembly: TimelineAssemblyRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      if (input.previousAssembly !== null) {
        this.db.prepare(
          "UPDATE editor_timeline_assemblies SET lifecycle_status = 'SUPERSEDED', updated_at = ? WHERE id = ? AND revision = ?"
        ).run(
          input.event.createdAt,
          input.previousAssembly.id,
          input.previousAssembly.revision
        );
      }
      this.insertAssembly(input.assembly);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  async markAssemblyStale(input: {
    previousAssembly: TimelineAssemblyRecord;
    nextAssembly: TimelineAssemblyRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare(
        "UPDATE editor_timeline_assemblies SET lifecycle_status = 'SUPERSEDED', updated_at = ? WHERE id = ? AND revision = ?"
      ).run(
        input.event.createdAt,
        input.previousAssembly.id,
        input.previousAssembly.revision
      );
      this.insertAssembly(input.nextAssembly);
      insertEvent(this.db, input.event, input.outbox);
    })();
  }

  private insertAssembly(assembly: TimelineAssemblyRecord): void {
    this.db.prepare(
      "INSERT INTO editor_timeline_assemblies (id, project_id, revision, lifecycle_status, source_binding_refs_json, fps, width, height, assembly_status, stale, stale_reason, edit_project_json, cut_boundaries_json, motion_directives_json, blockers_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      assembly.id,
      assembly.projectId,
      assembly.revision,
      assembly.lifecycleStatus,
      JSON.stringify(assembly.sourceBindingRefs),
      assembly.fps,
      assembly.width,
      assembly.height,
      assembly.assemblyStatus,
      assembly.stale ? 1 : 0,
      assembly.staleReason ?? null,
      JSON.stringify(assembly.editProject),
      JSON.stringify(assembly.cutBoundaries),
      JSON.stringify(assembly.motionDirectives),
      JSON.stringify(assembly.blockers),
      assembly.createdAt,
      assembly.updatedAt
    );
    if (assembly.sourceContentPlanRef !== undefined) {
      this.db.prepare(
        "INSERT INTO editor_timeline_content_refs (assembly_id, assembly_revision, content_plan_id, content_plan_revision) VALUES (?, ?, ?, ?)"
      ).run(
        assembly.id,
        assembly.revision,
        assembly.sourceContentPlanRef.contentPlanId,
        assembly.sourceContentPlanRef.contentPlanRevision
      );
    }
  }
}
