import type {CalculateMetadataFunction} from "remotion";
import type {FC} from "react";
import type {EditProject} from "../studio/editor/editorTypes";
import {ProjectRenderer} from "./ProjectRenderer";
export type GenericFinalRenderProps={project:EditProject};
export const GenericFinalRender:FC<GenericFinalRenderProps>=({project})=><ProjectRenderer project={project}/>;
export const calculateGenericFinalRenderMetadata:CalculateMetadataFunction<GenericFinalRenderProps>=({props})=>({durationInFrames:props.project.project.durationInFrames,fps:props.project.project.fps,width:props.project.project.width,height:props.project.project.height,props,defaultCodec:"h264",defaultPixelFormat:"yuv420p"});
