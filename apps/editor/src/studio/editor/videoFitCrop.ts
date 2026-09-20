import type {VideoTimelineItem} from "./editorTypes";

export type VideoFitCropPreset={fit:"cover"|"contain";x:number;y:number;scale:number};
export const VIDEO_CROP_RESET:VideoFitCropPreset={fit:"cover",x:0,y:0,scale:1};
export const VIDEO_VERTICAL_CENTER_COVER:VideoFitCropPreset={fit:"cover",x:0,y:0,scale:1};

export const videoCropSnapshot=(item:VideoTimelineItem):VideoFitCropPreset=>({fit:item.fit,x:item.x,y:item.y,scale:item.scale});
