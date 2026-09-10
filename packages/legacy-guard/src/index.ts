export type LegacyBlockCode =
  | "LEGACY_VISUAL_STYLE" | "LEGACY_IMAGE_PROMPT_PLANNER" | "LEGACY_MASTER_LIBRARY"
  | "LEGACY_SCENE_INTERPRETER" | "LEGACY_PROJECT_RENDER_PATH" | "LEGACY_CONTROL_PLANE"
  | "LEGACY_RUNTIME_FORBIDDEN";

export class LegacyGuardError extends Error {
  constructor(public readonly code: LegacyBlockCode, message: string) {
    super(message); this.name = "LegacyGuardError";
  }
}

/** Central detection data; these names are never execution targets. */
export const LEGACY_RULES: ReadonlyArray<{code: LegacyBlockCode; pattern: RegExp}> = [
  {code:"LEGACY_VISUAL_STYLE",pattern:/history[-_]mystery[-_]stylized[-_]v1|history[-_]mystery[-_]shorts[-_]style|history_mystery_stylized_visual_v1|old[-_]scene[-_]prompt[-_]style|master[-_]candidate[-_]style/i},
  {code:"LEGACY_MASTER_LIBRARY",pattern:/master_library|master_candidate_prompt_planner|master_visual_planner/i},
  {code:"LEGACY_IMAGE_PROMPT_PLANNER",pattern:/image_prompt_planner|history_mystery_visual_prompt_runtime|scene_image_prompt_composer|(?:^|[/.])visual_v2(?:[/.]|$)/i},
  {code:"LEGACY_SCENE_INTERPRETER",pattern:/(?:lived_sentences[/.](?:scenes|story_design|scene_image_generator))|config\/scene_prompts/i},
  {code:"LEGACY_PROJECT_RENDER_PATH",pattern:/src\/sado_prince|public\/projects\/sado_prince|SadoPrince(?:Editor|VisualAssembly|Subtitles)|sado_prince_clip_manifest/i},
  {code:"LEGACY_CONTROL_PLANE",pattern:/lived_sentences[/.]cli|history_project_command|sfx-server(?:\.mjs|\.js|\.py)?/i},
  {code:"LEGACY_RUNTIME_FORBIDDEN",pattern:/(?:^|[/:\s"'])video-production(?:-admin-manager-v2)?(?:[/\s"']|$)/i}
];

export function legacyCategory(value: string): LegacyBlockCode | undefined {
  let normalized = value.replaceAll("\\", "/");
  try { normalized = decodeURIComponent(normalized); } catch { /* literal malformed encoding */ }
  return LEGACY_RULES.find(rule => rule.pattern.test(normalized))?.code;
}

export function assertNoLegacyReference(value: string): void {
  const code = legacyCategory(value);
  if (code) throw new LegacyGuardError(code, "Legacy operational reference is forbidden.");
}

export interface UnifiedProjectPolicy { pipeline: string; legacyAllowed: boolean; }
export function assertUnifiedProject(value: unknown): asserts value is UnifiedProjectPolicy {
  const policy = value as Partial<UnifiedProjectPolicy> | null;
  if (!policy || policy.pipeline !== "VPF_UNIFIED_V1" || policy.legacyAllowed !== false)
    throw new LegacyGuardError("LEGACY_RUNTIME_FORBIDDEN", "Project must explicitly declare pipeline=VPF_UNIFIED_V1 and legacyAllowed=false; no implicit upgrade is allowed.");
}

/** Inspect operational fields, never prose such as approved prompts or narration. */
export function assertNoLegacyExecutionInput(value: unknown, operational = false): void {
  if (typeof value === "string") { if (operational) assertNoLegacyReference(value); return; }
  if (Array.isArray(value)) { for (const item of value) assertNoLegacyExecutionInput(item, operational); return; }
  if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) {
    assertNoLegacyReference(key);
    if (/^(?:prompt|negativePrompt|text|script|description|avoidances|rationale)$/i.test(key)) continue;
    assertNoLegacyExecutionInput(item, operational || /path|src|uri|url|module|command|args|cwd|runtime|planner|master|library|style|preset|resourceId|provider|renderer/i.test(key));
  }
}
