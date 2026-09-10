import type {FC} from "react";
import {editorActions} from "../editorActions";
import {useStudioEditor} from "../StudioEditorContext";
export const OverlayGeneratorPanel:FC=()=>{const {state,dispatch}=useStudioEditor();const items=state.project.items.filter((item)=>item.type==="TEXT"||item.type==="GRAPHIC");return <section data-editor-overlay-panel style={{padding:8,fontSize:11}}><strong>Text / Graphics</strong>{items.map((item)=><div key={item.id} style={{marginTop:4}}><button onClick={()=>dispatch(editorActions.selectItem([item.id]))}>{item.type} · {item.id}</button></div>)}</section>;};
