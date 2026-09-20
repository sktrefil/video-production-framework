import {useEffect,useState} from "react";
import type {FC} from "react";
import {editorActions} from "../editorActions";
import type {SubtitleTimelineItem} from "../editorTypes";
import {DEFAULT_SUBTITLE_EMPHASIS_COLOR,subtitleEmphasisEditorValue} from "../subtitleEmphasis";
import {useStudioEditor} from "../StudioEditorContext";

export const SubtitleEmphasisEditor:FC<{item:SubtitleTimelineItem}>=({item})=>{
  const {dispatch}=useStudioEditor();
  const current=subtitleEmphasisEditorValue(item);
  const [text,setText]=useState(current.text);
  useEffect(()=>setText(current.text),[item.id,current.text]);
  const update=(input:{text?:string;color?:string;enabled?:boolean})=>dispatch(editorActions.setSubtitleEmphasis(item.id,{text:input.text??current.text,color:input.color??current.color??DEFAULT_SUBTITLE_EMPHASIS_COLOR,enabled:input.enabled??current.enabled}));
  return <div data-editor-subtitle-emphasis-editor style={{display:"contents"}}>
    <label>Emphasis <input data-editor-subtitle-emphasis-text style={{width:150}} value={text} onChange={(event)=>setText(event.currentTarget.value)} placeholder="Exact subtitle text"/></label>
    <label>Color <input data-editor-subtitle-emphasis-color type="color" value={current.color} onChange={(event)=>update({color:event.currentTarget.value})}/></label>
    <label><input data-editor-subtitle-emphasis-enabled type="checkbox" checked={current.enabled} disabled={!current.text} onChange={(event)=>update({enabled:event.currentTarget.checked})}/> Emphasis on</label>
    <button data-editor-command="apply-subtitle-emphasis" disabled={!text||item.text.indexOf(text)<0} onClick={()=>update({text,enabled:true})}>Apply emphasis</button>
    {text&&item.text.indexOf(text)<0?<span data-editor-subtitle-emphasis-error style={{color:"#ff8c8c"}}>Text must exactly match this subtitle.</span>:null}
  </div>;
};
