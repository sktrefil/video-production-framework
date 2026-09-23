import type { ProjectBootstrapService } from "@vpf/project-bootstrap";
import {
  findTaskDefinition,
  type ArtifactRevisionRef,
  type ProductionGateEvaluation,
  type ProductionTaskDefinition,
  type ProjectTaskInstance,
  type TaskDispatchPackage,
  type WorkflowAgentId
} from "@vpf/production-spec";
import { ProductionSpecRepository } from "@vpf/storage/production-spec";
import { Agent2StoryAudioRepository } from "@vpf/storage/agent2-story-audio";
import { WorkflowOrchestratorRepository } from "@vpf/storage/workflow-orchestrator";
import { Agent1ProductionManagerService } from "./production-spec-service.js";

export class WorkflowOrchestratorError extends Error {
  constructor(
    public readonly code:
      | "WORKFLOW_NOT_FOUND"
      | "TASK_NOT_FOUND"
      | "TASK_NOT_READY"
      | "TASK_NOT_RUNNING"
      | "TASK_AGENT_MISMATCH"
      | "TASK_GATE_REQUIRED"
      | "TASK_RETRY_EXHAUSTED",
    message: string
  ) {
    super(message);
    this.name = "WorkflowOrchestratorError";
  }
}

const nowIso = () => new Date().toISOString();

function gateInput(task: ProjectTaskInstance): unknown {
  return {
    task_id: task.task_id,
    attempt: task.attempt,
    input_revision_refs: task.input_revision_refs,
    output_revision_refs: task.output_revision_refs
  };
}

function sameRef(a: ArtifactRevisionRef, b: ArtifactRevisionRef | null): boolean {
  return b !== null && a.artifact_type === b.artifact_type && a.revision === b.revision && a.sha256 === b.sha256;
}

export class Agent1WorkflowOrchestratorService {
  private readonly production: Agent1ProductionManagerService;

  constructor(private readonly projects: ProjectBootstrapService) {
    this.production = new Agent1ProductionManagerService(projects);
  }

  async status(projectId: string): Promise<{
    project_id: string;
    workflow_id: string;
    workflow_version: string;
    workflow_hash: string;
    profile: string;
    tasks: ProjectTaskInstance[];
    ready_tasks: string[];
    next_task: ProjectTaskInstance | null;
  }> {
    const dbPath = (await this.projects.getStatus(projectId)).projectDbPath;
    await this.ensureProjectGate(projectId, dbPath);
    const repo = new WorkflowOrchestratorRepository(dbPath);
    try {
      await this.refresh(projectId, repo);
      const workflow = repo.getWorkflow(projectId);
      if (workflow === null) throw new WorkflowOrchestratorError("WORKFLOW_NOT_FOUND", `Workflow not found for ${projectId}.`);
      const tasks = repo.listTasks(projectId);
      const ready = tasks.filter(task => task.status === "READY");
      return {
        project_id: projectId,
        workflow_id: workflow.workflow_id,
        workflow_version: workflow.workflow_version,
        workflow_hash: workflow.workflow_sha256,
        profile: workflow.profile,
        tasks,
        ready_tasks: ready.map(task => task.task_id),
        next_task: ready[0] ?? null
      };
    } finally {
      repo.close();
    }
  }

  async next(projectId: string): Promise<ProjectTaskInstance | null> {
    return (await this.status(projectId)).next_task;
  }

  async dispatch(projectId: string, taskId?: string, requestedAgent?: WorkflowAgentId): Promise<TaskDispatchPackage> {
    const status = await this.projects.getStatus(projectId);
    await this.ensureProjectGate(projectId, status.projectDbPath);
    const repo = new WorkflowOrchestratorRepository(status.projectDbPath);
    try {
      await this.refresh(projectId, repo);
      const workflow = repo.getWorkflow(projectId);
      if (workflow === null) throw new WorkflowOrchestratorError("WORKFLOW_NOT_FOUND", `Workflow not found for ${projectId}.`);
      const task = taskId === undefined
        ? repo.listTasks(projectId).find(item => item.status === "READY") ?? null
        : repo.getTask(projectId, taskId);
      if (task === null) throw new WorkflowOrchestratorError("TASK_NOT_FOUND", `Task not found for ${projectId}: ${taskId ?? "<next>"}.`);
      if (task.status !== "READY" && task.status !== "REVISION_REQUIRED") {
        throw new WorkflowOrchestratorError("TASK_NOT_READY", `${task.task_id} is ${task.status}, not dispatchable.`);
      }
      if (requestedAgent !== undefined && requestedAgent !== task.assigned_agent) {
        throw new WorkflowOrchestratorError("TASK_AGENT_MISMATCH", `${task.task_id} belongs to ${task.assigned_agent}, not ${requestedAgent}.`);
      }
      const definition = findTaskDefinition(workflow.definition, task.task_id);
      if (definition === null) throw new WorkflowOrchestratorError("TASK_NOT_FOUND", `Task definition missing: ${task.task_id}.`);
      if (task.attempt >= definition.retry_policy.max_attempts) {
        repo.updateTask({ projectId, taskId: task.task_id, status: "FAILED", updatedAt: nowIso() });
        throw new WorkflowOrchestratorError("TASK_RETRY_EXHAUSTED", `${task.task_id} exceeded ${definition.retry_policy.max_attempts} attempts.`);
      }
      if (task.task_id === "T070" && !(await this.generationGateCurrent(projectId, status.projectDbPath))) {
        throw new WorkflowOrchestratorError("TASK_GATE_REQUIRED", "T070 requires a current GENERATION_READY_GATE PASS.");
      }
      const attempt = task.attempt + 1;
      const at = nowIso();
      const inputRefs = this.resolveRefs(projectId, definition.required_inputs, repo);
      const dispatch: TaskDispatchPackage = {
        dispatch_id: `${projectId}:${task.task_id}:A${attempt}`,
        project_id: projectId,
        task_instance_id: task.task_instance_id,
        task_id: task.task_id,
        assigned_agent: task.assigned_agent,
        task_type: task.task_type,
        instruction_id: definition.instruction_id ?? `${definition.task_type}_V1`,
        attempt,
        required_inputs: [...definition.required_inputs],
        required_outputs: [...definition.required_outputs],
        policies: [...definition.production_policies],
        completion_gate: definition.completion_gate,
        input_revision_refs: inputRefs,
        created_at: at
      };
      repo.updateTask({
        projectId,
        taskId: task.task_id,
        status: "RUNNING",
        attempt,
        inputRefs,
        lastGateId: null,
        lastGateStatus: null,
        startedAt: at,
        completedAt: null,
        updatedAt: at
      });
      repo.saveDispatch(dispatch);
      return dispatch;
    } finally {
      repo.close();
    }
  }

  async recordGate(projectId: string, taskId: string, pass: boolean, issues: Array<{code: string; message: string}> = []): Promise<ProductionGateEvaluation> {
    const status = await this.projects.getStatus(projectId);
    const workflowRepo = new WorkflowOrchestratorRepository(status.projectDbPath);
    const productionRepo = new ProductionSpecRepository(status.projectDbPath);
    try {
      const workflow = workflowRepo.getWorkflow(projectId);
      const task = workflowRepo.getTask(projectId, taskId);
      if (workflow === null) throw new WorkflowOrchestratorError("WORKFLOW_NOT_FOUND", `Workflow not found for ${projectId}.`);
      if (task === null) throw new WorkflowOrchestratorError("TASK_NOT_FOUND", `Task not found: ${taskId}.`);
      if (task.status !== "RUNNING") throw new WorkflowOrchestratorError("TASK_NOT_RUNNING", `${taskId} must be RUNNING before gate evaluation.`);
      const definition = findTaskDefinition(workflow.definition, taskId);
      if (definition === null) throw new WorkflowOrchestratorError("TASK_NOT_FOUND", `Task definition missing: ${taskId}.`);
      const outputRefs = this.resolveRefs(projectId, definition.required_outputs, workflowRepo);
      const updated = { ...task, output_revision_refs: outputRefs };
      const at = nowIso();
      const evaluation: ProductionGateEvaluation = {
        project_id: projectId,
        gate: definition.completion_gate,
        status: pass ? "PASS" : "FAIL",
        valid: pass,
        ready_for_generation: false,
        errors: pass ? [] : issues.map(issue => ({ ...issue })),
        warnings: [],
        evaluated_by: "AGENT1_MANAGER",
        evaluated_at: at
      };
      workflowRepo.updateTask({
        projectId,
        taskId,
        outputRefs,
        lastGateId: definition.completion_gate,
        lastGateStatus: evaluation.status,
        updatedAt: at
      });
      productionRepo.saveGateEvaluation(evaluation, gateInput(updated));
      if (!pass) {
        workflowRepo.updateTask({ projectId, taskId, status: "REVISION_REQUIRED", completedAt: null, updatedAt: at });
        this.blockDescendants(projectId, taskId, workflow.definition.tasks, workflowRepo, at);
      }
      return evaluation;
    } finally {
      productionRepo.close();
      workflowRepo.close();
    }
  }

  async complete(projectId: string, taskId: string): Promise<ProjectTaskInstance> {
    const status = await this.projects.getStatus(projectId);
    const workflowRepo = new WorkflowOrchestratorRepository(status.projectDbPath);
    const productionRepo = new ProductionSpecRepository(status.projectDbPath);
    try {
      const workflow = workflowRepo.getWorkflow(projectId);
      let task = workflowRepo.getTask(projectId, taskId);
      if (workflow === null) throw new WorkflowOrchestratorError("WORKFLOW_NOT_FOUND", `Workflow not found for ${projectId}.`);
      if (task === null) throw new WorkflowOrchestratorError("TASK_NOT_FOUND", `Task not found: ${taskId}.`);
      if (task.status !== "RUNNING") throw new WorkflowOrchestratorError("TASK_NOT_RUNNING", `${taskId} must be RUNNING before completion.`);
      const definition = findTaskDefinition(workflow.definition, taskId);
      if (definition === null) throw new WorkflowOrchestratorError("TASK_NOT_FOUND", `Task definition missing: ${taskId}.`);

      const outputRefs = this.resolveRefs(projectId, definition.required_outputs, workflowRepo);
      workflowRepo.updateTask({ projectId, taskId, outputRefs, updatedAt: nowIso() });
      task = workflowRepo.getTask(projectId, taskId)!;

      const evaluated = await this.ensureCompletionGate(projectId, definition, task, productionRepo);
      if (evaluated.status !== "PASS") {
        const at = nowIso();
        workflowRepo.updateTask({
          projectId,
          taskId,
          status: "REVISION_REQUIRED",
          lastGateId: definition.completion_gate,
          lastGateStatus: "FAIL",
          completedAt: null,
          updatedAt: at
        });
        this.blockDescendants(projectId, taskId, workflow.definition.tasks, workflowRepo, at);
        throw new WorkflowOrchestratorError("TASK_GATE_REQUIRED", `${definition.completion_gate} did not PASS for ${taskId}.`);
      }

      const at = nowIso();
      workflowRepo.updateTask({
        projectId,
        taskId,
        status: "COMPLETE",
        lastGateId: definition.completion_gate,
        lastGateStatus: "PASS",
        completedAt: at,
        updatedAt: at
      });
      if (taskId === "T060") {
        await this.production.generationReady(projectId);
      }
      await this.refresh(projectId, workflowRepo);
      return workflowRepo.getTask(projectId, taskId)!;
    } finally {
      productionRepo.close();
      workflowRepo.close();
    }
  }

  async requestRevision(projectId: string, taskId: string): Promise<void> {
    const status = await this.projects.getStatus(projectId);
    const repo = new WorkflowOrchestratorRepository(status.projectDbPath);
    try {
      const workflow = repo.getWorkflow(projectId);
      const task = repo.getTask(projectId, taskId);
      if (workflow === null) throw new WorkflowOrchestratorError("WORKFLOW_NOT_FOUND", `Workflow not found for ${projectId}.`);
      if (task === null) throw new WorkflowOrchestratorError("TASK_NOT_FOUND", `Task not found: ${taskId}.`);
      const at = nowIso();
      repo.updateTask({ projectId, taskId, status: "REVISION_REQUIRED", completedAt: null, updatedAt: at });
      this.blockDescendants(projectId, taskId, workflow.definition.tasks, repo, at);
    } finally {
      repo.close();
    }
  }

  private async refresh(projectId: string, repo: WorkflowOrchestratorRepository): Promise<void> {
    const workflow = repo.getWorkflow(projectId);
    if (workflow === null) return;
    const at = nowIso();

    for (const task of repo.listTasks(projectId)) {
      if (!["COMPLETE", "RUNNING"].includes(task.status)) continue;
      const stale = task.input_revision_refs.some(ref => !sameRef(ref, repo.resolveArtifactRef(projectId, ref.artifact_type)));
      if (stale) {
        repo.updateTask({ projectId, taskId: task.task_id, status: "REVISION_REQUIRED", completedAt: null, updatedAt: at });
        this.blockDescendants(projectId, task.task_id, workflow.definition.tasks, repo, at);
      }
    }

    const tasks = repo.listTasks(projectId);
    for (const task of tasks) {
      if (!["BLOCKED", "PENDING"].includes(task.status)) continue;
      const definition = findTaskDefinition(workflow.definition, task.task_id);
      if (definition === null) continue;
      const dependenciesComplete = definition.depends_on.every(id => repo.getTask(projectId, id)?.status === "COMPLETE");
      if (!dependenciesComplete) continue;
      if (task.task_id === "T070") {
        const status = await this.projects.getStatus(projectId);
        if (!(await this.generationGateCurrent(projectId, status.projectDbPath))) continue;
      }
      repo.updateTask({ projectId, taskId: task.task_id, status: "READY", updatedAt: at });
    }
  }

  private blockDescendants(
    projectId: string,
    taskId: string,
    definitions: ProductionTaskDefinition[],
    repo: WorkflowOrchestratorRepository,
    at: string
  ): void {
    const queue = [taskId];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const parent = queue.shift()!;
      for (const definition of definitions.filter(item => item.depends_on.includes(parent))) {
        if (visited.has(definition.task_id)) continue;
        visited.add(definition.task_id);
        const dependent = repo.getTask(projectId, definition.task_id);
        if (dependent && dependent.status !== "CANCELLED") {
          repo.updateTask({
            projectId,
            taskId: definition.task_id,
            status: "BLOCKED",
            completedAt: null,
            updatedAt: at
          });
        }
        queue.push(definition.task_id);
      }
    }
  }

  private resolveRefs(projectId: string, names: string[], repo: WorkflowOrchestratorRepository): ArtifactRevisionRef[] {
    const refs: ArtifactRevisionRef[] = [];
    for (const name of names) {
      const ref = repo.resolveArtifactRef(projectId, name);
      if (ref !== null) refs.push(ref);
    }
    return refs;
  }

  private async ensureCompletionGate(
    projectId: string,
    definition: ProductionTaskDefinition,
    task: ProjectTaskInstance,
    repo: ProductionSpecRepository
  ): Promise<ProductionGateEvaluation> {
    if (definition.completion_gate === "RESEARCH_GATE") return this.production.validateResearch(projectId);
    if (definition.completion_gate === "SCRIPT_GATE") return this.production.validateScript(projectId);
    if (definition.completion_gate === "STORY_AUDIO_GATE") return this.production.validateStory(projectId);
    if (definition.completion_gate === "CLIP_PLAN_GATE") return this.production.validateClips(projectId);

    const latest = repo.getLatestGate(projectId, definition.completion_gate);
    if (latest?.status === "PASS" && repo.isLatestGateCurrent(projectId, definition.completion_gate, gateInput(task))) return latest;
    throw new WorkflowOrchestratorError("TASK_GATE_REQUIRED", `A current ${definition.completion_gate} PASS is required for ${task.task_id}.`);
  }

  private async ensureProjectGate(projectId: string, dbPath: string): Promise<void> {
    const repo = new ProductionSpecRepository(dbPath);
    try {
      const project = repo.getProjectSpec(projectId);
      if (project === null) return;
      const gate = repo.getLatestGate(projectId, "PROJECT_INIT_GATE");
      if (gate?.status === "PASS" && repo.isLatestGateCurrent(projectId, "PROJECT_INIT_GATE", project)) return;
    } finally {
      repo.close();
    }
    await this.production.validateProject(projectId);
  }

  private async generationGateCurrent(projectId: string, dbPath: string): Promise<boolean> {
    const repo = new ProductionSpecRepository(dbPath);
    const agent2 = new Agent2StoryAudioRepository(dbPath, { readonly: true });
    try {
      const project = repo.getProjectSpec(projectId);
      const scenes = repo.getSceneTiming(projectId);
      const clips = repo.getClipProduction(projectId);
      const tts = agent2.getActive(projectId, "tts_manifest")?.value ?? null;
      const subtitles = agent2.getActive(projectId, "subtitle_timing")?.value ?? null;
      const input = { project, scenes, clips, tts, subtitles };
      const gate = repo.getLatestGate(projectId, "GENERATION_READY_GATE");
      return gate?.status === "PASS" && repo.isLatestGateCurrent(projectId, "GENERATION_READY_GATE", input);
    } finally {
      agent2.close();
      repo.close();
    }
  }
}
