import { readFile } from "node:fs/promises";
import type { ProjectBootstrapService } from "@vpf/project-bootstrap";
import {
  validateClipProductionSpecs,
  validateGenerationReady,
  validateProjectSpec,
  validateSceneTimingDocument,
  type ClipProductionDocument,
  type ProductionGateEvaluation,
  type ProductionGateId,
  type SceneTimingDocument,
  type ValidationIssue,
  type ValidationResult
} from "@vpf/production-spec";
import { ProductionSpecRepository } from "@vpf/storage/production-spec";

export class ProductionSpecCliError extends Error {
  constructor(public readonly code: "PRODUCTION_SPEC_INVALID" | "PRODUCTION_SPEC_NOT_FOUND", message: string) {
    super(message);
    this.name = "ProductionSpecCliError";
  }
}

const missing = (code: string, message: string, path?: string): ValidationIssue => ({
  code,
  message,
  ...(path === undefined ? {} : { path })
});

function result(errors: ValidationIssue[], warnings: ValidationIssue[] = [], ready = false): ValidationResult {
  return { valid: errors.length === 0, ready_for_generation: errors.length === 0 && ready, errors, warnings };
}

function merge(...values: ValidationResult[]): ValidationResult {
  const errors = values.flatMap(value => value.errors);
  const warnings = values.flatMap(value => value.warnings);
  return result(errors, warnings);
}

async function readJson(filename: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filename, "utf8")) as unknown;
  } catch (error) {
    throw new ProductionSpecCliError("PRODUCTION_SPEC_INVALID", `Could not read JSON spec ${filename}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export class Agent1ProductionManagerService {
  constructor(private readonly projects: ProjectBootstrapService) {}

  async applyStory(projectId: string, filename: string): Promise<{ stored: boolean; revision?: number; validation: ValidationResult }> {
    const status = await this.projects.getStatus(projectId);
    const input = await readJson(filename);
    const validation = validateSceneTimingDocument(input);
    if (typeof input === "object" && input !== null && (input as { project_id?: unknown }).project_id !== projectId) {
      validation.errors.push(missing("PROJECT_ID_MISMATCH", "Scene Timing project_id must match the canonical project.", "project_id"));
      validation.valid = false;
    }
    if (!validation.valid) return { stored: false, validation };
    const repo = new ProductionSpecRepository(status.projectDbPath);
    try {
      return { stored: true, revision: repo.saveSceneTiming(projectId, input as SceneTimingDocument, new Date().toISOString()), validation };
    } finally { repo.close(); }
  }

  async applyClips(projectId: string, filename: string): Promise<{ stored: boolean; revision?: number; validation: ValidationResult }> {
    const status = await this.projects.getStatus(projectId);
    const input = await readJson(filename);
    const repo = new ProductionSpecRepository(status.projectDbPath);
    try {
      const scenes = repo.getSceneTiming(projectId);
      const validation = validateClipProductionSpecs(input, { ...(scenes === null ? {} : { sceneTimings: scenes.scenes }) });
      if (typeof input === "object" && input !== null && (input as { project_id?: unknown }).project_id !== projectId) {
        validation.errors.push(missing("PROJECT_ID_MISMATCH", "Clip Production project_id must match the canonical project.", "project_id"));
        validation.valid = false;
        validation.ready_for_generation = false;
      }
      validation.ready_for_generation = false;
      if (!validation.valid) return { stored: false, validation };
      return { stored: true, revision: repo.saveClipProduction(projectId, input as ClipProductionDocument, new Date().toISOString()), validation };
    } finally { repo.close(); }
  }

  async validateProject(projectId: string): Promise<ProductionGateEvaluation> {
    return this.evaluate(projectId, "PROJECT_INIT_GATE", repo => {
      const spec = repo.getProjectSpec(projectId);
      return { input: spec, validation: spec === null
        ? result([missing("PROJECT_SPEC_MISSING", "New unified projects require a Project Spec.")])
        : validateProjectSpec(spec) };
    });
  }

  async validateStory(projectId: string): Promise<ProductionGateEvaluation> {
    return this.evaluate(projectId, "STORY_AUDIO_GATE", repo => {
      const project = repo.getProjectSpec(projectId);
      const scenes = repo.getSceneTiming(projectId);
      const projectGate = repo.getLatestGate(projectId, "PROJECT_INIT_GATE");
      const dependency = project !== null && projectGate?.status === "PASS" && repo.isLatestGateCurrent(projectId, "PROJECT_INIT_GATE", project)
        ? result([])
        : result([missing("PROJECT_INIT_GATE_REQUIRED", "A current PROJECT_INIT_GATE PASS is required before STORY_AUDIO_GATE.")]);
      const validation = scenes === null
        ? result([missing("SCENE_TIMING_SPEC_MISSING", "Scene Timing Spec is required.")])
        : validateSceneTimingDocument(scenes);
      if (scenes !== null && scenes.project_id !== projectId) validation.errors.push(missing("PROJECT_ID_MISMATCH", "Scene Timing project_id mismatch.", "project_id"));
      return { input: { project, scenes }, validation: merge(dependency, validation) };
    });
  }

  async validateClips(projectId: string): Promise<ProductionGateEvaluation> {
    return this.evaluate(projectId, "CLIP_PLAN_GATE", repo => {
      const scenes = repo.getSceneTiming(projectId);
      const clips = repo.getClipProduction(projectId);
      const storyGate = repo.getLatestGate(projectId, "STORY_AUDIO_GATE");
      const dependencyInput = { project: repo.getProjectSpec(projectId), scenes };
      const dependency = scenes !== null && storyGate?.status === "PASS" && repo.isLatestGateCurrent(projectId, "STORY_AUDIO_GATE", dependencyInput)
        ? result([])
        : result([missing("STORY_AUDIO_GATE_REQUIRED", "A current STORY_AUDIO_GATE PASS is required before CLIP_PLAN_GATE.")]);
      const validation = clips === null
        ? result([missing("CLIP_PRODUCTION_SPEC_MISSING", "Clip Production Spec is required.")])
        : validateClipProductionSpecs(clips, { ...(scenes === null ? {} : { sceneTimings: scenes.scenes }) });
      if (clips !== null && clips.project_id !== projectId) {
        validation.errors.push(missing("PROJECT_ID_MISMATCH", "Clip Production project_id mismatch.", "project_id"));
        validation.valid = false;
        validation.ready_for_generation = false;
      }
      return { input: { scenes, clips }, validation: merge(dependency, validation) };
    });
  }

  async generationReady(projectId: string): Promise<ProductionGateEvaluation> {
    return this.evaluate(projectId, "GENERATION_READY_GATE", repo => {
      const project = repo.getProjectSpec(projectId);
      const scenes = repo.getSceneTiming(projectId);
      const clips = repo.getClipProduction(projectId);
      const errors: ValidationIssue[] = [];
      const required: Array<[ProductionGateId, unknown]> = [
        ["PROJECT_INIT_GATE", project],
        ["STORY_AUDIO_GATE", { project, scenes }],
        ["CLIP_PLAN_GATE", { scenes, clips }]
      ];
      for (const [gate, input] of required) {
        const prior = repo.getLatestGate(projectId, gate);
        if (prior?.status !== "PASS" || !repo.isLatestGateCurrent(projectId, gate, input)) {
          errors.push(missing("GATE_REQUIRED_OR_STALE", `${gate} must have a current PASS before generation.`, gate));
        }
      }
      const clipValidation = clips === null
        ? result([missing("CLIP_PRODUCTION_SPEC_MISSING", "Clip Production Spec is required.")])
        : validateGenerationReady(clips, { ...(scenes === null ? {} : { sceneTimings: scenes.scenes }) });
      if (scenes !== null && scenes.project_id !== projectId) clipValidation.errors.push(missing("PROJECT_ID_MISMATCH", "Scene Timing project_id mismatch.", "project_id"));
      if (clips !== null && clips.project_id !== projectId) clipValidation.errors.push(missing("PROJECT_ID_MISMATCH", "Clip Production project_id mismatch.", "project_id"));
      clipValidation.valid = clipValidation.errors.length === 0;
      clipValidation.ready_for_generation = clipValidation.valid;
      const combined = merge(result(errors), project === null ? result([missing("PROJECT_SPEC_MISSING", "Project Spec is required.")]) : validateProjectSpec(project), scenes === null ? result([missing("SCENE_TIMING_SPEC_MISSING", "Scene Timing Spec is required.")]) : validateSceneTimingDocument(scenes), clipValidation);
      combined.ready_for_generation = combined.valid;
      return { input: { project, scenes, clips }, validation: combined };
    });
  }

  private async evaluate(
    projectId: string,
    gate: ProductionGateId,
    build: (repository: ProductionSpecRepository) => { input: unknown; validation: ValidationResult }
  ): Promise<ProductionGateEvaluation> {
    const status = await this.projects.getStatus(projectId);
    const repo = new ProductionSpecRepository(status.projectDbPath);
    try {
      const { input, validation } = build(repo);
      if (gate !== "GENERATION_READY_GATE") validation.ready_for_generation = false;
      const evaluation: ProductionGateEvaluation = {
        project_id: projectId,
        gate,
        status: validation.valid ? "PASS" : "FAIL",
        valid: validation.valid,
        ready_for_generation: validation.ready_for_generation,
        errors: validation.errors,
        warnings: validation.warnings,
        evaluated_by: "AGENT1_MANAGER",
        evaluated_at: new Date().toISOString()
      };
      repo.saveGateEvaluation(evaluation, input);
      return evaluation;
    } finally { repo.close(); }
  }
}
