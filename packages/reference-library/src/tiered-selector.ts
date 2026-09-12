import { access, copyFile, mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { ImageRuntimeReference } from "@vpf/runtime-contracts/image";
import {
  loadVerifiedReferenceLibrary,
  mergeRuntimeReferences,
  selectSceneReferences,
  toImageRuntimeReferences,
  type ReferenceLibraryEntry,
  type ReferenceLibraryManifest
} from "./index.js";
import type {
  ReferenceSelectionRequest,
  RuntimeReferenceSelectionPort
} from "./selector.js";

export const REFERENCE_TIERS = ["GLOBAL_VISUAL", "KNF_LAYOUT", "PROJECT"] as const;
export type ReferenceTier = (typeof REFERENCE_TIERS)[number];

export interface TieredReferenceLibraryPaths {
  /** Repository-shared source root, normally <repo>/workspace/reference_library. */
  sharedAbsoluteRoot: string;
  /** Project workspace root, normally <repo>/workspace/projects/<project_id>. */
  projectAbsoluteRoot: string;
}

export interface TierSelectionLimits {
  /** Global visual references are foundational but scene-selected by default. */
  globalVisual?: number;
  /** KNF references are selected only when a KNF beat was supplied. */
  knfLayout?: number;
  /** Project references are scene-selected when the project library exists. */
  project?: number;
}

export interface TierSelectionResult {
  references: ImageRuntimeReference[];
  counts: Record<ReferenceTier, number>;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function requestToSceneInput(input: ReferenceSelectionRequest, maxReferences: number) {
  return {
    sceneId: input.scene.id,
    sceneText: input.scene.scriptSegment,
    primaryVisualIdea: input.scene.primaryVisualIdea,
    mustBeSeen: input.scene.mustBeSeen,
    ...(input.knfBeat === undefined ? {} : { knfBeat: input.knfBeat }),
    maxReferences
  };
}

const GLOBAL_ROLE_BY_FILE: Record<string, string> = {
  "1.png": "COMPOSITION_GRAMMAR",
  "2.png": "ATMOSPHERE_GRAMMAR",
  "3.png": "NARRATIVE_GRAMMAR",
  "6.png": "MYSTERY_CLOSURE_GRAMMAR"
};

function globalRole(entry: ReferenceLibraryEntry): string {
  return GLOBAL_ROLE_BY_FILE[basename(entry.relativePath).toLowerCase()] ?? "VISUAL_GRAMMAR";
}

function findGlobalEntry(manifest: ReferenceLibraryManifest, filename: string): ReferenceLibraryEntry | undefined {
  return manifest.entries.find(entry => basename(entry.relativePath).toLowerCase() === filename.toLowerCase());
}

/**
 * Select a small, explicit global grammar set instead of averaging every approved
 * image together. 1.png is the canonical composition anchor when present. The
 * second reference is chosen from the Scene/KNF narrative function. Callers may
 * raise globalVisual to 3+ when a specific workflow genuinely needs more context.
 */
function selectGlobalEntries(
  manifest: ReferenceLibraryManifest,
  input: ReferenceSelectionRequest,
  maxReferences: number
): ReferenceLibraryEntry[] {
  const limit = Math.max(1, maxReferences);
  const text = [
    input.scene.scriptSegment,
    input.scene.primaryVisualIdea,
    ...input.scene.mustBeSeen,
    input.knfBeat ?? ""
  ].join(" ").toLowerCase();

  const preferred: string[] = ["1.png"];
  if (/지도|경로|마지막|어디|미스터리|공백|unknown|mystery|map|route|close|ending/u.test(text)) {
    preferred.push("6.png", "3.png", "2.png");
  } else if (/비문|기록|증거|연대|타임라인|문서|inscription|evidence|record|timeline|document/u.test(text)) {
    preferred.push("3.png", "2.png", "6.png");
  } else if (/안개|풍경|행군|도로|전투|환경|mist|landscape|march|road|battle|environment/u.test(text)) {
    preferred.push("2.png", "3.png", "6.png");
  } else {
    preferred.push("3.png", "2.png", "6.png");
  }

  const selected: ReferenceLibraryEntry[] = [];
  const seen = new Set<string>();
  for (const filename of preferred) {
    const entry = findGlobalEntry(manifest, filename);
    if (entry === undefined || seen.has(entry.relativePath)) continue;
    selected.push(entry);
    seen.add(entry.relativePath);
    if (selected.length >= limit) return selected;
  }
  for (const entry of manifest.entries) {
    if (seen.has(entry.relativePath)) continue;
    selected.push(entry);
    seen.add(entry.relativePath);
    if (selected.length >= limit) break;
  }
  return selected;
}

async function materializeSharedEntries(
  entries: readonly ReferenceLibraryEntry[],
  sourceDirectory: string,
  projectAbsoluteRoot: string,
  tierDirectory: "global_visual" | "knf_layout",
  tierRole: "GLOBAL_VISUAL" | "KNF_LAYOUT"
): Promise<ImageRuntimeReference[]> {
  const relativeRoot = `05_images/reference_library/_shared/${tierDirectory}`;
  const targetRoot = join(projectAbsoluteRoot, "05_images", "reference_library", "_shared", tierDirectory);
  await mkdir(targetRoot, { recursive: true });

  for (const entry of entries) {
    const source = join(sourceDirectory, entry.relativePath);
    const target = join(targetRoot, entry.relativePath);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }

  const converted = toImageRuntimeReferences(entries, relativeRoot);
  return converted.map((reference, index) => ({
    ...reference,
    role: tierRole === "GLOBAL_VISUAL"
      ? `REFERENCE_LIBRARY:GLOBAL_VISUAL:${globalRole(entries[index]!)}:${reference.role.replace("REFERENCE_LIBRARY:", "")}`
      : reference.role.replace("REFERENCE_LIBRARY:", `REFERENCE_LIBRARY:${tierRole}:`)
  }));
}

/**
 * Canonical WF-09 reference policy.
 *
 * Shared source assets live once under workspace/reference_library. Because the
 * image runtime deliberately forbids reading outside a project workspace, the
 * selected shared references are automatically materialized byte-for-byte under
 * 05_images/reference_library/_shared before ImageRuntimeInput is created.
 *
 * 1. GLOBAL_VISUAL is repository-shared and mandatory. A compact scene-aware set
 *    is selected by default so the model receives explicit visual grammar instead
 *    of an averaged pile of references.
 * 2. KNF_LAYOUT is repository-shared and attached only when a KNF beat exists.
 * 3. PROJECT is project-local and optional; when present it is scene-selected.
 *
 * All source/project manifests are SHA-256 verified before references are returned.
 * The normal ImageRuntimeExecutor verifies the materialized bytes again against
 * those approved SHA-256 values, preserving MIG-11 project isolation.
 */
export class ThreeTierFilesystemReferenceSelector implements RuntimeReferenceSelectionPort {
  constructor(
    private readonly paths: TieredReferenceLibraryPaths,
    private readonly limits: TierSelectionLimits = {}
  ) {}

  async selectReferences(input: ReferenceSelectionRequest): Promise<ImageRuntimeReference[]> {
    return (await this.selectReferencesDetailed(input)).references;
  }

  async selectReferencesDetailed(input: ReferenceSelectionRequest): Promise<TierSelectionResult> {
    const globalDir = join(this.paths.sharedAbsoluteRoot, "global_visual");
    const knfDir = join(this.paths.sharedAbsoluteRoot, "knf_layout");
    const projectDir = join(this.paths.projectAbsoluteRoot, "05_images", "reference_library", "project");

    const globalManifest = await loadVerifiedReferenceLibrary(globalDir);
    const globalEntries = selectGlobalEntries(
      globalManifest,
      input,
      this.limits.globalVisual ?? 2
    );
    const globalReferences = await materializeSharedEntries(
      globalEntries,
      globalDir,
      this.paths.projectAbsoluteRoot,
      "global_visual",
      "GLOBAL_VISUAL"
    );

    let knfReferences: ImageRuntimeReference[] = [];
    if (input.knfBeat !== undefined && input.knfBeat.trim() && await exists(join(knfDir, "manifest.json"))) {
      const knfManifest = await loadVerifiedReferenceLibrary(knfDir);
      const selected = selectSceneReferences(
        knfManifest,
        requestToSceneInput(input, this.limits.knfLayout ?? 1)
      );
      knfReferences = await materializeSharedEntries(
        selected,
        knfDir,
        this.paths.projectAbsoluteRoot,
        "knf_layout",
        "KNF_LAYOUT"
      );
    }

    let projectReferences: ImageRuntimeReference[] = [];
    if (await exists(join(projectDir, "manifest.json"))) {
      const projectManifest = await loadVerifiedReferenceLibrary(projectDir);
      const selected = selectSceneReferences(
        projectManifest,
        requestToSceneInput(input, this.limits.project ?? 1)
      );
      projectReferences = toImageRuntimeReferences(
        selected,
        "05_images/reference_library/project"
      ).map(reference => ({
        ...reference,
        role: reference.role.replace("REFERENCE_LIBRARY:", "REFERENCE_LIBRARY:PROJECT:")
      }));
    }

    const references = mergeRuntimeReferences(
      globalReferences,
      mergeRuntimeReferences(knfReferences, projectReferences)
    );
    return {
      references,
      counts: {
        GLOBAL_VISUAL: globalReferences.length,
        KNF_LAYOUT: knfReferences.length,
        PROJECT: projectReferences.length
      }
    };
  }
}

export function createStandardThreeTierReferenceSelector(
  repositoryRoot: string,
  projectId: string,
  limits: TierSelectionLimits = {}
): ThreeTierFilesystemReferenceSelector {
  return new ThreeTierFilesystemReferenceSelector(
    {
      sharedAbsoluteRoot: join(repositoryRoot, "workspace", "reference_library"),
      projectAbsoluteRoot: join(repositoryRoot, "workspace", "projects", projectId)
    },
    limits
  );
}

/**
 * WF-09-facing port that resolves the current project on every request. A single
 * service instance can therefore process multiple projects without callers ever
 * constructing per-project reference selectors or copying shared assets manually.
 */
export class RepositoryThreeTierReferenceSelectionPort implements RuntimeReferenceSelectionPort {
  constructor(
    private readonly repositoryRoot: string,
    private readonly limits: TierSelectionLimits = {}
  ) {}

  selectReferences(input: ReferenceSelectionRequest): Promise<ImageRuntimeReference[]> {
    return createStandardThreeTierReferenceSelector(
      this.repositoryRoot,
      input.projectId,
      this.limits
    ).selectReferences(input);
  }
}
