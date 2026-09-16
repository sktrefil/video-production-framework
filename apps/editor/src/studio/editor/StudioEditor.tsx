import {useCurrentFrame,useRemotionEnvironment} from "remotion";
import {seek as seekStudio,toggle as toggleStudio} from "@remotion/studio";
import {createPortal} from "react-dom";
import {useCallback,useEffect,useRef,useState} from "react";
import type {FC,PointerEvent as ReactPointerEvent} from "react";
import {editorActions} from "./editorActions";
import {canSplitAudioAtFrame,createAudioSplitId,selectedAudioForSplit} from "./audioSplitCommand";
import {canSplitVideoAtFrame,createVideoSplitId,selectedVideoForSplit} from "./videoSplitCommand";
import {useStudioEditor} from "./StudioEditorContext";
import {Timeline} from "./timeline/Timeline";
import {Inspector} from "./inspector/Inspector";
import {AudioAssetPanel} from "./audio/AudioAssetPanel";
import {SubtitleGeneratorPanel} from "./subtitles/SubtitleGeneratorPanel";
import {OverlayGeneratorPanel} from "./overlays/OverlayGeneratorPanel";
import {ClipboardControls} from "./clipboard/ClipboardControls";

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
const isNotSplitShortcut=(event:KeyboardEvent):boolean=>event.key.toLowerCase()!=="s";
const clampPanelHeight=(height:number,viewportHeight:number)=>Math.round(Math.max(220,Math.min(height,Math.max(260,viewportHeight*.85))));

type PanelResize={pointerId:number;startY:number;startHeight:number};

export const StudioEditor:FC=()=>{
  const frame=useCurrentFrame();
  const {isStudio,isReadOnlyStudio}=useRemotionEnvironment();
  const {state,dispatch,persistence,saveProject,reloadProject,canUndo,canRedo}=useStudioEditor();
  const [assetPanelsVisible,setAssetPanelsVisible]=useState(false);
  const [panelHeight,setPanelHeight]=useState(440);
  const [panelCollapsed,setPanelCollapsed]=useState(false);
  const panelResize=useRef<PanelResize|null>(null);
  const selectedAudio=selectedAudioForSplit(state);
  const selectedVideo=selectedVideoForSplit(state);
  const canSplitAudio=canSplitAudioAtFrame(selectedAudio,state.playheadFrame);
  const canSplitVideo=canSplitVideoAtFrame(selectedVideo,state.playheadFrame);
  const seek=useCallback((next:number)=>{
    const lastFrame=Math.max(0,state.project.project.durationInFrames-1);
    const target=Math.max(0,Math.min(lastFrame,Math.round(next)));
    seekStudio(target);
    dispatch(editorActions.setPlayhead(target));
  },[dispatch,state.project.project.durationInFrames]);
  const splitSelectedAudio=useCallback(()=>{
    const item=selectedAudioForSplit(state);
    if(item===null||!canSplitAudioAtFrame(item,state.playheadFrame))return;
    dispatch(editorActions.splitAudioItem(item.id,state.playheadFrame,createAudioSplitId(state)));
  },[dispatch,state]);
  const splitSelectedVideo=useCallback(()=>{
    const item=selectedVideoForSplit(state);
    if(item===null||!canSplitVideoAtFrame(item,state.playheadFrame))return;
    dispatch(editorActions.splitVideoItem(item.id,state.playheadFrame,createVideoSplitId(state)));
  },[dispatch,state]);
  const deleteSelected=useCallback(()=>{
    if(state.selectedItemIds.length===0)return;
    dispatch(editorActions.beginEditTransaction());
    for(const itemId of state.selectedItemIds)dispatch(editorActions.deleteItem(itemId));
    dispatch(editorActions.endEditTransaction());
  },[dispatch,state.selectedItemIds]);
  useEffect(()=>{
    if(!isStudio||isReadOnlyStudio||state.playheadFrame===frame)return;
    dispatch(editorActions.setPlayhead(frame));
  },[dispatch,frame,isReadOnlyStudio,isStudio,state.playheadFrame]);
  useEffect(()=>{
    if(!isStudio||isReadOnlyStudio)return;
    const host=studioHostDocument();
    if(host===null)return;
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||isEditableKeyboardTarget(event.target))return;
      const key=event.key.toLowerCase();
      const commandModifier=event.ctrlKey||event.metaKey;
      if(commandModifier){
        if(event.altKey)return;
        if(key==="z"&&!event.shiftKey){event.preventDefault();dispatch(editorActions.undo());return;}
        if(key==="y"||(key==="z"&&event.shiftKey)){event.preventDefault();dispatch(editorActions.redo());return;}
        return;
      }
      if(event.altKey)return;
      if(event.repeat&&!(["arrowleft","arrowright"].includes(key)))return;
      if(key===" "||event.code==="Space"){event.preventDefault();toggleStudio();return;}
      if(key==="arrowleft"){event.preventDefault();seek(state.playheadFrame-(event.shiftKey?5:1));return;}
      if(key==="arrowright"){event.preventDefault();seek(state.playheadFrame+(event.shiftKey?5:1));return;}
      if(key==="home"){event.preventDefault();seek(0);return;}
      if(key==="end"){event.preventDefault();seek(state.project.project.durationInFrames-1);return;}
      if(key==="delete"){event.preventDefault();deleteSelected();return;}
      if(!isNotSplitShortcut(event)){
        if(!canSplitAudio&&!canSplitVideo)return;
        event.preventDefault();
        if(canSplitAudio)splitSelectedAudio();else splitSelectedVideo();
      }
    };
    host.addEventListener("keydown",onKeyDown);
    return()=>host.removeEventListener("keydown",onKeyDown);
  },[canSplitAudio,canSplitVideo,deleteSelected,dispatch,isReadOnlyStudio,isStudio,seek,splitSelectedAudio,splitSelectedVideo,state.playheadFrame,state.project.project.durationInFrames]);
  if(!isStudio||isReadOnlyStudio)return null;
  const host=studioHostDocument();
  if(host===null)return null;
  const zoom=(factor:number)=>dispatch(editorActions.setTimelineZoom(state.project.settings.timelineZoom*factor));
  const beginPanelResize=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(panelCollapsed)return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panelResize.current={pointerId:event.pointerId,startY:event.clientY,startHeight:panelHeight};
  };
  const movePanelResize=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const active=panelResize.current;
    if(active===null||active.pointerId!==event.pointerId)return;
    const viewportHeight=host.defaultView?.innerHeight??window.innerHeight;
    setPanelHeight(clampPanelHeight(active.startHeight+(active.startY-event.clientY),viewportHeight));
  };
  const endPanelResize=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(panelResize.current?.pointerId!==event.pointerId)return;
    panelResize.current=null;
  };
  const panel=<div data-vpf-generic-editor="true" data-editor-panel-collapsed={panelCollapsed?"true":"false"} style={{position:"fixed",left:0,right:0,bottom:0,zIndex:2147483647,height:panelCollapsed?"auto":panelHeight,maxHeight:"85vh",display:"flex",flexDirection:"column",background:"rgba(12,14,17,.98)",borderTop:"1px solid rgba(255,255,255,.22)",boxShadow:"0 -10px 30px rgba(0,0,0,.45)",color:"white",fontFamily:"sans-serif",fontSize:12,overflow:"hidden"}}>
    <div data-editor-panel-resizer="true" title="Drag to resize editor panel" onPointerDown={beginPanelResize} onPointerMove={movePanelResize} onPointerUp={endPanelResize} onPointerCancel={endPanelResize} style={{height:9,flex:"0 0 9px",cursor:panelCollapsed?"default":"ns-resize",display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(255,255,255,.04)",touchAction:"none"}}><div style={{width:54,height:3,borderRadius:3,background:"rgba(255,255,255,.42)"}}/></div>
    <div style={{display:"flex",gap:6,padding:"4px 6px 6px",alignItems:"center",flex:"0 0 auto"}}>
      <strong>Generic Editor</strong>
      <button data-editor-command="toggle-playback" onClick={()=>toggleStudio()} title="Play/Pause (Space)">Play/Pause</button>
      <button data-editor-command="step-back" onClick={()=>seek(state.playheadFrame-1)} title="Previous frame (Left)">-1f</button>
      <button data-editor-command="step-forward" onClick={()=>seek(state.playheadFrame+1)} title="Next frame (Right)">+1f</button>
      <button disabled={!canUndo} onClick={()=>dispatch(editorActions.undo())}>Undo</button>
      <button disabled={!canRedo} onClick={()=>dispatch(editorActions.redo())}>Redo</button>
      <ClipboardControls/>
      <button onClick={()=>void saveProject()}>Save</button>
      <button onClick={()=>void reloadProject()}>Reload</button>
      <button aria-expanded={!panelCollapsed} data-editor-command="toggle-panel-collapse" onClick={()=>setPanelCollapsed(value=>!value)}>{panelCollapsed?"Expand":"Minimize"}</button>
      {!panelCollapsed?<button aria-expanded={assetPanelsVisible} onClick={()=>setAssetPanelsVisible(visible=>!visible)}>{assetPanelsVisible?"Hide panels":"Show panels"}</button>:null}
      <span>{state.dirty?"modified":"saved"}</span>
      <span>{persistence.error??""}</span>
      <span style={{marginLeft:"auto"}}>render F{frame} · editor F{state.playheadFrame}</span>
    </div>
    {!panelCollapsed?<div data-editor-panel-content="true" style={{display:"flex",flexDirection:"column",minHeight:0,flex:"1 1 auto",overflow:"auto"}}>
      <Inspector/>
      {assetPanelsVisible?<div data-editor-asset-panels="true" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",maxHeight:100,overflow:"auto",flex:"0 0 auto"}}><AudioAssetPanel/><SubtitleGeneratorPanel/><OverlayGeneratorPanel/></div>:null}
      <Timeline currentFrame={state.playheadFrame} onSeek={seek} onZoomByFactor={zoom} canSplitAudio={canSplitAudio} onSplitAudio={splitSelectedAudio} canSplitVideo={canSplitVideo} onSplitVideo={splitSelectedVideo}/>
    </div>:null}
  </div>;
  return createPortal(panel,host.body);
};
