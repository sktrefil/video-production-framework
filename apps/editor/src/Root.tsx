import {Composition} from "remotion";
import type {CalculateMetadataFunction} from "remotion";
import type {EditProject} from "./studio/editor/editorTypes";
import sampleProjectJson from "./generated/edit_project.sample.json";
import {GenericEditorComposition} from "./editor/GenericEditorComposition";
import {
  GenericFinalRender,
  calculateGenericFinalRenderMetadata,
} from "./editor/GenericFinalRender";
import {StudioToolbarProvider} from "./studio/StudioToolbar";
import {configuredStudioProjectConnection,loadActiveEditorProject} from "./studio/editor/persistence/editorPersistenceApi";

const SAMPLE_PROJECT = sampleProjectJson as EditProject;
const studioConnection=configuredStudioProjectConnection();
const studioDurationInFrames=Math.max(SAMPLE_PROJECT.project.durationInFrames,studioConnection.durationInFrames??SAMPLE_PROJECT.project.durationInFrames);
const studioInitialProject:EditProject={
  ...SAMPLE_PROJECT,
  project:{
    ...SAMPLE_PROJECT.project,
    ...(studioConnection.projectId===undefined?{}:{id:studioConnection.projectId}),
    durationInFrames:studioDurationInFrames
  },
  tracks:[...SAMPLE_PROJECT.tracks],
  items:[]
};

const StudioWrappedGenericEditor: React.FC<{project?: EditProject}> = ({project}) => (
  <StudioToolbarProvider compositionId="GenericVideoEditor">
    <GenericEditorComposition project={project} />
  </StudioToolbarProvider>
);

const calculateStudioMetadata:CalculateMetadataFunction<{project?:EditProject}>=async({props,abortSignal,isRendering})=>{
  let editorProject=props.project??studioInitialProject;
  if(!isRendering){
    try{
      const activeProject=await loadActiveEditorProject({signal:abortSignal});
      if(activeProject)editorProject=activeProject;
    }catch(error){
      if(!(error instanceof TypeError))throw error;
    }
  }
  return {
    props:{...props,project:editorProject},
    durationInFrames:editorProject.project.durationInFrames,
    fps:editorProject.project.fps,
    width:editorProject.project.width,
    height:editorProject.project.height,
  };
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="GenericVideoEditor"
      component={StudioWrappedGenericEditor}
      defaultProps={{project: studioInitialProject}}
      durationInFrames={studioDurationInFrames}
      calculateMetadata={calculateStudioMetadata}
    />
    {studioConnection.projectId===undefined ? (
      <Composition
        id="GenericFinalRender"
        component={GenericFinalRender}
        defaultProps={{project: studioInitialProject}}
        durationInFrames={studioInitialProject.project.durationInFrames}
        fps={studioInitialProject.project.fps}
        width={studioInitialProject.project.width}
        height={studioInitialProject.project.height}
        calculateMetadata={calculateGenericFinalRenderMetadata}
      />
    ) : null}
  </>
);
