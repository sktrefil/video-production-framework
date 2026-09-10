export type TimelineItemType =
  | "VIDEO" | "IMAGE" | "TTS" | "CLIP_AUDIO" | "BGM" | "SFX"
  | "SUBTITLE" | "TEXT" | "GRAPHIC";

export type TrackType = "VIDEO" | "AUDIO" | "TEXT" | "GRAPHIC";

export type EditorTrack = {id:string; type:TrackType; name:string; enabled:boolean; locked:boolean; order:number};
export type EditorProjectMetadata = {id:string; name:string; fps:number; width:number; height:number; durationInFrames:number};
export type EditorProjectSettings = {snapEnabled:boolean; snapToleranceFrames:number; timelineZoom:number; masterVolume:number};
export type BaseTimelineItem = {id:string; type:TimelineItemType; trackId:string; timelineStartFrame:number; durationInFrames:number; enabled:boolean; locked:boolean; zIndex?:number};
export type MediaSourceWindow = {src:string; sourceStartFrame:number; sourceDurationInFrames:number; sourceAssetDurationInFrames:number};
export type VideoTimelineItem = BaseTimelineItem & MediaSourceWindow & {type:"VIDEO"; playbackRate:number; volume:number; x:number; y:number; scale:number; rotation:number; opacity:number; fit:"cover"|"contain"};
export type ImageMotionEasing = "LINEAR" | "EASE_IN_OUT";
export type ImageMotionTransform = {x:number; y:number; scale:number; rotation:number; opacity:number};
export type ImageMotionSpec = {kind:"TRANSFORM"; from:ImageMotionTransform; to:ImageMotionTransform; easing:ImageMotionEasing};
export type ImageTimelineItem = BaseTimelineItem & {type:"IMAGE"; src:string; x:number; y:number; scale:number; rotation:number; opacity:number; fit:"cover"|"contain"; motion?:ImageMotionSpec};
export type AudioTimelineItem = BaseTimelineItem & MediaSourceWindow & {type:"TTS"|"CLIP_AUDIO"|"BGM"|"SFX"; volume:number; muted:boolean; fadeInFrames:number; fadeOutFrames:number; loop?:boolean};
export type TextStyleFields = {text:string; x:number; y:number; width:number; fontFamily:string; fontSize:number; fontWeight:number; color:string; strokeColor:string; strokeWidth:number; textAlign:"left"|"center"|"right"; lineHeight:number; maxLines:number; backgroundEnabled:boolean; backgroundColor:string; backgroundOpacity:number};
export type SubtitleGenerationSource = "TTS_TRANSCRIBE"|"SCRIPT_TTS_ALIGN"|"SCRIPT_TIMING"|"MANUAL";
export type SubtitleTimelineItem = BaseTimelineItem & TextStyleFields & {type:"SUBTITLE"; generationSource?:SubtitleGenerationSource; generatedFromTtsIds?:string[]};
export type TextRole = "TOP_TITLE"|"LOWER_THIRD"|"SOURCE"|"LABEL"|"FREE_TEXT";
export type TextTimelineItem = BaseTimelineItem & TextStyleFields & {type:"TEXT"; textRole:TextRole};
export type GraphicType = "BLUR_PANEL"|"GRADIENT"|"SOLID_PANEL"|"DIM_LAYER";
export type GraphicTimelineItem = BaseTimelineItem & {type:"GRAPHIC"; graphicType:GraphicType; x:number; y:number; width:number; height:number; opacity:number; blurPx:number; backgroundColor:string; borderRadius:number; gradientStartColor?:string; gradientEndColor?:string; gradientAngleDeg?:number};
export type TimelineItem = VideoTimelineItem|ImageTimelineItem|AudioTimelineItem|SubtitleTimelineItem|TextTimelineItem|GraphicTimelineItem;
export type EditProject = {schemaVersion:1; project:EditorProjectMetadata; tracks:EditorTrack[]; items:TimelineItem[]; settings:EditorProjectSettings};
export type EditorHistoryState = {past:EditProject[]; future:EditProject[]; transactionBase:EditProject|null};
export type EditorState = {project:EditProject; selectedItemIds:string[]; playheadFrame:number; history:EditorHistoryState; savedProjectJson:string; dirty:boolean};
