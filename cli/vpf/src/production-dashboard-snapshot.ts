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
