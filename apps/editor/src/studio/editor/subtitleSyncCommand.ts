import type {EditorState,SubtitleTimelineItem,TimelineItem} from "./editorTypes";

export const isSubtitleTimelineItem=(item:TimelineItem|null|undefined):item is SubtitleTimelineItem=>item?.type==="SUBTITLE";

export const selectedSubtitleForSync=(state:EditorState):SubtitleTimelineItem|null=>{
  if(state.selectedItemIds.length!==1)return null;
  const item=state.project.items.find((candidate)=>candidate.id===state.selectedItemIds[0]);
  return isSubtitleTimelineItem(item)?item:null;
};

export const canSplitSubtitleAtFrame=(item:SubtitleTimelineItem|null,frame:number):boolean=>{
  if(item===null||item.locked)return false;
  const target=Math.round(frame);
  return target>item.timelineStartFrame&&target<item.timelineStartFrame+item.durationInFrames;
};

export const createSubtitleSplitId=(state:EditorState,randomUUID:()=>string=()=>crypto.randomUUID()):string=>{
  let id:string;
  do{id=`subtitle-split-${randomUUID()}`;}while(state.project.items.some((item)=>item.id===id));
  return id;
};

export const nextSubtitleForMerge=(state:EditorState,item:SubtitleTimelineItem|null):SubtitleTimelineItem|null=>{
  if(item===null)return null;
  const candidates=state.project.items.filter((candidate):candidate is SubtitleTimelineItem=>candidate.type==="SUBTITLE"&&candidate.trackId===item.trackId&&candidate.id!==item.id&&candidate.timelineStartFrame>=item.timelineStartFrame).sort((a,b)=>a.timelineStartFrame-b.timelineStartFrame||a.id.localeCompare(b.id));
  return candidates[0]??null;
};

export const subtitleNudgeTarget=(state:EditorState,item:SubtitleTimelineItem,deltaFrames:number):number=>{
  const lastStart=Math.max(0,state.project.project.durationInFrames-item.durationInFrames);
  return Math.min(lastStart,Math.max(0,item.timelineStartFrame+Math.round(deltaFrames)));
};

export type SubtitleWarning={overlap:boolean;safeZone:boolean};

export const subtitleWarning=(state:EditorState,item:SubtitleTimelineItem):SubtitleWarning=>{
  const start=item.timelineStartFrame;const end=start+item.durationInFrames;
  const overlap=state.project.items.some((candidate)=>candidate.type==="SUBTITLE"&&candidate.id!==item.id&&candidate.trackId===item.trackId&&candidate.timelineStartFrame<end&&candidate.timelineStartFrame+candidate.durationInFrames>start);
  const {width,height}=state.project.project;
  const safeLeft=width*.04;const safeRight=width*.96;const safeTop=height*.05;const safeBottom=height*.96;
  const safeZone=item.x-item.width/2<safeLeft||item.x+item.width/2>safeRight||item.y<safeTop||item.y>safeBottom;
  return{overlap,safeZone};
};
