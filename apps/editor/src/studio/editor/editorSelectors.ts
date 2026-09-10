import type {EditorState, TimelineItem} from "./editorTypes";

export const selectSelectedItems=(state:EditorState):TimelineItem[]=>state.selectedItemIds.map((id)=>state.project.items.find((item)=>item.id===id)).filter((item):item is TimelineItem=>item!==undefined);
export const selectPrimaryItem=(state:EditorState):TimelineItem|null=>selectSelectedItems(state)[0]??null;
export const selectItemsForTrack=(state:EditorState,trackId:string):TimelineItem[]=>state.project.items.filter((item)=>item.trackId===trackId).sort((a,b)=>a.timelineStartFrame-b.timelineStartFrame);
