import {Audio} from "@remotion/media";
import {interpolate} from "remotion";
import type {FC} from "react";
import type {AudioTimelineItem} from "../studio/editor/editorTypes";
import {resolveEditorMediaSrc} from "./mediaSource";

const envelope=(frame:number,duration:number,fadeIn:number,fadeOut:number)=>{
  const incoming=fadeIn>0?interpolate(frame,[0,fadeIn],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"}):1;
  const start=Math.max(0,duration-fadeOut);const outgoing=fadeOut>0?interpolate(frame,[start,duration],[1,0],{extrapolateLeft:"clamp",extrapolateRight:"clamp"}):1;
  return Math.min(incoming,outgoing);
};
export const AudioItemRenderer:FC<{item:AudioTimelineItem;masterVolume:number}>=({item,masterVolume})=>(
  <Audio src={resolveEditorMediaSrc(item.src)} trimBefore={item.sourceStartFrame} trimAfter={item.sourceStartFrame+item.sourceDurationInFrames} muted={item.muted} loop={item.loop===true} loopVolumeCurveBehavior="extend" volume={(frame)=>item.volume*masterVolume*envelope(frame,item.durationInFrames,item.fadeInFrames,item.fadeOutFrames)} />
);
