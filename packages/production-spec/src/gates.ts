import type { ValidationIssue } from "./project-validator.js";
import { PRODUCTION_GATES, type ProductionGate } from "./enums.js";

export const PRODUCTION_GATE_IDS = PRODUCTION_GATES;

export type ProductionGateId = ProductionGate;
export type ProductionGateStatus = "PASS" | "FAIL" | "NOT_EVALUATED";

export interface ProductionGateEvaluation {
  project_id: string;
  gate: ProductionGateId;
  status: ProductionGateStatus;
  valid: boolean;
  ready_for_generation: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  evaluated_by: "AGENT1_MANAGER";
  evaluated_at: string;
}

export interface Agent1ProductionManagerPort {
  validateProject(projectId: string): Promise<ProductionGateEvaluation>;
  validateResearch(projectId: string): Promise<ProductionGateEvaluation>;
  validateScript(projectId: string): Promise<ProductionGateEvaluation>;
  validateStory(projectId: string): Promise<ProductionGateEvaluation>;
  validateVisualPlan(projectId: string): Promise<ProductionGateEvaluation>;
  validateStateImages(projectId: string): Promise<ProductionGateEvaluation>;
  validateClips(projectId: string): Promise<ProductionGateEvaluation>;
  generationReady(projectId: string): Promise<ProductionGateEvaluation>;
}
