import { resolve } from "node:path";
import { RepositoryThreeTierReferenceSelectionPort, type TierSelectionLimits } from "@vpf/reference-library/tiered-selector";
import type { SceneAssetDecisionPort } from "@vpf/production-system";
import {
  ReferenceAwareUnifiedImageRuntimeJobService
} from "./reference-aware-image-runtime.js";
import type {
  ChannelVisualBiblePort,
  FormatProfilePort,
  SceneAssetClock,
  SceneAssetContextPort,
  SceneAssetIdFactory,
  SceneAssetRepository
} from "./index.js";

export interface StandardReferenceAwareImageRuntimeOptions {
  /** Repository root containing workspace/reference_library and workspace/projects. Defaults to process.cwd(). */
  repositoryRoot?: string;
  referenceLimits?: TierSelectionLimits;
}

/**
 * Standard WF-09 composition.
 *
 * Callers do not provide a reference selector. The service always resolves the
 * canonical three-tier policy from the repository:
 *
 *   workspace/reference_library/global_visual       (mandatory, always used)
 *   workspace/reference_library/knf_layout          (KNF-beat selected)
 *   workspace/projects/<project>/05_images/reference_library/project (optional)
 *
 * Shared references are materialized automatically inside the active project
 * before the existing ImageRuntimeExecutor consumes them.
 */
export function createStandardReferenceAwareImageRuntimeJobService(
  repository: SceneAssetRepository,
  context: SceneAssetContextPort,
  visualBibles: ChannelVisualBiblePort,
  formatProfiles: FormatProfilePort,
  decisions: SceneAssetDecisionPort,
  clock: SceneAssetClock,
  ids: SceneAssetIdFactory,
  options: StandardReferenceAwareImageRuntimeOptions = {}
): ReferenceAwareUnifiedImageRuntimeJobService {
  const repositoryRoot = resolve(options.repositoryRoot ?? process.cwd());
  const references = new RepositoryThreeTierReferenceSelectionPort(
    repositoryRoot,
    options.referenceLimits ?? {}
  );
  return new ReferenceAwareUnifiedImageRuntimeJobService(
    repository,
    context,
    visualBibles,
    formatProfiles,
    decisions,
    references,
    clock,
    ids
  );
}
