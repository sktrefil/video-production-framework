import type {CSSProperties,FC} from "react";
import {editorActions} from "../editorActions";
import {selectPrimaryItem} from "../editorSelectors";
import {useStudioEditor} from "../StudioEditorContext";

const field={width:90} as const;
const panelStyle:CSSProperties={padding:"6px 8px",color:"white",fontFamily:"sans-serif",fontSize:12,display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",borderTop:"1px solid #333",background:"#14171a",maxHeight:84,overflow:"auto"};
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
    {(item.type==="VIDEO"||item.type==="IMAGE")?<><label>X <input style={field} type="number" value={item.x} onChange={(e)=>dispatch(editorActions.updateTransform(item.id,{x:Number(e.currentTarget.value)}))}/></label><label>Scale <input style={field} type="number" step={.01} value={item.scale} onChange={(e)=>dispatch(editorActions.updateTransform(item.id,{scale:Number(e.currentTarget.value)}))}/></label></>:null}
    <button onClick={()=>dispatch(editorActions.deleteItem(item.id))}>Delete</button>
  </aside>;
};
