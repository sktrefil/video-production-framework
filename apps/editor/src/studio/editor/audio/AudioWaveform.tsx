import {useEffect,useMemo,useState} from "react";
import type {FC} from "react";
import {resolveEditorMediaSrc} from "../../../editor/mediaSource";
import type {AudioTimelineItem} from "../editorTypes";
import {loadWaveformPeaks,sampleWaveformWindow} from "./waveformPeaks";

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));

type Props={item:AudioTimelineItem;width:number};

export const AudioWaveform:FC<Props>=({item,width})=>{
  const [peaks,setPeaks]=useState<Float32Array|null>(null);
  const [failed,setFailed]=useState(false);
  const src=useMemo(()=>resolveEditorMediaSrc(item.src),[item.src]);
  useEffect(()=>{
    let cancelled=false;
    setPeaks(null);setFailed(false);
    void loadWaveformPeaks(src).then((result)=>{if(!cancelled)setPeaks(result.peaks);}).catch(()=>{if(!cancelled)setFailed(true);});
    return()=>{cancelled=true;};
  },[src]);
  const displayBins=clamp(Math.round(Math.max(1,width)/3),12,256);
  const visible=useMemo(()=>peaks===null?null:sampleWaveformWindow(peaks,item.sourceStartFrame,item.sourceDurationInFrames,item.sourceAssetDurationInFrames,displayBins),[displayBins,item.sourceAssetDurationInFrames,item.sourceDurationInFrames,item.sourceStartFrame,peaks]);
  if(visible===null||failed)return <svg data-editor-audio-waveform={failed?"unavailable":"loading"} aria-hidden="true" viewBox="0 0 100 20" preserveAspectRatio="none" style={{position:"absolute",left:8,right:8,top:3,bottom:3,width:"calc(100% - 16px)",height:"calc(100% - 6px)",pointerEvents:"none",opacity:.35}}><line x1="0" x2="100" y1="10" y2="10" stroke="currentColor" strokeWidth=".7"/></svg>;
  const barWidth=100/visible.length;
  return <svg data-editor-audio-waveform="ready" aria-hidden="true" viewBox="0 0 100 20" preserveAspectRatio="none" style={{position:"absolute",left:8,right:8,top:3,bottom:3,width:"calc(100% - 16px)",height:"calc(100% - 6px)",pointerEvents:"none",opacity:.42}}>{Array.from(visible,(peak,index)=>{const height=Math.max(.8,Math.min(19,peak*19));return <rect key={index} x={index*barWidth} y={10-height/2} width={Math.max(.18,barWidth*.55)} height={height} fill="currentColor"/>;})}</svg>;
};
