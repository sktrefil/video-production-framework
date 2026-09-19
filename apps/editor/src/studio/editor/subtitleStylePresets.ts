import type {SubtitleStylePatch} from "./editorActions";
import type {SubtitleTimelineItem} from "./editorTypes";
import {cinematicShortsSubtitleStyle} from "@vpf/domain";

export type SubtitleStylePreset={id:string;label:string;patch:SubtitleStylePatch|((profile:{width:number;height:number})=>SubtitleStylePatch)};
export const SUBTITLE_STYLE_PRESETS:SubtitleStylePreset[]=[
  {id:"clean-white",label:"Clean white",patch:{fontFamily:"KoddiUD OnGothic",fontWeight:700,color:"#FFFFFF",strokeColor:"#17130F",strokeWidth:4,textAlign:"center",lineHeight:1.1,maxLines:2,backgroundEnabled:false}},
  {id:"cinematic-shorts",label:"Cinematic shorts",patch:cinematicShortsSubtitleStyle},
  {id:"yellow-emphasis",label:"Yellow emphasis",patch:{color:"#FFE45C",strokeColor:"#17130F",strokeWidth:5,backgroundEnabled:false}},
  {id:"strong-alert",label:"Strong alert",patch:{color:"#FFFFFF",strokeColor:"#000000",strokeWidth:6,backgroundEnabled:true,backgroundColor:"#E5422D",backgroundOpacity:.82}},
];
export const resolveSubtitleStylePreset=(preset:SubtitleStylePreset,profile:{width:number;height:number}):SubtitleStylePatch=>typeof preset.patch==="function"?preset.patch(profile):preset.patch;
export const CUSTOM_SUBTITLE_PRESET_KEY="vpf.editor.subtitle-style.custom.v1";
export const subtitleStylePatchFromItem=(item:SubtitleTimelineItem):SubtitleStylePatch=>({x:item.x,y:item.y,width:item.width,fontFamily:item.fontFamily,fontSize:item.fontSize,fontWeight:item.fontWeight,color:item.color,strokeColor:item.strokeColor,strokeWidth:item.strokeWidth,textAlign:item.textAlign,lineHeight:item.lineHeight,maxLines:item.maxLines,backgroundEnabled:item.backgroundEnabled,backgroundColor:item.backgroundColor,backgroundOpacity:item.backgroundOpacity});
export const serializeSubtitleStylePreset=(item:SubtitleTimelineItem)=>JSON.stringify(subtitleStylePatchFromItem(item));
export const parseSubtitleStylePreset=(value:string|null):SubtitleStylePatch|null=>{if(!value)return null;try{const parsed=JSON.parse(value);return parsed&&typeof parsed==="object"?parsed as SubtitleStylePatch:null;}catch{return null;}};
