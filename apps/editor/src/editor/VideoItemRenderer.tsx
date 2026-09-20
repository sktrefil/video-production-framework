import {Video} from "@remotion/media";
import {AbsoluteFill,interpolate,useCurrentFrame} from "remotion";
import type {FC} from "react";
import type {VideoTimelineItem} from "../studio/editor/editorTypes";
import {resolveEditorMediaSrc} from "./mediaSource";

export const VideoItemRenderer:FC<{item:VideoTimelineItem;masterVolume:number;muted?:boolean}>=({item,masterVolume,muted=false})=>{
  const frame=useCurrentFrame();const transition=Math.min(item.durationInFrames,Math.max(0,item.transitionInFrames??0));const transitionOpacity=transition>0?interpolate(frame,[0,transition],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"}):1;
  return <AbsoluteFill style={{overflow:"hidden"}}>
    <Video
  src={resolveEditorMediaSrc(item.src)}
  trimBefore={item.sourceStartFrame}
  trimAfter={item.sourceStartFrame+item.sourceDurationInFrames}
  loop={item.loop===true}
  playbackRate={item.playbackRate}
  volume={()=>muted?0:item.volume*masterVolume}
  objectFit={item.fit}
  style={{width:"100%",height:"100%",opacity:item.opacity*transitionOpacity,transform:`translate(${item.x}px, ${item.y}px) scale(${item.scale}) rotate(${item.rotation}deg)`,transformOrigin:"center center"}} />
  </AbsoluteFill>;
};
