import type {VideoTimelineItem} from "./editorTypes";

export const MIN_VIDEO_PLAYBACK_RATE=.0625;
export const MAX_VIDEO_PLAYBACK_RATE=16;

export const maxPlaybackRateForVideo=(item:VideoTimelineItem)=>{
  if(item.loop===true)return MAX_VIDEO_PLAYBACK_RATE;
  const sourcePerTimelineFrame=item.sourceDurationInFrames/Math.max(1,item.durationInFrames);
  return Math.max(MIN_VIDEO_PLAYBACK_RATE,Math.min(MAX_VIDEO_PLAYBACK_RATE,sourcePerTimelineFrame));
};

export const clampVideoPlaybackRate=(value:number,item:VideoTimelineItem)=>{
  const finite=Number.isFinite(value)?value:1;
  return Math.min(maxPlaybackRateForVideo(item),Math.max(MIN_VIDEO_PLAYBACK_RATE,finite));
};

export const playbackDurationPolicyLabel=(item:VideoTimelineItem)=>`Timeline fixed · source window unchanged · ${item.sourceUsagePolicy??"QC_TRIM"}`;
