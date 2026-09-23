import Database from "better-sqlite3";
import type {
  ArtifactRevisionRef,
  ProductionWorkflowDefinition,
  ProjectTaskInstance,
  TaskDispatchPackage,
  TaskStatus,
  WorkflowAgentId
} from "@vpf/production-spec";

const parseRefs = (value: string): ArtifactRevisionRef[] => JSON.parse(value) as ArtifactRevisionRef[];

function mapTask(row: any): ProjectTaskInstance {
  return {
    project_id: String(row.project_id),
    task_instance_id: String(row.task_instance_id),
    task_id: String(row.task_id),
    task_order: Number(row.task_order),
    assigned_agent: row.assigned_agent as WorkflowAgentId,
    task_type: String(row.task_type),
    status: row.status as TaskStatus,
    workflow_id: "",
    workflow_version: "",
    attempt: Number(row.attempt),
    manual_approval_required: Number(row.manual_approval_required) === 1,
    input_revision_refs: parseRefs(String(row.input_refs_json)),
    output_revision_refs: parseRefs(String(row.output_refs_json)),
    last_gate_id: row.last_gate_id == null ? null : row.last_gate_id,
    last_gate_status: row.last_gate_status == null ? null : row.last_gate_status,
    created_at: String(row.created_at),
    started_at: row.started_at == null ? null : String(row.started_at),
    completed_at: row.completed_at == null ? null : String(row.completed_at),
    updated_at: String(row.updated_at)
  };
}

export interface StoredWorkflowSnapshot {
  project_id: string;
  workflow_id: string;
  workflow_version: string;
  workflow_sha256: string;
  profile: string;
  definition: ProductionWorkflowDefinition;
  created_at: string;
}

export class WorkflowOrchestratorRepository {
  readonly db: Database.Database;

  constructor(filename: string, options: { readonly?: boolean } = {}) {
    this.db = new Database(filename, { readonly: options.readonly ?? false, fileMustExist: true });
    this.db.pragma("foreign_keys = ON");
  }

  close(): void { this.db.close(); }

  getWorkflow(projectId: string): StoredWorkflowSnapshot | null {
    const row = this.db.prepare(`SELECT * FROM production_workflow_instances WHERE project_id = ?`).get(projectId) as any;
    if (row === undefined) return null;
    return {
      project_id: String(row.project_id),
      workflow_id: String(row.workflow_id),
      workflow_version: String(row.workflow_version),
      workflow_sha256: String(row.workflow_sha256),
      profile: String(row.profile),
      definition: JSON.parse(String(row.workflow_json)) as ProductionWorkflowDefinition,
      created_at: String(row.created_at)
    };
  }

  listTasks(projectId: string): ProjectTaskInstance[] {
    const workflow = this.getWorkflow(projectId);
    const rows = this.db.prepare(`SELECT * FROM production_task_instances WHERE project_id = ? ORDER BY task_order`).all(projectId) as any[];
    return rows.map(row => {
      const task = mapTask(row);
      task.workflow_id = workflow?.workflow_id ?? "";
      task.workflow_version = workflow?.workflow_version ?? "";
      return task;
    });
  }

  getTask(projectId: string, taskId: string): ProjectTaskInstance | null {
    const workflow = this.getWorkflow(projectId);
    const row = this.db.prepare(`SELECT * FROM production_task_instances WHERE project_id = ? AND task_id = ?`).get(projectId, taskId) as any;
    if (row === undefined) return null;
    const task = mapTask(row);
    task.workflow_id = workflow?.workflow_id ?? "";
    task.workflow_version = workflow?.workflow_version ?? "";
    return task;
  }

  updateTask(input: {
    projectId: string;
    taskId: string;
    status?: TaskStatus;
    attempt?: number;
    inputRefs?: ArtifactRevisionRef[];
    outputRefs?: ArtifactRevisionRef[];
    lastGateId?: string | null;
    lastGateStatus?: "PASS" | "FAIL" | null;
    startedAt?: string | null;
    completedAt?: string | null;
    updatedAt: string;
  }): void {
    const current = this.getTask(input.projectId, input.taskId);
    if (current === null) throw new Error(`Task not found: ${input.projectId}:${input.taskId}`);
    this.db.prepare(`UPDATE production_task_instances SET
      status = ?, attempt = ?, input_refs_json = ?, output_refs_json = ?,
      last_gate_id = ?, last_gate_status = ?, started_at = ?, completed_at = ?, updated_at = ?
      WHERE project_id = ? AND task_id = ?`).run(
      input.status ?? current.status,
      input.attempt ?? current.attempt,
      JSON.stringify(input.inputRefs ?? current.input_revision_refs),
      JSON.stringify(input.outputRefs ?? current.output_revision_refs),
      input.lastGateId === undefined ? current.last_gate_id : input.lastGateId,
      input.lastGateStatus === undefined ? current.last_gate_status : input.lastGateStatus,
      input.startedAt === undefined ? current.started_at : input.startedAt,
      input.completedAt === undefined ? current.completed_at : input.completedAt,
      input.updatedAt,
      input.projectId,
      input.taskId
    );
  }

  saveDispatch(dispatch: TaskDispatchPackage): void {
    this.db.prepare(`INSERT INTO production_task_dispatches
      (dispatch_id, project_id, task_id, attempt, dispatch_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(
      dispatch.dispatch_id,
      dispatch.project_id,
      dispatch.task_id,
      dispatch.attempt,
      JSON.stringify(dispatch),
      dispatch.created_at
    );
  }

  listDispatches(projectId: string, taskId?: string): TaskDispatchPackage[] {
    const rows = taskId === undefined
      ? this.db.prepare(`SELECT dispatch_json FROM production_task_dispatches WHERE project_id = ? ORDER BY created_at`).all(projectId) as Array<{dispatch_json: string}>
      : this.db.prepare(`SELECT dispatch_json FROM production_task_dispatches WHERE project_id = ? AND task_id = ? ORDER BY created_at`).all(projectId, taskId) as Array<{dispatch_json: string}>;
    return rows.map(row => JSON.parse(row.dispatch_json) as TaskDispatchPackage);
  }

  resolveArtifactRef(projectId: string, artifactType: string): ArtifactRevisionRef | null {
    const tables: Record<string, string> = {
      project_spec: "production_project_specs",
      scene_timing_spec: "production_scene_timing_specs",
      clip_production_spec: "production_clip_specs"
    };
    const table = tables[artifactType];
    if (table !== undefined) {
      const row = this.db.prepare(`SELECT revision, spec_sha256 FROM ${table}
        WHERE project_id = ? AND lifecycle_status = 'ACTIVE' ORDER BY revision DESC LIMIT 1`)
        .get(projectId) as { revision: number; spec_sha256: string } | undefined;
      return row === undefined ? null : {
        artifact_type: artifactType,
        revision: Number(row.revision),
        sha256: String(row.spec_sha256)
      };
    }

    const agent2Types = new Set([
      "research_spec",
      "fact_check_spec",
      "story_spec",
      "script",
      "tts_manifest",
      "subtitle_timing"
    ]);
    if (agent2Types.has(artifactType)) {
      const row = this.db.prepare(`SELECT revision, artifact_sha256
        FROM agent2_story_audio_artifacts
        WHERE project_id = ? AND artifact_type = ? AND lifecycle_status = 'ACTIVE'
        ORDER BY revision DESC LIMIT 1`)
        .get(projectId, artifactType) as { revision: number; artifact_sha256: string } | undefined;
      return row === undefined ? null : {
        artifact_type: artifactType,
        revision: Number(row.revision),
        sha256: String(row.artifact_sha256)
      };
    }

    const agent3Types = new Set([
      "scene_visual_spec",
      "state_image_spec",
      "prompt_bundle_spec"
    ]);
    if (agent3Types.has(artifactType)) {
      const row = this.db.prepare(`SELECT revision, artifact_sha256
        FROM agent3_visual_artifacts
        WHERE project_id = ? AND artifact_type = ? AND lifecycle_status = 'ACTIVE'
        ORDER BY revision DESC LIMIT 1`)
        .get(projectId, artifactType) as { revision: number; artifact_sha256: string } | undefined;
      return row === undefined ? null : {
        artifact_type: artifactType,
        revision: Number(row.revision),
        sha256: String(row.artifact_sha256)
      };
    }

    if (artifactType === "visual_bible") {
      const row = this.db.prepare(`SELECT resource_pins_json FROM projects
        WHERE project_id = ? AND lifecycle_status = 'ACTIVE' ORDER BY revision DESC LIMIT 1`)
        .get(projectId) as { resource_pins_json: string } | undefined;
      if (row === undefined) return null;
      const pins = JSON.parse(row.resource_pins_json) as Array<{
        resourceType: string;
        resourceId: string;
        version: string;
        contentHash: string;
      }>;
      const pin = pins.find(item => item.resourceType === "CHANNEL_VISUAL_BIBLE");
      return pin === undefined ? null : {
        artifact_type: artifactType,
        revision: 1,
        sha256: pin.contentHash
      };
    }

    return null;
  }
}
