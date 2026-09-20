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
 *
 * The object return annotation is deliberate: older compiled callers still
 * spread the result for JSON output, but this guard always throws before a
 * value can be returned. Using `never` here makes those dead compatibility
 * callers fail TypeScript's object-spread check and prevents the CLI package
 * from building even though production execution is routed through entry.ts.
 */
export function assembleEditorProject(_input: {
  projectId: string;
  projectRoot: string;
  header: string;
}): Record<string, never> {
  throw new EditorAssembleError(
    "EDITOR_ASSEMBLE_LEGACY_DISABLED: use the canonical `npm run vpf -- editor assemble <project_id>` entrypoint."
  );
}
