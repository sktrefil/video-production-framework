import type {TimelineItem} from "./editorTypes";

export const selectionAfterItemPointer=(current:string[],itemId:string,additive:boolean):string[]=>{
  if(additive)return current.includes(itemId)?current.filter((id)=>id!==itemId):[...current,itemId];
  return current.includes(itemId)?current:[itemId];
};

export const clampGroupMoveDelta=(items:TimelineItem[],deltaFrames:number):number=>{
  if(items.length===0)return 0;
  const minStart=Math.min(...items.map((item)=>item.timelineStartFrame));
  return Math.max(-minStart,Math.round(deltaFrames));
};

export const groupNudgeTargets=(items:TimelineItem[],deltaFrames:number):Map<string,number>=>{
  const delta=clampGroupMoveDelta(items,deltaFrames);
  return new Map(items.map((item)=>[item.id,item.timelineStartFrame+delta]));
};
