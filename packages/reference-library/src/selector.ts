import type { ImageRuntimeReference } from "@vpf/runtime-contracts/image";
import {
  loadVerifiedReferenceLibrary,
  selectSceneReferences,
  toImageRuntimeReferences
} from "./index.js";

export interface ReferenceSelectableScene {
  id: string;
  scriptSegment: string;
  primaryVisualIdea: string;
  mustBeSeen: string[];
}

export interface ReferenceSelectionRequest {
  projectId: string;
  scene: ReferenceSelectableScene;
  knfBeat?: string;
  maxReferences?: number;
}

export interface RuntimeReferenceSelectionPort {
  selectReferences(input: ReferenceSelectionRequest): Promise<ImageRuntimeReference[]>;
}

export class VerifiedFilesystemReferenceSelector implements RuntimeReferenceSelectionPort {
  constructor(
    private readonly libraryDirectory: string,
    private readonly projectRelativeLibraryRoot: string
  ) {}

  async selectReferences(input: ReferenceSelectionRequest): Promise<ImageRuntimeReference[]> {
    const manifest = await loadVerifiedReferenceLibrary(this.libraryDirectory);
    const selected = selectSceneReferences(manifest, {
      sceneId: input.scene.id,
      sceneText: input.scene.scriptSegment,
      primaryVisualIdea: input.scene.primaryVisualIdea,
      mustBeSeen: input.scene.mustBeSeen,
      ...(input.knfBeat === undefined ? {} : { knfBeat: input.knfBeat }),
      ...(input.maxReferences === undefined ? {} : { maxReferences: input.maxReferences })
    });
    return toImageRuntimeReferences(selected, this.projectRelativeLibraryRoot);
  }
}
