import type {VideoTimelineItem} from "./editorTypes";

export const videoSourceOutFrame=(item:VideoTimelineItem):number=>item.sourceStartFrame+item.sourceDurationInFrames;
export const videoSourceUsePercent=(item:VideoTimelineItem):number=>item.sourceAssetDurationInFrames<=0?0:(item.sourceDurationInFrames/item.sourceAssetDurationInFrames)*100;
export const videoCanonicalWindow=(item:VideoTimelineItem):{start:number;duration:number;end:number}=>{
  const start=item.canonicalSourceStartFrame??item.sourceStartFrame;
  const duration=item.canonicalSourceDurationInFrames??item.sourceDurationInFrames;
  return{start,duration,end:start+duration};
};
export const videoSourceProvenanceLabel=(item:VideoTimelineItem):string=>{
  const match=item.id.match(/^visual-(.+)-r(\d+)$/);
  return match?`Canonical binding ${match[1]} r${match[2]}`:"Editor/imported media";
};
