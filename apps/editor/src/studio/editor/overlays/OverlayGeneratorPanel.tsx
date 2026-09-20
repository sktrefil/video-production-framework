import type {FC} from "react";
import {editorActions} from "../editorActions";
import {selectPrimaryItem} from "../editorSelectors";
import type {GraphicType,TextRole} from "../editorTypes";
import {createGraphicItem} from "../graphicPresets";
import {useStudioEditor} from "../StudioEditorContext";
import {createTextRoleItem,TEXT_ROLE_PRESETS} from "../textRolePresets";
import {GraphicBlurEditor} from "./GraphicBlurEditor";
import {TextTitleEditor} from "./TextTitleEditor";

const GRAPHIC_TYPES:{type:GraphicType;label:string}[]=[{type:"BLUR_PANEL",label:"Blur"},{type:"GRADIENT",label:"Gradient"},{type:"SOLID_PANEL",label:"Solid"},{type:"DIM_LAYER",label:"Dim"}];

export const OverlayGeneratorPanel:FC=()=>{
  const {state,dispatch}=useStudioEditor();
  const selected=selectPrimaryItem(state);
  const selectedText=selected?.type==="TEXT"?selected:null;
  const selectedGraphic=selected?.type==="GRAPHIC"?selected:null;
  const items=state.project.items.filter((item)=>item.type==="TEXT"||item.type==="GRAPHIC");
  const textTrack=state.project.tracks.find((track)=>track.type==="TEXT"&&!track.locked);
  const graphicTrack=state.project.tracks.find((track)=>track.type==="GRAPHIC"&&!track.locked);
  const remaining=Math.max(1,state.project.project.durationInFrames-state.playheadFrame);
  const addText=(role:TextRole)=>{if(!textTrack)return;const id=`text-${crypto.randomUUID()}`;const item=createTextRoleItem({id,trackId:textTrack.id,role,timelineStartFrame:state.playheadFrame,durationInFrames:Math.min(90,remaining)});dispatch(editorActions.beginEditTransaction());dispatch(editorActions.addItem(item));dispatch(editorActions.selectItem([id]));dispatch(editorActions.endEditTransaction());};
  const addGraphic=(graphicType:GraphicType)=>{if(!graphicTrack)return;const id=`graphic-${crypto.randomUUID()}`;const item=createGraphicItem({id,trackId:graphicTrack.id,graphicType,timelineStartFrame:state.playheadFrame,durationInFrames:remaining,project:state.project.project});dispatch(editorActions.beginEditTransaction());dispatch(editorActions.addItem(item));dispatch(editorActions.selectItem([id]));dispatch(editorActions.endEditTransaction());};
  return <section data-editor-overlay-panel style={{padding:8,fontSize:11}}>
    <strong>Text / Graphics</strong>
    <div data-editor-text-role-add style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:4}}>{TEXT_ROLE_PRESETS.map((preset)=><button key={preset.role} data-editor-add-text-role={preset.role} disabled={!textTrack} onClick={()=>addText(preset.role)}>+ {preset.label}</button>)}</div>
    <div data-editor-graphic-add style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:4}}>{GRAPHIC_TYPES.map((entry)=><button key={entry.type} data-editor-add-graphic={entry.type} disabled={!graphicTrack} onClick={()=>addGraphic(entry.type)}>+ {entry.label}</button>)}</div>
    {selectedText?<div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:6}}><TextTitleEditor item={selectedText}/></div>:null}
    {selectedGraphic?<div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:6}}><GraphicBlurEditor item={selectedGraphic}/></div>:null}
    <div style={{marginTop:6}}>{items.map((item)=><div key={item.id} style={{marginTop:4}}><button onClick={()=>dispatch(editorActions.selectItem([item.id]))}>{item.type} · {item.id}</button></div>)}</div>
  </section>;
};
