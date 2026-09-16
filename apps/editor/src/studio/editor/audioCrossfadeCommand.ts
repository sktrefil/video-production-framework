import type {AudioTimelineItem,EditorState} from "./editorTypes";

const isAudio=(item:{type:string}):item is AudioTimelineItem=>["TTS","CLIP_AUDIO","BGM","SFX"].includes(item.type);

export const AUDIO_CROSSFADE_CURVE="linear" as const;

export const audioOverlapFrames=(first:AudioTimelineItem,second:AudioTimelineItem)=>{
  const start=Math.max(first.timelineStartFrame,second.timelineStartFrame);
  const end=Math.min(first.timelineStartFrame+first.durationInFrames,second.timelineStartFrame+second.durationInFrames);
  return Math.max(0,end-start);
};

export const clampAudioCrossfadeFrames=(value:number,overlapFrames:number)=>{
  const overlap=Math.max(0,Math.round(Number.isFinite(overlapFrames)?overlapFrames:0));
  const frames=Math.round(Number.isFinite(value)?value:0);
  return Math.min(overlap,Math.max(0,frames));
};

export const nextAudioForCrossfade=(state:EditorState,item:AudioTimelineItem):AudioTimelineItem|null=>{
  const track=state.project.tracks.find((candidate)=>candidate.id===item.trackId);
  if(item.locked||track?.locked===true)return null;
  const candidates=state.project.items.filter((candidate):candidate is AudioTimelineItem=>isAudio(candidate)&&candidate.id!==item.id&&candidate.trackId===item.trackId&&!candidate.locked&&candidate.timelineStartFrame>=item.timelineStartFrame).sort((a,b)=>a.timelineStartFrame-b.timelineStartFrame||a.id.localeCompare(b.id));
  return candidates.find((candidate)=>audioOverlapFrames(item,candidate)>0)??null;
};

export const currentAudioCrossfadeFrames=(first:AudioTimelineItem,second:AudioTimelineItem)=>clampAudioCrossfadeFrames(Math.min(first.fadeOutFrames,second.fadeInFrames),audioOverlapFrames(first,second));
