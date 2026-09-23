import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectBootstrapService } from "@vpf/project-bootstrap";
import {
  FileSystemResourceRegistry,
  type ChannelVisualBiblePayload
} from "@vpf/resource-registry";
import {
  compileAgent3Prompts,
  validateClipProductionSpecs,
  validateClipStateBindings,
  validatePromptBundle,
  validateSceneVisualDocument,
  validateStateImageDocument,
  validateStateSceneBindings,
  type Agent2FactCheckSpec,
  type Agent2StorySpec,
  type Agent3T060Input,
  type Agent3TaskExecutionResult,
  type PromptBundleDocument,
  type SceneVisualDocument,
  type StateImageDocument,
  type VisualBibleRef
} from "@vpf/production-spec";
import { Agent2StoryAudioRepository } from "@vpf/storage/agent2-story-audio";
import { Agent3VisualProductionRepository } from "@vpf/storage/agent3-visual-production";
import { ProductionSpecRepository } from "@vpf/storage/production-spec";
import { WorkflowOrchestratorRepository } from "@vpf/storage/workflow-orchestrator";

const DEFAULT_REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../..", import.meta.url))
);

type Agent3TaskId = "T040" | "T050" | "T060";

const hash = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

export class Agent3VisualProductionError extends Error {
  constructor(
    public readonly code:
      | "AGENT3_TASK_MISMATCH"
      | "AGENT3_TASK_NOT_RUNNING"
      | "AGENT3_INPUT_INVALID"
      | "AGENT3_PREREQUISITE_MISSING"
      | "AGENT3_VISUAL_BIBLE_MISSING"
      | "AGENT3_PROJECT_UPGRADE_REQUIRED"
      | "AGENT3_PROMPT_COMPILATION_FAILED",
    message: string
  ) {
    super(message);
    this.name = "Agent3VisualProductionError";
  }
}

async function readJson(filename: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filename, "utf8")) as unknown;
  } catch (error) {
    throw new Agent3VisualProductionError(
      "AGENT3_INPUT_INVALID",
      "Could not read Agent3 JSON: " + (error instanceof Error ? error.message : String(error))
    );
  }
}

function validationMessage(result: {
  errors: Array<{ code: string; message: string; path?: string }>;
}): string {
  return result.errors
    .map(issue => issue.code + (issue.path ? "@" + issue.path : "") + ": " + issue.message)
    .join(" | ");
}

function visualBibleRef(status: Awaited<ReturnType<ProjectBootstrapService["getStatus"]>>): VisualBibleRef {
  const pin = status.resourcePins.find(item => item.resourceType === "CHANNEL_VISUAL_BIBLE");
  if (pin === undefined) {
    throw new Agent3VisualProductionError(
      "AGENT3_VISUAL_BIBLE_MISSING",
      "Project does not pin a Channel Visual Bible."
    );
  }
  return {
    resource_id: pin.resourceId,
    version: pin.version,
    content_hash: pin.contentHash
  };
}

async function visualBibleSummary(
  status: Awaited<ReturnType<ProjectBootstrapService["getStatus"]>>
): Promise<string> {
  const pin = status.resourcePins.find(item => item.resourceType === "CHANNEL_VISUAL_BIBLE");
  if (pin === undefined) {
    throw new Agent3VisualProductionError(
      "AGENT3_VISUAL_BIBLE_MISSING",
      "Project does not pin a Channel Visual Bible."
    );
  }
  const registry = new FileSystemResourceRegistry(
    path.join(DEFAULT_REPOSITORY_ROOT, "resources")
  );
  const snapshot = await registry.resolvePinned<ChannelVisualBiblePayload>(pin);
  return [
    snapshot.payload.channelWideVisualApproach,
    ...snapshot.payload.realismAndFactualityPrinciples.slice(0, 3),
    ...snapshot.payload.compositionAndCameraTendencies.slice(0, 3),
    ...snapshot.payload.historicalUncertaintyHandling.slice(0, 3),
    ...snapshot.payload.avoidances.slice(0, 4)
  ].join(" ");
}

export class Agent3VisualProductionWorkerService {
  constructor(private readonly projects: ProjectBootstrapService) {}

  async execute(
    projectId: string,
    taskId: Agent3TaskId,
    filename: string
  ): Promise<Agent3TaskExecutionResult> {
    return this.executePayload(projectId, taskId, await readJson(filename));
  }

  async executePayload(
    projectId: string,
    taskId: Agent3TaskId,
    input: unknown
  ): Promise<Agent3TaskExecutionResult> {
    const status = await this.projects.getStatus(projectId);
    if (!status.migrations.appliedMigrationIds.includes("0020")) {
      throw new Agent3VisualProductionError(
        "AGENT3_PROJECT_UPGRADE_REQUIRED",
        "Agent3 Visual Production requires migration 0020. Upgrade the project schema explicitly or create a new project on the current framework."
      );
    }
    const workflow = new WorkflowOrchestratorRepository(status.projectDbPath, { readonly: true });
    try {
      const task = workflow.getTask(projectId, taskId);
      if (task === null || task.assigned_agent !== "AGENT3_VISUAL_PRODUCTION") {
        throw new Agent3VisualProductionError(
          "AGENT3_TASK_MISMATCH",
          taskId + " is not assigned to AGENT3_VISUAL_PRODUCTION."
        );
      }
      if (task.status !== "RUNNING") {
        throw new Agent3VisualProductionError(
          "AGENT3_TASK_NOT_RUNNING",
          taskId + " must be dispatched by Agent 1 before Agent 3 executes it."
        );
      }
    } finally {
      workflow.close();
    }

    if (taskId === "T040") {
      return this.executeSceneVisual(status, projectId, input);
    }
    if (taskId === "T050") {
      return this.executeStateImages(status, projectId, input);
    }
    return this.executeClipCamera(status, projectId, input);
  }

  private executeSceneVisual(
    status: Awaited<ReturnType<ProjectBootstrapService["getStatus"]>>,
    projectId: string,
    input: unknown
  ): Agent3TaskExecutionResult {
    const production = new ProductionSpecRepository(status.projectDbPath, { readonly: true });
    const agent2 = new Agent2StoryAudioRepository(status.projectDbPath, { readonly: true });
    try {
      const scenes = production.getSceneTiming(projectId);
      const story = agent2.getActive<Agent2StorySpec>(projectId, "story_spec");
      const facts = agent2.getActive<Agent2FactCheckSpec>(projectId, "fact_check_spec");
      if (scenes === null || story === null || facts === null) {
        throw new Agent3VisualProductionError(
          "AGENT3_PREREQUISITE_MISSING",
          "T040 requires active scene_timing_spec, story_spec and fact_check_spec."
        );
      }
      const validation = validateSceneVisualDocument(input, {
        projectId,
        sceneIds: scenes.scenes.map(scene => scene.scene_id),
        storyRoles: new Map(scenes.scenes.map(scene => [scene.scene_id, scene.story_role])),
        factRefsByScene: new Map(story.value.scenes.map(scene => [scene.scene_id, scene.fact_refs])),
        factClassifications: new Map(facts.value.facts.map(fact => [fact.fact_id, fact.classification])),
        visualBible: visualBibleRef(status)
      });
      if (!validation.valid) {
        throw new Agent3VisualProductionError(
          "AGENT3_INPUT_INVALID",
          validationMessage(validation)
        );
      }
      const repo = new Agent3VisualProductionRepository(status.projectDbPath);
      try {
        const saved = repo.save(
          projectId,
          "scene_visual_spec",
          structuredClone(input as SceneVisualDocument),
          "T040",
          new Date().toISOString()
        );
        return {
          project_id: projectId,
          task_id: "T040",
          assigned_agent: "AGENT3_VISUAL_PRODUCTION",
          stored_artifacts: [{
            artifact_type: saved.artifact_type,
            revision: saved.revision,
            sha256: saved.sha256
          }],
          warnings: validation.warnings.map(issue => ({
            code: issue.code,
            message: issue.message
          }))
        };
      } finally {
        repo.close();
      }
    } finally {
      agent2.close();
      production.close();
    }
  }

  private executeStateImages(
    status: Awaited<ReturnType<ProjectBootstrapService["getStatus"]>>,
    projectId: string,
    input: unknown
  ): Agent3TaskExecutionResult {
    const production = new ProductionSpecRepository(status.projectDbPath, { readonly: true });
    const agent3 = new Agent3VisualProductionRepository(status.projectDbPath, { readonly: true });
    let collectedWarnings: Array<{ code: string; message: string }> = [];
    try {
      const scenes = production.getSceneTiming(projectId);
      const visual = agent3.getActive<SceneVisualDocument>(projectId, "scene_visual_spec");
      if (scenes === null || visual === null) {
        throw new Agent3VisualProductionError(
          "AGENT3_PREREQUISITE_MISSING",
          "T050 requires active scene_timing_spec and scene_visual_spec."
        );
      }
      const validation = validateStateImageDocument(input, {
        projectId,
        sceneIds: scenes.scenes.map(scene => scene.scene_id),
        beatIdsByScene: new Map(
          scenes.scenes.map(scene => [
            scene.scene_id,
            scene.beats.map(beat => beat.beat_id)
          ])
        ),
        sceneDurationsSec: new Map(
          scenes.scenes
            .filter(scene => scene.tts !== null)
            .map(scene => [scene.scene_id, scene.tts!.duration_sec])
        )
      });
      const binding = validateStateSceneBindings(input, visual.value);
      const errors = [...validation.errors, ...binding.errors];
      if (errors.length > 0) {
        throw new Agent3VisualProductionError(
          "AGENT3_INPUT_INVALID",
          validationMessage({ errors })
        );
      }
      collectedWarnings = [...validation.warnings, ...binding.warnings]
        .map(issue => ({ code: issue.code, message: issue.message }));
    } finally {
      agent3.close();
      production.close();
    }

    const writable = new Agent3VisualProductionRepository(status.projectDbPath);
    try {
      const saved = writable.save(
        projectId,
        "state_image_spec",
        structuredClone(input as StateImageDocument),
        "T050",
        new Date().toISOString()
      );
      return {
        project_id: projectId,
        task_id: "T050",
        assigned_agent: "AGENT3_VISUAL_PRODUCTION",
        stored_artifacts: [{
          artifact_type: saved.artifact_type,
          revision: saved.revision,
          sha256: saved.sha256
        }],
        warnings: collectedWarnings
      };
    } finally {
      writable.close();
    }
  }

  private async executeClipCamera(
    status: Awaited<ReturnType<ProjectBootstrapService["getStatus"]>>,
    projectId: string,
    input: unknown
  ): Promise<Agent3TaskExecutionResult> {
    if (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input) ||
      (input as { schema_version?: unknown }).schema_version !== "1.0" ||
      (input as { project_id?: unknown }).project_id !== projectId ||
      typeof (input as { clip_production_spec?: unknown }).clip_production_spec !== "object" ||
      (input as { clip_production_spec?: unknown }).clip_production_spec === null
    ) {
      throw new Agent3VisualProductionError(
        "AGENT3_INPUT_INVALID",
        "T060 input requires schema_version=1.0, matching project_id and clip_production_spec."
      );
    }

    const typed = input as Agent3T060Input;
    const production = new ProductionSpecRepository(status.projectDbPath, { readonly: true });
    const agent3 = new Agent3VisualProductionRepository(status.projectDbPath, { readonly: true });
    let sceneVisual: SceneVisualDocument;
    let states: StateImageDocument;
    try {
      const scenes = production.getSceneTiming(projectId);
      const visual = agent3.getActive<SceneVisualDocument>(projectId, "scene_visual_spec");
      const state = agent3.getActive<StateImageDocument>(projectId, "state_image_spec");
      if (scenes === null || visual === null || state === null) {
        throw new Agent3VisualProductionError(
          "AGENT3_PREREQUISITE_MISSING",
          "T060 requires scene_timing_spec, scene_visual_spec and state_image_spec."
        );
      }
      sceneVisual = visual.value;
      states = state.value;

      const clipValidation = validateClipProductionSpecs(
        typed.clip_production_spec,
        { sceneTimings: scenes.scenes }
      );
      const bindingValidation = validateClipStateBindings(
        typed.clip_production_spec,
        states
      );
      const errors = [...clipValidation.errors, ...bindingValidation.errors];
      if (typed.clip_production_spec.project_id !== projectId) {
        errors.push({
          code: "PROJECT_ID_MISMATCH",
          path: "clip_production_spec.project_id",
          message: "Clip Production project_id mismatch."
        });
      }
      if (errors.length > 0) {
        throw new Agent3VisualProductionError(
          "AGENT3_INPUT_INVALID",
          validationMessage({ errors })
        );
      }

      let prompts: PromptBundleDocument;
      try {
        prompts = compileAgent3Prompts({
          projectId,
          visualBibleSummary: await visualBibleSummary(status),
          sceneVisual,
          states,
          clips: typed.clip_production_spec
        });
      } catch (error) {
        throw new Agent3VisualProductionError(
          "AGENT3_PROMPT_COMPILATION_FAILED",
          error instanceof Error ? error.message : String(error)
        );
      }
      const promptValidation = validatePromptBundle(prompts, {
        projectId,
        stateImageIds: states.state_images.map(item => item.state_image_id),
        clipIds: typed.clip_production_spec.clips.map(item => item.clip_id)
      });
      if (!promptValidation.valid) {
        throw new Agent3VisualProductionError(
          "AGENT3_PROMPT_COMPILATION_FAILED",
          validationMessage(promptValidation)
        );
      }

      const writableProduction = new ProductionSpecRepository(status.projectDbPath);
      const writableAgent3 = new Agent3VisualProductionRepository(status.projectDbPath);
      try {
        const at = new Date().toISOString();
        const clipRevision = writableProduction.saveClipProduction(
          projectId,
          typed.clip_production_spec,
          at
        );
        const promptSaved = writableAgent3.save(
          projectId,
          "prompt_bundle_spec",
          prompts,
          "T060",
          at
        );
        return {
          project_id: projectId,
          task_id: "T060",
          assigned_agent: "AGENT3_VISUAL_PRODUCTION",
          stored_artifacts: [
            {
              artifact_type: "clip_production_spec",
              revision: clipRevision,
              sha256: hash(JSON.stringify(typed.clip_production_spec))
            },
            {
              artifact_type: promptSaved.artifact_type,
              revision: promptSaved.revision,
              sha256: promptSaved.sha256
            }
          ],
          warnings: [
            ...clipValidation.warnings,
            ...bindingValidation.warnings,
            ...promptValidation.warnings
          ].map(issue => ({ code: issue.code, message: issue.message }))
        };
      } finally {
        writableAgent3.close();
        writableProduction.close();
      }
    } finally {
      agent3.close();
      production.close();
    }
  }
}
