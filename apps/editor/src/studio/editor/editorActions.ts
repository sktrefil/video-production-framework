import type {AudioDuckingSettings,EditProject, EditorTrack, GraphicTimelineItem, SubtitleTimelineItem, TextTimelineItem, TimelineItem, VideoSourceUsagePolicy} from "./editorTypes";

export type TransformPatch = Partial<{x:number; y:number; scale:number; rotation:number; opacity:number}>;
export type TextOverlayStylePatch = Partial<Pick<TextTimelineItem,"x"|"y"|"width"|"fontFamily"|"fontSize"|"fontWeight"|"color"|"strokeColor"|"strokeWidth"|"textAlign"|"lineHeight"|"maxLines"|"backgroundEnabled"|"backgroundColor"|"backgroundOpacity"|"textRole">>;
export type GraphicStylePatch = Partial<Pick<GraphicTimelineItem,"graphicType"|"x"|"y"|"width"|"height"|"opacity"|"blurPx"|"backgroundColor"|"borderRadius"|"gradientStartColor"|"gradientEndColor"|"gradientAngleDeg">>;
export type SubtitleStylePatch = Partial<Pick<SubtitleTimelineItem,"x"|"y"|"width"|"fontFamily"|"fontSize"|"fontWeight"|"color"|"strokeColor"|"strokeWidth"|"textAlign"|"lineHeight"|"maxLines"|"backgroundEnabled"|"backgroundColor"|"backgroundOpacity">>;
export type SubtitleTimingChange={itemId:string;timelineStartFrame:number;durationInFrames:number};

export type EditorAction =
  | {type:"LOAD_PROJECT"; project:EditProject} | {type:"MARK_SAVED"} | {type:"UNDO"} | {type:"REDO"}
  | {type:"BEGIN_EDIT_TRANSACTION"} | {type:"END_EDIT_TRANSACTION"}
  | {type:"SELECT_ITEM"; itemIds:string[]}
  | {type:"MOVE_ITEM"; itemId:string; timelineStartFrame:number; trackId?:string}
  | {type:"TRIM_ITEM_START"; itemId:string; deltaFrames:number} | {type:"TRIM_ITEM_END"; itemId:string; deltaFrames:number}
  | {type:"CHANGE_ITEM_DURATION"; itemId:string; durationInFrames:number}
  | {type:"CHANGE_PLAYBACK_RATE"; itemId:string; playbackRate:number} | {type:"CHANGE_VOLUME"; itemId:string; volume:number}
  | {type:"CHANGE_VIDEO_FIT"; itemId:string; fit:"cover"|"contain"}
  | {type:"CHANGE_VIDEO_SOURCE_WINDOW"; itemId:string; sourceStartFrame:number; sourceDurationInFrames:number}
  | {type:"CHANGE_VIDEO_SOURCE_POLICY"; itemId:string; policy:VideoSourceUsagePolicy}
  | {type:"CHANGE_AUDIO_MUTED"; itemId:string; muted:boolean} | {type:"CHANGE_AUDIO_LOOP"; itemId:string; loop:boolean}
  | {type:"CHANGE_AUDIO_FADES"; itemId:string; fadeInFrames?:number; fadeOutFrames?:number}
  | {type:"CHANGE_AUDIO_DUCKING"; itemId:string; patch:Partial<AudioDuckingSettings>}
  | {type:"UPDATE_TEXT"; itemId:string; text:string}
  | {type:"SET_SUBTITLE_EMPHASIS"; itemId:string; text:string; color:string; enabled:boolean}
  | {type:"UPDATE_SUBTITLE_STYLE"; itemId:string; patch:SubtitleStylePatch}
  | {type:"UPDATE_TEXT_STYLE"; itemId:string; patch:TextOverlayStylePatch}
  | {type:"UPDATE_GRAPHIC_STYLE"; itemId:string; patch:GraphicStylePatch}
  | {type:"UPDATE_TRANSFORM"; itemId:string; patch:TransformPatch}
  | {type:"ADD_TRACK"; track:EditorTrack} | {type:"ADD_ITEM"; item:TimelineItem}
  | {type:"SET_TRACK_LOCKED"; trackId:string; locked:boolean}
  | {type:"SET_TRACK_ENABLED"; trackId:string; enabled:boolean}
  | {type:"SET_TRACK_MUTED"; trackId:string; muted:boolean}
  | {type:"SET_TRACK_SOLO"; trackId:string; solo:boolean}
  | {type:"REPLACE_SUBTITLE_ITEMS"; items:SubtitleTimelineItem[]} | {type:"DELETE_ITEM"; itemId:string}
  | {type:"APPLY_SUBTITLE_SYNC"; changes:SubtitleTimingChange[]}
  | {type:"DUPLICATE_ITEM"; itemId:string; newItemId:string; timelineStartFrame?:number; trackId?:string}
  | {type:"SPLIT_AUDIO_ITEM"; itemId:string; splitFrame:number; newItemId:string}
  | {type:"SPLIT_VIDEO_ITEM"; itemId:string; splitFrame:number; newItemId:string}
  | {type:"SPLIT_SUBTITLE_ITEM"; itemId:string; splitFrame:number; newItemId:string}
  | {type:"MERGE_SUBTITLE_ITEMS"; itemId:string; nextItemId:string}
  | {type:"SET_PLAYHEAD"; frame:number} | {type:"SET_TIMELINE_ZOOM"; zoom:number}
  | {type:"SET_SNAP"; enabled:boolean; toleranceFrames?:number};

export const editorActions = {
  loadProject:(project:EditProject):EditorAction=>({type:"LOAD_PROJECT",project}), markSaved:():EditorAction=>({type:"MARK_SAVED"}),
  undo:():EditorAction=>({type:"UNDO"}), redo:():EditorAction=>({type:"REDO"}), beginEditTransaction:():EditorAction=>({type:"BEGIN_EDIT_TRANSACTION"}), endEditTransaction:():EditorAction=>({type:"END_EDIT_TRANSACTION"}),
  selectItem:(itemIds:string[]):EditorAction=>({type:"SELECT_ITEM",itemIds}), moveItem:(itemId:string,timelineStartFrame:number,trackId?:string):EditorAction=>({type:"MOVE_ITEM",itemId,timelineStartFrame,trackId}),
  trimItemStart:(itemId:string,deltaFrames:number):EditorAction=>({type:"TRIM_ITEM_START",itemId,deltaFrames}), trimItemEnd:(itemId:string,deltaFrames:number):EditorAction=>({type:"TRIM_ITEM_END",itemId,deltaFrames}),
  changeItemDuration:(itemId:string,durationInFrames:number):EditorAction=>({type:"CHANGE_ITEM_DURATION",itemId,durationInFrames}), changePlaybackRate:(itemId:string,playbackRate:number):EditorAction=>({type:"CHANGE_PLAYBACK_RATE",itemId,playbackRate}),
  changeVolume:(itemId:string,volume:number):EditorAction=>({type:"CHANGE_VOLUME",itemId,volume}), changeVideoFit:(itemId:string,fit:"cover"|"contain"):EditorAction=>({type:"CHANGE_VIDEO_FIT",itemId,fit}),
  changeVideoSourceWindow:(itemId:string,sourceStartFrame:number,sourceDurationInFrames:number):EditorAction=>({type:"CHANGE_VIDEO_SOURCE_WINDOW",itemId,sourceStartFrame,sourceDurationInFrames}), changeVideoSourcePolicy:(itemId:string,policy:VideoSourceUsagePolicy):EditorAction=>({type:"CHANGE_VIDEO_SOURCE_POLICY",itemId,policy}),
  changeAudioMuted:(itemId:string,muted:boolean):EditorAction=>({type:"CHANGE_AUDIO_MUTED",itemId,muted}), changeAudioLoop:(itemId:string,loop:boolean):EditorAction=>({type:"CHANGE_AUDIO_LOOP",itemId,loop}),
  changeAudioFades:(itemId:string,patch:{fadeInFrames?:number;fadeOutFrames?:number}):EditorAction=>({type:"CHANGE_AUDIO_FADES",itemId,...patch}), changeAudioDucking:(itemId:string,patch:Partial<AudioDuckingSettings>):EditorAction=>({type:"CHANGE_AUDIO_DUCKING",itemId,patch}), updateText:(itemId:string,text:string):EditorAction=>({type:"UPDATE_TEXT",itemId,text}),
  setSubtitleEmphasis:(itemId:string,input:{text:string;color:string;enabled:boolean}):EditorAction=>({type:"SET_SUBTITLE_EMPHASIS",itemId,...input}),
  updateSubtitleStyle:(itemId:string,patch:SubtitleStylePatch):EditorAction=>({type:"UPDATE_SUBTITLE_STYLE",itemId,patch}), updateTextStyle:(itemId:string,patch:TextOverlayStylePatch):EditorAction=>({type:"UPDATE_TEXT_STYLE",itemId,patch}),
  updateGraphicStyle:(itemId:string,patch:GraphicStylePatch):EditorAction=>({type:"UPDATE_GRAPHIC_STYLE",itemId,patch}), updateTransform:(itemId:string,patch:TransformPatch):EditorAction=>({type:"UPDATE_TRANSFORM",itemId,patch}),
  addTrack:(track:EditorTrack):EditorAction=>({type:"ADD_TRACK",track}), addItem:(item:TimelineItem):EditorAction=>({type:"ADD_ITEM",item}),
  setTrackLocked:(trackId:string,locked:boolean):EditorAction=>({type:"SET_TRACK_LOCKED",trackId,locked}), setTrackEnabled:(trackId:string,enabled:boolean):EditorAction=>({type:"SET_TRACK_ENABLED",trackId,enabled}), setTrackMuted:(trackId:string,muted:boolean):EditorAction=>({type:"SET_TRACK_MUTED",trackId,muted}), setTrackSolo:(trackId:string,solo:boolean):EditorAction=>({type:"SET_TRACK_SOLO",trackId,solo}),
  replaceSubtitleItems:(items:SubtitleTimelineItem[]):EditorAction=>({type:"REPLACE_SUBTITLE_ITEMS",items}),
  applySubtitleSync:(changes:SubtitleTimingChange[]):EditorAction=>({type:"APPLY_SUBTITLE_SYNC",changes}),
  deleteItem:(itemId:string):EditorAction=>({type:"DELETE_ITEM",itemId}), duplicateItem:(itemId:string,newItemId:string,timelineStartFrame?:number,trackId?:string):EditorAction=>({type:"DUPLICATE_ITEM",itemId,newItemId,timelineStartFrame,trackId}),
  splitAudioItem:(itemId:string,splitFrame:number,newItemId:string):EditorAction=>({type:"SPLIT_AUDIO_ITEM",itemId,splitFrame,newItemId}), splitVideoItem:(itemId:string,splitFrame:number,newItemId:string):EditorAction=>({type:"SPLIT_VIDEO_ITEM",itemId,splitFrame,newItemId}), splitSubtitleItem:(itemId:string,splitFrame:number,newItemId:string):EditorAction=>({type:"SPLIT_SUBTITLE_ITEM",itemId,splitFrame,newItemId}), mergeSubtitleItems:(itemId:string,nextItemId:string):EditorAction=>({type:"MERGE_SUBTITLE_ITEMS",itemId,nextItemId}),
  setPlayhead:(frame:number):EditorAction=>({type:"SET_PLAYHEAD",frame}), setTimelineZoom:(zoom:number):EditorAction=>({type:"SET_TIMELINE_ZOOM",zoom}), setSnap:(enabled:boolean,toleranceFrames?:number):EditorAction=>({type:"SET_SNAP",enabled,toleranceFrames}),
};
