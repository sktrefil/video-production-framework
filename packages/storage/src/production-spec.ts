import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import type {
  ClipProductionDocument,
  ProductionGateEvaluation,
  ProductionGateId,
  ProjectSpec,
  SceneTimingDocument
} from "@vpf/production-spec";

type SpecTable = "production_project_specs" | "production_scene_timing_specs" | "production_clip_specs";
const json = (value: unknown) => JSON.stringify(value);
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export class ProductionSpecRepository {
  readonly db: Database.Database;

  constructor(filename: string, options: { readonly?: boolean } = {}) {
    this.db = new Database(filename, { readonly: options.readonly ?? false, fileMustExist: true });
    this.db.pragma("foreign_keys = ON");
  }

  close(): void { this.db.close(); }

  saveProjectSpec(projectId: string, spec: ProjectSpec, at: string): number {
    return this.saveSpec("production_project_specs", projectId, spec.schema_version, spec, at);
  }
  saveSceneTiming(projectId: string, spec: SceneTimingDocument, at: string): number {
    return this.saveSpec("production_scene_timing_specs", projectId, spec.schema_version, spec, at);
  }
  saveClipProduction(projectId: string, spec: ClipProductionDocument, at: string): number {
    return this.saveSpec("production_clip_specs", projectId, spec.schema_version, spec, at);
  }
  getProjectSpec(projectId: string): ProjectSpec | null {
    return this.getSpec<ProjectSpec>("production_project_specs", projectId);
  }
  getSceneTiming(projectId: string): SceneTimingDocument | null {
    return this.getSpec<SceneTimingDocument>("production_scene_timing_specs", projectId);
  }
  getClipProduction(projectId: string): ClipProductionDocument | null {
    return this.getSpec<ClipProductionDocument>("production_clip_specs", projectId);
  }

  saveGateEvaluation(evaluation: ProductionGateEvaluation, input: unknown): number {
    const save = this.db.transaction(() => {
      const row = this.db.prepare("SELECT COALESCE(MAX(revision), 0) revision FROM production_gate_evaluations WHERE project_id = ? AND gate_id = ?")
        .get(evaluation.project_id, evaluation.gate) as { revision: number };
      const revision = Number(row.revision) + 1;
      this.db.prepare(`INSERT INTO production_gate_evaluations
        (project_id, gate_id, revision, status, result_json, input_sha256, evaluated_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(evaluation.project_id, evaluation.gate, revision, evaluation.status, json(evaluation), sha256(json(input)), evaluation.evaluated_by, evaluation.evaluated_at);
      return revision;
    });
    return save();
  }

  getLatestGate(projectId: string, gate: ProductionGateId): ProductionGateEvaluation | null {
    const row = this.db.prepare("SELECT result_json FROM production_gate_evaluations WHERE project_id = ? AND gate_id = ? ORDER BY revision DESC LIMIT 1")
      .get(projectId, gate) as { result_json: string } | undefined;
    return row === undefined ? null : JSON.parse(row.result_json) as ProductionGateEvaluation;
  }

  isLatestGateCurrent(projectId: string, gate: ProductionGateId, input: unknown): boolean {
    const row = this.db.prepare("SELECT input_sha256 FROM production_gate_evaluations WHERE project_id = ? AND gate_id = ? ORDER BY revision DESC LIMIT 1")
      .get(projectId, gate) as { input_sha256: string } | undefined;
    return row !== undefined && row.input_sha256 === sha256(json(input));
  }

  private saveSpec(table: SpecTable, projectId: string, schemaVersion: string, spec: unknown, at: string): number {
    const encoded = json(spec);
    const save = this.db.transaction(() => {
      const row = this.db.prepare(`SELECT COALESCE(MAX(revision), 0) revision FROM ${table} WHERE project_id = ?`).get(projectId) as { revision: number };
      const revision = Number(row.revision) + 1;
      this.db.prepare(`UPDATE ${table} SET lifecycle_status = 'SUPERSEDED' WHERE project_id = ? AND lifecycle_status = 'ACTIVE'`).run(projectId);
      this.db.prepare(`INSERT INTO ${table} (project_id, revision, lifecycle_status, schema_version, spec_json, spec_sha256, created_at) VALUES (?, ?, 'ACTIVE', ?, ?, ?, ?)`)
        .run(projectId, revision, schemaVersion, encoded, sha256(encoded), at);
      return revision;
    });
    return save();
  }

  private getSpec<T>(table: SpecTable, projectId: string): T | null {
    const row = this.db.prepare(`SELECT spec_json FROM ${table} WHERE project_id = ? AND lifecycle_status = 'ACTIVE' ORDER BY revision DESC LIMIT 1`)
      .get(projectId) as { spec_json: string } | undefined;
    return row === undefined ? null : JSON.parse(row.spec_json) as T;
  }
}
