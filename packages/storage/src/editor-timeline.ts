import type { TimelineAssemblyRecord } from "@vpf/domain";
import type { TimelineAssemblyRepository } from "@vpf/editor-timeline";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import { SqliteMediaBindingRepository } from "./media-binding.js";

export const EDITOR_TIMELINE_MIGRATION_SQL = "PRAGMA foreign_keys = ON;\n\nCREATE TABLE IF NOT EXISTS editor_timeline_assemblies (\n  id TEXT NOT NULL,\n  project_id TEXT NOT NULL,\n  revision INTEGER NOT NULL,\n  lifecycle_status TEXT NOT NULL,\n  source_binding_refs_json TEXT NOT NULL,\n  fps INTEGER NOT NULL,\n  width INTEGER NOT NULL,\n  height INTEGER NOT NULL,\n  assembly_status TEXT NOT NULL,\n  stale INTEGER NOT NULL,\n  stale_reason TEXT,\n  edit_project_json TEXT NOT NULL,\n  cut_boundaries_json TEXT NOT NULL,\n  motion_directives_json TEXT NOT NULL,\n  blockers_json TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY(id, revision)\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_active_editor_timeline_assembly\n  ON editor_timeline_assemblies(id) WHERE lifecycle_status = 'ACTIVE';\n\nCREATE INDEX IF NOT EXISTS idx_editor_timeline_project\n  ON editor_timeline_assemblies(project_id, revision);\n";

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

function mapAssembly(row: any): TimelineAssemblyRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceBindingRefs: JSON.parse(row.source_binding_refs_json),
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
  implements TimelineAssemblyRepository {
  constructor(filename: string) {
    super(filename);
    this.db.exec(EDITOR_TIMELINE_MIGRATION_SQL);
  }

  async getLatestAssembly(projectId: string): Promise<TimelineAssemblyRecord | null> {
    const row = this.db.prepare(
      "SELECT * FROM editor_timeline_assemblies WHERE project_id = ? AND lifecycle_status = 'ACTIVE' ORDER BY revision DESC LIMIT 1"
    ).get(projectId) as any;
    return row === undefined ? null : mapAssembly(row);
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
  }
}
