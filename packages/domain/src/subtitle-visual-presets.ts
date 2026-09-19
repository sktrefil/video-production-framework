export type SubtitleVisualProfile={width:number;height:number};
export type SubtitleVisualStyle={x:number;y:number;width:number;fontFamily:string;fontSize:number;fontWeight:number;color:string;strokeColor:string;strokeWidth:number;textAlign:"center";lineHeight:number;maxLines:number;backgroundEnabled:false;backgroundColor:string;backgroundOpacity:number};

export const VPF_SUBTITLE_VISUAL_TOKENS={
  fontFamily:"VPF Noto Sans KR",
  paper:"#FFFDF7",
  ink:"#17130F",
  gold:"#D79A32",
  standardShadow:"0 2px 4px rgba(0,0,0,0.95)",
  cinematicShadow:"0 3px 8px rgba(0,0,0,0.98), 0 1px 2px rgba(0,0,0,1)"
} as const;

// Existing canonical look. Kept as a named generic preset while the cinematic
// preset is introduced, so callers never need Roman IX-specific constants.
export const standardSubtitleStyle=(profile:SubtitleVisualProfile):SubtitleVisualStyle=>({
  x:Math.round(profile.width*.5),y:Math.round(profile.height*.859375),width:Math.round(profile.width*(5/6)),fontFamily:VPF_SUBTITLE_VISUAL_TOKENS.fontFamily,fontSize:Math.round(Math.min(profile.width,profile.height)/12),fontWeight:700,color:"#FFFFFF",strokeColor:VPF_SUBTITLE_VISUAL_TOKENS.ink,strokeWidth:4,textAlign:"center",lineHeight:1.16,maxLines:2,backgroundEnabled:false,backgroundColor:"#000000",backgroundOpacity:.4
});

export const cinematicShortsSubtitleStyle=(profile:SubtitleVisualProfile):SubtitleVisualStyle=>({
  x:Math.round(profile.width*.5),y:Math.round(profile.height*.92),width:Math.round(profile.width*.9),fontFamily:VPF_SUBTITLE_VISUAL_TOKENS.fontFamily,fontSize:Math.round(Math.min(profile.width,profile.height)/10.8),fontWeight:800,color:VPF_SUBTITLE_VISUAL_TOKENS.paper,strokeColor:VPF_SUBTITLE_VISUAL_TOKENS.ink,strokeWidth:6,textAlign:"center",lineHeight:1.06,maxLines:2,backgroundEnabled:false,backgroundColor:"#000000",backgroundOpacity:.4
});
