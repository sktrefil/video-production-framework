import {AbsoluteFill} from "remotion";
import type {CSSProperties,FC} from "react";
import type {GraphicTimelineItem} from "../studio/editor/editorTypes";
const background=(item:GraphicTimelineItem):CSSProperties=>item.graphicType==="GRADIENT"?{background:`linear-gradient(${item.gradientAngleDeg??180}deg, ${item.gradientStartColor??"rgba(0,0,0,0)"} 0%, ${item.gradientEndColor??"rgba(0,0,0,0.78)"} 100%)`}:{backgroundColor:item.backgroundColor};
export const GraphicItemRenderer:FC<{item:GraphicTimelineItem}>=({item})=><AbsoluteFill style={{pointerEvents:"none"}}><div style={{position:"absolute",left:item.x,top:item.y,width:item.width,height:item.height,opacity:item.opacity,borderRadius:item.borderRadius,backdropFilter:item.graphicType==="BLUR_PANEL"?`blur(${item.blurPx}px)`:undefined,WebkitBackdropFilter:item.graphicType==="BLUR_PANEL"?`blur(${item.blurPx}px)`:undefined,...background(item)}}/></AbsoluteFill>;
