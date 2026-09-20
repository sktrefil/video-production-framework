import {useState} from "react";
import type {FC} from "react";
import {editorActions} from "../editorActions";
import type {SubtitleTimelineItem} from "../editorTypes";
import {useStudioEditor} from "../StudioEditorContext";
import {CUSTOM_SUBTITLE_PRESET_KEY,parseSubtitleStylePreset,resolveSubtitleStylePreset,serializeSubtitleStylePreset,SUBTITLE_STYLE_PRESETS} from "../subtitleStylePresets";

const field={width:86} as const;
export const SubtitleStyleEditor:FC<{item:SubtitleTimelineItem}>=({item})=>{
  const {state,dispatch}=useStudioEditor();
  const [customPreset,setCustomPreset]=useState(()=>typeof window==="undefined"?null:parseSubtitleStylePreset(window.localStorage.getItem(CUSTOM_SUBTITLE_PRESET_KEY)));
  const applyBuiltin=(id:string)=>{const preset=SUBTITLE_STYLE_PRESETS.find((candidate)=>candidate.id===id);if(preset)dispatch(editorActions.updateSubtitleStyle(item.id,resolveSubtitleStylePreset(preset,state.project.project)));};
  const saveCustom=()=>{const value=serializeSubtitleStylePreset(item);if(typeof window!=="undefined")window.localStorage.setItem(CUSTOM_SUBTITLE_PRESET_KEY,value);setCustomPreset(parseSubtitleStylePreset(value));};
  return <div data-editor-subtitle-style-editor style={{display:"contents"}}>
    <label>Font <input data-editor-subtitle-font-family style={{width:150}} value={item.fontFamily} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{fontFamily:e.currentTarget.value}))}/></label>
    <label>Size <input data-editor-subtitle-font-size style={field} type="number" min={12} value={item.fontSize} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{fontSize:Math.max(12,Number(e.currentTarget.value))}))}/></label>
    <label>Weight <input data-editor-subtitle-font-weight style={field} type="number" min={100} max={900} step={100} value={item.fontWeight} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{fontWeight:Math.min(900,Math.max(100,Number(e.currentTarget.value)))}))}/></label>
    <label>Fill <input data-editor-subtitle-fill type="color" value={item.color} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{color:e.currentTarget.value}))}/></label>
    <label>Stroke <input data-editor-subtitle-stroke type="color" value={item.strokeColor} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{strokeColor:e.currentTarget.value}))}/></label>
    <label>Stroke px <input data-editor-subtitle-stroke-width style={field} type="number" min={0} max={20} value={item.strokeWidth} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{strokeWidth:Math.max(0,Number(e.currentTarget.value))}))}/></label>
    <label>Align <select data-editor-subtitle-align value={item.textAlign} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{textAlign:e.currentTarget.value as "left"|"center"|"right"}))}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
    <label>Line height <input data-editor-subtitle-line-height style={field} type="number" min={.5} max={3} step={.05} value={item.lineHeight} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{lineHeight:Math.max(.5,Number(e.currentTarget.value))}))}/></label>
    <label>Width <input data-editor-subtitle-width style={field} type="number" min={40} value={item.width} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{width:Math.max(40,Number(e.currentTarget.value))}))}/></label>
    <label>Max lines <input data-editor-subtitle-max-lines style={field} type="number" min={1} max={6} value={item.maxLines} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{maxLines:Math.max(1,Math.round(Number(e.currentTarget.value)))}))}/></label>
    <label>X <input data-editor-subtitle-x style={field} type="number" value={item.x} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{x:Number(e.currentTarget.value)}))}/></label>
    <label>Y <input data-editor-subtitle-y style={field} type="number" value={item.y} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{y:Number(e.currentTarget.value)}))}/></label>
    <label><input data-editor-subtitle-background-enabled type="checkbox" checked={item.backgroundEnabled} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{backgroundEnabled:e.currentTarget.checked}))}/> Background</label>
    {item.backgroundEnabled?<><label>BG <input data-editor-subtitle-background-color type="color" value={item.backgroundColor} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{backgroundColor:e.currentTarget.value}))}/></label><label>BG opacity <input data-editor-subtitle-background-opacity style={field} type="number" min={0} max={1} step={.05} value={item.backgroundOpacity} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{backgroundOpacity:Math.min(1,Math.max(0,Number(e.currentTarget.value)))}))}/></label></>:null}
    <label>Preset <select data-editor-subtitle-preset defaultValue="" onChange={(e)=>{if(e.currentTarget.value)applyBuiltin(e.currentTarget.value);e.currentTarget.value="";}}><option value="">Apply…</option>{SUBTITLE_STYLE_PRESETS.map((preset)=><option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
    <button data-editor-command="save-subtitle-preset" onClick={saveCustom}>Save current preset</button>
    <button data-editor-command="apply-custom-subtitle-preset" disabled={customPreset===null} onClick={()=>customPreset&&dispatch(editorActions.updateSubtitleStyle(item.id,customPreset))}>Apply custom</button>
  </div>;
};
