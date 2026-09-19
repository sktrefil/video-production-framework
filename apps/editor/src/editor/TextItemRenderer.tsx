import {AbsoluteFill} from "remotion";
import type {FC} from "react";
import type {SubtitleTimelineItem, TextTimelineItem} from "../studio/editor/editorTypes";
import {VPF_SUBTITLE_VISUAL_TOKENS} from "@vpf/domain";

type RenderableTextItem=SubtitleTimelineItem|TextTimelineItem;
export const TextItemRenderer:FC<{item:RenderableTextItem}>=({item})=>{
  const subtitle=item.type==="SUBTITLE";
  return <AbsoluteFill style={{pointerEvents:"none"}}><div style={{position:"absolute",left:item.x,top:item.y,width:item.width,transform:subtitle?"translate(-50%, -100%)":"translate(-50%, -50%)",textAlign:item.textAlign}}>{item.backgroundEnabled?<div style={{position:"absolute",inset:0,backgroundColor:item.backgroundColor,opacity:item.backgroundOpacity,borderRadius:12}}/>:null}<div style={{position:"relative",color:item.color,fontFamily:item.fontFamily,fontSize:item.fontSize,fontWeight:item.fontWeight,lineHeight:item.lineHeight,whiteSpace:"pre-wrap",wordBreak:"keep-all",overflow:"hidden",display:"-webkit-box",WebkitBoxOrient:"vertical",WebkitLineClamp:item.maxLines,WebkitTextStroke:`${item.strokeWidth}px ${item.strokeColor}`,paintOrder:"stroke fill",textShadow:subtitle?VPF_SUBTITLE_VISUAL_TOKENS.cinematicShadow:undefined}}>{item.text}</div></div></AbsoluteFill>;
};
