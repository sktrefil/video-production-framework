import {Composition} from "remotion";
import type {EditProject} from "./studio/editor/editorTypes";
import sampleProjectJson from "./generated/edit_project.sample.json";
import {GenericEditorComposition} from "./editor/GenericEditorComposition";
import {
  GenericFinalRender,
  calculateGenericFinalRenderMetadata,
} from "./editor/GenericFinalRender";
import {StudioToolbarProvider} from "./studio/StudioToolbar";

const SAMPLE_PROJECT = sampleProjectJson as EditProject;

const StudioWrappedGenericEditor: React.FC<{project?: EditProject}> = ({project}) => (
  <StudioToolbarProvider compositionId="GenericVideoEditor">
    <GenericEditorComposition project={project} />
  </StudioToolbarProvider>
);

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="GenericVideoEditor"
      component={StudioWrappedGenericEditor}
      defaultProps={{project: SAMPLE_PROJECT}}
      calculateMetadata={({props}: {props: {project?: EditProject}}) => {
        const editorProject = props.project ?? SAMPLE_PROJECT;
        return {
          durationInFrames: editorProject.project.durationInFrames,
          fps: editorProject.project.fps,
          width: editorProject.project.width,
          height: editorProject.project.height,
        };
      }}
    />
    <Composition
      id="GenericFinalRender"
      component={GenericFinalRender}
      defaultProps={{project: SAMPLE_PROJECT}}
      durationInFrames={SAMPLE_PROJECT.project.durationInFrames}
      fps={SAMPLE_PROJECT.project.fps}
      width={SAMPLE_PROJECT.project.width}
      height={SAMPLE_PROJECT.project.height}
      calculateMetadata={calculateGenericFinalRenderMetadata}
    />
  </>
);
