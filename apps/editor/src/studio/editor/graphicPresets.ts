import type {EditorProjectMetadata,GraphicTimelineItem,GraphicType} from "./editorTypes";

export type ShortsGraphicRegion="TOP"|"STORY"|"BOTTOM";
export const SHORTS_GRAPHIC_REGIONS:{id:ShortsGraphicRegion;label:string;startRatio:number;endRatio:number}[]=[
  {id:"TOP",label:"Top 0–18%",startRatio:0,endRatio:.18},
  {id:"STORY",label:"Story 18–72%",startRatio:.18,endRatio:.72},
  {id:"BOTTOM",label:"Bottom 74–100%",startRatio:.74,endRatio:1},
];

const styleFor=(graphicType:GraphicType):Pick<GraphicTimelineItem,"opacity"|"blurPx"|"backgroundColor"|"borderRadius"|"gradientStartColor"|"gradientEndColor"|"gradientAngleDeg">=>{
  if(graphicType==="BLUR_PANEL")return{opacity:1,blurPx:18,backgroundColor:"rgba(8,12,18,0.30)",borderRadius:0,gradientStartColor:"rgba(0,0,0,0)",gradientEndColor:"rgba(0,0,0,0)",gradientAngleDeg:180};
  if(graphicType==="GRADIENT")return{opacity:1,blurPx:0,backgroundColor:"rgba(0,0,0,0)",borderRadius:0,gradientStartColor:"rgba(0,0,0,0)",gradientEndColor:"rgba(0,0,0,0.78)",gradientAngleDeg:180};
  if(graphicType==="DIM_LAYER")return{opacity:.35,blurPx:0,backgroundColor:"#000000",borderRadius:0,gradientStartColor:"rgba(0,0,0,0)",gradientEndColor:"rgba(0,0,0,0)",gradientAngleDeg:180};
  return{opacity:.72,blurPx:0,backgroundColor:"#17191C",borderRadius:20,gradientStartColor:"rgba(0,0,0,0)",gradientEndColor:"rgba(0,0,0,0)",gradientAngleDeg:180};
};

export const shortsGraphicRegionPatch=(region:ShortsGraphicRegion,project:EditorProjectMetadata)=>{const spec=SHORTS_GRAPHIC_REGIONS.find((candidate)=>candidate.id===region)!;return{x:0,y:Math.round(project.height*spec.startRatio),width:project.width,height:Math.max(1,Math.round(project.height*(spec.endRatio-spec.startRatio)))};};

export const createGraphicItem=(args:{id:string;trackId:string;graphicType:GraphicType;timelineStartFrame:number;durationInFrames:number;project:EditorProjectMetadata}):GraphicTimelineItem=>({id:args.id,type:"GRAPHIC",trackId:args.trackId,timelineStartFrame:Math.max(0,Math.round(args.timelineStartFrame)),durationInFrames:Math.max(1,Math.round(args.durationInFrames)),enabled:true,locked:false,graphicType:args.graphicType,...shortsGraphicRegionPatch("BOTTOM",args.project),...styleFor(args.graphicType)});
