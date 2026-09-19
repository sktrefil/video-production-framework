import {useRef,useState} from "react";
import type {DragEvent,FC,PointerEvent as ReactPointerEvent} from "react";
import {editorActions} from "../editorActions";
import {isAudioTimelineItem} from "../audioSplitCommand";
import {audioFadeFramesFromDrag} from "../audioFadeCommand";
import {selectItemsForTrack} from "../editorSelectors";
import type {TimelineItem} from "../editorTypes";
import {useStudioEditor} from "../StudioEditorContext";
import {buildSnapTargets,resolveSnapDelta} from "../snapEngine";
import type {SnapTarget} from "../snapEngine";
import {AudioWaveform} from "../audio/AudioWaveform";
import {clampGroupMoveDelta,groupNudgeTargets,selectionAfterItemPointer} from "../multiSelect";

const TRACK_HEADER_WIDTH=220;
const color=(type:string)=>type==="VIDEO"?"#315f8f":type==="IMAGE"?"#547b51":["TTS","CLIP_AUDIO"].includes(type)?"#7a4e91":type==="BGM"?"#8b6a35":type==="SFX"?"#9b4f4a":type==="SUBTITLE"?"#336f73":type==="TEXT"?"#596f7c":"#6d6258";
type DragMode="move"|"trim-start"|"trim-end"|"fade-in"|"fade-out";
type Drag={item:TimelineItem;mode:DragMode;pointerId:number;startClientX:number;appliedFrames:number;selectedIds:string[];starts:Map<string,number>};
type Marquee={pointerId:number;startClientX:number;startClientY:number;clientX:number;clientY:number;additive:boolean};
type Box={left:number;top:number;width:number;height:number};

type TimelineProps={currentFrame:number;onSeek:(frame:number)=>void;onStartPlayback:()=>void;onZoomByFactor:(factor:number)=>void;canSplitAudio:boolean;onSplitAudio:()=>void;canSplitVideo:boolean;onSplitVideo:()=>void};

export const Timeline:FC<TimelineProps>=({currentFrame,onSeek,onStartPlayback,onZoomByFactor,canSplitAudio,onSplitAudio,canSplitVideo,onSplitVideo})=>{
  const {state,dispatch}=useStudioEditor();
  const zoom=Math.max(.05,state.project.settings.timelineZoom);
  const ppf=Math.max(.12,.45*zoom);
  const total=state.project.project.durationInFrames;
  const drag=useRef<Drag|null>(null);
  const marquee=useRef<Marquee|null>(null);
  const contentRef=useRef<HTMLDivElement|null>(null);
  const [marqueeBox,setMarqueeBox]=useState<Box|null>(null);
  const [snapGuide,setSnapGuide]=useState<SnapTarget|null>(null);
  const trackLocked=(trackId:string)=>state.project.tracks.find((track)=>track.id===trackId)?.locked===true;
  const editableSelected=()=>state.project.items.filter((candidate)=>state.selectedItemIds.includes(candidate.id)&&!candidate.locked&&!trackLocked(candidate.trackId));
  const beginDrag=(event:ReactPointerEvent<HTMLElement>,item:TimelineItem,mode:DragMode)=>{
    if(item.locked||trackLocked(item.trackId))return;
    event.preventDefault();event.stopPropagation();
    const additive=event.ctrlKey||event.metaKey||event.shiftKey;
    if(mode==="move"&&additive&&state.selectedItemIds.includes(item.id)){
      dispatch(editorActions.selectItem(state.selectedItemIds.filter((id)=>id!==item.id)));
      return;
    }
    const selectedIds=mode==="move"?selectionAfterItemPointer(state.selectedItemIds,item.id,additive):[item.id];
    dispatch(editorActions.selectItem(selectedIds));
    event.currentTarget.setPointerCapture(event.pointerId);
    const selectedItems=state.project.items.filter((candidate)=>selectedIds.includes(candidate.id)&&!candidate.locked&&!trackLocked(candidate.trackId));
    drag.current={item,mode,pointerId:event.pointerId,startClientX:event.clientX,appliedFrames:0,selectedIds:selectedItems.map((candidate)=>candidate.id),starts:new Map(selectedItems.map((candidate)=>[candidate.id,candidate.timelineStartFrame]))};
    setSnapGuide(null);
    dispatch(editorActions.beginEditTransaction());
  };
  const moveDrag=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const active=drag.current;if(!active||active.pointerId!==event.pointerId)return;
    const rawDesired=Math.round((event.clientX-active.startClientX)/ppf);
    if(active.mode==="fade-in"||active.mode==="fade-out"){
      if(!isAudioTimelineItem(active.item))return;
      const edge=active.mode==="fade-in"?"in":"out";
      const frames=audioFadeFramesFromDrag(active.item,edge,rawDesired);
      dispatch(editorActions.changeAudioFades(active.item.id,edge==="in"?{fadeInFrames:frames}:{fadeOutFrames:frames}));
      return;
    }
    if(active.mode==="move"&&active.selectedIds.length>1){
      const selected=state.project.items.filter((candidate)=>active.selectedIds.includes(candidate.id)).map((candidate)=>({...candidate,timelineStartFrame:active.starts.get(candidate.id)??candidate.timelineStartFrame}));
      const desired=clampGroupMoveDelta(selected,rawDesired);
      if(desired===active.appliedFrames)return;
      active.appliedFrames=desired;setSnapGuide(null);
      for(const id of active.selectedIds){const start=active.starts.get(id);if(start!==undefined)dispatch(editorActions.moveItem(id,start+desired));}
      return;
    }
    const snapped=resolveSnapDelta({item:active.item,mode:active.mode,rawDeltaFrames:rawDesired,targets:buildSnapTargets(state,active.item.id),toleranceFrames:state.project.settings.snapToleranceFrames,enabled:state.project.settings.snapEnabled,bypass:event.shiftKey});
    const desired=snapped.deltaFrames;setSnapGuide(snapped.target);if(desired===active.appliedFrames)return;
    const delta=desired-active.appliedFrames;active.appliedFrames=desired;
    if(active.mode==="move")dispatch(editorActions.moveItem(active.item.id,Math.max(0,active.item.timelineStartFrame+desired)));
    else if(active.mode==="trim-start")dispatch(editorActions.trimItemStart(active.item.id,delta));
    else dispatch(editorActions.trimItemEnd(active.item.id,delta));
  };
  const endDrag=(event:ReactPointerEvent<HTMLDivElement>)=>{if(drag.current?.pointerId!==event.pointerId)return;drag.current=null;setSnapGuide(null);dispatch(editorActions.endEditTransaction());};
  const beginMarquee=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(event.button!==0)return;
    const target=event.target as HTMLElement;
    if(target.closest("[data-editor-timeline-item]")||target.closest("[data-editor-track-header]"))return;
    event.currentTarget.setPointerCapture(event.pointerId);
    marquee.current={pointerId:event.pointerId,startClientX:event.clientX,startClientY:event.clientY,clientX:event.clientX,clientY:event.clientY,additive:event.ctrlKey||event.metaKey||event.shiftKey};
    setMarqueeBox({left:event.clientX-event.currentTarget.getBoundingClientRect().left,top:event.clientY-event.currentTarget.getBoundingClientRect().top,width:0,height:0});
  };
  const moveMarquee=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const active=marquee.current;const content=contentRef.current;if(!active||active.pointerId!==event.pointerId||!content)return;
    active.clientX=event.clientX;active.clientY=event.clientY;
    const bounds=content.getBoundingClientRect();
    setMarqueeBox({left:Math.min(active.startClientX,event.clientX)-bounds.left,top:Math.min(active.startClientY,event.clientY)-bounds.top,width:Math.abs(event.clientX-active.startClientX),height:Math.abs(event.clientY-active.startClientY)});
  };
  const endMarquee=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const active=marquee.current;const content=contentRef.current;if(!active||active.pointerId!==event.pointerId||!content)return;
    const left=Math.min(active.startClientX,event.clientX),right=Math.max(active.startClientX,event.clientX),top=Math.min(active.startClientY,event.clientY),bottom=Math.max(active.startClientY,event.clientY);
    const hits=Array.from(content.querySelectorAll<HTMLElement>("[data-editor-timeline-item]")).filter((element)=>{const rect=element.getBoundingClientRect();return rect.right>=left&&rect.left<=right&&rect.bottom>=top&&rect.top<=bottom;}).map((element)=>element.dataset.editorTimelineItem).filter((id):id is string=>Boolean(id));
    const ids=active.additive?[...new Set([...state.selectedItemIds,...hits])]:hits;
    dispatch(editorActions.selectItem(ids));marquee.current=null;setMarqueeBox(null);
  };
  const nudgeSelected=(delta:number)=>{const items=editableSelected();if(items.length===0)return;const targets=groupNudgeTargets(items,delta);dispatch(editorActions.beginEditTransaction());for(const item of items)dispatch(editorActions.moveItem(item.id,targets.get(item.id)??item.timelineStartFrame));dispatch(editorActions.endEditTransaction());};
  const deleteSelected=()=>{if(state.selectedItemIds.length===0)return;dispatch(editorActions.beginEditTransaction());for(const id of state.selectedItemIds)dispatch(editorActions.deleteItem(id));dispatch(editorActions.endEditTransaction());};
  const isTimelineDraggable=(item:TimelineItem)=>item.type==="VIDEO"||item.type==="IMAGE"||item.type==="SUBTITLE"||item.type==="TEXT"||item.type==="GRAPHIC"||item.type==="TTS"||item.type==="CLIP_AUDIO"||item.type==="BGM"||item.type==="SFX";
  const handleStyle=(side:"left"|"right")=>({position:"absolute" as const,[side]:0,top:0,bottom:0,width:8,cursor:"ew-resize",zIndex:4});
  const fadeHandleStyle=(left:number)=>({position:"absolute" as const,left:Math.max(0,left-4),top:1,width:8,height:12,cursor:"ew-resize",zIndex:6,borderRadius:4,background:"rgba(255,255,255,.95)",boxShadow:"0 0 0 1px rgba(0,0,0,.6)"});
  const allowAudioDrop=(event:DragEvent<HTMLDivElement>)=>{if(event.dataTransfer.types.includes("application/x-vpf-audio-item"))event.preventDefault();};
  const dropAudio=(event:DragEvent<HTMLDivElement>)=>{const sourceId=event.dataTransfer.getData("application/x-vpf-audio-item");const source=state.project.items.find((item)=>item.id===sourceId);const trackId=(event.target as HTMLElement).closest<HTMLElement>("[data-editor-track]")?.dataset.editorTrack;if(!source||(source.type!=="BGM"&&source.type!=="SFX")||!trackId)return;const track=state.project.tracks.find((candidate)=>candidate.id===trackId);if(track?.type!=="AUDIO"||track.locked)return;event.preventDefault();const bounds=event.currentTarget.getBoundingClientRect();const rawFrame=Math.max(0,Math.round((event.clientX-bounds.left+event.currentTarget.scrollLeft-TRACK_HEADER_WIDTH)/ppf));const snap=resolveSnapDelta({item:{...source,timelineStartFrame:rawFrame},mode:"trim-start",rawDeltaFrames:0,targets:buildSnapTargets(state),toleranceFrames:state.project.settings.snapToleranceFrames,enabled:state.project.settings.snapEnabled,bypass:event.shiftKey});const frame=Math.max(0,rawFrame+snap.deltaFrames);dispatch(editorActions.duplicateItem(source.id,`audio-${source.type.toLowerCase()}-${crypto.randomUUID()}`,frame,trackId));};
  return <div data-editor-timeline="true" onPointerMove={(event)=>{moveDrag(event);moveMarquee(event);}} onPointerUp={(event)=>{endDrag(event);endMarquee(event);}} onPointerCancel={(event)=>{endDrag(event);endMarquee(event);}} onDragOver={allowAudioDrop} onDrop={dropAudio} style={{overflow:"auto",minHeight:0,flex:"1 1 auto",background:"#101215",borderTop:"1px solid #333",fontFamily:"sans-serif",fontSize:11,color:"white",touchAction:"none"}}>
    <div style={{position:"sticky",left:0,zIndex:20,display:"flex",gap:6,padding:6,background:"#17191c"}}><button onClick={()=>onZoomByFactor(1/1.2)}>-</button><span>zoom {zoom.toFixed(2)}x</span><button onClick={()=>onZoomByFactor(1.2)}>+</button><button data-editor-command="toggle-snap" aria-pressed={state.project.settings.snapEnabled} onClick={()=>dispatch(editorActions.setSnap(!state.project.settings.snapEnabled))}>Snap {state.project.settings.snapEnabled?"On":"Off"}</button><span>{state.project.settings.snapToleranceFrames}f</span><button data-editor-command="split-audio" disabled={!canSplitAudio} onClick={onSplitAudio}>Split Audio</button><button data-editor-command="split-video" disabled={!canSplitVideo} onClick={onSplitVideo}>Razor Video</button><button data-editor-command="group-nudge-left" disabled={state.selectedItemIds.length===0} onClick={()=>nudgeSelected(-1)}>Nudge -1f</button><button data-editor-command="group-nudge-right" disabled={state.selectedItemIds.length===0} onClick={()=>nudgeSelected(1)}>Nudge +1f</button><button data-editor-command="group-delete" disabled={state.selectedItemIds.length===0} onClick={deleteSelected}>Delete selected</button><span data-editor-selection-count>{state.selectedItemIds.length} selected</span><button data-editor-command="timeline-playback" onClick={onStartPlayback} title="Play (S)">Play</button><input aria-label="playhead" type="range" min={0} max={Math.max(0,total-1)} value={Math.min(currentFrame,total-1)} onPointerDown={(event)=>event.stopPropagation()} onPointerMove={(event)=>event.stopPropagation()} onPointerUp={(event)=>event.stopPropagation()} onInput={(event)=>onSeek(Number(event.currentTarget.value))} style={{flex:1}}/><span>F{currentFrame}</span></div>
    <div ref={contentRef} data-editor-marquee-surface onPointerDown={beginMarquee} style={{minWidth:Math.max(900,total*ppf+TRACK_HEADER_WIDTH+10),position:"relative"}}>
      {marqueeBox?<div data-editor-marquee-selection style={{position:"absolute",left:marqueeBox.left,top:marqueeBox.top,width:marqueeBox.width,height:marqueeBox.height,border:"1px solid #7ec8ff",background:"rgba(80,160,255,.14)",zIndex:18,pointerEvents:"none"}}/>:null}
      {snapGuide?<div data-editor-snap-guide={snapGuide.kind} title={`${snapGuide.kind} · F${snapGuide.frame}`} style={{position:"absolute",left:TRACK_HEADER_WIDTH+snapGuide.frame*ppf,top:0,bottom:0,width:1,background:"#ffd65a",zIndex:19,pointerEvents:"none"}}/>:null}
      {state.project.tracks.slice().sort((a,b)=>a.order-b.order).map((track)=><div key={track.id} data-editor-track={track.id} data-editor-track-locked={track.locked?"true":"false"} style={{height:42,position:"relative",borderTop:"1px solid rgba(255,255,255,.08)",opacity:track.enabled?1:.55}}><div data-editor-track-header style={{position:"sticky",left:0,zIndex:10,width:TRACK_HEADER_WIDTH,height:42,display:"flex",alignItems:"center",gap:3,paddingLeft:6,background:"#17191c"}}><span style={{minWidth:58,maxWidth:78,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{track.id} · {track.name}</span><button data-editor-track-control="lock" aria-pressed={track.locked} onClick={()=>dispatch(editorActions.setTrackLocked(track.id,!track.locked))}>{track.locked?"Unlock":"Lock"}</button><button data-editor-track-control="enabled" aria-pressed={track.enabled} onClick={()=>dispatch(editorActions.setTrackEnabled(track.id,!track.enabled))}>{track.enabled?"Hide":"Show"}</button>{track.type==="AUDIO"?<><button data-editor-track-control="mute" aria-pressed={track.muted===true} onClick={()=>dispatch(editorActions.setTrackMuted(track.id,track.muted!==true))}>{track.muted?"Unmute":"Mute"}</button><button data-editor-track-control="solo" aria-pressed={track.solo===true} onClick={()=>dispatch(editorActions.setTrackSolo(track.id,track.solo!==true))}>{track.solo?"Unsolo":"Solo"}</button></>:null}</div>{selectItemsForTrack(state,track.id).map((item)=>{const movable=isTimelineDraggable(item)&&!track.locked;const editable=!item.locked&&!track.locked;const itemWidth=Math.max(10,item.durationInFrames*ppf);const audio=isAudioTimelineItem(item)?item:null;const fadeInWidth=audio?Math.min(itemWidth,audio.fadeInFrames*ppf):0;const fadeOutWidth=audio?Math.min(itemWidth,audio.fadeOutFrames*ppf):0;return <button key={item.id} data-editor-timeline-item={item.id} disabled={track.locked} onPointerDown={(event)=>movable&&beginDrag(event,item,"move")} onDoubleClick={()=>onSeek(item.timelineStartFrame)} style={{position:"absolute",left:TRACK_HEADER_WIDTH+item.timelineStartFrame*ppf,top:5,width:itemWidth,height:32,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",border:state.selectedItemIds.includes(item.id)?"2px solid white":"1px solid #aaa",borderRadius:4,background:color(item.type),color:"white",cursor:movable?"grab":"not-allowed",opacity:item.enabled?1:.45}}>{movable&&<><span data-editor-trim-handle="start" aria-label={`${item.id} start trim`} onPointerDown={(event)=>beginDrag(event,item,"trim-start")} style={handleStyle("left")}/><span data-editor-trim-handle="end" aria-label={`${item.id} end trim`} onPointerDown={(event)=>beginDrag(event,item,"trim-end")} style={handleStyle("right")}/></>}{audio?<><span data-editor-audio-fade-region="in" style={{position:"absolute",left:0,top:0,bottom:0,width:fadeInWidth,pointerEvents:"none",zIndex:1,background:"linear-gradient(90deg,rgba(0,0,0,.55),rgba(255,255,255,.08))"}}/><span data-editor-audio-fade-region="out" style={{position:"absolute",right:0,top:0,bottom:0,width:fadeOutWidth,pointerEvents:"none",zIndex:1,background:"linear-gradient(270deg,rgba(0,0,0,.55),rgba(255,255,255,.08))"}}/>{editable?<><span data-editor-audio-fade-handle="in" aria-label={`${item.id} fade in`} onPointerDown={(event)=>beginDrag(event,item,"fade-in")} style={fadeHandleStyle(fadeInWidth)}/><span data-editor-audio-fade-handle="out" aria-label={`${item.id} fade out`} onPointerDown={(event)=>beginDrag(event,item,"fade-out")} style={fadeHandleStyle(itemWidth-fadeOutWidth)}/></>:null}<AudioWaveform item={audio} width={itemWidth}/></>:null}<span style={{position:"relative",zIndex:2}}>{item.type} · {item.id}</span></button>;})}</div>)}
    </div>
  </div>;
};
