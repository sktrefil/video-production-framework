import type {FC} from "react";
import {editorActions} from "../editorActions";
import {selectPrimaryItem} from "../editorSelectors";
import type {TextRole} from "../editorTypes";
import {useStudioEditor} from "../StudioEditorContext";
import {createTextRoleItem,TEXT_ROLE_PRESETS} from "../textRolePresets";
import {TextTitleEditor} from "./TextTitleEditor";

export const OverlayGeneratorPanel:FC=()=>{
  const {state,dispatch}=useStudioEditor();
  const selected=selectPrimaryItem(state);
  const selectedText=selected?.type==="TEXT"?selected:null;
  const items=state.project.items.filter((item)=>item.type==="TEXT"||item.type==="GRAPHIC");
  const textTrack=state.project.tracks.find((track)=>track.type==="TEXT"&&!track.locked);
  const addText=(role:TextRole)=>{if(!textTrack)return;const id=`text-${crypto.randomUUID()}`;const item=createTextRoleItem({id,trackId:textTrack.id,role,timelineStartFrame:state.playheadFrame,durationInFrames:Math.min(90,Math.max(1,state.project.project.durationInFrames-state.playheadFrame))});dispatch(editorActions.beginEditTransaction());dispatch(editorActions.addItem(item));dispatch(editorActions.selectItem([id]));dispatch(editorActions.endEditTransaction());};
  return <section data-editor-overlay-panel style={{padding:8,fontSize:11}}>
    <strong>Text / Graphics</strong>
    <div data-editor-text-role-add style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:4}}>{TEXT_ROLE_PRESETS.map((preset)=><button key={preset.role} data-editor-add-text-role={preset.role} disabled={!textTrack} onClick={()=>addText(preset.role)}>+ {preset.label}</button>)}</div>
    {selectedText?<div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:6}}><TextTitleEditor item={selectedText}/></div>:null}
    <div style={{marginTop:6}}>{items.map((item)=><div key={item.id} style={{marginTop:4}}><button onClick={()=>dispatch(editorActions.selectItem([item.id]))}>{item.type} · {item.id}</button></div>)}</div>
  </section>;
};
