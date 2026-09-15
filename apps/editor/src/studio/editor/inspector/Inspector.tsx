import type {CSSProperties,FC} from "react";
import {editorActions} from "../editorActions";
import {selectPrimaryItem} from "../editorSelectors";
import {useStudioEditor} from "../StudioEditorContext";

const field={width:90} as const;
const panelStyle:CSSProperties={padding:"6px 8px",color:"white",fontFamily:"sans-serif",fontSize:12,display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",borderTop:"1px solid #333",background:"#14171a",maxHeight:132,overflow:"auto"};
const titleStyle:CSSProperties={maxWidth:340,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"};
const textAreaStyle:CSSProperties={width:280,height:38,resize:"vertical"};

export const Inspector:FC=()=>{
  const {state,dispatch}=useStudioEditor();
  const item=selectPrimaryItem(state);
  if(!item)return <aside data-editor-inspector style={{...panelStyle,color:"#bbb"}}>Select a timeline item.</aside>;
  return <aside data-editor-inspector style={panelStyle}>
    <strong style={titleStyle}>{item.type} · {item.id}</strong>
    <label>Start <input style={field} type="number" value={item.timelineStartFrame} onChange={(e)=>dispatch(editorActions.moveItem(item.id,Number(e.currentTarget.value)))}/></label>
    <label>Duration <input style={field} type="number" min={1} value={item.durationInFrames} onChange={(e)=>dispatch(editorActions.changeItemDuration(item.id,Number(e.currentTarget.value)))}/></label>
    {(item.type==="VIDEO"||["TTS","CLIP_AUDIO","BGM","SFX"].includes(item.type))&&"volume" in item?<label>Volume <input style={field} type="number" min={0} step={.05} value={item.volume} onChange={(e)=>dispatch(editorActions.changeVolume(item.id,Number(e.currentTarget.value)) )}/></label>:null}
    {(item.type==="TEXT"||item.type==="SUBTITLE")?<textarea style={textAreaStyle} value={item.text} onChange={(e)=>dispatch(editorActions.updateText(item.id,e.currentTarget.value) )}/>:null}
    {item.type==="SUBTITLE"?<><label>Size <input style={field} type="number" min={12} value={item.fontSize} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{fontSize:Math.max(12,Number(e.currentTarget.value))}))}/></label><label>Text color <input type="color" value={item.color} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{color:e.currentTarget.value}))}/></label><label>Outline <input type="color" value={item.strokeColor} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{strokeColor:e.currentTarget.value}))}/></label><label>Outline px <input style={field} type="number" min={0} max={12} value={item.strokeWidth} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{strokeWidth:Math.max(0,Number(e.currentTarget.value))}))}/></label><label><input type="checkbox" checked={item.backgroundEnabled} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{backgroundEnabled:e.currentTarget.checked}))}/> Highlight band</label>{item.backgroundEnabled?<><label>Band <input type="color" value={item.backgroundColor} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{backgroundColor:e.currentTarget.value}))}/></label><label>Band opacity <input style={field} type="number" min={0} max={1} step={.05} value={item.backgroundOpacity} onChange={(e)=>dispatch(editorActions.updateSubtitleStyle(item.id,{backgroundOpacity:Math.min(1,Math.max(0,Number(e.currentTarget.value)))}))}/></label></>:null}<button onClick={()=>dispatch(editorActions.updateSubtitleStyle(item.id,{color:"#FFE45C",strokeColor:"#17130F",strokeWidth:5,backgroundEnabled:false}))}>Yellow emphasis</button><button onClick={()=>dispatch(editorActions.updateSubtitleStyle(item.id,{color:"#FFFFFF",strokeColor:"#000000",strokeWidth:6,backgroundEnabled:true,backgroundColor:"#E5422D",backgroundOpacity:.82}))}>Strong alert</button><button onClick={()=>dispatch(editorActions.updateSubtitleStyle(item.id,{color:"#FFFFFF",strokeColor:"#17130F",strokeWidth:4,backgroundEnabled:false}))}>Reset style</button></>:null}
    {(item.type==="VIDEO"||item.type==="IMAGE")?<><label>X <input style={field} type="number" value={item.x} onChange={(e)=>dispatch(editorActions.updateTransform(item.id,{x:Number(e.currentTarget.value)}))}/></label><label>Scale <input style={field} type="number" step={.01} value={item.scale} onChange={(e)=>dispatch(editorActions.updateTransform(item.id,{scale:Number(e.currentTarget.value)}))}/></label></>:null}
    <button onClick={()=>dispatch(editorActions.deleteItem(item.id))}>Delete</button>
  </aside>;
};
