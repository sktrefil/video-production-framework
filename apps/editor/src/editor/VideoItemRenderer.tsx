import {Video} from "@remotion/media";
import {AbsoluteFill} from "remotion";
import type {FC} from "react";
import type {VideoTimelineItem} from "../studio/editor/editorTypes";
import {resolveEditorMediaSrc} from "./mediaSource";

export const VideoItemRenderer:FC<{item:VideoTimelineItem;masterVolume:number}>=({item,masterVolume})=>(
  <AbsoluteFill style={{overflow:"hidden"}}>
    <Video src={resolveEditorMediaSrc(item.src)} trimBefore={item.sourceStartFrame} trimAfter={item.sourceStartFrame+item.sourceDurationInFrames} playbackRate={item.playbackRate} volume={()=>item.volume*masterVolume} objectFit={item.fit} style={{width:"100%",height:"100%",opacity:item.opacity,transform:`translate(${item.x}px, ${item.y}px) scale(${item.scale}) rotate(${item.rotation}deg)`,transformOrigin:"center center"}} />
  </AbsoluteFill>
);
