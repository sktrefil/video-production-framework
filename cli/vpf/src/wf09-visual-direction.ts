import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectFormat } from "@vpf/domain";
import type { ProjectStatus } from "@vpf/project-bootstrap";
import {
  FileSystemResourceRegistry,
  type ResourcePin
} from "@vpf/resource-registry";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const resourcesRoot = path.join(repositoryRoot, "resources");
const COMPOSITION_MARKER = "\n\nVISUAL DIRECTION: ";
const PROMPT_MARKER = "\n\nVISUAL DIRECTION: ";
const VDG_REQUIREMENT_PREFIX = "[VDG ";

export interface VisualDirectionGrammarV1 {
  grammarId: string;
  grammarVersion: string;
  coreStatement: string;
  storyHierarchy: string[];
  shotGrammar: {
    defaultShotFamilies: string[];
    defaultSubjectScale: string[];
    environmentVisibility: string;
    closeUpPolicy: {
      default: string;
      allowedReasons: string[];
      rule: string;
    };
  };
  surfaceGrammar: {
    structure: string;
    finish: string;
    photographicMicrodetail: string;
    skinAndMaterialSharpness: string;
    gameRenderGloss: string;
    rule: string;
  };
  evidenceGrammar: {
    priority: string;
    generatedReadableHistoricalText: string;
    unsupportedHeraldryOrInsignia: string;
    consecutiveEvidenceCloseUps: string;
    contextRecoveryRule: string;
  };
  certaintyGrammar: Record<string, string>;
  handoffGrammar: {
    preserveElementsMin: number;
    preserveElementsMax: number;
    preferredElements: string[];
    rule: string;
  };
  motionGrammar: {
    preferred: string[];
    avoidByDefault: string[];
  };
  formatGrammar: {
    LONGFORM: { rule: string };
    SHORTFORM: {
      essentialInformationZone: string;
      topPeripheralZone: string;
      bottomPeripheralZone: string;
      rule: string;
    };
  };
  promptCompilation: {
    principles: string[];
    forbidden: string[];
  };
}

interface VisualBibleWithGrammar {
  visualDirectionGrammar?: VisualDirectionGrammarV1;
  [key: string]: unknown;
}

interface SceneAssetPlanRecord {
  scenes: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface VisualDirectionPlanResult {
  file: string;
  applied: boolean;
  grammarId: string;
  grammarVersion: string;
  grammarContentHash: string;
  enrichedSceneCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function normalizePlan(value: unknown): SceneAssetPlanRecord {
  if (!isRecord(value) || !Array.isArray(value.scenes)) {
    throw new Error("WF-09 Visual Direction requires a Scene Asset plan with a scenes array.");
  }
  const scenes = value.scenes.map((scene, index) => {
    if (!isRecord(scene) || typeof scene.sceneId !== "string" || !scene.sceneId.trim()) {
      throw new Error(`Scene Asset plan entry ${index + 1} has no valid sceneId.`);
    }
    return scene;
  });
  return { ...value, scenes };
}

function stripDerived(value: string, marker: string): string {
  return value.split(marker)[0]!.trim();
}

function hasExplicitCloseView(composition: string): boolean {
  return /\b(close[- ]?up|close view|macro|detail shot)\b|근접|클로즈업|접사/iu.test(composition);
}

function shortformCompositionRule(grammar: VisualDirectionGrammarV1): string {
  const rules = grammar.formatGrammar.SHORTFORM;
  return `Keep essential story information in the central 60-70% of the frame; keep the top 15-20% and bottom 15-20% atmospheric and lower-detail for final blur/crop. ${rules.rule}`;
}

function compositionDirective(
  grammar: VisualDirectionGrammarV1,
  format: ProjectFormat,
  explicitCloseView: boolean
): string {
  const shot = explicitCloseView
    ? "Preserve the explicitly justified close/detail view, but keep enough surrounding context to maintain story geography."
    : "Use environment-first medium-wide/wide framing with characters and objects small-to-medium by default.";
  const formatRule = format === "SHORTFORM"
    ? ` ${shortformCompositionRule(grammar)}`
    : ` ${grammar.formatGrammar.LONGFORM.rule}`;
  return `${shot} Story hierarchy is narrative > environment > continuity > evidence > character/object. Maintain readable foreground-midground-background depth for handoff and later motion.${formatRule}`;
}

function designRequirements(
  grammar: VisualDirectionGrammarV1,
  format: ProjectFormat
): string[] {
  const base = [
    "[VDG STORY] Story and spatial context must remain more important than isolated character, object, or spectacle emphasis.",
    `[VDG SHOT] Default shot families: ${grammar.shotGrammar.defaultShotFamilies.join(" / ")}; default subject scale: ${grammar.shotGrammar.defaultSubjectScale.join(" / ")}; close-up requires an explicit narrative reason.`,
    `[VDG SURFACE] ${grammar.surfaceGrammar.rule}`,
    `[VDG HANDOFF] Preserve ${grammar.handoffGrammar.preserveElementsMin}-${grammar.handoffGrammar.preserveElementsMax} useful continuity cues when the canonical Link requires them; leave motion-readable depth for later I2V.`,
    "[VDG CERTAINTY] Preserve the factual certainty already expressed by the scene: fact, reconstruction, hypothesis, legend, and unknown must not collapse into the same visual certainty."
  ];
  if (format === "SHORTFORM") {
    base.push(`[VDG SHORTFORM] ${shortformCompositionRule(grammar)}`);
  }
  return base;
}

function promptDirective(
  grammar: VisualDirectionGrammarV1,
  format: ProjectFormat,
  explicitCloseView: boolean
): string {
  const framing = explicitCloseView
    ? "keep the source-approved close/detail framing with contextual space"
    : "environment-first medium-wide/wide framing, small-to-medium character/object scale";
  const shortform = format === "SHORTFORM"
    ? ", essential story information in the central 60-70%, upper/lower 15-20% kept atmospheric and lower-detail for blur/crop"
    : "";
  return `story-first ${framing}, historically realistic structure with restrained painterly matte surface, readable depth and continuity for the next cut and later I2V${shortform}, preserve uncertainty where present, no readable generated historical text, no unsupported insignia or heraldry, no glossy game-render finish`;
}

function derivedAvoidances(): string[] {
  return [
    "photographic hyperreal finish",
    "oversized character or object without narrative reason",
    "glossy game-render surface",
    "readable generated historical text",
    "unsupported insignia or heraldry",
    "spectacle-only composition"
  ];
}

export function enrichSceneAssetPlanWithVisualDirection(
  value: unknown,
  grammar: VisualDirectionGrammarV1,
  format: ProjectFormat,
  grammarContext: { resourceId: string; version: string; contentHash: string }
): { plan: SceneAssetPlanRecord; enrichedSceneCount: number } {
  const plan = normalizePlan(value);
  let enrichedSceneCount = 0;

  const scenes = plan.scenes.map(scene => {
    if (!isRecord(scene.imageAssetDesign)) {
      throw new Error(`Scene ${String(scene.sceneId)} has no imageAssetDesign object.`);
    }
    const design = scene.imageAssetDesign;
    const originalComposition = typeof design.composition === "string"
      ? stripDerived(design.composition, COMPOSITION_MARKER)
      : "";
    if (!originalComposition) {
      throw new Error(`Scene ${String(scene.sceneId)} has no valid imageAssetDesign.composition.`);
    }
    const explicitCloseView = hasExplicitCloseView(originalComposition);
    const continuity = Array.isArray(design.continuityRequirements)
      ? design.continuityRequirements.filter((item): item is string => typeof item === "string")
      : [];
    const avoidances = Array.isArray(design.avoidances)
      ? design.avoidances.filter((item): item is string => typeof item === "string")
      : [];

    const imageAssetDesign = {
      ...design,
      composition: `${originalComposition}${COMPOSITION_MARKER}${compositionDirective(grammar, format, explicitCloseView)}`,
      continuityRequirements: unique([
        ...continuity.filter(item => !item.startsWith(VDG_REQUIREMENT_PREFIX)),
        ...designRequirements(grammar, format)
      ]),
      avoidances: unique([
        ...avoidances,
        ...derivedAvoidances()
      ])
    };

    let imagePrompt = scene.imagePrompt;
    if (isRecord(scene.imagePrompt) && typeof scene.imagePrompt.prompt === "string") {
      const originalPrompt = stripDerived(scene.imagePrompt.prompt, PROMPT_MARKER);
      const negativePrompt = typeof scene.imagePrompt.negativePrompt === "string"
        ? scene.imagePrompt.negativePrompt
        : "";
      imagePrompt = {
        ...scene.imagePrompt,
        prompt: `${originalPrompt}${PROMPT_MARKER}${promptDirective(grammar, format, explicitCloseView)}`,
        negativePrompt: unique([
          ...negativePrompt.split(",").map(item => item.trim()).filter(Boolean),
          ...derivedAvoidances()
        ]).join(", ")
      };
    }

    enrichedSceneCount += 1;
    return {
      ...scene,
      imageAssetDesign,
      ...(imagePrompt === undefined ? {} : { imagePrompt }),
      visualDirectionContext: {
        source: "pinned_channel_visual_bible",
        grammarId: grammar.grammarId,
        grammarVersion: grammar.grammarVersion,
        resourceId: grammarContext.resourceId,
        resourceVersion: grammarContext.version,
        contentHash: grammarContext.contentHash
      }
    };
  });

  return {
    plan: {
      ...plan,
      visualDirectionDerivation: {
        source: `${grammarContext.resourceId}@${grammarContext.version}`,
        contentHash: grammarContext.contentHash,
        grammarId: grammar.grammarId,
        grammarVersion: grammar.grammarVersion,
        rule: "Story-first Visual Direction is derived into Asset Design and compact IMAGE_PROMPT; the pinned Visual Bible remains canonical."
      },
      scenes
    },
    enrichedSceneCount
  };
}

async function writeTextAtomic(filename: string, value: string): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, value, "utf8");
  await rename(temporary, filename);
}

function requirePinnedVisualBible(status: ProjectStatus): ResourcePin {
  const pin = status.resourcePins.find(candidate =>
    candidate.resourceType === "CHANNEL_VISUAL_BIBLE" &&
    candidate.resourceId === "HISTORY_MYSTERY_VISUAL_BIBLE"
  );
  if (pin === undefined) {
    throw new Error("Project is missing the pinned HISTORY_MYSTERY_VISUAL_BIBLE resource.");
  }
  return pin;
}

function validateGrammar(value: unknown): asserts value is VisualDirectionGrammarV1 {
  if (!isRecord(value)) throw new Error("Visual Direction Grammar is missing.");
  if (
    value.grammarId !== "HISTORY_MYSTERY_VISUAL_DIRECTION_GRAMMAR_V1" ||
    value.grammarVersion !== "1.0.0" ||
    !Array.isArray(value.storyHierarchy) ||
    !isRecord(value.shotGrammar) ||
    !isRecord(value.surfaceGrammar) ||
    !isRecord(value.evidenceGrammar) ||
    !isRecord(value.handoffGrammar) ||
    !isRecord(value.motionGrammar) ||
    !isRecord(value.formatGrammar) ||
    !isRecord(value.promptCompilation)
  ) {
    throw new Error("Pinned Visual Direction Grammar does not match the V1 execution contract.");
  }
}

export async function prepareVisualDirectionSceneAssetPlan(input: {
  status: ProjectStatus;
  sourceFile: string;
}): Promise<VisualDirectionPlanResult> {
  const pin = requirePinnedVisualBible(input.status);
  const registry = new FileSystemResourceRegistry(resourcesRoot);
  const snapshot = await registry.resolvePinned<VisualBibleWithGrammar>(pin);
  const grammar = snapshot.payload.visualDirectionGrammar;
  validateGrammar(grammar);

  const parsed = JSON.parse(await readFile(input.sourceFile, "utf8")) as unknown;
  const enriched = enrichSceneAssetPlanWithVisualDirection(
    parsed,
    grammar,
    input.status.project.format,
    {
      resourceId: snapshot.resourceId,
      version: snapshot.version,
      contentHash: snapshot.contentHash
    }
  );
  const target = path.join(input.status.projectRoot, "05_images", "scene-assets.production-ready.json");
  await writeTextAtomic(target, `${JSON.stringify(enriched.plan, null, 2)}\n`);

  return {
    file: target,
    applied: enriched.enrichedSceneCount > 0,
    grammarId: grammar.grammarId,
    grammarVersion: grammar.grammarVersion,
    grammarContentHash: snapshot.contentHash,
    enrichedSceneCount: enriched.enrichedSceneCount
  };
}
