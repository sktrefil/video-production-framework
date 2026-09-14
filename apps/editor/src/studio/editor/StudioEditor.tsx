import {useCurrentFrame,useRemotionEnvironment} from "remotion";
import {createPortal} from "react-dom";
import type {FC} from "react";
import {editorActions} from "./editorActions";
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

export const StudioEditor:FC=()=>{
  const frame=useCurrentFrame();
  const {isStudio,isReadOnlyStudio}=useRemotionEnvironment();
  const {state,dispatch,persistence,saveProject,reloadProject,canUndo,canRedo}=useStudioEditor();
  if(!isStudio||isReadOnlyStudio)return null;
  const host=studioHostDocument();
  if(host===null)return null;
  const seek=(next:number)=>dispatch(editorActions.setPlayhead(next));
  const zoom=(factor:number)=>dispatch(editorActions.setTimelineZoom(state.project.settings.timelineZoom*factor));
  const panel=<div data-vpf-generic-editor="true" style={{position:"fixed",left:0,right:0,bottom:0,zIndex:2147483647,maxHeight:"42vh",display:"grid",gridTemplateColumns:"1fr 280px",background:"rgba(12,14,17,.98)",borderTop:"2px solid rgba(255,255,255,.2)",boxShadow:"0 -10px 30px rgba(0,0,0,.45)",color:"white",fontFamily:"sans-serif",fontSize:12,overflow:"hidden"}}><div style={{minWidth:0}}><div style={{display:"flex",gap:6,padding:6,alignItems:"center"}}><strong>Generic Editor</strong><button disabled={!canUndo} onClick={()=>dispatch(editorActions.undo())}>Undo</button><button disabled={!canRedo} onClick={()=>dispatch(editorActions.redo())}>Redo</button><button onClick={()=>void saveProject()}>Save</button><button onClick={()=>void reloadProject()}>Reload</button><span>{state.dirty?"modified":"saved"}</span><span>{persistence.error??""}</span><span style={{marginLeft:"auto"}}>render F{frame} · editor F{state.playheadFrame}</span></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",maxHeight:100,overflow:"auto"}}><AudioAssetPanel/><SubtitleGeneratorPanel/><OverlayGeneratorPanel/></div><Timeline currentFrame={state.playheadFrame} onSeek={seek} onZoomByFactor={zoom}/></div><Inspector/></div>;
  return createPortal(panel,host.body);
};
