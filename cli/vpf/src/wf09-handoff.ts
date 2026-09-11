import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { ProjectStatus } from "@vpf/project-bootstrap";
import { SqliteSceneAssetRepository } from "@vpf/storage/scene-assets";

export interface CanonicalVisualHandoff {
  linkId: string;
  fromSceneId: string;
  toSceneId: string;
  continuityLevel: string;
  handoffIntent: string;
  handoffAnchors: string[];
  transitionIntent: string;
}

export interface HandoffAwarePlanResult {
  file: string;
  applied: boolean;
  visualLinkCount: number;
  enrichedSceneCount: number;
  linkIds: string[];
}

interface SceneAssetPlanRecord {
  scenes: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface ProductionLinkRow {
  id: string;
  from_scene_id: string;
  to_scene_id: string;
  continuity_level: string;
  handoff_intent: string;
  handoff_anchor_json: string;
  handoff_channels_json: string;
  transition_intent: string;
  link_status: string;
}

const CONTINUITY_MARKER = "\n\nCONTINUITY HANDOFF: ";

function unique(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function decodeStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePlan(value: unknown): SceneAssetPlanRecord {
  if (!isRecord(value) || !Array.isArray(value.scenes)) {
    throw new Error("WF-09 handoff enrichment requires a Scene Asset plan with a scenes array.");
  }
  const scenes = value.scenes.map((scene, index) => {
    if (!isRecord(scene) || typeof scene.sceneId !== "string" || !scene.sceneId.trim()) {
      throw new Error(`Scene Asset plan entry ${index + 1} has no valid sceneId.`);
    }
    return scene;
  });
  return { ...value, scenes };
}

function handoffRequirement(
  direction: "IN" | "OUT",
  link: CanonicalVisualHandoff
): string {
  const counterpart = direction === "IN" ? link.fromSceneId : link.toSceneId;
  const parts = [
    link.handoffIntent.trim(),
    link.handoffAnchors.length > 0 ? `preserve ${link.handoffAnchors.join(", ")}` : "",
    link.transitionIntent.trim() ? `transition ${link.transitionIntent.trim()}` : "",
    link.continuityLevel.trim() ? `continuity ${link.continuityLevel.trim()}` : ""
  ].filter(Boolean);
  return `[HANDOFF ${direction}] ${counterpart}: ${parts.join("; ")}`;
}

export function deriveSceneHandoffRequirements(
  sceneId: string,
  links: CanonicalVisualHandoff[]
): string[] {
  const incoming = links
    .filter(link => link.toSceneId === sceneId)
    .map(link => handoffRequirement("IN", link));
  const outgoing = links
    .filter(link => link.fromSceneId === sceneId)
    .map(link => handoffRequirement("OUT", link));
  return unique([...incoming, ...outgoing]);
}

export function enrichImagePromptWithHandoffs(
  prompt: string,
  handoffRequirements: string[]
): string {
  const base = prompt.split(CONTINUITY_MARKER)[0]!.trim();
  const compact = unique(
    handoffRequirements
      .filter(requirement => /^\[HANDOFF (?:IN|OUT)\]/u.test(requirement))
      .map(requirement => requirement.replace(/^\[HANDOFF (?:IN|OUT)\]\s*/u, ""))
  );
  return compact.length === 0
    ? base
    : `${base}${CONTINUITY_MARKER}${compact.join(" | ")}`;
}

export function enrichSceneAssetPlanWithHandoffs(
  value: unknown,
  links: CanonicalVisualHandoff[]
): { plan: SceneAssetPlanRecord; enrichedSceneCount: number; linkIds: string[] } {
  const plan = normalizePlan(value);
  let enrichedSceneCount = 0;

  const scenes = plan.scenes.map(scene => {
    const sceneId = (scene.sceneId as string).trim();
    const requirements = deriveSceneHandoffRequirements(sceneId, links);
    if (requirements.length === 0) return scene;
    if (!isRecord(scene.imageAssetDesign)) {
      throw new Error(`Scene ${sceneId} has no imageAssetDesign object.`);
    }
    const currentContinuity = Array.isArray(scene.imageAssetDesign.continuityRequirements)
      ? scene.imageAssetDesign.continuityRequirements.filter((item): item is string => typeof item === "string")
      : [];
    const imageAssetDesign = {
      ...scene.imageAssetDesign,
      continuityRequirements: unique([...currentContinuity, ...requirements])
    };

    let imagePrompt = scene.imagePrompt;
    if (isRecord(scene.imagePrompt) && typeof scene.imagePrompt.prompt === "string") {
      imagePrompt = {
        ...scene.imagePrompt,
        prompt: enrichImagePromptWithHandoffs(scene.imagePrompt.prompt, requirements)
      };
    }

    const sceneLinkIds = links
      .filter(link => link.fromSceneId === sceneId || link.toSceneId === sceneId)
      .map(link => link.linkId);
    enrichedSceneCount += 1;
    return {
      ...scene,
      imageAssetDesign,
      ...(imagePrompt === undefined ? {} : { imagePrompt }),
      handoffContext: {
        source: "production_links",
        linkIds: unique(sceneLinkIds)
      }
    };
  });

  return {
    plan: {
      ...plan,
      handoffDerivation: {
        source: "project.db:production_links",
        rule: "VISUAL channel only; canonical Link remains source of truth"
      },
      scenes
    },
    enrichedSceneCount,
    linkIds: unique(links.map(link => link.linkId))
  };
}

async function writeTextAtomic(filename: string, value: string): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, value, "utf8");
  await rename(temporary, filename);
}

function readCanonicalVisualHandoffs(
  repo: SqliteSceneAssetRepository,
  projectId: string
): CanonicalVisualHandoff[] {
  const table = repo.db.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'production_links' LIMIT 1"
  ).get() as { ok: number } | undefined;
  if (table === undefined) return [];

  const rows = repo.db.prepare(`
    SELECT id, from_scene_id, to_scene_id, continuity_level, handoff_intent,
           handoff_anchor_json, handoff_channels_json, transition_intent, link_status
    FROM production_links
    WHERE project_id = ?
      AND lifecycle_status = 'ACTIVE'
      AND stale = 0
      AND link_status <> 'NOT_PLANNED'
    ORDER BY rowid
  `).all(projectId) as ProductionLinkRow[];

  return rows.flatMap(row => {
    const channels = decodeStringArray(row.handoff_channels_json);
    if (!channels.includes("VISUAL")) return [];
    if (!row.handoff_intent.trim() && !row.transition_intent.trim()) return [];
    return [{
      linkId: row.id,
      fromSceneId: row.from_scene_id,
      toSceneId: row.to_scene_id,
      continuityLevel: row.continuity_level,
      handoffIntent: row.handoff_intent,
      handoffAnchors: decodeStringArray(row.handoff_anchor_json),
      transitionIntent: row.transition_intent
    }];
  });
}

export async function prepareHandoffAwareSceneAssetPlan(input: {
  status: ProjectStatus;
  sourceFile: string;
}): Promise<HandoffAwarePlanResult> {
  const repo = new SqliteSceneAssetRepository(input.status.projectDbPath);
  let links: CanonicalVisualHandoff[];
  try {
    links = readCanonicalVisualHandoffs(repo, input.status.project.projectId);
  } finally {
    repo.close();
  }

  if (links.length === 0) {
    return {
      file: input.sourceFile,
      applied: false,
      visualLinkCount: 0,
      enrichedSceneCount: 0,
      linkIds: []
    };
  }

  const parsed = JSON.parse(await readFile(input.sourceFile, "utf8")) as unknown;
  const enriched = enrichSceneAssetPlanWithHandoffs(parsed, links);
  const target = path.join(input.status.projectRoot, "05_images", "scene-assets.handoff-aware.json");
  await writeTextAtomic(target, `${JSON.stringify(enriched.plan, null, 2)}\n`);
  return {
    file: target,
    applied: enriched.enrichedSceneCount > 0,
    visualLinkCount: links.length,
    enrichedSceneCount: enriched.enrichedSceneCount,
    linkIds: enriched.linkIds
  };
}
