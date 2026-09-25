import { readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import type { ProjectBootstrapService } from "@vpf/project-bootstrap";
import type { PromptBundleDocument, SceneVisualDocument } from "@vpf/production-spec";
import { Agent3VisualProductionRepository } from "@vpf/storage/agent3-visual-production";
import { ProductionTailRepository } from "@vpf/storage/production-tail";
import { WorkflowOrchestratorRepository } from "@vpf/storage/workflow-orchestrator";
import { calculateOverallProgress } from "./production-progress.js";
import type { ProductionDashboardHub } from "./production-dashboard-hub.js";
import {
  combineEtaRanges,
  DEFAULT_TASK_ETA_SEC,
  estimateTaskRemaining,
  type EtaRange
} from "./production-dashboard-eta.js";

const TASK_LABELS: Readonly<Record<string, string>> = Object.freeze({
  T010: "Research / Fact Check",
  T020: "Story / Script",
  T030: "TTS / Timing",
  T040: "Visual Scene Plan",
  T050: "State Image Plan",
  T060: "Clip / Camera Plan",
  T070: "Image Generation / QC",
  T080: "Google Flow Video / QC",
  T090: "Editorial Assembly",
  T100: "Final Cinematic QC"
});

function safeFileSegment(value: string): string {
  const safe = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  return safe || "artifact";
}

async function isReadyFile(filename: string): Promise<boolean> {
  try {
    const info = await stat(filename);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

function secondsBetween(start: string | null, end: string | null): number {
  if (start === null || end === null) return 0;
  const delta = Date.parse(end) - Date.parse(start);
  return Number.isFinite(delta) ? Math.max(0, Math.round(delta / 1000)) : 0;
}

export async function countGeneratedImageFiles(
  projectRoot: string,
  stateImageIds: readonly string[]
): Promise<{
  total: number;
  completed: number;
  items: Array<{ state_image_id: string; relative_path: string; ready: boolean }>;
}> {
  const items = await Promise.all(stateImageIds.map(async stateImageId => {
    const relativePath = "05_images/generated/" + safeFileSegment(stateImageId) + ".png";
    return {
      state_image_id: stateImageId,
      relative_path: relativePath,
      ready: await isReadyFile(path.resolve(projectRoot, relativePath))
    };
  }));
  return {
    total: items.length,
    completed: items.filter(item => item.ready).length,
    items
  };
}

interface T070CheckpointSnapshot {
  phase?: unknown;
  seed_image_ids?: unknown;
  scene_qc_passed_ids?: unknown;
  scene_qc_attempts?: unknown;
  revision_feedback_by_state?: unknown;
}

async function inspectT070Checkpoint(projectRoot:string):Promise<{
  phase:string|null;
  seed_image_ids:string[];
  scene_qc_passed_ids:string[];
  scene_qc_attempts:Record<string,number>;
  revision_pending_count:number;
}>{
  try{
    const parsed=JSON.parse(
      await readFile(
        path.resolve(projectRoot,"05_images/generated/t070-checkpoint.json"),
        "utf8"
      )
    ) as T070CheckpointSnapshot;
    const attempts:Record<string,number>={};
    if(typeof parsed.scene_qc_attempts==="object"&&parsed.scene_qc_attempts!==null){
      for(const [key,value] of Object.entries(parsed.scene_qc_attempts)){
        if(typeof value==="number"&&Number.isFinite(value))attempts[key]=value;
      }
    }
    const feedback=
      typeof parsed.revision_feedback_by_state==="object"&&
      parsed.revision_feedback_by_state!==null
        ?Object.keys(parsed.revision_feedback_by_state)
        :[];
    return{
      phase:typeof parsed.phase==="string"?parsed.phase:null,
      seed_image_ids:Array.isArray(parsed.seed_image_ids)
        ?parsed.seed_image_ids.filter((value):value is string=>typeof value==="string")
        :[],
      scene_qc_passed_ids:Array.isArray(parsed.scene_qc_passed_ids)
        ?parsed.scene_qc_passed_ids.filter((value):value is string=>typeof value==="string")
        :[],
      scene_qc_attempts:attempts,
      revision_pending_count:feedback.length
    };
  }catch{
    return{
      phase:null,
      seed_image_ids:[],
      scene_qc_passed_ids:[],
      scene_qc_attempts:{},
      revision_pending_count:0
    };
  }
}

interface FlowManifest {
  items?: Array<{
    clip_id?: unknown;
    expected_output_relative_path?: unknown;
  }>;
}

export async function inspectFlowManifestFiles(projectRoot: string): Promise<{
  manifest_relative_path: string;
  exists: boolean;
  total: number;
  completed: number;
  missing: string[];
  items: Array<{ clip_id: string; relative_path: string; ready: boolean }>;
}> {
  const manifestRelativePath = "06_clips/google-flow-manifest.json";
  const manifestAbsolutePath = path.resolve(projectRoot, manifestRelativePath);
  let manifest: FlowManifest;
  try {
    manifest = JSON.parse(await readFile(manifestAbsolutePath, "utf8")) as FlowManifest;
  } catch {
    return {
      manifest_relative_path: manifestRelativePath,
      exists: false,
      total: 0,
      completed: 0,
      missing: [],
      items: []
    };
  }

  const sourceItems = Array.isArray(manifest.items) ? manifest.items : [];
  const items = await Promise.all(sourceItems.map(async (item, index) => {
    const relativePath =
      typeof item.expected_output_relative_path === "string"
        ? item.expected_output_relative_path
        : "";
    const ready = relativePath.length > 0 &&
      await isReadyFile(path.resolve(projectRoot, relativePath));
    return {
      clip_id: typeof item.clip_id === "string" ? item.clip_id : "CLIP_" + String(index + 1),
      relative_path: relativePath,
      ready
    };
  }));

  return {
    manifest_relative_path: manifestRelativePath,
    exists: true,
    total: items.length,
    completed: items.filter(item => item.ready).length,
    missing: items.filter(item => !item.ready).map(item => item.relative_path),
    items
  };
}

export interface ProductionDashboardClipPlanItem {
  clip_id: string;
  scene_id: string;
  entry_state_image_id: string;
  mid_state_image_id: string | null;
  target_state_image_id: string;
  prompt_ko: string;
  provider_prompt_en: string;
  editorial_duration_sec: number;
  narrative_deadline_sec: number;
  target_state_deadline_sec: number;
  safe_trim_start_sec: number;
  handoff: {
    entry_anchor: string;
    exit_anchor: string;
    preserve_elements: string[];
    next_cut_intent: string;
  } | null;
  continuity: {
    movement_direction: string;
    screen_direction: string;
    camera_energy: string;
  } | null;
}

export function buildClipPlanPreview(
  promptBundle: PromptBundleDocument | null,
  sceneVisual: SceneVisualDocument | null
): {
  available: boolean;
  total: number;
  items: ProductionDashboardClipPlanItem[];
} {
  if (promptBundle === null) return { available: false, total: 0, items: [] };
  const sceneById = new Map(
    (sceneVisual?.scenes ?? []).map(scene => [scene.scene_id, scene])
  );
  const items = promptBundle.video_prompts.map(prompt => {
    const scene = sceneById.get(prompt.scene_id);
    return {
      clip_id: prompt.clip_id,
      scene_id: prompt.scene_id,
      entry_state_image_id: prompt.entry_state_image_id,
      mid_state_image_id: prompt.mid_state_image_id,
      target_state_image_id: prompt.target_state_image_id,
      prompt_ko: prompt.prompt_ko,
      provider_prompt_en: prompt.provider_prompt_en,
      editorial_duration_sec: prompt.editorial_duration_sec,
      narrative_deadline_sec: prompt.narrative_deadline_sec,
      target_state_deadline_sec: prompt.target_state_deadline_sec,
      safe_trim_start_sec: prompt.safe_trim_start_sec,
      handoff: scene === undefined ? null : {
        entry_anchor: scene.handoff.entry_anchor,
        exit_anchor: scene.handoff.exit_anchor,
        preserve_elements: [...scene.handoff.preserve_elements],
        next_cut_intent: scene.handoff.next_cut_intent
      },
      continuity: scene === undefined ? null : {
        movement_direction: scene.continuity.movement_direction,
        screen_direction: scene.continuity.screen_direction,
        camera_energy: scene.continuity.camera_energy
      }
    };
  });
  return { available: items.length > 0, total: items.length, items };
}


export interface ProductionDashboardTaskSnapshot {
  task_id: string;
  name: string;
  status: string;
  workflow_status: string;
  agent: string;
  attempt: number;
  phase: string | null;
  percent: number;
  started_at: string | null;
  completed_at: string | null;
  elapsed_sec: number;
  runtime_last_activity_age_sec: number | null;
  runtime_pid: number | null;
  expected_default_sec: readonly [number, number] | null;
  eta: EtaRange | null;
}

export interface ProductionDashboardSnapshot {
  schema_version: "1.0";
  project_id: string;
  title: string;
  format: string;
  generated_at: string;
  workflow_id: string;
  workflow_version: string;
  overall_percent: number;
  elapsed_sec: number;
  current_task: string | null;
  current_phase: string | null;
  last_activity_at: string | null;
  last_activity_age_sec: number | null;
  remaining_eta: EtaRange | null;
  remaining_eta_excludes_manual_external: boolean;
  tasks: ProductionDashboardTaskSnapshot[];
  clip_plan: ReturnType<typeof buildClipPlanPreview>;
  t070: {
    total: number;
    completed: number;
    current_state_image_id: string | null;
    phase: string | null;
    seed_image_ids: string[];
    seed_qc_verdict: string | null;
    seed_cross_seed_diversity: string | null;
    seed_style_coherence: string | null;
    scene_qc_passed_ids: string[];
    scene_qc_passed_count: number;
    scene_qc_total: number;
    scene_qc_attempts: Record<string, number>;
    revision_pending_count: number;
    final_qc_verdict: string | null;
    final_checked_image_count: number | null;
    final_expected_image_count: number | null;
    final_failed_scene_ids: string[];
    final_failed_image_ids: string[];
    policy_version: string | null;
    items: Array<{
      state_image_id: string;
      relative_path: string;
      ready: boolean;
      preview_url: string | null;
    }>;
  };
  t080: Awaited<ReturnType<typeof inspectFlowManifestFiles>> & {
    action_required: boolean;
  };
  t090: {
    render_progress_available: boolean;
    rendered_frames: number | null;
    total_frames: number | null;
    render_fps: number | null;
    message: string;
  };
  final: {
    preview_available: boolean;
    final_available: boolean;
    final_relative_path: string;
    final_qc_available: boolean;
    final_qc_verdict: string | null;
    production_complete: boolean;
  };
  recent_events: ReturnType<ProductionDashboardHub["snapshot"]>["recent_events"];
}

export class ProductionDashboardSnapshotService {
  constructor(
    private readonly projects: ProjectBootstrapService,
    private readonly hub: ProductionDashboardHub,
    private readonly clock: () => string = () => new Date().toISOString()
  ) {}

  async get(projectId: string): Promise<ProductionDashboardSnapshot> {
    const now = this.clock();
    const project = await this.projects.getStatus(projectId);
    const workflowRepo = new WorkflowOrchestratorRepository(
      project.projectDbPath,
      { readonly: true }
    );
    const agent3Repo = new Agent3VisualProductionRepository(
      project.projectDbPath,
      { readonly: true }
    );
    const tailRepo = new ProductionTailRepository(
      project.projectDbPath,
      { readonly: true }
    );

    try {
      const workflow = workflowRepo.getWorkflow(projectId);
      if (workflow === null) {
        throw new Error("Production workflow does not exist for " + projectId + ".");
      }
      const rawTasks = workflowRepo.listTasks(projectId);
      const live = this.hub.snapshot();
      const promptBundle =
        agent3Repo.getActive<PromptBundleDocument>(projectId, "prompt_bundle_spec");
      const sceneVisual =
        agent3Repo.getActive<SceneVisualDocument>(projectId, "scene_visual_spec");
      const clipPlan = buildClipPlanPreview(
        promptBundle?.value ?? null,
        sceneVisual?.value ?? null
      );
      const stateImageIds = promptBundle?.value.image_prompts.map(item => item.state_image_id) ?? [];
      const imageProgress = await countGeneratedImageFiles(project.projectRoot, stateImageIds);
      const t070Checkpoint = await inspectT070Checkpoint(project.projectRoot);
      const seedVisualQc = tailRepo.getActive<Record<string, unknown>>(
        projectId,
        "t070_seed_visual_qc"
      );
      const sceneVisualQc = tailRepo.getActive<Record<string, unknown>>(
        projectId,
        "t070_scene_visual_qc"
      );
      const finalImageQc = tailRepo.getActive<Record<string, unknown>>(
        projectId,
        "t070_final_visual_qc"
      );
      const flow = await inspectFlowManifestFiles(project.projectRoot);

      const tasks: ProductionDashboardTaskSnapshot[] = rawTasks.map(task => {
        const liveProgress = live.task_progress[task.task_id];
        const isComplete = task.status === "COMPLETE";
        const percent = isComplete ? 100 : liveProgress?.percent ?? 0;
        const elapsedSec = task.started_at === null
          ? 0
          : secondsBetween(
              task.started_at,
              task.completed_at ?? (task.status === "RUNNING" ? now : task.updated_at)
            );
        const itemProgress = task.task_id === "T070" && imageProgress.total > 0
          ? { completed: imageProgress.completed, total: imageProgress.total }
          : undefined;
        const eta = isComplete
          ? { min_sec: 0, max_sec: 0, confidence: "HIGH" as const, source: "PROGRESS" as const }
          : estimateTaskRemaining(task.task_id, elapsedSec, percent, itemProgress);
        const displayStatus =
          task.task_id === "T080" &&
          task.status !== "COMPLETE" &&
          flow.exists &&
          flow.completed < flow.total
            ? "MANUAL_EXTERNAL"
            : task.status;
        return {
          task_id: task.task_id,
          name:
            workflow.definition.tasks.find(item => item.task_id === task.task_id)?.name ??
            TASK_LABELS[task.task_id] ??
            task.task_id,
          status: displayStatus,
          workflow_status: task.status,
          agent: task.assigned_agent,
          attempt: task.attempt,
          phase: liveProgress?.phase ?? null,
          percent,
          started_at: task.started_at,
          completed_at: task.completed_at,
          elapsed_sec: elapsedSec,
          runtime_last_activity_age_sec:
            liveProgress?.runtime_last_activity_age_sec ?? null,
          runtime_pid: liveProgress?.runtime_pid ?? null,
          expected_default_sec: DEFAULT_TASK_ETA_SEC[task.task_id] ?? null,
          eta
        };
      });

      const completedIds = tasks
        .filter(task => task.workflow_status === "COMPLETE")
        .map(task => task.task_id);
      const activeTask =
        tasks.find(task => task.workflow_status === "RUNNING") ??
        tasks.find(task => task.workflow_status === "READY") ??
        null;
      const overallPercent = calculateOverallProgress(
        completedIds,
        activeTask === null
          ? undefined
          : { task_id: activeTask.task_id, percent: activeTask.percent }
      );

      const earliestStarted = rawTasks
        .map(task => task.started_at)
        .filter((value): value is string => value !== null)
        .sort()[0] ?? null;
      const runStartedAt = live.run_started_at ?? earliestStarted;
      const elapsedSec = runStartedAt === null ? 0 : secondsBetween(runStartedAt, now);
      const lastActivityAt =
        live.last_event?.at ??
        rawTasks.map(task => task.updated_at).sort().at(-1) ??
        null;
      const lastActivityAgeSec =
        lastActivityAt === null ? null : secondsBetween(lastActivityAt, now);

      const remainingEta = combineEtaRanges(
        tasks
          .filter(task => task.workflow_status !== "COMPLETE" && task.task_id !== "T080")
          .map(task => task.eta)
      );

      const generatedCurrent =
        imageProgress.items.find(item => !item.ready)?.state_image_id ?? null;
      const t070Items = imageProgress.items.map(item => ({
        ...item,
        preview_url: item.ready
          ? "/api/images/" + encodeURIComponent(item.relative_path)
          : null
      }));

      const preview = tailRepo.getActive(projectId, "preview_render");
      const finalQc = tailRepo.getActive<Record<string, unknown>>(projectId, "final_qc_result");
      const finalRelativePath = "09_render/final.mp4";
      const finalAvailable = await isReadyFile(path.resolve(project.projectRoot, finalRelativePath));
      const finalQcVerdict =
        finalQc !== null && typeof finalQc.value.verdict === "string"
          ? finalQc.value.verdict
          : null;
      const productionComplete =
        rawTasks.length > 0 &&
        rawTasks.every(task => task.status === "COMPLETE") &&
        finalAvailable &&
        finalQc !== null;

      return {
        schema_version: "1.0",
        project_id: projectId,
        title: project.project.title,
        format: project.project.format,
        generated_at: now,
        workflow_id: workflow.workflow_id,
        workflow_version: workflow.workflow_version,
        overall_percent: overallPercent,
        elapsed_sec: elapsedSec,
        current_task: activeTask?.task_id ?? null,
        current_phase: activeTask?.phase ?? null,
        last_activity_at: lastActivityAt,
        last_activity_age_sec: lastActivityAgeSec,
        remaining_eta: remainingEta,
        remaining_eta_excludes_manual_external:
          tasks.some(task => task.task_id === "T080" && task.workflow_status !== "COMPLETE"),
        tasks,
        clip_plan: clipPlan,
        t070: {
          total: imageProgress.total,
          completed: imageProgress.completed,
          current_state_image_id: generatedCurrent,
          phase:t070Checkpoint.phase,
          seed_image_ids:t070Checkpoint.seed_image_ids,
          seed_qc_verdict:
            typeof seedVisualQc?.value.verdict==="string"
              ?seedVisualQc.value.verdict
              :null,
          seed_cross_seed_diversity:
            typeof seedVisualQc?.value.cross_seed_diversity==="string"
              ?seedVisualQc.value.cross_seed_diversity
              :null,
          seed_style_coherence:
            typeof seedVisualQc?.value.style_coherence==="string"
              ?seedVisualQc.value.style_coherence
              :null,
          scene_qc_passed_ids:t070Checkpoint.scene_qc_passed_ids,
          scene_qc_passed_count:t070Checkpoint.scene_qc_passed_ids.length,
          scene_qc_total:new Set(
            promptBundle?.value.image_prompts.map(item=>item.scene_id)??[]
          ).size,
          scene_qc_attempts:t070Checkpoint.scene_qc_attempts,
          revision_pending_count:t070Checkpoint.revision_pending_count,
          final_qc_verdict:
            typeof finalImageQc?.value.verdict==="string"
              ?finalImageQc.value.verdict
              :null,
          final_checked_image_count:
            typeof finalImageQc?.value.checked_image_count==="number"
              ?finalImageQc.value.checked_image_count
              :null,
          final_expected_image_count:
            typeof finalImageQc?.value.expected_image_count==="number"
              ?finalImageQc.value.expected_image_count
              :null,
          final_failed_scene_ids:Array.isArray(finalImageQc?.value.failed_scene_ids)
            ?finalImageQc.value.failed_scene_ids.filter(
              (value):value is string=>typeof value==="string"
            )
            :[],
          final_failed_image_ids:Array.isArray(finalImageQc?.value.failed_image_ids)
            ?finalImageQc.value.failed_image_ids.filter(
              (value):value is string=>typeof value==="string"
            )
            :[],
          policy_version:
            typeof finalImageQc?.value.policy_version==="string"
              ?finalImageQc.value.policy_version
              :typeof sceneVisualQc?.value.policy_version==="string"
                ?sceneVisualQc.value.policy_version
                :typeof seedVisualQc?.value.policy_version==="string"
                  ?seedVisualQc.value.policy_version
                  :null,
          items: t070Items
        },
        t080: {
          ...flow,
          action_required:
            flow.exists &&
            flow.total > 0 &&
            flow.completed < flow.total &&
            rawTasks.find(task => task.task_id === "T080")?.status !== "COMPLETE"
        },
        t090: {
          render_progress_available: false,
          rendered_frames: null,
          total_frames: null,
          render_fps: null,
          message: "Render frame progress unavailable; showing task lifecycle progress only."
        },
        final: {
          preview_available: preview !== null,
          final_available: finalAvailable,
          final_relative_path: finalRelativePath,
          final_qc_available: finalQc !== null,
          final_qc_verdict: finalQcVerdict,
          production_complete: productionComplete
        },
        recent_events: live.recent_events.slice(-30)
      };
    } finally {
      tailRepo.close();
      agent3Repo.close();
      workflowRepo.close();
    }
  }
}
