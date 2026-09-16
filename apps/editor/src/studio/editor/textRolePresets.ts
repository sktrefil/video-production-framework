import type {TextRole,TextTimelineItem} from "./editorTypes";

export type TextRolePreset={role:TextRole;label:string;patch:Partial<Omit<TextTimelineItem,"id"|"type"|"trackId"|"timelineStartFrame"|"durationInFrames"|"enabled"|"locked"|"text">>};

export const TEXT_ROLE_PRESETS:TextRolePreset[]=[
  {role:"TOP_TITLE",label:"Top title",patch:{x:540,y:260,width:920,fontFamily:"KoddiUD OnGothic",fontSize:74,fontWeight:800,color:"#FFFFFF",strokeColor:"#17130F",strokeWidth:5,textAlign:"center",lineHeight:1.05,maxLines:2,backgroundEnabled:false,backgroundColor:"#000000",backgroundOpacity:.45,textRole:"TOP_TITLE"}},
  {role:"LOWER_THIRD",label:"Lower third",patch:{x:540,y:1380,width:900,fontFamily:"KoddiUD OnGothic",fontSize:54,fontWeight:700,color:"#FFFFFF",strokeColor:"#17130F",strokeWidth:4,textAlign:"center",lineHeight:1.08,maxLines:2,backgroundEnabled:true,backgroundColor:"#000000",backgroundOpacity:.5,textRole:"LOWER_THIRD"}},
  {role:"SOURCE",label:"Source",patch:{x:540,y:1510,width:860,fontFamily:"KoddiUD OnGothic",fontSize:38,fontWeight:600,color:"#F2F2F2",strokeColor:"#17130F",strokeWidth:3,textAlign:"center",lineHeight:1.1,maxLines:2,backgroundEnabled:true,backgroundColor:"#000000",backgroundOpacity:.42,textRole:"SOURCE"}},
  {role:"LABEL",label:"Label",patch:{x:540,y:960,width:700,fontFamily:"KoddiUD OnGothic",fontSize:46,fontWeight:700,color:"#FFFFFF",strokeColor:"#17130F",strokeWidth:4,textAlign:"center",lineHeight:1.05,maxLines:1,backgroundEnabled:true,backgroundColor:"#000000",backgroundOpacity:.45,textRole:"LABEL"}},
  {role:"FREE_TEXT",label:"Free text",patch:{x:540,y:960,width:860,fontFamily:"KoddiUD OnGothic",fontSize:50,fontWeight:700,color:"#FFFFFF",strokeColor:"#17130F",strokeWidth:4,textAlign:"center",lineHeight:1.1,maxLines:3,backgroundEnabled:false,backgroundColor:"#000000",backgroundOpacity:.4,textRole:"FREE_TEXT"}},
];

export const textRolePreset=(role:TextRole)=>TEXT_ROLE_PRESETS.find((preset)=>preset.role===role)??TEXT_ROLE_PRESETS.at(-1)!;

export const createTextRoleItem=(args:{id:string;trackId:string;role:TextRole;timelineStartFrame:number;durationInFrames:number}):TextTimelineItem=>{
  const preset=textRolePreset(args.role);
  return {id:args.id,type:"TEXT",trackId:args.trackId,timelineStartFrame:Math.max(0,Math.round(args.timelineStartFrame)),durationInFrames:Math.max(1,Math.round(args.durationInFrames)),enabled:true,locked:false,text:preset.label,...preset.patch,textRole:args.role} as TextTimelineItem;
};
