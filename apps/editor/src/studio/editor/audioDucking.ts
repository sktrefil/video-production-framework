import type {AudioDuckingSettings,AudioTimelineItem,EditProject} from "./editorTypes";

export type DuckingRange={startFrame:number;endFrame:number};
export const DEFAULT_AUDIO_DUCKING:AudioDuckingSettings={enabled:false,duckVolume:.25,attackFrames:6,releaseFrames:10,minGapFrames:4};

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,Number.isFinite(value)?value:min));
export const normalizeAudioDucking=(settings?:Partial<AudioDuckingSettings>):AudioDuckingSettings=>({
  enabled:settings?.enabled??DEFAULT_AUDIO_DUCKING.enabled,
  duckVolume:clamp(settings?.duckVolume??DEFAULT_AUDIO_DUCKING.duckVolume,0,1),
  attackFrames:Math.max(0,Math.round(settings?.attackFrames??DEFAULT_AUDIO_DUCKING.attackFrames)),
  releaseFrames:Math.max(0,Math.round(settings?.releaseFrames??DEFAULT_AUDIO_DUCKING.releaseFrames)),
  minGapFrames:Math.max(0,Math.round(settings?.minGapFrames??DEFAULT_AUDIO_DUCKING.minGapFrames)),
});

export const mergeDuckingRanges=(ranges:DuckingRange[],minGapFrames:number):DuckingRange[]=>{
  const sorted=ranges.filter((range)=>range.endFrame>range.startFrame).map((range)=>({...range})).sort((a,b)=>a.startFrame-b.startFrame||a.endFrame-b.endFrame);
  if(sorted.length===0)return [];
  const merged:DuckingRange[]=[sorted[0]!];
  for(const range of sorted.slice(1)){const current=merged.at(-1)!;if(range.startFrame<=current.endFrame+Math.max(0,Math.round(minGapFrames))){current.endFrame=Math.max(current.endFrame,range.endFrame);}else merged.push({...range});}
  return merged;
};

export const ttsDuckingRanges=(project:EditProject,minGapFrames:number):DuckingRange[]=>{
  const enabledTracks=new Set(project.tracks.filter((track)=>track.enabled).map((track)=>track.id));
  return mergeDuckingRanges(project.items.filter((item):item is AudioTimelineItem=>item.type==="TTS"&&item.enabled&&!item.muted&&enabledTracks.has(item.trackId)).map((item)=>({startFrame:item.timelineStartFrame,endFrame:item.timelineStartFrame+item.durationInFrames})),minGapFrames);
};

export const bgmDuckingRanges=(project:EditProject,item:AudioTimelineItem):DuckingRange[]=>{
  if(item.type!=="BGM")return [];
  const settings=normalizeAudioDucking(item.ducking);
  if(!settings.enabled)return [];
  const itemStart=item.timelineStartFrame;const itemEnd=itemStart+item.durationInFrames;
  return ttsDuckingRanges(project,settings.minGapFrames).filter((range)=>range.endFrame+settings.releaseFrames>itemStart&&range.startFrame-settings.attackFrames<itemEnd).map((range)=>({startFrame:range.startFrame-itemStart,endFrame:range.endFrame-itemStart}));
};

export const duckingGainAtFrame=(frame:number,ranges:DuckingRange[],settingsInput?:Partial<AudioDuckingSettings>)=>{
  const settings=normalizeAudioDucking(settingsInput);
  if(!settings.enabled||ranges.length===0)return 1;
  let gain=1;
  for(const range of ranges){
    if(frame>=range.startFrame&&frame<range.endFrame)gain=Math.min(gain,settings.duckVolume);
    else if(settings.attackFrames>0&&frame>=range.startFrame-settings.attackFrames&&frame<range.startFrame){const progress=(frame-(range.startFrame-settings.attackFrames))/settings.attackFrames;gain=Math.min(gain,1-(1-settings.duckVolume)*progress);}
    else if(settings.releaseFrames>0&&frame>=range.endFrame&&frame<range.endFrame+settings.releaseFrames){const progress=(frame-range.endFrame)/settings.releaseFrames;gain=Math.min(gain,settings.duckVolume+(1-settings.duckVolume)*progress);}
  }
  return clamp(gain,0,1);
};
