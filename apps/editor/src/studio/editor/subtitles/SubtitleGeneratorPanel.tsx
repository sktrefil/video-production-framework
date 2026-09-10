import type {FC} from "react";
import {editorActions} from "../editorActions";
import {useStudioEditor} from "../StudioEditorContext";
export const SubtitleGeneratorPanel:FC=()=>{const {state,dispatch}=useStudioEditor();const items=state.project.items.filter((item)=>item.type==="SUBTITLE");return <section data-editor-subtitle-panel style={{padding:8,fontSize:11}}><strong>Subtitles</strong>{items.map((item)=><div key={item.id} style={{display:"grid",gridTemplateColumns:"110px 1fr",gap:6,marginTop:4}}><button onClick={()=>dispatch(editorActions.selectItem([item.id]))}>{item.id}</button><input value={item.text} onChange={(e)=>dispatch(editorActions.updateText(item.id,e.currentTarget.value))}/></div>)}</section>;};
