import type {FC} from "react";
import {useRemotionEnvironment} from "remotion";
import {selectPrimaryItem} from "../editorSelectors";
import {useStudioEditor} from "../StudioEditorContext";
export const StudioSubtitleCanvasOverlay:FC=()=>{const {isStudio,isReadOnlyStudio}=useRemotionEnvironment();const {state}=useStudioEditor();const item=selectPrimaryItem(state);if(!isStudio||isReadOnlyStudio||!item||item.type!=="SUBTITLE")return null;return <div data-editor-subtitle-selection style={{position:"absolute",left:item.x-item.width/2,top:item.y-120,width:item.width,height:120,border:"2px dashed #ffe0a6",pointerEvents:"none",zIndex:999}}/>;};
