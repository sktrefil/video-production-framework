import {useCurrentFrame,useRemotionEnvironment} from "remotion";
import type {FC} from "react";
import {editorActions} from "./editorActions";
import {useStudioEditor} from "./StudioEditorContext";
import {Timeline} from "./timeline/Timeline";
import {Inspector} from "./inspector/Inspector";
import {AudioAssetPanel} from "./audio/AudioAssetPanel";
import {SubtitleGeneratorPanel} from "./subtitles/SubtitleGeneratorPanel";
import {OverlayGeneratorPanel} from "./overlays/OverlayGeneratorPanel";

export const StudioEditor:FC=()=>{const frame=useCurrentFrame();const {isStudio,isReadOnlyStudio}=useRemotionEnvironment();const {state,dispatch,persistence,saveProject,reloadProject,canUndo,canRedo}=useStudioEditor();if(!isStudio||isReadOnlyStudio)return null;const seek=(next:number)=>dispatch(editorActions.setPlayhead(next));const zoom=(factor:number)=>dispatch(editorActions.setTimelineZoom(state.project.settings.timelineZoom*factor));return <div data-vpf-generic-editor="true" style={{position:"absolute",left:0,right:0,bottom:0,zIndex:1000,maxHeight:"48%",display:"grid",gridTemplateColumns:"1fr 240px",background:"rgba(12,14,17,.96)",borderTop:"2px solid rgba(255,255,255,.2)",color:"white",fontFamily:"sans-serif",fontSize:12}}><div style={{minWidth:0}}><div style={{display:"flex",gap:6,padding:6,alignItems:"center"}}><strong>Generic Editor</strong><button disabled={!canUndo} onClick={()=>dispatch(editorActions.undo())}>Undo</button><button disabled={!canRedo} onClick={()=>dispatch(editorActions.redo())}>Redo</button><button onClick={()=>void saveProject()}>Save</button><button onClick={()=>void reloadProject()}>Reload</button><span>{state.dirty?"modified":"saved"}</span><span>{persistence.error??""}</span><span style={{marginLeft:"auto"}}>render F{frame} · editor F{state.playheadFrame}</span></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",maxHeight:100,overflow:"auto"}}><AudioAssetPanel/><SubtitleGeneratorPanel/><OverlayGeneratorPanel/></div><Timeline currentFrame={state.playheadFrame} onSeek={seek} onZoomByFactor={zoom}/></div><Inspector/></div>;};
