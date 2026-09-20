import {AbsoluteFill,Easing,Img,Sequence,interpolate,useCurrentFrame} from "remotion";
import type {FC} from "react";
import type {AudioTimelineItem,EditProject,ImageTimelineItem,TimelineItem} from "../studio/editor/editorTypes";
import {bgmDuckingRanges} from "../studio/editor/audioDucking";
import {AudioItemRenderer} from "./AudioItemRenderer";
import {GraphicItemRenderer} from "./GraphicItemRenderer";
import {resolveEditorMediaSrc} from "./mediaSource";
import {TextItemRenderer} from "./TextItemRenderer";
import {VideoItemRenderer} from "./VideoItemRenderer";

const isAudioItem=(item:TimelineItem):item is AudioTimelineItem=>item.type==="TTS"||item.type==="CLIP_AUDIO"||item.type==="BGM"||item.type==="SFX";
export const ImageItemRenderer:FC<{item:ImageTimelineItem}>=({item})=>{
  const frame=useCurrentFrame();const motion=item.motion;const endFrame=Math.max(1,item.durationInFrames-1);const easing=motion?.easing==="LINEAR"?Easing.linear:Easing.inOut(Easing.ease);
  const motionValue=(from:number,to:number)=>interpolate(frame,[0,endFrame],[from,to],{extrapolateLeft:"clamp",extrapolateRight:"clamp",easing});
  const x=motion?motionValue(motion.from.x,motion.to.x):item.x;const y=motion?motionValue(motion.from.y,motion.to.y):item.y;const scale=motion?motionValue(motion.from.scale,motion.to.scale):item.scale;const rotation=motion?motionValue(motion.from.rotation,motion.to.rotation):item.rotation;const opacity=motion?motionValue(motion.from.opacity,motion.to.opacity):item.opacity;
  return <AbsoluteFill style={{overflow:"hidden"}}><Img src={resolveEditorMediaSrc(item.src)} style={{width:"100%",height:"100%",objectFit:item.fit,opacity,transform:`translate(${x}px, ${y}px) scale(${scale}) rotate(${rotation}deg)`,transformOrigin:"center center"}}/></AbsoluteFill>;
};
const ItemRenderer:FC<{item:TimelineItem;masterVolume:number;clipAudioMasterVolume:number;trackMuted:boolean;project:EditProject;muted:boolean}>=({item,masterVolume,clipAudioMasterVolume,trackMuted,project,muted})=>{
  if(item.type==="VIDEO")return <VideoItemRenderer item={item} masterVolume={masterVolume} muted={muted}/>;
  if(item.type==="IMAGE")return <ImageItemRenderer item={item}/>;
  if(isAudioItem(item)){const duckingRanges=item.type==="BGM"?bgmDuckingRanges(project,item):[];const trackVolume=item.trackId==="A2"?clipAudioMasterVolume:1;return <AudioItemRenderer item={trackMuted||muted?{...item,muted:true}:item} masterVolume={masterVolume*trackVolume} duckingRanges={duckingRanges}/>;}
  if(item.type==="SUBTITLE"||item.type==="TEXT")return <TextItemRenderer item={item}/>;
  return <GraphicItemRenderer item={item}/>;
};
export const ProjectRenderer:FC<{project:EditProject;muted?:boolean}>=({project,muted=false})=>{
  const trackMap=new Map(project.tracks.map((track)=>[track.id,track]));
  const audioSoloActive=project.tracks.some((track)=>track.type==="AUDIO"&&track.enabled&&track.solo===true);
  const videoItems=project.items.filter((item)=>item.type==="VIDEO"&&item.trackId==="V1");
  const entries=project.items.map((original,index)=>{let item=original;if(original.type==="VIDEO"&&original.trackId==="V1"&&original.transitionInFrames===undefined){const overlap=Math.max(0,...videoItems.filter((candidate)=>candidate.id!==original.id&&candidate.timelineStartFrame<original.timelineStartFrame&&candidate.timelineStartFrame+candidate.durationInFrames>original.timelineStartFrame).map((candidate)=>candidate.timelineStartFrame+candidate.durationInFrames-original.timelineStartFrame));const dissolve=Math.min(10,overlap);if(dissolve>0)item={...original,transitionInFrames:dissolve};else{const touching=videoItems.some((candidate)=>candidate.id!==original.id&&candidate.timelineStartFrame+candidate.durationInFrames===original.timelineStartFrame);if(touching){const frames=Math.min(10,original.durationInFrames-1);item={...original,timelineStartFrame:original.timelineStartFrame-frames,durationInFrames:original.durationInFrames,transitionInFrames:frames};}}}return{item,index,track:trackMap.get(item.trackId)};}).filter((entry)=>entry.item.enabled&&entry.track?.enabled===true).sort((a,b)=>{
    const trackOrder=(a.track?.order??0)-(b.track?.order??0);
    if(trackOrder!==0)return trackOrder;
    // V1 overlap behaves like an editorial overwrite: the clip placed later
    // on the timeline is rendered above the earlier clip.
    if(a.item.trackId==="V1"&&a.item.type==="VIDEO"&&b.item.trackId==="V1"&&b.item.type==="VIDEO"){
      const timelineOrder=a.item.timelineStartFrame-b.item.timelineStartFrame;
      if(timelineOrder!==0)return timelineOrder;
    }
    return (a.item.zIndex??0)-(b.item.zIndex??0)||a.index-b.index;
  });
  return <AbsoluteFill style={{backgroundColor:"black",overflow:"hidden"}}>{entries.map(({item,track})=>{const trackMuted=track?.type==="AUDIO"&&(track.muted===true||(audioSoloActive&&track.solo!==true));return <Sequence key={item.id} from={item.timelineStartFrame} durationInFrames={item.durationInFrames} name={`${item.trackId} · ${item.type} · ${item.id}`} premountFor={item.type==="VIDEO"?30:0}><ItemRenderer item={item} masterVolume={project.settings.masterVolume} clipAudioMasterVolume={project.settings.clipAudioMasterVolume??1} trackMuted={trackMuted} project={project} muted={muted}/></Sequence>;})}</AbsoluteFill>;
};
