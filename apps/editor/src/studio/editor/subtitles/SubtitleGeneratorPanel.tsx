import {useState} from "react";
import type {FC} from "react";
import {editorActions} from "../editorActions";
import type {SubtitleTimelineItem} from "../editorTypes";
import {previewSubtitleAudioSync,promoteSubtitleAudioSync} from "../persistence/editorPersistenceApi";
import type {SubtitleSyncPreview} from "../persistence/editorPersistenceApi";
import {useStudioEditor} from "../StudioEditorContext";

type SyncScope="SELECTED"|"FROM_HERE"|"ALL";

export const SubtitleGeneratorPanel:FC=()=>{
  const {state,dispatch}=useStudioEditor();
  const [scope,setScope]=useState<SyncScope>("ALL");
  const [preview,setPreview]=useState<SubtitleSyncPreview|null>(null);
  const [approvedIds,setApprovedIds]=useState<Set<string>>(new Set());
  const [busy,setBusy]=useState(false);
  const [applying,setApplying]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const items=state.project.items.filter((item):item is SubtitleTimelineItem=>item.type==="SUBTITLE").sort((a,b)=>a.timelineStartFrame-b.timelineStartFrame||a.id.localeCompare(b.id));
  const selected=new Set(state.selectedItemIds);
  const anchor=items.find(item=>selected.has(item.id))??null;
  const inScope=(id:string)=>{
    if(scope==="ALL")return true;
    if(scope==="SELECTED")return selected.has(id);
    const item=items.find(candidate=>candidate.id===id);
    return anchor!==null&&item!==undefined&&item.timelineStartFrame>=anchor.timelineStartFrame;
  };
  const scoped=preview?.proposals.filter(proposal=>inScope(proposal.id))??[];
  const approved=scoped.filter(proposal=>approvedIds.has(proposal.id)&&items.find(item=>item.id===proposal.id)?.locked!==true);
  const resultingItems=items.map(item=>{const proposal=approved.find(candidate=>candidate.id===item.id);return proposal?{...item,timelineStartFrame:proposal.suggestedStartFrame,durationInFrames:proposal.suggestedDurationInFrames}:item;}).sort((a,b)=>a.timelineStartFrame-b.timelineStartFrame||a.id.localeCompare(b.id));
  const overlap=resultingItems.some((item,index)=>index>0&&resultingItems[index-1]!.timelineStartFrame+resultingItems[index-1]!.durationInFrames>item.timelineStartFrame);
  const analyze=async()=>{
    setBusy(true);setError(null);
    try{const result=await previewSubtitleAudioSync(state.project);setPreview(result);setApprovedIds(new Set(result.proposals.filter(proposal=>proposal.status==="READY").map(proposal=>proposal.id)));}
    catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
    finally{setBusy(false);}
  };
  const apply=async()=>{
    if(approved.length===0||overlap)return;
    const changes=approved.map(proposal=>({itemId:proposal.id,timelineStartFrame:proposal.suggestedStartFrame,durationInFrames:proposal.suggestedDurationInFrames}));
    const timings=new Map(changes.map(change=>[change.itemId,change]));
    const project={...state.project,items:state.project.items.map(item=>{
      const timing=timings.get(item.id);
      return timing&&item.type==="SUBTITLE"?{...item,timelineStartFrame:timing.timelineStartFrame,durationInFrames:timing.durationInFrames,generationSource:"TTS_TRANSCRIBE" as const}:item;
    })};
    setApplying(true);setError(null);
    try{
      await promoteSubtitleAudioSync(project);
      dispatch(editorActions.applySubtitleSync(changes));
      setPreview(null);setApprovedIds(new Set());
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
    finally{setApplying(false);}
  };
  return <section data-editor-subtitle-panel style={{padding:8,fontSize:11}}>
    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
      <strong>Subtitles</strong>
      <select data-editor-subtitle-sync-scope value={scope} onChange={event=>setScope(event.currentTarget.value as SyncScope)}>
        <option value="SELECTED">Selected</option>
        <option value="FROM_HERE" disabled={anchor===null}>From selected</option>
        <option value="ALL">All T1</option>
      </select>
      <button data-editor-command="preview-subtitle-audio-sync" disabled={busy||applying||items.length===0||(scope!=="ALL"&&anchor===null)} onClick={()=>void analyze()}>{busy?"Analyzing final audio…":"Auto Sync T1 preview"}</button>
      <button data-editor-command="apply-subtitle-audio-sync" disabled={busy||applying||approved.length===0||overlap} onClick={()=>void apply()}>{applying?"Saving canonical…":`Apply ${approved.length||""}`}</button>
      {preview?<span>Whisper {preview.model} · match {(preview.modelAlignmentConfidence*100).toFixed(1)}%</span>:null}
      {overlap?<span style={{color:"#ff8c8c"}}>Resolve unchecked cue overlap before Apply</span>:null}
      {error?<span style={{color:"#ff8c8c"}}>{error}</span>:null}
    </div>
    {preview?<div data-editor-subtitle-sync-preview title="Drag the lower edge to resize this review list" style={{marginTop:6,height:150,minHeight:80,maxHeight:"55vh",resize:"vertical",overflow:"auto",border:"1px solid #3f454d"}}>
      {scoped.map(proposal=>{const locked=items.find(item=>item.id===proposal.id)?.locked===true;return <div key={proposal.id} style={{display:"grid",gridTemplateColumns:"22px minmax(180px,1fr) 58px 72px 72px",gap:6,padding:"3px 5px",borderBottom:"1px solid #30343a",color:proposal.status==="READY"&&!locked?"white":"#ffcf70"}}>
        <input aria-label={`approve ${proposal.id}`} type="checkbox" disabled={locked} checked={approvedIds.has(proposal.id)} onChange={event=>{const checked=event.currentTarget.checked;setApprovedIds(current=>{const next=new Set(current);if(checked)next.add(proposal.id);else next.delete(proposal.id);return next;});}}/>
        <span title={proposal.text} style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{proposal.text}</span>
        <span>{proposal.deltaFrames>=0?"+":""}{proposal.deltaFrames}f</span>
        <span>{proposal.currentStartFrame}→{proposal.suggestedStartFrame}</span>
        <span>{locked?"LOCKED":proposal.status==="READY"?`${Math.round(proposal.confidence*100)}%`:"CHECK"}</span>
      </div>;})}
    </div>:null}
    {!preview?<div style={{marginTop:6,maxHeight:90,overflow:"auto"}}>{items.map(item=><div key={item.id} style={{display:"grid",gridTemplateColumns:"110px 1fr",gap:6,marginTop:4}}><button onClick={()=>dispatch(editorActions.selectItem([item.id]))}>{item.id}</button><input value={item.text} onChange={event=>dispatch(editorActions.updateText(item.id,event.currentTarget.value))}/></div>)}</div>:null}
  </section>;
};
