import type {FC} from "react";
import {useRemotionEnvironment} from "remotion";
import {selectPrimaryItem} from "../editorSelectors";
import {useStudioEditor} from "../StudioEditorContext";
export const StudioGraphicsCanvasOverlay:FC=()=>{const {isStudio,isReadOnlyStudio}=useRemotionEnvironment();const {state}=useStudioEditor();const item=selectPrimaryItem(state);if(!isStudio||isReadOnlyStudio||!item||item.type!=="GRAPHIC")return null;return <div data-editor-graphic-selection style={{position:"absolute",left:item.x,top:item.y,width:item.width,height:item.height,border:"2px dashed #fff4bd",pointerEvents:"none",zIndex:999}}/>;};
