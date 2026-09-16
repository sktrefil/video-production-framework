import type {FC} from "react";
import sampleProjectJson from "../generated/edit_project.sample.json";
import type {EditProject} from "../studio/editor/editorTypes";
import {StudioEditorProvider, useStudioEditor} from "../studio/editor/StudioEditorContext";
import {StudioEditor} from "../studio/editor/StudioEditor";
import {StudioCanvasDirectOverlay} from "../studio/editor/canvas/StudioCanvasDirectOverlay";
import {ProjectRenderer} from "./ProjectRenderer";

export const GENERIC_EDITOR_SAMPLE_PROJECT=sampleProjectJson as EditProject;
export const GENERIC_EDITOR_SAMPLE_METADATA=GENERIC_EDITOR_SAMPLE_PROJECT.project;
const GenericEditorRuntime:FC=()=>{const {state}=useStudioEditor();return <><ProjectRenderer project={state.project}/><StudioCanvasDirectOverlay/><StudioEditor/></>;};
export const GenericEditorComposition:FC<{project?:EditProject}>=({project})=><StudioEditorProvider initialProject={project??GENERIC_EDITOR_SAMPLE_PROJECT}><GenericEditorRuntime/></StudioEditorProvider>;
