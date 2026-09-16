import type {EditorState,TimelineItem} from "./editorTypes";

export type SnapTargetKind="PLAYHEAD"|"ITEM_START"|"ITEM_END"|"SUBTITLE_START"|"SUBTITLE_END"|"PROJECT_START"|"PROJECT_END";
export type SnapTarget={frame:number;kind:SnapTargetKind;itemId?:string};
export type SnapDragMode="move"|"trim-start"|"trim-end";
export type SnapResolution={deltaFrames:number;target:SnapTarget|null;distanceFrames:number|null};

export const buildSnapTargets=(state:EditorState,excludeItemId?:string):SnapTarget[]=>{
  const targets:SnapTarget[]=[
    {frame:0,kind:"PROJECT_START"},
    {frame:state.project.project.durationInFrames,kind:"PROJECT_END"},
    {frame:state.playheadFrame,kind:"PLAYHEAD"},
  ];
  for(const item of state.project.items){
    if(item.id===excludeItemId||!item.enabled)continue;
    const subtitle=item.type==="SUBTITLE";
    targets.push({frame:item.timelineStartFrame,kind:subtitle?"SUBTITLE_START":"ITEM_START",itemId:item.id});
    targets.push({frame:item.timelineStartFrame+item.durationInFrames,kind:subtitle?"SUBTITLE_END":"ITEM_END",itemId:item.id});
  }
  return targets;
};

const candidateAnchors=(item:TimelineItem,mode:SnapDragMode,rawDelta:number):number[]=>{
  if(mode==="trim-start")return[item.timelineStartFrame+rawDelta];
  if(mode==="trim-end")return[item.timelineStartFrame+item.durationInFrames+rawDelta];
  const start=item.timelineStartFrame+rawDelta;
  return[start,start+item.durationInFrames];
};

export const resolveSnapDelta=(input:{item:TimelineItem;mode:SnapDragMode;rawDeltaFrames:number;targets:SnapTarget[];toleranceFrames:number;enabled:boolean;bypass?:boolean}):SnapResolution=>{
  const raw=Math.round(input.rawDeltaFrames);
  if(!input.enabled||input.bypass||input.toleranceFrames<0)return{deltaFrames:raw,target:null,distanceFrames:null};
  let best:{offset:number;distance:number;target:SnapTarget}|null=null;
  for(const anchor of candidateAnchors(input.item,input.mode,raw)){
    for(const target of input.targets){
      const offset=target.frame-anchor;
      const distance=Math.abs(offset);
      if(distance>input.toleranceFrames)continue;
      if(best===null||distance<best.distance)best={offset,distance,target};
    }
  }
  if(best===null)return{deltaFrames:raw,target:null,distanceFrames:null};
  return{deltaFrames:raw+best.offset,target:best.target,distanceFrames:best.distance};
};
