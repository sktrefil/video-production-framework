import type {FC} from "react";
import sampleProjectJson from "../../test/fixtures/edit_project.json";
import type {EditProject} from "../studio/editor/editorTypes";
import {
  StudioEditorProvider,
  useStudioEditor,
} from "../studio/editor/StudioEditorContext";
import {StudioEditor} from "../studio/editor/StudioEditor";
import {StudioSubtitleCanvasOverlay} from "../studio/editor/canvas/StudioSubtitleCanvasOverlay";
import {StudioGraphicsCanvasOverlay} from "../studio/editor/canvas/StudioGraphicsCanvasOverlay";
import {ProjectRenderer} from "./ProjectRenderer";

export const GENERIC_EDITOR_SAMPLE_PROJECT =
  sampleProjectJson as EditProject;

export const GENERIC_EDITOR_SAMPLE_METADATA =
  GENERIC_EDITOR_SAMPLE_PROJECT.project;

const GenericEditorRuntime: FC = () => {
  const {state} = useStudioEditor();

  return (
    <>
      <ProjectRenderer project={state.project} />
      <StudioGraphicsCanvasOverlay />
      <StudioSubtitleCanvasOverlay />
      <StudioEditor />
    </>
  );
};

export const GenericEditorComposition: FC<{
  project?: EditProject;
}> = ({project}) => (
  <StudioEditorProvider
    initialProject={project ?? GENERIC_EDITOR_SAMPLE_PROJECT}
  >
    <GenericEditorRuntime />
  </StudioEditorProvider>
);
