import {useRef,useState} from "react";
import type {FC,PointerEvent as ReactPointerEvent} from "react";
import {useRemotionEnvironment} from "remotion";
import {editorActions} from "../editorActions";
import {selectPrimaryItem} from "../editorSelectors";
import type {TimelineItem} from "../editorTypes";
import {useStudioEditor} from "../StudioEditorContext";
import {canvasItemRect,safeAreaGuideFrames,snapCanvasValue} from "../canvasDirectEdit";
import {normalizeTransformValue} from "../transformControls";

type Mode="move"|"resize"|"rotate";
type Interaction={mode:Mode;pointerId:number;clientX:number;clientY:number;item:TimelineItem};
const editable=(item:TimelineItem)=>item.type==="VIDEO"||item.type==="IMAGE"||item.type==="SUBTITLE"||item.type==="TEXT"||item.type==="GRAPHIC";

export const StudioCanvasDirectOverlay:FC=()=>{
  const {isStudio,isReadOnlyStudio}=useRemotionEnvironment();
  const {state,dispatch}=useStudioEditor();
  const item=selectPrimaryItem(state);
  const overlayRef=useRef<HTMLDivElement|null>(null);
  const interaction=useRef<Interaction|null>(null);
  const [aspectLocked,setAspectLocked]=useState(true);
  if(!isStudio||isReadOnlyStudio||!item||!editable(item))return null;
  const track=state.project.tracks.find((candidate)=>candidate.id===item.trackId);
  const locked=item.locked||track?.locked===true;
  const rect=canvasItemRect(item,state.project.project);
  const guides=safeAreaGuideFrames(state.project.project);
  const scaleDelta=(event:ReactPointerEvent<HTMLDivElement>)=>{const bounds=overlayRef.current?.getBoundingClientRect();if(!bounds||bounds.width<=0||bounds.height<=0)return{x:0,y:0};return{x:(event.clientX-(interaction.current?.clientX??event.clientX))*state.project.project.width/bounds.width,y:(event.clientY-(interaction.current?.clientY??event.clientY))*state.project.project.height/bounds.height};};
  const begin=(mode:Mode,event:ReactPointerEvent<HTMLElement>)=>{if(locked)return;event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);interaction.current={mode,pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,item};dispatch(editorActions.beginEditTransaction());};
  const move=(event:ReactPointerEvent<HTMLDivElement>)=>{const active=interaction.current;if(!active||active.pointerId!==event.pointerId)return;const delta=scaleDelta(event);const source=active.item;
    if(active.mode==="move"){
      if(source.type==="VIDEO"||source.type==="IMAGE"){dispatch(editorActions.updateTransform(source.id,{x:snapCanvasValue(source.x+delta.x,[0]),y:snapCanvasValue(source.y+delta.y,[0])}));return;}
      if(source.type==="SUBTITLE"){dispatch(editorActions.updateSubtitleStyle(source.id,{x:snapCanvasValue(source.x+delta.x,[guides.centerX]),y:snapCanvasValue(source.y+delta.y,[guides.top,guides.centerY,guides.bottom])}));return;}
      if(source.type==="TEXT"){dispatch(editorActions.updateTextStyle(source.id,{x:snapCanvasValue(source.x+delta.x,[guides.centerX]),y:snapCanvasValue(source.y+delta.y,[guides.top,guides.centerY,guides.bottom])}));return;}
      if(source.type==="GRAPHIC"){dispatch(editorActions.updateGraphicStyle(source.id,{x:snapCanvasValue(source.x+delta.x,[guides.centerX-source.width/2]),y:snapCanvasValue(source.y+delta.y,[guides.top,guides.centerY-source.height/2,guides.bottom])}));return;}
    }
    if(active.mode==="resize"){
      if(source.type==="VIDEO"||source.type==="IMAGE"){const startRect=canvasItemRect(source,state.project.project);const ratio=Math.max(.01,(startRect.width+delta.x)/Math.max(1,startRect.width));dispatch(editorActions.updateTransform(source.id,{scale:normalizeTransformValue("scale",source.scale*ratio)}));return;}
      if(source.type==="SUBTITLE"){dispatch(editorActions.updateSubtitleStyle(source.id,{width:Math.max(40,source.width+delta.x)}));return;}
      if(source.type==="TEXT"){dispatch(editorActions.updateTextStyle(source.id,{width:Math.max(40,source.width+delta.x)}));return;}
      if(source.type==="GRAPHIC"){const width=Math.max(10,source.width+delta.x);const height=aspectLocked?Math.max(10,width*(source.height/Math.max(1,source.width))):Math.max(10,source.height+delta.y);dispatch(editorActions.updateGraphicStyle(source.id,{width,height}));return;}
    }
    if(active.mode==="rotate"&&(source.type==="VIDEO"||source.type==="IMAGE")){dispatch(editorActions.updateTransform(source.id,{rotation:normalizeTransformValue("rotation",source.rotation+delta.x*.5)}));}
  };
  const end=(event:ReactPointerEvent<HTMLDivElement>)=>{if(interaction.current?.pointerId!==event.pointerId)return;interaction.current=null;dispatch(editorActions.endEditTransaction());};
  const canRotate=item.type==="VIDEO"||item.type==="IMAGE";
  return <div ref={overlayRef} data-editor-canvas-direct-overlay style={{position:"absolute",inset:0,zIndex:1000,pointerEvents:"auto",touchAction:"none"}} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
    <div data-editor-safe-guide="top" style={{position:"absolute",left:0,right:0,top:guides.top,borderTop:"1px dashed rgba(255,210,80,.7)",pointerEvents:"none"}}/>
    <div data-editor-safe-guide="bottom" style={{position:"absolute",left:0,right:0,top:guides.bottom,borderTop:"1px dashed rgba(255,210,80,.7)",pointerEvents:"none"}}/>
    <div data-editor-center-guide="x" style={{position:"absolute",top:0,bottom:0,left:guides.centerX,borderLeft:"1px dashed rgba(100,220,255,.35)",pointerEvents:"none"}}/>
    <div data-editor-center-guide="y" style={{position:"absolute",left:0,right:0,top:guides.centerY,borderTop:"1px dashed rgba(100,220,255,.35)",pointerEvents:"none"}}/>
    <div data-editor-canvas-selection={item.type} onPointerDown={(event)=>begin("move",event)} style={{position:"absolute",left:rect.left,top:rect.top,width:Math.max(10,rect.width),height:Math.max(10,rect.height),boxSizing:"border-box",border:"2px dashed #fff4bd",cursor:locked?"not-allowed":"move",pointerEvents:"auto"}}>
      <span data-editor-canvas-resize-handle onPointerDown={(event)=>begin("resize",event)} style={{position:"absolute",right:-7,bottom:-7,width:14,height:14,borderRadius:3,background:"#fff",border:"2px solid #222",cursor:"nwse-resize"}}/>
      {canRotate?<span data-editor-canvas-rotate-handle onPointerDown={(event)=>begin("rotate",event)} style={{position:"absolute",left:"50%",top:-28,width:12,height:12,marginLeft:-6,borderRadius:"50%",background:"#ffd65a",border:"2px solid #222",cursor:"grab"}}/>:null}
      <label data-editor-canvas-aspect-lock style={{position:"absolute",left:2,top:2,padding:"2px 4px",fontSize:10,background:"rgba(0,0,0,.7)",color:"white",pointerEvents:"auto"}} onPointerDown={(event)=>event.stopPropagation()}><input type="checkbox" checked={aspectLocked} onChange={(event)=>setAspectLocked(event.currentTarget.checked)}/> aspect</label>
    </div>
  </div>;
};
