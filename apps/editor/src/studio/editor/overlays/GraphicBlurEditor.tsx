import type {FC} from "react";
import {editorActions} from "../editorActions";
import type {GraphicTimelineItem,GraphicType} from "../editorTypes";
import {SHORTS_GRAPHIC_REGIONS,shortsGraphicRegionPatch} from "../graphicPresets";
import {useStudioEditor} from "../StudioEditorContext";

const field={width:82} as const;
export const GraphicBlurEditor:FC<{item:GraphicTimelineItem}>=({item})=>{
  const {state,dispatch}=useStudioEditor();
  const patch=(value:Partial<GraphicTimelineItem>)=>dispatch(editorActions.updateGraphicStyle(item.id,value));
  const applyRegion=(region:(typeof SHORTS_GRAPHIC_REGIONS)[number]["id"])=>patch(shortsGraphicRegionPatch(region,state.project.project));
  return <div data-editor-graphic-blur-editor style={{display:"contents"}}>
    <label>Graphic <select data-editor-graphic-type value={item.graphicType} onChange={(e)=>patch({graphicType:e.currentTarget.value as GraphicType})}><option value="BLUR_PANEL">Blur panel</option><option value="GRADIENT">Gradient</option><option value="SOLID_PANEL">Solid panel</option><option value="DIM_LAYER">Dim layer</option></select></label>
    <label>X <input data-editor-graphic-x style={field} type="number" value={item.x} onChange={(e)=>patch({x:Number(e.currentTarget.value)})}/></label>
    <label>Y <input data-editor-graphic-y style={field} type="number" value={item.y} onChange={(e)=>patch({y:Number(e.currentTarget.value)})}/></label>
    <label>W <input data-editor-graphic-width style={field} type="number" min={1} value={item.width} onChange={(e)=>patch({width:Math.max(1,Number(e.currentTarget.value))})}/></label>
    <label>H <input data-editor-graphic-height style={field} type="number" min={1} value={item.height} onChange={(e)=>patch({height:Math.max(1,Number(e.currentTarget.value))})}/></label>
    <label>Opacity <input data-editor-graphic-opacity style={field} type="number" min={0} max={1} step={.05} value={item.opacity} onChange={(e)=>patch({opacity:Math.min(1,Math.max(0,Number(e.currentTarget.value)))})}/></label>
    <label>Blur <input data-editor-graphic-blur style={field} type="number" min={0} value={item.blurPx} onChange={(e)=>patch({blurPx:Math.max(0,Number(e.currentTarget.value))})}/></label>
    <label>Color <input data-editor-graphic-color type="color" value={item.backgroundColor.startsWith("#")?item.backgroundColor:"#000000"} onChange={(e)=>patch({backgroundColor:e.currentTarget.value})}/></label>
    <label>Radius <input data-editor-graphic-radius style={field} type="number" min={0} value={item.borderRadius} onChange={(e)=>patch({borderRadius:Math.max(0,Number(e.currentTarget.value))})}/></label>
    {item.graphicType==="GRADIENT"?<><label>Gradient start <input data-editor-gradient-start style={{width:120}} value={item.gradientStartColor??"rgba(0,0,0,0)"} onChange={(e)=>patch({gradientStartColor:e.currentTarget.value})}/></label><label>Gradient end <input data-editor-gradient-end style={{width:120}} value={item.gradientEndColor??"rgba(0,0,0,0.78)"} onChange={(e)=>patch({gradientEndColor:e.currentTarget.value})}/></label><label>Angle <input data-editor-gradient-angle style={field} type="number" value={item.gradientAngleDeg??180} onChange={(e)=>patch({gradientAngleDeg:Number(e.currentTarget.value)})}/></label></>:null}
    {SHORTS_GRAPHIC_REGIONS.map((region)=><button key={region.id} data-editor-shorts-graphic-region={region.id} onClick={()=>applyRegion(region.id)}>{region.label}</button>)}
    <button data-editor-command="duplicate-graphic" onClick={()=>dispatch(editorActions.duplicateItem(item.id,`graphic-${crypto.randomUUID()}`,item.timelineStartFrame,item.trackId))}>Duplicate graphic</button>
    <button data-editor-command="delete-graphic" onClick={()=>dispatch(editorActions.deleteItem(item.id))}>Delete graphic</button>
  </div>;
};
