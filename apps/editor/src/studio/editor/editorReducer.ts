import type {EditorAction} from "./editorActions";
import type {AudioTimelineItem, EditProject, EditorState, SubtitleTimelineItem, TimelineItem, VideoTimelineItem} from "./editorTypes";

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,Number.isFinite(value)?value:min));
const isAudio=(item:TimelineItem):item is AudioTimelineItem=>["TTS","CLIP_AUDIO","BGM","SFX"].includes(item.type);
const isVideo=(item:TimelineItem):item is VideoTimelineItem=>item.type==="VIDEO";
const isSubtitle=(item:TimelineItem):item is SubtitleTimelineItem=>item.type==="SUBTITLE";

const normalizeItem=(item:TimelineItem):TimelineItem=>{
  const normalized={...item,timelineStartFrame:Math.max(0,Math.round(item.timelineStartFrame)),durationInFrames:Math.max(1,Math.round(item.durationInFrames))} as TimelineItem;
  if(!isVideo(normalized))return normalized;
  const asset=Math.max(1,Math.round(normalized.sourceAssetDurationInFrames));
  const start=Math.min(asset-1,Math.max(0,Math.round(normalized.sourceStartFrame)));
  const duration=Math.min(asset-start,Math.max(1,Math.round(normalized.sourceDurationInFrames)));
  const canonicalStart=Math.min(asset-1,Math.max(0,Math.round(normalized.canonicalSourceStartFrame??start)));
  const canonicalDuration=Math.min(asset-canonicalStart,Math.max(1,Math.round(normalized.canonicalSourceDurationInFrames??duration)));
  return{...normalized,sourceAssetDurationInFrames:asset,sourceStartFrame:start,sourceDurationInFrames:duration,canonicalSourceStartFrame:canonicalStart,canonicalSourceDurationInFrames:canonicalDuration,sourceUsagePolicy:normalized.sourceUsagePolicy??(start===0&&duration===asset?"FULL_SOURCE":"QC_TRIM"),sourceWindowApprovalRequired:normalized.sourceWindowApprovalRequired??false};
};

const normalizeProject=(project:EditProject):EditProject=>({
  ...project,
  schemaVersion:1,
  project:{...project.project,fps:Math.max(1,Math.round(project.project.fps)),width:Math.max(1,Math.round(project.project.width)),height:Math.max(1,Math.round(project.project.height)),durationInFrames:Math.max(1,Math.round(project.project.durationInFrames))},
  tracks:project.tracks.map((track)=>({...track})).sort((a,b)=>a.order-b.order),
  items:project.items.map(normalizeItem),
  settings:{...project.settings,timelineZoom:clamp(project.settings.timelineZoom,0.05,100),masterVolume:Math.max(0,project.settings.masterVolume),snapToleranceFrames:Math.max(0,Math.round(project.settings.snapToleranceFrames))},
});

export const createEmptyEditProject=():EditProject=>({schemaVersion:1,project:{id:"untitled",name:"Untitled Edit",fps:30,width:1080,height:1920,durationInFrames:1},tracks:[],items:[],settings:{snapEnabled:true,snapToleranceFrames:4,timelineZoom:1,masterVolume:1}});
export const createEditorState=(project:EditProject=createEmptyEditProject()):EditorState=>{const normalized=normalizeProject(project);return{project:normalized,selectedItemIds:[],playheadFrame:0,history:{past:[],future:[],transactionBase:null},savedProjectJson:JSON.stringify(normalized),dirty:false}};

const updateItem=(state:EditorState,itemId:string,fn:(item:TimelineItem)=>TimelineItem):EditorState=>{
  const index=state.project.items.findIndex((item)=>item.id===itemId); if(index<0||state.project.items[index]?.locked)return state;
  const items=[...state.project.items]; items[index]=fn(items[index]!); return {...state,project:{...state.project,items}};
};
const mediaTrim=(item:TimelineItem,delta:number,start:boolean):TimelineItem=>{
  const d=Math.round(delta); if(d===0)return item; const maxInward=item.durationInFrames-1; const actual=Math.min(d,maxInward);
  if(start){
    const nextStart=Math.max(0,item.timelineStartFrame+actual); const applied=nextStart-item.timelineStartFrame;
    if(isAudio(item)||isVideo(item)){const rate=isVideo(item)?item.playbackRate:1; const srcDelta=Math.round(applied*rate);return{...item,timelineStartFrame:nextStart,durationInFrames:Math.max(1,item.durationInFrames-applied),sourceStartFrame:Math.max(0,item.sourceStartFrame+srcDelta),sourceDurationInFrames:Math.max(1,item.sourceDurationInFrames-srcDelta)};}
    return{...item,timelineStartFrame:nextStart,durationInFrames:Math.max(1,item.durationInFrames-applied)};
  }
  if(isAudio(item)||isVideo(item)){const rate=isVideo(item)?item.playbackRate:1; const srcDelta=Math.round(actual*rate);return{...item,durationInFrames:Math.max(1,item.durationInFrames-actual),sourceDurationInFrames:Math.max(1,item.sourceDurationInFrames-srcDelta)};}
  return{...item,durationInFrames:Math.max(1,item.durationInFrames-actual)};
};

export const editorReducer=(state:EditorState,action:EditorAction):EditorState=>{
  switch(action.type){
    case "LOAD_PROJECT": return createEditorState(action.project);
    case "SELECT_ITEM": return {...state,selectedItemIds:action.itemIds.filter((id)=>state.project.items.some((item)=>item.id===id))};
    case "MOVE_ITEM": return updateItem(state,action.itemId,(item)=>({...item,timelineStartFrame:Math.max(0,Math.round(action.timelineStartFrame)),trackId:action.trackId??item.trackId}));
    case "TRIM_ITEM_START": return updateItem(state,action.itemId,(item)=>mediaTrim(item,action.deltaFrames,true));
    case "TRIM_ITEM_END": return updateItem(state,action.itemId,(item)=>mediaTrim(item,action.deltaFrames,false));
    case "CHANGE_ITEM_DURATION": return updateItem(state,action.itemId,(item)=>({...item,durationInFrames:Math.max(1,Math.round(action.durationInFrames))}));
    case "CHANGE_PLAYBACK_RATE": return updateItem(state,action.itemId,(item)=>isVideo(item)?{...item,playbackRate:clamp(action.playbackRate,0.0625,16)}:item);
    case "CHANGE_VOLUME": return updateItem(state,action.itemId,(item)=>(isAudio(item)||isVideo(item))?{...item,volume:Math.max(0,action.volume)}:item);
    case "CHANGE_VIDEO_FIT": return updateItem(state,action.itemId,(item)=>isVideo(item)?{...item,fit:action.fit}:item);
    case "CHANGE_VIDEO_SOURCE_WINDOW": return updateItem(state,action.itemId,(item)=>{if(!isVideo(item))return item;const asset=Math.max(1,item.sourceAssetDurationInFrames);const start=Math.min(asset-1,Math.max(0,Math.round(action.sourceStartFrame)));const duration=Math.min(asset-start,Math.max(1,Math.round(action.sourceDurationInFrames)));return{...item,sourceStartFrame:start,sourceDurationInFrames:duration};});
    case "CHANGE_VIDEO_SOURCE_POLICY": return updateItem(state,action.itemId,(item)=>isVideo(item)?{...item,sourceUsagePolicy:action.policy}:item);
    case "CHANGE_AUDIO_MUTED": return updateItem(state,action.itemId,(item)=>isAudio(item)?{...item,muted:action.muted}:item);
    case "CHANGE_AUDIO_LOOP": return updateItem(state,action.itemId,(item)=>isAudio(item)?{...item,loop:action.loop}:item);
    case "CHANGE_AUDIO_FADES": return updateItem(state,action.itemId,(item)=>isAudio(item)?{...item,fadeInFrames:Math.max(0,Math.round(action.fadeInFrames??item.fadeInFrames)),fadeOutFrames:Math.max(0,Math.round(action.fadeOutFrames??item.fadeOutFrames))}:item);
    case "UPDATE_TEXT": return updateItem(state,action.itemId,(item)=>(item.type==="TEXT"||item.type==="SUBTITLE")?{...item,text:action.text}:item);
    case "UPDATE_SUBTITLE_STYLE": return updateItem(state,action.itemId,(item)=>item.type==="SUBTITLE"?{...item,...action.patch}:item);
    case "UPDATE_TEXT_STYLE": return updateItem(state,action.itemId,(item)=>item.type==="TEXT"?{...item,...action.patch}:item);
    case "UPDATE_GRAPHIC_STYLE": return updateItem(state,action.itemId,(item)=>item.type==="GRAPHIC"?{...item,...action.patch}:item);
    case "UPDATE_TRANSFORM": return updateItem(state,action.itemId,(item)=>(item.type==="VIDEO"||item.type==="IMAGE")?{...item,...action.patch}:item);
    case "ADD_TRACK": return state.project.tracks.some((track)=>track.id===action.track.id)?state:{...state,project:{...state.project,tracks:[...state.project.tracks,action.track].sort((a,b)=>a.order-b.order)}};
    case "ADD_ITEM": return state.project.items.some((item)=>item.id===action.item.id)?state:{...state,project:{...state.project,items:[...state.project.items,normalizeItem(action.item)]}};
    case "REPLACE_SUBTITLE_ITEMS": return {...state,project:{...state.project,items:[...state.project.items.filter((item)=>item.type!=="SUBTITLE"),...action.items]}};
    case "DELETE_ITEM": return {...state,project:{...state.project,items:state.project.items.filter((item)=>item.id!==action.itemId)},selectedItemIds:state.selectedItemIds.filter((id)=>id!==action.itemId)};
    case "DUPLICATE_ITEM": {const source=state.project.items.find((item)=>item.id===action.itemId);if(!source)return state;const copy=normalizeItem({...source,id:action.newItemId,timelineStartFrame:action.timelineStartFrame??source.timelineStartFrame,trackId:action.trackId??source.trackId} as TimelineItem);return {...state,project:{...state.project,items:[...state.project.items,copy]},selectedItemIds:[copy.id]};}
    case "SPLIT_AUDIO_ITEM": {const source=state.project.items.find((item)=>item.id===action.itemId);if(!source||!isAudio(source)||state.project.items.some((item)=>item.id===action.newItemId))return state;const offset=Math.round(action.splitFrame-source.timelineStartFrame);if(offset<=0||offset>=source.durationInFrames)return state;const first={...source,durationInFrames:offset,sourceDurationInFrames:Math.min(source.sourceDurationInFrames,offset)};const second={...source,id:action.newItemId,timelineStartFrame:action.splitFrame,durationInFrames:source.durationInFrames-offset,sourceStartFrame:source.sourceStartFrame+offset,sourceDurationInFrames:Math.max(1,source.sourceDurationInFrames-offset)};return {...state,project:{...state.project,items:state.project.items.flatMap((item)=>item.id===source.id?[first,second]:[item])},selectedItemIds:[second.id]};}
    case "SPLIT_SUBTITLE_ITEM": {const source=state.project.items.find((item)=>item.id===action.itemId);if(!source||!isSubtitle(source)||source.locked||state.project.items.some((item)=>item.id===action.newItemId))return state;const offset=Math.round(action.splitFrame-source.timelineStartFrame);if(offset<=0||offset>=source.durationInFrames)return state;const first={...source,durationInFrames:offset};const second={...source,id:action.newItemId,timelineStartFrame:source.timelineStartFrame+offset,durationInFrames:source.durationInFrames-offset};return {...state,project:{...state.project,items:state.project.items.flatMap((item)=>item.id===source.id?[first,second]:[item])},selectedItemIds:[second.id]};}
    case "MERGE_SUBTITLE_ITEMS": {const first=state.project.items.find((item)=>item.id===action.itemId);const second=state.project.items.find((item)=>item.id===action.nextItemId);if(!first||!second||!isSubtitle(first)||!isSubtitle(second)||first.locked||second.locked||first.trackId!==second.trackId||first.id===second.id)return state;const start=Math.min(first.timelineStartFrame,second.timelineStartFrame);const end=Math.max(first.timelineStartFrame+first.durationInFrames,second.timelineStartFrame+second.durationInFrames);const text=[first.text.trim(),second.text.trim()].filter(Boolean).join(" ");const generatedFromTtsIds=[...new Set([...(first.generatedFromTtsIds??[]),...(second.generatedFromTtsIds??[])])];const merged={...first,timelineStartFrame:start,durationInFrames:Math.max(1,end-start),text,...(generatedFromTtsIds.length?{generatedFromTtsIds}:{})};return {...state,project:{...state.project,items:state.project.items.filter((item)=>item.id!==second.id).map((item)=>item.id===first.id?merged:item)},selectedItemIds:[first.id]};}
    case "SET_PLAYHEAD": return {...state,playheadFrame:Math.min(state.project.project.durationInFrames-1,Math.max(0,Math.round(action.frame)))};
    case "SET_TIMELINE_ZOOM": return {...state,project:{...state.project,settings:{...state.project.settings,timelineZoom:clamp(action.zoom,0.05,100)}}};
    case "SET_SNAP": return {...state,project:{...state.project,settings:{...state.project.settings,snapEnabled:action.enabled,snapToleranceFrames:Math.max(0,Math.round(action.toleranceFrames??state.project.settings.snapToleranceFrames))}}};
    default: return state;
  }
};
