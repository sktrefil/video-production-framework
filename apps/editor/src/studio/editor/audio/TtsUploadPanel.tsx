import {useRef,useState} from "react";
import type {ChangeEvent,FC} from "react";
import {editorActions} from "../editorActions";
import {configuredStudioProjectConnection} from "../persistence/editorPersistenceApi";
import {useStudioEditor} from "../StudioEditorContext";

export const TtsUploadPanel:FC=()=>{
  const {state,dispatch}=useStudioEditor();const input=useRef<HTMLInputElement|null>(null);const [message,setMessage]=useState("");
  const upload=async(event:ChangeEvent<HTMLInputElement>)=>{const file=event.currentTarget.files?.[0];event.currentTarget.value="";if(!file)return;const api=configuredStudioProjectConnection().apiBase;if(!api){setMessage("Start Studio API server first.");return;}setMessage("Uploading...");try{const response=await fetch(`${api}/api/editor/tts/upload`,{method:"POST",headers:{"X-VPF-Filename":encodeURIComponent(file.name)},body:file});const payload=await response.json() as {success:boolean;asset?:{src:string};error?:string};if(!response.ok||!payload.asset)throw new Error(payload.error??"Upload failed");const duration=Math.max(1,Math.round(state.project.project.fps*file.size/16000));const safeName=file.name.replace(/[^a-zA-Z0-9가-힣._-]+/g,"-").slice(0,60);const id=`tts-${safeName}-${crypto.randomUUID().slice(0,8)}`;dispatch(editorActions.addItem({id,type:"TTS",trackId:"A1",timelineStartFrame:state.playheadFrame,durationInFrames:duration,enabled:true,locked:false,src:payload.asset.src,sourceStartFrame:0,sourceDurationInFrames:duration,sourceAssetDurationInFrames:duration,volume:1,muted:false,fadeInFrames:0,fadeOutFrames:0,loop:false}));dispatch(editorActions.selectItem([id]));setMessage(`Added ${file.name} to A1.`);}catch(error){setMessage(error instanceof Error?error.message:String(error));}};
  return <section data-editor-tts-upload style={{padding:8,fontSize:11}}><strong>New TTS → A1</strong><div style={{marginTop:5}}><button onClick={()=>input.current?.click()}>Choose TTS file</button><input ref={input} type="file" accept="audio/*" onChange={(event)=>void upload(event)} style={{display:"none"}}/></div><small>Adds at playhead.</small>{message?<div>{message}</div>:null}</section>;
};
