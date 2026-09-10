import {AbsoluteFill,Easing,Img,Sequence,interpolate,useCurrentFrame} from "remotion";
import type {FC} from "react";
import type {AudioTimelineItem,EditProject,ImageTimelineItem,TimelineItem} from "../studio/editor/editorTypes";
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
const ItemRenderer:FC<{item:TimelineItem;masterVolume:number}>=({item,masterVolume})=>{
  if(item.type==="VIDEO")return <VideoItemRenderer item={item} masterVolume={masterVolume}/>;
  if(item.type==="IMAGE")return <ImageItemRenderer item={item}/>;
  if(isAudioItem(item))return <AudioItemRenderer item={item} masterVolume={masterVolume}/>;
  if(item.type==="SUBTITLE"||item.type==="TEXT")return <TextItemRenderer item={item}/>;
  return <GraphicItemRenderer item={item}/>;
};
export const ProjectRenderer:FC<{project:EditProject}>=({project})=>{
  const trackMap=new Map(project.tracks.map((track)=>[track.id,track]));
  const entries=project.items.map((item,index)=>({item,index,track:trackMap.get(item.trackId)})).filter((entry)=>entry.item.enabled&&entry.track?.enabled===true).sort((a,b)=>(a.track?.order??0)-(b.track?.order??0)||(a.item.zIndex??0)-(b.item.zIndex??0)||a.index-b.index);
  return <AbsoluteFill style={{backgroundColor:"black",overflow:"hidden"}}>{entries.map(({item})=><Sequence key={item.id} from={item.timelineStartFrame} durationInFrames={item.durationInFrames} name={`${item.trackId} · ${item.type} · ${item.id}`} layout="none"><ItemRenderer item={item} masterVolume={project.settings.masterVolume}/></Sequence>)}</AbsoluteFill>;
};
