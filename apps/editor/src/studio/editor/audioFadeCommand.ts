import type {AudioTimelineItem} from "./editorTypes";

export type AudioFadeEdge="in"|"out";

export const clampAudioFadeFrames=(value:number,durationInFrames:number)=>{
  const duration=Math.max(0,Math.round(Number.isFinite(durationInFrames)?durationInFrames:0));
  const frames=Math.round(Number.isFinite(value)?value:0);
  return Math.min(duration,Math.max(0,frames));
};

export const audioFadeFramesFromDrag=(item:AudioTimelineItem,edge:AudioFadeEdge,deltaFrames:number)=>{
  const delta=Math.round(Number.isFinite(deltaFrames)?deltaFrames:0);
  const base=edge==="in"?item.fadeInFrames:item.fadeOutFrames;
  return clampAudioFadeFrames(base+(edge==="in"?delta:-delta),item.durationInFrames);
};
