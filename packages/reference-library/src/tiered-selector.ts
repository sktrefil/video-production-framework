import { access } from "node:fs/promises";
import { join } from "node:path";
import type { ImageRuntimeReference } from "@vpf/runtime-contracts/image";
import {
  loadVerifiedReferenceLibrary,
  mergeRuntimeReferences,
  selectSceneReferences,
  toImageRuntimeReferences,
  type ReferenceLibraryManifest
} from "./index.js";
import type {
  ReferenceSelectionRequest,
  RuntimeReferenceSelectionPort
} from "./selector.js";

export const REFERENCE_TIERS = ["GLOBAL_VISUAL", "KNF_LAYOUT", "PROJECT"] as const;
export type ReferenceTier = (typeof REFERENCE_TIERS)[number];

export interface TieredReferenceLibraryPaths {
  /** Repository-shared root, normally workspace/reference_library. */
  sharedAbsoluteRoot: string;
  /** Runtime-contract relative root, normally workspace/reference_library. */
  sharedProjectRelativeRoot: string;
  /** Project workspace absolute root, normally workspace/projects/<project_id>. */
  projectAbsoluteRoot: string;
  /** Project workspace relative root used by ImageRuntimeInput, normally workspace/projects/<project_id>. */
  projectRelativeRoot: string;
}

export interface TierSelectionLimits {
  /** Global visual references are foundational and are always selected. */
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

function allAsRuntimeReferences(
  manifest: ReferenceLibraryManifest,
  relativeRoot: string,
  maxReferences: number
): ImageRuntimeReference[] {
  return toImageRuntimeReferences(manifest.entries.slice(0, Math.max(1, maxReferences)), relativeRoot);
}

/**
 * Canonical WF-09 reference policy.
 *
 * 1. GLOBAL_VISUAL is repository-shared and mandatory. It is always attached.
 * 2. KNF_LAYOUT is repository-shared and attached only when a KNF beat exists.
 * 3. PROJECT is project-local and optional; when present it is scene-selected.
 *
 * Every loaded manifest is SHA-256 verified before any ImageRuntimeReference is returned.
 * Missing GLOBAL_VISUAL is therefore a hard B010 block instead of silently generating
 * without the approved visual baseline.
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
    const globalReferences = allAsRuntimeReferences(
      globalManifest,
      `${this.paths.sharedProjectRelativeRoot}/global_visual`,
      this.limits.globalVisual ?? 2
    ).map(reference => ({ ...reference, role: reference.role.replace("REFERENCE_LIBRARY:", "REFERENCE_LIBRARY:GLOBAL_VISUAL:") }));

    let knfReferences: ImageRuntimeReference[] = [];
    if (input.knfBeat !== undefined && input.knfBeat.trim() && await exists(join(knfDir, "manifest.json"))) {
      const knfManifest = await loadVerifiedReferenceLibrary(knfDir);
      const selected = selectSceneReferences(
        knfManifest,
        requestToSceneInput(input, this.limits.knfLayout ?? 1)
      );
      knfReferences = toImageRuntimeReferences(
        selected,
        `${this.paths.sharedProjectRelativeRoot}/knf_layout`
      ).map(reference => ({ ...reference, role: reference.role.replace("REFERENCE_LIBRARY:", "REFERENCE_LIBRARY:KNF_LAYOUT:") }));
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
        `${this.paths.projectRelativeRoot}/05_images/reference_library/project`
      ).map(reference => ({ ...reference, role: reference.role.replace("REFERENCE_LIBRARY:", "REFERENCE_LIBRARY:PROJECT:") }));
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
