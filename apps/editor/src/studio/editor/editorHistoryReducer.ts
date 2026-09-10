import type {EditorAction} from "./editorActions";
import {createEditorState, editorReducer as baseEditorReducer} from "./editorReducer";
import type {EditProject, EditorState} from "./editorTypes";

const MAX_HISTORY_ENTRIES=100;
const projectJson=(project:EditProject)=>JSON.stringify(project);
const dirty=(state:EditorState):EditorState=>({...state,dirty:projectJson(state.project)!==state.savedProjectJson});
const push=(past:EditProject[],project:EditProject)=>[...past,project].slice(-MAX_HISTORY_ENTRIES);

export const editorHistoryReducer=(state:EditorState,action:EditorAction):EditorState=>{
  if(action.type==="LOAD_PROJECT")return createEditorState(action.project);
  if(action.type==="MARK_SAVED")return {...state,savedProjectJson:projectJson(state.project),dirty:false};
  if(action.type==="BEGIN_EDIT_TRANSACTION")return state.history.transactionBase?state:{...state,history:{...state.history,transactionBase:state.project}};
  if(action.type==="END_EDIT_TRANSACTION"){
    const base=state.history.transactionBase;if(!base)return state;const changed=projectJson(base)!==projectJson(state.project);
    return dirty({...state,history:{past:changed?push(state.history.past,base):state.history.past,future:changed?[]:state.history.future,transactionBase:null}});
  }
  if(action.type==="UNDO"){
    const previous=state.history.transactionBase??state.history.past.at(-1);if(!previous)return state;
    return dirty({...state,project:previous,selectedItemIds:state.selectedItemIds.filter((id)=>previous.items.some((item)=>item.id===id)),history:{past:state.history.transactionBase?state.history.past:state.history.past.slice(0,-1),future:[state.project,...state.history.future].slice(0,MAX_HISTORY_ENTRIES),transactionBase:null}});
  }
  if(action.type==="REDO"){
    const next=state.history.future[0];if(!next)return state;
    return dirty({...state,project:next,selectedItemIds:state.selectedItemIds.filter((id)=>next.items.some((item)=>item.id===id)),history:{past:push(state.history.past,state.project),future:state.history.future.slice(1),transactionBase:null}});
  }
  const next=baseEditorReducer(state,action);if(next.project===state.project)return next;
  if(state.history.transactionBase)return dirty({...next,history:state.history});
  return dirty({...next,history:{past:push(state.history.past,state.project),future:[],transactionBase:null}});
};
