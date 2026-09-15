import {useCurrentFrame,useRemotionEnvironment} from "remotion";
import {seek as seekStudio} from "@remotion/studio";
import {createPortal} from "react-dom";
import {useCallback,useEffect,useState} from "react";
import type {FC} from "react";
import {editorActions} from "./editorActions";
import {canSplitAudioAtFrame,createAudioSplitId,selectedAudioForSplit} from "./audioSplitCommand";
import {useStudioEditor} from "./StudioEditorContext";
import {Timeline} from "./timeline/Timeline";
import {Inspector} from "./inspector/Inspector";
import {AudioAssetPanel} from "./audio/AudioAssetPanel";
import {SubtitleGeneratorPanel} from "./subtitles/SubtitleGeneratorPanel";
import {OverlayGeneratorPanel} from "./overlays/OverlayGeneratorPanel";

const studioHostDocument=():Document|null=>{
  if(typeof window==="undefined")return null;
  try{
    if(window.parent!==window&&window.parent.document?.body)return window.parent.document;
  }catch{
    // Cross-origin Studio hosts cannot be portaled into; fall back to this document.
  }
  return window.document;
};

const isEditableKeyboardTarget=(target:EventTarget|null):boolean=>{
  const element=target as HTMLElement|null;
  const tagName=element?.tagName?.toLowerCase();
  return tagName==="input"||tagName==="textarea"||tagName==="select"||element?.isContentEditable===true;
};

export const StudioEditor:FC=()=>{
  const frame=useCurrentFrame();
  const {isStudio,isReadOnlyStudio}=useRemotionEnvironment();
  const {state,dispatch,persistence,saveProject,reloadProject,canUndo,canRedo}=useStudioEditor();
  const [assetPanelsVisible,setAssetPanelsVisible]=useState(false);
  const selectedAudio=selectedAudioForSplit(state);
  const canSplitAudio=canSplitAudioAtFrame(selectedAudio,state.playheadFrame);
  const splitSelectedAudio=useCallback(()=>{
    const item=selectedAudioForSplit(state);
    if(item===null||!canSplitAudioAtFrame(item,state.playheadFrame))return;
    dispatch(editorActions.splitAudioItem(item.id,state.playheadFrame,createAudioSplitId(state)));
  },[dispatch,state]);
  useEffect(()=>{
    if(!isStudio||isReadOnlyStudio||state.playheadFrame===frame)return;
    dispatch(editorActions.setPlayhead(frame));
  },[dispatch,frame,isReadOnlyStudio,isStudio,state.playheadFrame]);
  useEffect(()=>{
    if(!isStudio||isReadOnlyStudio)return;
    const host=studioHostDocument();
    if(host===null)return;
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.key.toLowerCase()!=="s"||isEditableKeyboardTarget(event.target))return;
      if(!canSplitAudio)return;
      event.preventDefault();
      splitSelectedAudio();
    };
    host.addEventListener("keydown",onKeyDown);
    return()=>host.removeEventListener("keydown",onKeyDown);
  },[canSplitAudio,isReadOnlyStudio,isStudio,splitSelectedAudio]);
  if(!isStudio||isReadOnlyStudio)return null;
  const host=studioHostDocument();
  if(host===null)return null;
  const seek=(next:number)=>{
    const lastFrame=Math.max(0,state.project.project.durationInFrames-1);
    const target=Math.max(0,Math.min(lastFrame,Math.round(next)));
    seekStudio(target);
    dispatch(editorActions.setPlayhead(target));
  };
  const zoom=(factor:number)=>dispatch(editorActions.setTimelineZoom(state.project.settings.timelineZoom*factor));
  const panel=<div data-vpf-generic-editor="true" style={{position:"fixed",left:0,right:0,bottom:0,zIndex:2147483647,maxHeight:"42vh",background:"rgba(12,14,17,.98)",borderTop:"2px solid rgba(255,255,255,.2)",boxShadow:"0 -10px 30px rgba(0,0,0,.45)",color:"white",fontFamily:"sans-serif",fontSize:12,overflow:"hidden"}}>
    <div style={{minWidth:0}}>
      <div style={{display:"flex",gap:6,padding:6,alignItems:"center"}}>
        <strong>Generic Editor</strong>
        <button disabled={!canUndo} onClick={()=>dispatch(editorActions.undo())}>Undo</button>
        <button disabled={!canRedo} onClick={()=>dispatch(editorActions.redo())}>Redo</button>
        <button onClick={()=>void saveProject()}>Save</button>
        <button onClick={()=>void reloadProject()}>Reload</button>
        <button aria-expanded={assetPanelsVisible} onClick={()=>setAssetPanelsVisible(visible=>!visible)}>{assetPanelsVisible?"Hide panels":"Show panels"}</button>
        <span>{state.dirty?"modified":"saved"}</span>
        <span>{persistence.error??""}</span>
        <span style={{marginLeft:"auto"}}>render F{frame} · editor F{state.playheadFrame}</span>
      </div>
      <Inspector/>
      {assetPanelsVisible?<div data-editor-asset-panels="true" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",maxHeight:100,overflow:"auto"}}><AudioAssetPanel/><SubtitleGeneratorPanel/><OverlayGeneratorPanel/></div>:null}
      <Timeline currentFrame={state.playheadFrame} onSeek={seek} onZoomByFactor={zoom} canSplitAudio={canSplitAudio} onSplitAudio={splitSelectedAudio}/>
    </div>
  </div>;
  return createPortal(panel,host.body);
};
