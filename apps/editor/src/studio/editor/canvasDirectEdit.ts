import type {EditProject,TimelineItem} from "./editorTypes";

export const CANVAS_GUIDE_SNAP_PX=12;
export const SHORTS_SAFE_TOP_RATIO=.18;
export const SHORTS_SAFE_BOTTOM_START_RATIO=.72;

export type CanvasRect={left:number;top:number;width:number;height:number};

export const snapCanvasValue=(value:number,targets:number[],tolerance=CANVAS_GUIDE_SNAP_PX)=>{
  let best=value;let distance=Math.max(0,tolerance)+1;
  for(const target of targets){const next=Math.abs(value-target);if(next<=tolerance&&next<distance){best=target;distance=next;}}
  return best;
};

export const canvasItemRect=(item:TimelineItem,project:EditProject["project"]):CanvasRect=>{
  if(item.type==="VIDEO"||item.type==="IMAGE"){
    const width=project.width*Math.max(.01,item.scale);const height=project.height*Math.max(.01,item.scale);
    return{left:(project.width-width)/2+item.x,top:(project.height-height)/2+item.y,width,height};
  }
  if(item.type==="SUBTITLE"||item.type==="TEXT"){
    const height=Math.max(item.fontSize*1.4,item.fontSize*item.lineHeight*Math.max(1,item.maxLines));
    return{left:item.x-item.width/2,top:item.y-height/2,width:item.width,height};
  }
  if(item.type==="GRAPHIC")return{left:item.x,top:item.y,width:item.width,height:item.height};
  return{left:0,top:0,width:0,height:0};
};

export const safeAreaGuideFrames=(project:EditProject["project"])=>({top:project.height*SHORTS_SAFE_TOP_RATIO,bottom:project.height*SHORTS_SAFE_BOTTOM_START_RATIO,centerX:project.width/2,centerY:project.height/2});
