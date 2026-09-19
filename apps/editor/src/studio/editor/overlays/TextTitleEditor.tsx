import type {FC} from "react";
import {editorActions} from "../editorActions";
import type {TextRole,TextTimelineItem} from "../editorTypes";
import {useStudioEditor} from "../StudioEditorContext";
import {TEXT_ROLE_PRESETS,textRolePreset} from "../textRolePresets";

const field={width:84} as const;
export const TextTitleEditor:FC<{item:TextTimelineItem}>=({item})=>{
  const {state,dispatch}=useStudioEditor();
  const applyRole=(role:TextRole)=>{const preset=textRolePreset(role);dispatch(editorActions.beginEditTransaction());dispatch(editorActions.updateTextStyle(item.id,preset.patch));dispatch(editorActions.endEditTransaction());};
  const duplicate=()=>dispatch(editorActions.duplicateItem(item.id,`text-${crypto.randomUUID()}`,Math.min(state.project.project.durationInFrames-1,item.timelineStartFrame+15),item.trackId));
  return <div data-editor-text-title-editor style={{display:"contents"}}>
    <label>Role <select data-editor-text-role value={item.textRole} onChange={(e)=>applyRole(e.currentTarget.value as TextRole)}>{TEXT_ROLE_PRESETS.map((preset)=><option key={preset.role} value={preset.role}>{preset.label}</option>)}</select></label>
    <label>Font <input data-editor-text-font-family style={{width:150}} value={item.fontFamily} onChange={(e)=>dispatch(editorActions.updateTextStyle(item.id,{fontFamily:e.currentTarget.value}))}/></label>
    <label>Size <input data-editor-text-font-size style={field} type="number" min={10} value={item.fontSize} onChange={(e)=>dispatch(editorActions.updateTextStyle(item.id,{fontSize:Math.max(10,Number(e.currentTarget.value))}))}/></label>
    <label>Weight <input data-editor-text-font-weight style={field} type="number" min={100} max={900} step={100} value={item.fontWeight} onChange={(e)=>dispatch(editorActions.updateTextStyle(item.id,{fontWeight:Math.min(900,Math.max(100,Number(e.currentTarget.value)))}))}/></label>
    <label>Fill <input data-editor-text-fill type="color" value={item.color} onChange={(e)=>dispatch(editorActions.updateTextStyle(item.id,{color:e.currentTarget.value}))}/></label>
    <label>Stroke <input data-editor-text-stroke type="color" value={item.strokeColor} onChange={(e)=>dispatch(editorActions.updateTextStyle(item.id,{strokeColor:e.currentTarget.value}))}/></label>
    <label>Stroke px <input data-editor-text-stroke-width style={field} type="number" min={0} max={20} value={item.strokeWidth} onChange={(e)=>dispatch(editorActions.updateTextStyle(item.id,{strokeWidth:Math.max(0,Number(e.currentTarget.value))}))}/></label>
    <label>Align <select data-editor-text-align value={item.textAlign} onChange={(e)=>dispatch(editorActions.updateTextStyle(item.id,{textAlign:e.currentTarget.value as "left"|"center"|"right"}))}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
    <label>Width <input data-editor-text-width style={field} type="number" min={40} value={item.width} onChange={(e)=>dispatch(editorActions.updateTextStyle(item.id,{width:Math.max(40,Number(e.currentTarget.value))}))}/></label>
    <label>X <input data-editor-text-x style={field} type="number" value={item.x} onChange={(e)=>dispatch(editorActions.updateTextStyle(item.id,{x:Number(e.currentTarget.value)}))}/></label>
    <label>Y <input data-editor-text-y style={field} type="number" value={item.y} onChange={(e)=>dispatch(editorActions.updateTextStyle(item.id,{y:Number(e.currentTarget.value)}))}/></label>
    <label><input data-editor-text-background-enabled type="checkbox" checked={item.backgroundEnabled} onChange={(e)=>dispatch(editorActions.updateTextStyle(item.id,{backgroundEnabled:e.currentTarget.checked}))}/> Background</label>
    <button data-editor-command="duplicate-text" onClick={duplicate}>Duplicate text</button>
    <button data-editor-command="delete-text" onClick={()=>dispatch(editorActions.deleteItem(item.id))}>Delete text</button>
  </div>;
};
