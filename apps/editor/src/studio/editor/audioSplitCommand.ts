import type {AudioTimelineItem,EditorState,TimelineItem} from "./editorTypes";

const AUDIO_TYPES=new Set<TimelineItem["type"]>(["TTS","CLIP_AUDIO","BGM","SFX"]);

export const isAudioTimelineItem=(item:TimelineItem|null|undefined):item is AudioTimelineItem=>item!==null&&item!==undefined&&AUDIO_TYPES.has(item.type);

export const selectedAudioForSplit=(state:EditorState):AudioTimelineItem|null=>{
  if(state.selectedItemIds.length!==1)return null;
  const item=state.project.items.find((candidate)=>candidate.id===state.selectedItemIds[0]);
  return isAudioTimelineItem(item)?item:null;
};

export const canSplitAudioAtFrame=(item:AudioTimelineItem|null,frame:number):boolean=>{
  if(item===null||item.locked)return false;
  const target=Math.round(frame);
  return target>item.timelineStartFrame&&target<item.timelineStartFrame+item.durationInFrames;
};

export const createAudioSplitId=(state:EditorState,randomUUID:()=>string=()=>crypto.randomUUID()):string=>{
  let id:string;
  do{id=`audio-split-${randomUUID()}`;}while(state.project.items.some((item)=>item.id===id));
  return id;
};
