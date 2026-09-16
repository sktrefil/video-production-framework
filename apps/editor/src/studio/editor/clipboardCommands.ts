import type {EditProject,TimelineItem} from "./editorTypes";

export type EditorClipboard={anchorFrame:number;items:TimelineItem[]};
export const DUPLICATE_OFFSET_FRAMES=1;

export const captureEditorClipboard=(project:EditProject,selectedItemIds:string[]):EditorClipboard|null=>{
  const items=project.items.filter((item)=>selectedItemIds.includes(item.id));
  if(items.length===0)return null;
  const anchorFrame=Math.min(...items.map((item)=>item.timelineStartFrame));
  return{anchorFrame,items:items.map((item)=>({...item}))};
};

export const buildPasteItems=(project:EditProject,clipboard:EditorClipboard,targetFrame:number,idFactory:(item:TimelineItem,index:number)=>string):TimelineItem[]=>{
  const tracks=new Map(project.tracks.map((track)=>[track.id,track]));
  const frame=Math.max(0,Math.round(targetFrame));
  return clipboard.items.flatMap((item,index)=>{
    const track=tracks.get(item.trackId);
    if(!track||track.locked)return[];
    const timelineStartFrame=Math.max(0,frame+(item.timelineStartFrame-clipboard.anchorFrame));
    return[{...item,id:idFactory(item,index),timelineStartFrame} as TimelineItem];
  });
};

export const buildDuplicateItems=(project:EditProject,selectedItemIds:string[],idFactory:(item:TimelineItem,index:number)=>string,offsetFrames=DUPLICATE_OFFSET_FRAMES):TimelineItem[]=>{
  const clipboard=captureEditorClipboard(project,selectedItemIds);
  if(!clipboard)return[];
  return buildPasteItems(project,clipboard,clipboard.anchorFrame+Math.max(1,Math.round(offsetFrames)),idFactory);
};
