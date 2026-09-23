import type { ValidationResult } from "./project-validator.js";
import { validateClipProductionSpecs, type ClipValidationContext } from "./clip-production-validator.js";

/**
 * Pure plan readiness. Agent1 must additionally verify current project/story/clip
 * approvals from canonical storage before authorizing any image or video job.
 * Input ready_for_generation flags never participate in this computation.
 */
export function validateGenerationReady(input: unknown, context: ClipValidationContext = {}): ValidationResult {
  return validateClipProductionSpecs(input, context);
}
