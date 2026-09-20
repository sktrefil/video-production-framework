import {useCallback,useEffect,useState} from "react";
import type {FC} from "react";
import {editorActions} from "../editorActions";
import type {TimelineItem} from "../editorTypes";
import {useStudioEditor} from "../StudioEditorContext";
import {buildDuplicateItems,buildPasteItems,captureEditorClipboard} from "../clipboardCommands";
import type {EditorClipboard} from "../clipboardCommands";

const studioHostDocument=():Document|null=>{
  if(typeof window==="undefined")return null;
  try{if(window.parent!==window&&window.parent.document?.body)return window.parent.document;}catch{}
  return window.document;
};
const isEditableTarget=(target:EventTarget|null)=>{const element=target as HTMLElement|null;const tag=element?.tagName?.toLowerCase();return tag==="input"||tag==="textarea"||tag==="select"||element?.isContentEditable===true;};
const newId=(item:TimelineItem)=>`${item.type.toLowerCase()}-${crypto.randomUUID()}`;

export const ClipboardControls:FC=()=>{
  const {state,dispatch}=useStudioEditor();
  const [clipboard,setClipboard]=useState<EditorClipboard|null>(null);
  const copy=useCallback(()=>{setClipboard(captureEditorClipboard(state.project,state.selectedItemIds));},[state.project,state.selectedItemIds]);
  const addItems=useCallback((items:TimelineItem[])=>{if(items.length===0)return;dispatch(editorActions.beginEditTransaction());for(const item of items)dispatch(editorActions.addItem(item));dispatch(editorActions.selectItem(items.map((item)=>item.id)));dispatch(editorActions.endEditTransaction());},[dispatch]);
  const paste=useCallback(()=>{if(!clipboard)return;addItems(buildPasteItems(state.project,clipboard,state.playheadFrame,(item)=>newId(item)));},[addItems,clipboard,state.playheadFrame,state.project]);
  const duplicate=useCallback(()=>{addItems(buildDuplicateItems(state.project,state.selectedItemIds,(item)=>newId(item)));},[addItems,state.project,state.selectedItemIds]);
  useEffect(()=>{
    const host=studioHostDocument();if(!host)return;
    const onKeyDown=(event:KeyboardEvent)=>{if(event.defaultPrevented||isEditableTarget(event.target)||event.altKey)return;const command=event.ctrlKey||event.metaKey;if(!command)return;const key=event.key.toLowerCase();if(key==="c"){if(state.selectedItemIds.length===0)return;event.preventDefault();copy();return;}if(key==="v"){if(!clipboard)return;event.preventDefault();paste();return;}if(key==="d"){if(state.selectedItemIds.length===0)return;event.preventDefault();duplicate();}};
    host.addEventListener("keydown",onKeyDown);return()=>host.removeEventListener("keydown",onKeyDown);
  },[clipboard,copy,duplicate,paste,state.selectedItemIds.length]);
  return <>
    <button data-editor-command="copy-items" disabled={state.selectedItemIds.length===0} onClick={copy} title="Copy selected (Ctrl/Cmd+C)">Copy</button>
    <button data-editor-command="paste-items" disabled={!clipboard} onClick={paste} title="Paste at playhead (Ctrl/Cmd+V)">Paste</button>
    <button data-editor-command="duplicate-items" disabled={state.selectedItemIds.length===0} onClick={duplicate} title="Duplicate selected +1f (Ctrl/Cmd+D)">Duplicate</button>
  </>;
};
