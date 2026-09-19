import {resolveEditorMediaSrc} from "../../../editor/mediaSource";
import type {AudioTimelineItem} from "../editorTypes";

let activeAudition:HTMLAudioElement|null=null;

export const stopAudioAudition=()=>{
  activeAudition?.pause();
  activeAudition=null;
};

// Audition uses the browser's native media element. This intentionally avoids
// the composition audio pipeline so an editor can verify one source clip even
// when the timeline is paused or other tracks are muted/soloed.
export const auditionAudioClip=(item:AudioTimelineItem,fps:number,volume:number)=>{
  if(typeof window==="undefined"||typeof Audio==="undefined")return;
  stopAudioAudition();
  const audio=new Audio(resolveEditorMediaSrc(item.src));
  const start=Math.max(0,item.sourceStartFrame/Math.max(1,fps));
  const end=start+Math.max(1,item.sourceDurationInFrames)/Math.max(1,fps);
  audio.preload="auto";
  audio.volume=Math.min(1,Math.max(0,volume));
  const stopAtEnd=()=>{if(audio.currentTime>=end){audio.pause();activeAudition=null;}};
  audio.addEventListener("timeupdate",stopAtEnd);
  audio.addEventListener("ended",()=>{activeAudition=null;},{once:true});
  audio.addEventListener("loadedmetadata",()=>{
    audio.currentTime=Math.min(start,Math.max(0,audio.duration-.01));
    void audio.play().catch(()=>{activeAudition=null;});
  },{once:true});
  activeAudition=audio;
  audio.load();
};
