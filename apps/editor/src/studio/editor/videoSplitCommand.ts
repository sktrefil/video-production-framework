import type {EditorState,TimelineItem,VideoTimelineItem} from "./editorTypes";

export const isVideoTimelineItem=(item:TimelineItem|null|undefined):item is VideoTimelineItem=>item?.type==="VIDEO";

export const selectedVideoForSplit=(state:EditorState):VideoTimelineItem|null=>{
  if(state.selectedItemIds.length!==1)return null;
  const item=state.project.items.find((candidate)=>candidate.id===state.selectedItemIds[0]);
  return isVideoTimelineItem(item)?item:null;
};

export const canSplitVideoAtFrame=(item:VideoTimelineItem|null,frame:number):boolean=>{
  if(item===null||item.locked||item.sourceWindowApprovalRequired===true||item.sourceDurationInFrames<=1)return false;
  const target=Math.round(frame);
  return target>item.timelineStartFrame&&target<item.timelineStartFrame+item.durationInFrames;
};

export const createVideoSplitId=(state:EditorState,randomUUID:()=>string=()=>crypto.randomUUID()):string=>{
  let id:string;
  do{id=`video-split-${randomUUID()}`;}while(state.project.items.some((item)=>item.id===id));
  return id;
};
