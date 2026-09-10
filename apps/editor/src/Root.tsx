import type {FC} from "react";
import {Composition} from "remotion";
import type {EditProject} from "./studio/editor/editorTypes";
import {StudioToolbarProvider} from "./studio/StudioToolbar";
import {GenericEditorComposition} from "./editor/GenericEditorComposition";
import {GenericFinalRender, calculateGenericFinalRenderMetadata} from "./editor/GenericFinalRender";
import sample from "../test/fixtures/edit_project.json";

const EDITOR_PROJECT = sample as EditProject;
const StudioWrappedGenericEditor: FC<{project: EditProject}> = ({project}) => (
  <StudioToolbarProvider compositionId="GenericVideoEditor">
    <GenericEditorComposition project={project} />
  </StudioToolbarProvider>
);

export const RemotionRoot: FC = () => (
  <>
    <Composition
      id="GenericVideoEditor"
      component={StudioWrappedGenericEditor}
      defaultProps={{ project: EDITOR_PROJECT }}
      calculateMetadata={calculateGenericFinalRenderMetadata}
    />
    <Composition
      id="GenericFinalRender"
      component={GenericFinalRender}
      defaultProps={{ project: EDITOR_PROJECT }}
      calculateMetadata={calculateGenericFinalRenderMetadata}
    />
  </>
);
