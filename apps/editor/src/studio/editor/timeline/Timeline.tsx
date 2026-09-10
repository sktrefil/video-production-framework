import type {FC} from "react";
import {editorActions} from "../editorActions";
import {selectItemsForTrack} from "../editorSelectors";
import {useStudioEditor} from "../StudioEditorContext";

const color=(type:string)=>type==="VIDEO"?"#315f8f":type==="IMAGE"?"#547b51":["TTS","CLIP_AUDIO"].includes(type)?"#7a4e91":type==="BGM"?"#8b6a35":type==="SFX"?"#9b4f4a":type==="SUBTITLE"?"#336f73":type==="TEXT"?"#596f7c":"#6d6258";
export const Timeline:FC<{currentFrame:number;onSeek:(frame:number)=>void;onZoomByFactor:(factor:number)=>void}>=({currentFrame,onSeek,onZoomByFactor})=>{
  const {state,dispatch}=useStudioEditor();const zoom=Math.max(.05,state.project.settings.timelineZoom);const ppf=Math.max(.12,.45*zoom);const total=state.project.project.durationInFrames;
  return <div data-editor-timeline="true" style={{overflow:"auto",maxHeight:250,background:"#101215",borderTop:"1px solid #333",fontFamily:"sans-serif",fontSize:11,color:"white"}}>
    <div style={{position:"sticky",left:0,zIndex:20,display:"flex",gap:6,padding:6,background:"#17191c"}}><button onClick={()=>onZoomByFactor(1/1.2)}>-</button><span>zoom {zoom.toFixed(2)}×</span><button onClick={()=>onZoomByFactor(1.2)}>+</button><input aria-label="playhead" type="range" min={0} max={Math.max(0,total-1)} value={Math.min(currentFrame,total-1)} onChange={(e)=>onSeek(Number(e.currentTarget.value))} style={{flex:1}}/><span>F{currentFrame}</span></div>
    <div style={{minWidth:Math.max(900,total*ppf+150),position:"relative"}}>{state.project.tracks.slice().sort((a,b)=>a.order-b.order).map((track)=><div key={track.id} data-editor-track={track.id} style={{height:42,position:"relative",borderTop:"1px solid rgba(255,255,255,.08)"}}><div style={{position:"sticky",left:0,zIndex:10,width:130,height:42,display:"flex",alignItems:"center",paddingLeft:8,background:"#17191c"}}>{track.id} · {track.name}</div>{selectItemsForTrack(state,track.id).map((item)=><button key={item.id} data-editor-timeline-item={item.id} onClick={()=>dispatch(editorActions.selectItem([item.id]))} onDoubleClick={()=>onSeek(item.timelineStartFrame)} style={{position:"absolute",left:140+item.timelineStartFrame*ppf,top:5,width:Math.max(10,item.durationInFrames*ppf),height:32,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",border:state.selectedItemIds.includes(item.id)?"2px solid white":"1px solid #aaa",borderRadius:4,background:color(item.type),color:"white",cursor:"pointer"}}>{item.type} · {item.id}</button>)}</div>)}</div>
  </div>;
};
