export class EditorAssembleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditorAssembleError";
  }
}

/**
 * Legacy synchronous editor assembly is intentionally disabled.
 *
 * Production assembly must go through EditorAssemblyCliService, which uses
 * WF-13 MediaBindingPipeline, EditorContentPlanService, and
 * EditorTimelineAssemblyPipeline so project.db remains the canonical source of
 * truth. Keeping this exported function as a fail-closed compatibility guard
 * prevents older callers from silently recreating 08_editor/edit-project.json.
 */
export function assembleEditorProject(_input: {
  projectId: string;
  projectRoot: string;
  header: string;
}): never {
  throw new EditorAssembleError(
    "EDITOR_ASSEMBLE_LEGACY_DISABLED: use the canonical `npm run vpf -- editor assemble <project_id>` entrypoint."
  );
}
