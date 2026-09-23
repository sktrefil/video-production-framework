import type { ProductionGateId } from "./gates.js";

export const WORKFLOW_AGENTS = [
  "AGENT1_MANAGER",
  "AGENT2_STORY_AUDIO",
  "AGENT3_VISUAL_PRODUCTION",
  "EDITOR_REMOTION"
] as const;
export type WorkflowAgentId = typeof WORKFLOW_AGENTS[number];

export const TASK_STATUSES = [
  "BLOCKED",
  "PENDING",
  "READY",
  "RUNNING",
  "COMPLETE",
  "REVISION_REQUIRED",
  "FAILED",
  "CANCELLED"
] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export interface ArtifactRevisionRef {
  artifact_type: string;
  revision: number;
  sha256: string;
}

export interface WorkflowRetryPolicy {
  max_attempts: number;
}

export interface ProductionTaskDefinition {
  task_id: string;
  order: number;
  name: string;
  description: string;
  task_type: string;
  assigned_agent: WorkflowAgentId;
  depends_on: string[];
  required_inputs: string[];
  required_outputs: string[];
  production_policies: string[];
  completion_gate: ProductionGateId;
  on_pass: "UNLOCK_DEPENDENTS";
  on_fail: "RETURN_TO_ASSIGNED_AGENT";
  retry_policy: WorkflowRetryPolicy;
  manual_approval_required: boolean;
}

export interface ProductionWorkflowDefinition {
  workflow_id: "VPF_PRODUCTION_V1";
  version: "1.0";
  applies_to: readonly ["SHORTS", "LONGFORM"];
  tasks: ProductionTaskDefinition[];
}

export interface ProjectTaskInstance {
  project_id: string;
  task_instance_id: string;
  task_id: string;
  task_order: number;
  assigned_agent: WorkflowAgentId;
  task_type: string;
  status: TaskStatus;
  workflow_id: string;
  workflow_version: string;
  attempt: number;
  manual_approval_required: boolean;
  input_revision_refs: ArtifactRevisionRef[];
  output_revision_refs: ArtifactRevisionRef[];
  last_gate_id: ProductionGateId | null;
  last_gate_status: "PASS" | "FAIL" | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface TaskDispatchPackage {
  dispatch_id: string;
  project_id: string;
  task_instance_id: string;
  task_id: string;
  assigned_agent: WorkflowAgentId;
  task_type: string;
  attempt: number;
  required_inputs: string[];
  required_outputs: string[];
  policies: string[];
  completion_gate: ProductionGateId;
  input_revision_refs: ArtifactRevisionRef[];
  created_at: string;
}

const task = (
  task_id: string,
  order: number,
  name: string,
  description: string,
  task_type: string,
  assigned_agent: WorkflowAgentId,
  depends_on: string[],
  required_inputs: string[],
  required_outputs: string[],
  production_policies: string[],
  completion_gate: ProductionGateId,
  manual_approval_required: boolean
): ProductionTaskDefinition => ({
  task_id,
  order,
  name,
  description,
  task_type,
  assigned_agent,
  depends_on,
  required_inputs,
  required_outputs,
  production_policies,
  completion_gate,
  on_pass: "UNLOCK_DEPENDENTS",
  on_fail: "RETURN_TO_ASSIGNED_AGENT",
  retry_policy: { max_attempts: 3 },
  manual_approval_required
});

export const STANDARD_PRODUCTION_WORKFLOW: ProductionWorkflowDefinition = {
  workflow_id: "VPF_PRODUCTION_V1",
  version: "1.0",
  applies_to: ["SHORTS", "LONGFORM"],
  tasks: [
    task("T010", 10, "Research / Fact Check", "Research the topic and establish verified facts before story writing.", "RESEARCH_FACT_CHECK", "AGENT2_STORY_AUDIO", [], ["project_spec", "project_topic"], ["research_spec", "fact_check_spec"], ["RESEARCH_POLICY_V1", "FACT_CHECK_POLICY_V1"], "RESEARCH_GATE", false),
    task("T020", 20, "Story / Script", "Build the narrative structure and approved script from verified research.", "STORY_SCRIPT", "AGENT2_STORY_AUDIO", ["T010"], ["project_spec", "research_spec", "fact_check_spec"], ["story_spec", "script"], ["STORY_POLICY_V1", "SCRIPT_POLICY_V1"], "SCRIPT_GATE", true),
    task("T030", 30, "TTS / Scene Timing / Subtitle", "Create narration timing, scene/beat timing and subtitle timing from the approved script.", "TTS_TIMING", "AGENT2_STORY_AUDIO", ["T020"], ["script"], ["tts_manifest", "scene_timing_spec", "subtitle_timing"], ["TTS_POLICY_V1", "SCENE_TIMING_POLICY_V1"], "STORY_AUDIO_GATE", true),
    task("T040", 40, "Visual Scene Planning", "Translate the approved story timing into scene-level visual intent and continuity.", "VISUAL_SCENE_PLAN", "AGENT3_VISUAL_PRODUCTION", ["T030"], ["scene_timing_spec", "visual_bible"], ["scene_visual_spec"], ["VISUAL_BIBLE_POLICY_V1", "CONTINUITY_POLICY_V1"], "VISUAL_PLAN_GATE", true),
    task("T050", 50, "State Image Planning", "Plan entry, optional mid and target state images for each visual beat.", "STATE_IMAGE_PLAN", "AGENT3_VISUAL_PRODUCTION", ["T040"], ["scene_visual_spec", "scene_timing_spec"], ["state_image_spec"], ["STATE_IMAGE_POLICY_V1", "CONTINUITY_POLICY_V1"], "STATE_IMAGE_GATE", true),
    task("T060", 60, "Clip / Camera Planning", "Allocate clip durations, core-point timing, camera direction and transitions.", "CLIP_CAMERA_PLAN", "AGENT3_VISUAL_PRODUCTION", ["T030", "T040", "T050"], ["scene_timing_spec", "scene_visual_spec", "state_image_spec"], ["clip_production_spec"], ["CLIP_DURATION_POLICY_V1", "CORE_POINT_POLICY_V1", "CAMERA_POLICY_V1", "CONTINUITY_POLICY_V1"], "CLIP_PLAN_GATE", true),
    task("T070", 70, "Image Generation / QC", "Generate approved state images and complete image QC.", "IMAGE_GENERATION_QC", "AGENT3_VISUAL_PRODUCTION", ["T060"], ["state_image_spec", "clip_production_spec"], ["generated_images", "image_qc_result"], ["IMAGE_GENERATION_POLICY_V1", "IMAGE_QC_POLICY_V1"], "IMAGE_APPROVAL_GATE", true),
    task("T080", 80, "Video Clip Generation / QC", "Generate image-to-video clips and validate timing, camera and continuity.", "VIDEO_CLIP_GENERATION_QC", "AGENT3_VISUAL_PRODUCTION", ["T070"], ["approved_images", "clip_production_spec"], ["generated_clips", "clip_qc_result"], ["VIDEO_GENERATION_POLICY_V1", "CLIP_QC_POLICY_V1"], "CLIP_APPROVAL_GATE", true),
    task("T090", 90, "Editorial Assembly", "Assemble TTS, subtitles, clips, BGM, SFX and transitions into the editorial timeline.", "EDITORIAL_ASSEMBLY", "EDITOR_REMOTION", ["T080"], ["generated_clips", "tts_manifest", "subtitle_timing"], ["timeline_spec", "preview_render"], ["EDITORIAL_POLICY_V1", "AUDIO_POLICY_V1"], "EDITORIAL_GATE", true),
    task("T100", 100, "Final Cinematic QC", "Perform final narrative, visual, timing and continuity QC before final render.", "FINAL_CINEMATIC_QC", "AGENT1_MANAGER", ["T090"], ["preview_render", "timeline_spec"], ["final_qc_result"], ["FINAL_CINEMATIC_QC_POLICY_V1"], "FINAL_GATE", true)
  ]
};

export function getStandardProductionWorkflow(): ProductionWorkflowDefinition {
  return structuredClone(STANDARD_PRODUCTION_WORKFLOW);
}

export function createProjectTaskInstances(
  projectId: string,
  workflow: ProductionWorkflowDefinition,
  at: string
): ProjectTaskInstance[] {
  return workflow.tasks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(definition => ({
      project_id: projectId,
      task_instance_id: `${projectId}:${definition.task_id}`,
      task_id: definition.task_id,
      task_order: definition.order,
      assigned_agent: definition.assigned_agent,
      task_type: definition.task_type,
      status: definition.depends_on.length === 0 ? "READY" : "BLOCKED",
      workflow_id: workflow.workflow_id,
      workflow_version: workflow.version,
      attempt: 0,
      manual_approval_required: definition.manual_approval_required,
      input_revision_refs: [],
      output_revision_refs: [],
      last_gate_id: null,
      last_gate_status: null,
      created_at: at,
      started_at: null,
      completed_at: null,
      updated_at: at
    }));
}

export function findTaskDefinition(
  workflow: ProductionWorkflowDefinition,
  taskId: string
): ProductionTaskDefinition | null {
  return workflow.tasks.find(item => item.task_id === taskId) ?? null;
}
