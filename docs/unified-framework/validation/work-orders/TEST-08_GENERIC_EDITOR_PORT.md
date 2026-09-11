# TEST-08 — Generic Editor Port

Owner: MIG-08

## Goal
Validate that the Generic Editor port is project-neutral, correctly wired, buildable, browser-smoke capable, and free of project-specific/legacy decision logic.

## Validate
- editor types/reducer/context/actions/selectors,
- timeline/canvas/inspector/persistence boundaries,
- GenericEditorComposition/ProjectRenderer item renderers,
- editor package tests,
- bundle/build/typecheck,
- browser smoke in CI or a deterministic equivalent,
- project load/save uses approved materialized JSON while DB remains canonical,
- no SadoPrince/project-specific behavior leaked into generic editor.

## Human visual note
Subjective preview QC belongs to TEST-13. This TEST requires technical editor/browser correctness.

## Repair rule
Editor implementation defects may be repaired automatically; making editor JSON canonical state is prohibited.

## PASS criteria
Generic Editor is technically loadable/editable/render-compatible and architecture-compliant.

## Next
PASS -> TEST-09.