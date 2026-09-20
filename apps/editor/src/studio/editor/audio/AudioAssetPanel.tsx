import {useEffect,useState} from "react";
import type {DragEvent,FC} from "react";
import {editorActions} from "../editorActions";
import {configuredStudioProjectConnection} from "../persistence/editorPersistenceApi";
import {useStudioEditor} from "../StudioEditorContext";
type BgmLibraryAsset={id:string;name:string;extension:string;sizeBytes:number};
const dragAudio=(event:DragEvent<HTMLButtonElement>,itemId:string)=>{event.dataTransfer.effectAllowed="copy";event.dataTransfer.setData("application/x-vpf-audio-item",itemId);};
export const AudioAssetPanel:FC=()=>{
  const {state,dispatch}=useStudioEditor();
  const items=state.project.items.filter((item)=>["TTS","CLIP_AUDIO","BGM","SFX"].includes(item.type)).sort((a,b)=>{
    const aSelected=state.selectedItemIds.includes(a.id),bSelected=state.selectedItemIds.includes(b.id);
    if(aSelected!==bSelected)return aSelected?-1:1;
    if(a.type!==b.type)return a.type==="TTS"?-1:b.type==="TTS"?1:0;
    return a.id.localeCompare(b.id);
  });
  const apiBase=configuredStudioProjectConnection().apiBase;
  const [assets,setAssets]=useState<BgmLibraryAsset[]>([]);
  const [selectedId,setSelectedId]=useState("");
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  const a3=state.project.tracks.find((track)=>track.id==="A3"&&track.type==="AUDIO");
  useEffect(()=>{if(!apiBase)return;let cancelled=false;setLoading(true);void fetch(`${apiBase}/api/editor/bgm-library`).then(async(response)=>{const payload=await response.json() as {success:boolean;assets?:BgmLibraryAsset[];error?:string};if(!response.ok||!payload.success)throw new Error(payload.error??"Could not load the BGM library.");if(!cancelled){const next=payload.assets??[];setAssets(next);setSelectedId((current)=>next.some((asset)=>asset.id===current)?current:next[0]?.id??"");setError(null);}}).catch((reason)=>!cancelled&&setError(reason instanceof Error?reason.message:String(reason))).finally(()=>!cancelled&&setLoading(false));return()=>{cancelled=true;};},[apiBase]);
  const addSelectedBgm=async()=>{if(!apiBase||!selectedId||!a3||a3.locked)return;setLoading(true);try{const response=await fetch(`${apiBase}/api/editor/bgm-library/import`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({assetId:selectedId})});const payload=await response.json() as {success:boolean;asset?:{src:string};error?:string};if(!response.ok||!payload.success||!payload.asset)throw new Error(payload.error??"Could not import the selected BGM.");const duration=state.project.project.durationInFrames;const id=`audio-bgm-${crypto.randomUUID()}`;dispatch(editorActions.beginEditTransaction());dispatch(editorActions.addItem({id,type:"BGM",trackId:a3.id,timelineStartFrame:0,durationInFrames:duration,enabled:true,locked:false,src:payload.asset.src,sourceStartFrame:0,sourceDurationInFrames:duration,sourceAssetDurationInFrames:duration,volume:.1,muted:false,fadeInFrames:0,fadeOutFrames:0,loop:true}));dispatch(editorActions.selectItem([id]));dispatch(editorActions.endEditTransaction());setError(null);}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setLoading(false);}};
  return <section data-editor-audio-panel style={{padding:8,fontSize:11}}><strong>Audio</strong>{items.map((item)=>{const canDrop=item.type==="BGM"||item.type==="SFX";const source="src" in item?item.src:item.id;const filename=source.split("/").at(-1)??item.id;return <div key={item.id} style={{display:"flex",gap:6,alignItems:"center",marginTop:4}}><button draggable={canDrop} data-editor-audio-drag-source={canDrop?item.type:undefined} onDragStart={(event)=>canDrop&&dragAudio(event,item.id)} onClick={()=>dispatch(editorActions.selectItem([item.id]))} title={source}>{item.type} · {filename}</button>{"muted" in item?<label><input type="checkbox" checked={item.muted} onChange={(event)=>dispatch(editorActions.changeAudioMuted(item.id,event.currentTarget.checked))}/> mute</label>:null}</div>;})}<div data-editor-bgm-library style={{display:"flex",gap:4,alignItems:"center",marginTop:8,flexWrap:"wrap"}}><strong>A3 BGM</strong>{apiBase?<><select data-editor-bgm-library-select value={selectedId} disabled={loading||!a3||a3.locked||assets.length===0} onChange={(event)=>setSelectedId(event.currentTarget.value)}>{assets.length===0?<option value="">No supported BGM files</option>:assets.map((asset)=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select><button data-editor-command="add-bgm-to-a3" disabled={loading||!selectedId||!a3||a3.locked} onClick={()=>void addSelectedBgm()}>{loading?"Loading…":"Add to A3"}</button></>:<span>Start the Studio server to load the BGM library.</span>}{error?<span data-editor-bgm-library-error style={{color:"#ff8c8c"}}>{error}</span>:null}</div></section>;
};
