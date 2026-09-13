import {Composition} from "remotion";
import type {EditProject} from "./studio/editor/editorTypes";
import sampleProjectJson from "./generated/edit_project.sample.json";
import {GenericEditorComposition} from "./editor/GenericEditorComposition";
import {
  GenericFinalRender,
  calculateGenericFinalRenderMetadata,
} from "./editor/GenericFinalRender";
import {StudioToolbarProvider} from "./studio/StudioToolbar";
import {configuredStudioProjectConnection} from "./studio/editor/persistence/editorPersistenceApi";

const SAMPLE_PROJECT = sampleProjectJson as EditProject;
const studioConnection=configuredStudioProjectConnection();
const studioDurationInFrames=Math.max(SAMPLE_PROJECT.project.durationInFrames,studioConnection.durationInFrames??SAMPLE_PROJECT.project.durationInFrames);
const studioInitialProject:EditProject=studioConnection.projectId===undefined?SAMPLE_PROJECT:{
  ...SAMPLE_PROJECT,
  project:{...SAMPLE_PROJECT.project,id:studioConnection.projectId,durationInFrames:studioDurationInFrames},
  tracks:[],
  items:[]
};

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
      defaultProps={{project: studioInitialProject}}
      durationInFrames={studioDurationInFrames}
      calculateMetadata={({props}: {props: {project?: EditProject}}) => {
        const editorProject = props.project ?? studioInitialProject;
        return {
          durationInFrames: Math.max(editorProject.project.durationInFrames,studioDurationInFrames),
          fps: editorProject.project.fps,
          width: editorProject.project.width,
          height: editorProject.project.height,
        };
      }}
    />
    {studioConnection.projectId===undefined ? (
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
    ) : null}
  </>
);
