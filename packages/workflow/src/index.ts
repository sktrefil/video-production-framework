export type ProductionSystemGateId =
  | "PSG_S1" | "PSG_S2" | "PSG_S3" | "PSG_V1" | "PSG_V2" | "PSG_M1"
  | "PSG_P1" | "PSG_P2" | "PSG_P3" | "PSG_P4" | "PSG_P5"
  | "PSG_P6" | "PSG_P7" | "PSG_P8" | "PSG_P9";

export type FrameworkGateId =
  | "FWG_IMAGE_GENERATION_READY"
  | "FWG_IMAGE_QC_READY"
  | "FWG_HANDOFF_QC_READY"
  | "FWG_VIDEO_GENERATION_READY"
  | "FWG_CLIP_QC_READY"
  | "FWG_AUDIO_READY"
  | "FWG_BINDING_READY"
  | "FWG_REMOTION_HANDOFF_READY"
  | "FWG_FINAL_QC_READY";

export type GateStatus = "OPEN" | "BLOCKED" | "REVIEW_REQUIRED";

export interface GateDependency {
  type: string;
  id?: string;
  detail?: string;
}

export interface GateEvaluation {
  gateId: ProductionSystemGateId | FrameworkGateId;
  status: GateStatus;
  missingDependencies: GateDependency[];
  userMessage?: string;
  recommendedAction?: string;
}

export interface Capability {
  action: string;
  allowed: boolean;
  reason?: string;
}

export interface WorkflowEvent {
  eventId: string;
  projectId: string;
  eventType: string;
  targetType: string;
  targetId: string;
  trigger: "USER" | "SYSTEM" | "PROVIDER_RESULT" | "QC_RESULT" | "WORKFLOW_ENGINE" | "MIGRATION";
  createdAt: string;
}

export interface OutboxRecord {
  outboxId: string;
  eventId: string;
  status: "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED";
  attempts: number;
  createdAt: string;
  processedAt?: string;
}
