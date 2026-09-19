import type {EditorAction} from "./editorActions";
import type {AudioTimelineItem, EditProject, EditorState, SubtitleTimelineItem, TimelineItem, VideoTimelineItem} from "./editorTypes";

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,Number.isFinite(value)?value:min));
const isAudio=(item:TimelineItem):item is AudioTimelineItem=>["TTS","CLIP_AUDIO","BGM","SFX"].includes(item.type);
const isVideo=(item:TimelineItem):item is VideoTimelineItem=>item.type==="VIDEO";
const isSubtitle=(item:TimelineItem):item is SubtitleTimelineItem=>item.type==="SUBTITLE";
const normalizeSubtitleEmphasis=(text:string,ranges:SubtitleTimelineItem["emphasisRanges"])=>{
  const normalized=(ranges??[]).filter((range)=>Number.isFinite(range.start)&&Number.isFinite(range.end)).map((range)=>({start:Math.max(0,Math.min(text.length,Math.round(range.start))),end:Math.max(0,Math.min(text.length,Math.round(range.end))),color:range.color.trim()||"#D79A32",enabled:range.enabled===true})).filter((range)=>range.end>range.start).sort((a,b)=>a.start-b.start||a.end-b.end).reduce<NonNullable<SubtitleTimelineItem["emphasisRanges"]>>((accepted,range)=>range.start>=(accepted.at(-1)?.end??0)?[...accepted,range]:accepted,[]);
  return normalized.length?normalized:undefined;
};
const replaceSubtitleEmphasis=(item:SubtitleTimelineItem,input:{text:string;color:string;enabled:boolean})=>{const start=input.text?item.text.indexOf(input.text):-1;return start<0?undefined:[{start,end:start+input.text.length,color:input.color.trim()||"#D79A32",enabled:input.enabled}];};

const normalizeItem=(item:TimelineItem):TimelineItem=>{
  const normalized={...item,timelineStartFrame:Math.max(0,Math.round(item.timelineStartFrame)),durationInFrames:Math.max(1,Math.round(item.durationInFrames))} as TimelineItem;
  if(isAudio(normalized)){
    const duration=normalized.durationInFrames;
    const ducking=normalized.type==="BGM"&&normalized.ducking?{enabled:normalized.ducking.enabled,duckVolume:clamp(normalized.ducking.duckVolume,0,1),attackFrames:Math.max(0,Math.round(normalized.ducking.attackFrames)),releaseFrames:Math.max(0,Math.round(normalized.ducking.releaseFrames)),minGapFrames:Math.max(0,Math.round(normalized.ducking.minGapFrames))}:normalized.ducking;
    return{...normalized,fadeInFrames:clamp(Math.round(normalized.fadeInFrames),0,duration),fadeOutFrames:clamp(Math.round(normalized.fadeOutFrames),0,duration),...(ducking?{ducking}:{})};
  }
  if(isSubtitle(normalized)){
    const emphasisRanges=normalizeSubtitleEmphasis(normalized.text,normalized.emphasisRanges);
    const {emphasisRanges:_discarded,...subtitle}=normalized;
    return{...subtitle,...(emphasisRanges?{emphasisRanges}:{})} as SubtitleTimelineItem;
  }
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

const isTrackLockedById=(state:EditorState,trackId:string)=>state.project.tracks.find((track)=>track.id===trackId)?.locked===true;
const itemLocked=(state:EditorState,item:TimelineItem)=>item.locked||isTrackLockedById(state,item.trackId);
const updateItem=(state:EditorState,itemId:string,fn:(item:TimelineItem)=>TimelineItem):EditorState=>{
  const index=state.project.items.findIndex((item)=>item.id===itemId); if(index<0)return state;const current=state.project.items[index]!;if(itemLocked(state,current))return state;
  const items=[...state.project.items]; items[index]=fn(current); return {...state,project:{...state.project,items}};
};
const updateTrack=(state:EditorState,trackId:string,fn:(track:EditProject["tracks"][number])=>EditProject["tracks"][number]):EditorState=>{
  const index=state.project.tracks.findIndex((track)=>track.id===trackId);if(index<0)return state;const tracks=[...state.project.tracks];tracks[index]=fn(tracks[index]!);return{...state,project:{...state.project,tracks}};
};
const canonicalWindow=(item:VideoTimelineItem)=>{const start=item.canonicalSourceStartFrame??item.sourceStartFrame;const duration=item.canonicalSourceDurationInFrames??item.sourceDurationInFrames;return{start,duration,end:start+duration};};
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
    case "MOVE_ITEM": {const source=state.project.items.find((item)=>item.id===action.itemId);if(!source||itemLocked(state,source)||isTrackLockedById(state,action.trackId??source.trackId))return state;return updateItem(state,action.itemId,(item)=>({...item,timelineStartFrame:Math.max(0,Math.round(action.timelineStartFrame)),trackId:action.trackId??item.trackId}));}
    case "TRIM_ITEM_START": return updateItem(state,action.itemId,(item)=>mediaTrim(item,action.deltaFrames,true));
    case "TRIM_ITEM_END": return updateItem(state,action.itemId,(item)=>mediaTrim(item,action.deltaFrames,false));
    case "CHANGE_ITEM_DURATION": return updateItem(state,action.itemId,(item)=>({...item,durationInFrames:Math.max(1,Math.round(action.durationInFrames))}));
    case "CHANGE_PLAYBACK_RATE": return updateItem(state,action.itemId,(item)=>isVideo(item)?{...item,playbackRate:clamp(action.playbackRate,0.0625,16)}:item);
    case "CHANGE_VOLUME": return updateItem(state,action.itemId,(item)=>(isAudio(item)||isVideo(item))?{...item,volume:Math.max(0,action.volume)}:item);
    case "CHANGE_VIDEO_FIT": return updateItem(state,action.itemId,(item)=>isVideo(item)?{...item,fit:action.fit}:item);
    case "CHANGE_VIDEO_SOURCE_WINDOW": return updateItem(state,action.itemId,(item)=>{if(!isVideo(item))return item;const asset=Math.max(1,item.sourceAssetDurationInFrames);const start=Math.min(asset-1,Math.max(0,Math.round(action.sourceStartFrame)));const duration=Math.min(asset-start,Math.max(1,Math.round(action.sourceDurationInFrames)));const canonical=canonicalWindow(item);if(start<canonical.start||start+duration>canonical.end)return{...item,sourceWindowApprovalRequired:true};return{...item,sourceStartFrame:start,sourceDurationInFrames:duration,sourceWindowApprovalRequired:false};});
    case "CHANGE_VIDEO_SOURCE_POLICY": return updateItem(state,action.itemId,(item)=>{if(!isVideo(item))return item;const canonical=canonicalWindow(item);if(action.policy==="QC_TRIM")return{...item,sourceUsagePolicy:"QC_TRIM",sourceStartFrame:canonical.start,sourceDurationInFrames:canonical.duration,sourceWindowApprovalRequired:false};if(action.policy==="FULL_SOURCE"){if(canonical.start===0&&canonical.duration===item.sourceAssetDurationInFrames)return{...item,sourceUsagePolicy:"FULL_SOURCE",sourceStartFrame:0,sourceDurationInFrames:item.sourceAssetDurationInFrames,sourceWindowApprovalRequired:false};return{...item,sourceUsagePolicy:"FULL_SOURCE",sourceWindowApprovalRequired:true};}const designedDuration=Math.max(1,Math.round(item.durationInFrames*item.playbackRate));if(designedDuration<=canonical.duration)return{...item,sourceUsagePolicy:"DESIGNED_DURATION",sourceStartFrame:canonical.start,sourceDurationInFrames:designedDuration,sourceWindowApprovalRequired:false};return{...item,sourceUsagePolicy:"DESIGNED_DURATION",sourceWindowApprovalRequired:true};});
    case "CHANGE_AUDIO_MUTED": return updateItem(state,action.itemId,(item)=>isAudio(item)?{...item,muted:action.muted}:item);
    case "CHANGE_AUDIO_LOOP": return updateItem(state,action.itemId,(item)=>isAudio(item)?{...item,loop:action.loop}:item);
    case "CHANGE_AUDIO_FADES": return updateItem(state,action.itemId,(item)=>isAudio(item)?{...item,fadeInFrames:clamp(Math.round(action.fadeInFrames??item.fadeInFrames),0,item.durationInFrames),fadeOutFrames:clamp(Math.round(action.fadeOutFrames??item.fadeOutFrames),0,item.durationInFrames)}:item);
    case "CHANGE_AUDIO_DUCKING": return updateItem(state,action.itemId,(item)=>{if(item.type!=="BGM")return item;const current=item.ducking??{enabled:false,duckVolume:.25,attackFrames:6,releaseFrames:10,minGapFrames:4};return{...item,ducking:{enabled:action.patch.enabled??current.enabled,duckVolume:clamp(action.patch.duckVolume??current.duckVolume,0,1),attackFrames:Math.max(0,Math.round(action.patch.attackFrames??current.attackFrames)),releaseFrames:Math.max(0,Math.round(action.patch.releaseFrames??current.releaseFrames)),minGapFrames:Math.max(0,Math.round(action.patch.minGapFrames??current.minGapFrames))}};});
    case "UPDATE_TEXT": return updateItem(state,action.itemId,(item)=>{if(item.type==="TEXT")return{...item,text:action.text};if(item.type!=="SUBTITLE")return item;const {emphasisRanges:_discarded,...subtitle}=item;return{...subtitle,text:action.text};});
    case "SET_SUBTITLE_EMPHASIS": return updateItem(state,action.itemId,(item)=>{if(item.type!=="SUBTITLE")return item;const emphasisRanges=replaceSubtitleEmphasis(item,{text:action.text,color:action.color,enabled:action.enabled});const {emphasisRanges:_discarded,...subtitle}=item;return{...subtitle,...(emphasisRanges?{emphasisRanges}:{})};});
    case "UPDATE_SUBTITLE_STYLE": return updateItem(state,action.itemId,(item)=>item.type==="SUBTITLE"?{...item,...action.patch}:item);
    case "UPDATE_TEXT_STYLE": return updateItem(state,action.itemId,(item)=>item.type==="TEXT"?{...item,...action.patch}:item);
    case "UPDATE_GRAPHIC_STYLE": return updateItem(state,action.itemId,(item)=>item.type==="GRAPHIC"?{...item,...action.patch}:item);
    case "UPDATE_TRANSFORM": return updateItem(state,action.itemId,(item)=>(item.type==="VIDEO"||item.type==="IMAGE")?{...item,...action.patch}:item);
    case "ADD_TRACK": return state.project.tracks.some((track)=>track.id===action.track.id)?state:{...state,project:{...state.project,tracks:[...state.project.tracks,action.track].sort((a,b)=>a.order-b.order)}};
    case "ADD_ITEM": return state.project.items.some((item)=>item.id===action.item.id)||isTrackLockedById(state,action.item.trackId)?state:{...state,project:{...state.project,items:[...state.project.items,normalizeItem(action.item)]}};
    case "SET_TRACK_LOCKED": return updateTrack(state,action.trackId,(track)=>({...track,locked:action.locked}));
    case "SET_TRACK_ENABLED": return updateTrack(state,action.trackId,(track)=>({...track,enabled:action.enabled}));
    case "SET_TRACK_MUTED": return updateTrack(state,action.trackId,(track)=>track.type==="AUDIO"?{...track,muted:action.muted}:track);
    case "SET_TRACK_SOLO": return updateTrack(state,action.trackId,(track)=>track.type==="AUDIO"?{...track,solo:action.solo}:track);
    case "REPLACE_SUBTITLE_ITEMS": {const lockedExisting=state.project.items.some((item)=>item.type==="SUBTITLE"&&itemLocked(state,item));const lockedIncoming=action.items.some((item)=>isTrackLockedById(state,item.trackId));if(lockedExisting||lockedIncoming)return state;return{...state,project:{...state.project,items:[...state.project.items.filter((item)=>item.type!=="SUBTITLE"),...action.items]}};}
    case "APPLY_SUBTITLE_SYNC": {const changes=new Map(action.changes.map(change=>[change.itemId,change]));let changed=false;const items=state.project.items.map(item=>{const timing=changes.get(item.id);if(!timing||!isSubtitle(item)||itemLocked(state,item))return item;changed=true;return{...item,timelineStartFrame:Math.max(0,Math.round(timing.timelineStartFrame)),durationInFrames:Math.max(1,Math.round(timing.durationInFrames)),generationSource:"TTS_TRANSCRIBE" as const};});return changed?{...state,project:{...state.project,items}}:state;}
    case "DELETE_ITEM": {const source=state.project.items.find((item)=>item.id===action.itemId);if(!source||itemLocked(state,source))return state;return{...state,project:{...state.project,items:state.project.items.filter((item)=>item.id!==action.itemId)},selectedItemIds:state.selectedItemIds.filter((id)=>id!==action.itemId)};}
    case "DUPLICATE_ITEM": {const source=state.project.items.find((item)=>item.id===action.itemId);if(!source||itemLocked(state,source)||isTrackLockedById(state,action.trackId??source.trackId))return state;const copy=normalizeItem({...source,id:action.newItemId,timelineStartFrame:action.timelineStartFrame??source.timelineStartFrame,trackId:action.trackId??source.trackId} as TimelineItem);return {...state,project:{...state.project,items:[...state.project.items,copy]},selectedItemIds:[copy.id]};}
    case "SPLIT_AUDIO_ITEM": {const source=state.project.items.find((item)=>item.id===action.itemId);if(!source||!isAudio(source)||itemLocked(state,source)||state.project.items.some((item)=>item.id===action.newItemId))return state;const offset=Math.round(action.splitFrame-source.timelineStartFrame);if(offset<=0||offset>=source.durationInFrames)return state;const first={...source,durationInFrames:offset,sourceDurationInFrames:Math.min(source.sourceDurationInFrames,offset)};const second={...source,id:action.newItemId,timelineStartFrame:action.splitFrame,durationInFrames:source.durationInFrames-offset,sourceStartFrame:source.sourceStartFrame+offset,sourceDurationInFrames:Math.max(1,source.sourceDurationInFrames-offset)};return {...state,project:{...state.project,items:state.project.items.flatMap((item)=>item.id===source.id?[first,second]:[item])},selectedItemIds:[second.id]};}
    case "SPLIT_VIDEO_ITEM": {const source=state.project.items.find((item)=>item.id===action.itemId);if(!source||!isVideo(source)||itemLocked(state,source)||source.sourceWindowApprovalRequired===true||source.sourceDurationInFrames<=1||state.project.items.some((item)=>item.id===action.newItemId))return state;const splitFrame=Math.round(action.splitFrame);const offset=splitFrame-source.timelineStartFrame;if(offset<=0||offset>=source.durationInFrames)return state;const sourceOffset=Math.min(source.sourceDurationInFrames-1,Math.max(1,Math.round(offset*source.playbackRate)));const first={...source,durationInFrames:offset,sourceDurationInFrames:sourceOffset,canonicalSourceStartFrame:source.sourceStartFrame,canonicalSourceDurationInFrames:sourceOffset,sourceWindowApprovalRequired:false};const second={...source,id:action.newItemId,timelineStartFrame:splitFrame,durationInFrames:source.durationInFrames-offset,sourceStartFrame:source.sourceStartFrame+sourceOffset,sourceDurationInFrames:source.sourceDurationInFrames-sourceOffset,canonicalSourceStartFrame:source.sourceStartFrame+sourceOffset,canonicalSourceDurationInFrames:source.sourceDurationInFrames-sourceOffset,sourceWindowApprovalRequired:false};return{...state,project:{...state.project,items:state.project.items.flatMap((item)=>item.id===source.id?[first,second]:[item])},selectedItemIds:[second.id]};}
    case "SPLIT_SUBTITLE_ITEM": {const source=state.project.items.find((item)=>item.id===action.itemId);if(!source||!isSubtitle(source)||itemLocked(state,source)||state.project.items.some((item)=>item.id===action.newItemId))return state;const offset=Math.round(action.splitFrame-source.timelineStartFrame);if(offset<=0||offset>=source.durationInFrames)return state;const first={...source,durationInFrames:offset};const second={...source,id:action.newItemId,timelineStartFrame:source.timelineStartFrame+offset,durationInFrames:source.durationInFrames-offset};return {...state,project:{...state.project,items:state.project.items.flatMap((item)=>item.id===source.id?[first,second]:[item])},selectedItemIds:[second.id]};}
    case "MERGE_SUBTITLE_ITEMS": {const first=state.project.items.find((item)=>item.id===action.itemId);const second=state.project.items.find((item)=>item.id===action.nextItemId);if(!first||!second||!isSubtitle(first)||!isSubtitle(second)||itemLocked(state,first)||itemLocked(state,second)||first.trackId!==second.trackId||first.id===second.id)return state;const start=Math.min(first.timelineStartFrame,second.timelineStartFrame);const end=Math.max(first.timelineStartFrame+first.durationInFrames,second.timelineStartFrame+second.durationInFrames);const text=[first.text.trim(),second.text.trim()].filter(Boolean).join(" ");const generatedFromTtsIds=[...new Set([...(first.generatedFromTtsIds??[]),...(second.generatedFromTtsIds??[])])];const merged={...first,timelineStartFrame:start,durationInFrames:Math.max(1,end-start),text,...(generatedFromTtsIds.length?{generatedFromTtsIds}:{})};return {...state,project:{...state.project,items:state.project.items.filter((item)=>item.id!==second.id).map((item)=>item.id===first.id?merged:item)},selectedItemIds:[first.id]};}
    case "SET_PLAYHEAD": return {...state,playheadFrame:Math.min(state.project.project.durationInFrames-1,Math.max(0,Math.round(action.frame)))};
    case "SET_TIMELINE_ZOOM": return {...state,project:{...state.project,settings:{...state.project.settings,timelineZoom:clamp(action.zoom,0.05,100)}}};
    case "SET_SNAP": return {...state,project:{...state.project,settings:{...state.project.settings,snapEnabled:action.enabled,snapToleranceFrames:Math.max(0,Math.round(action.toleranceFrames??state.project.settings.snapToleranceFrames))}}};
    default: return state;
  }
};
