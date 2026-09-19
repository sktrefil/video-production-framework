import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");
const transpile=async(path)=>ts.transpileModule(await read(path),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const importTs=async(path)=>import(`data:text/javascript;base64,${Buffer.from(await transpile(path)).toString("base64")}`);
const subtitle={id:"sub-1",type:"SUBTITLE",trackId:"T1",timelineStartFrame:0,durationInFrames:30,enabled:true,locked:false,text:"전해지는 곳이죠.",x:540,y:1650,width:900,fontFamily:"sans",fontSize:60,fontWeight:700,color:"#FFFFFF",strokeColor:"#000000",strokeWidth:4,textAlign:"center",lineHeight:1.1,maxLines:2,backgroundEnabled:false,backgroundColor:"#000000",backgroundOpacity:.4};
const project={schemaVersion:1,project:{id:"p",name:"p",fps:30,width:1080,height:1920,durationInFrames:120},tracks:[{id:"T1",type:"TEXT",name:"Subtitles",enabled:true,locked:false,order:0}],items:[subtitle],settings:{snapEnabled:true,snapToleranceFrames:4,timelineZoom:1,masterVolume:1}};

test("P1-13 subtitle emphasis renders only explicit authored ranges",async()=>{
  const {subtitleTextSegments}=await importTs("src/studio/editor/subtitleEmphasis.ts");
  assert.deepEqual(subtitleTextSegments(subtitle.text,undefined),[{text:subtitle.text,emphasized:false}]);
  assert.deepEqual(subtitleTextSegments(subtitle.text,[{start:5,end:9,color:"#D79A32",enabled:true}]),[{text:"전해지는 ",emphasized:false},{text:"곳이죠.",color:"#D79A32",emphasized:true}]);
  assert.deepEqual(subtitleTextSegments(subtitle.text,[{start:5,end:9,color:"#D79A32",enabled:false}]),[{text:"전해지는 ",emphasized:false},{text:"곳이죠.",color:"#D79A32",emphasized:false}]);
});

test("P1-13 emphasis survives JSON roundtrip, copy/paste, duplicate and undo/redo",async()=>{
  const {editorReducer,createEditorState}=await importTs("src/studio/editor/editorReducer.ts");
  const {captureEditorClipboard,buildPasteItems}=await importTs("src/studio/editor/clipboardCommands.ts");
  let state=createEditorState(project);
  state=editorReducer(state,{type:"SET_SUBTITLE_EMPHASIS",itemId:"sub-1",text:"곳이죠.",color:"#D79A32",enabled:true});
  const emphasized=state.project.items[0];
  assert.deepEqual(emphasized.emphasisRanges,[{start:5,end:9,color:"#D79A32",enabled:true}]);
  assert.deepEqual(createEditorState(JSON.parse(JSON.stringify(state.project))).project,state.project);
  const clipboard=captureEditorClipboard(state.project,["sub-1"]);
  assert.ok(clipboard);
  assert.deepEqual(buildPasteItems(state.project,clipboard,40,()=>"sub-copy")[0].emphasisRanges,emphasized.emphasisRanges);
  state=editorReducer(state,{type:"DUPLICATE_ITEM",itemId:"sub-1",newItemId:"sub-duplicate"});
  assert.deepEqual(state.project.items.find((item)=>item.id==="sub-duplicate").emphasisRanges,emphasized.emphasisRanges);
  const reducerUrl=`data:text/javascript;base64,${Buffer.from(await transpile("src/studio/editor/editorReducer.ts")).toString("base64")}`;
  const historyOutput=(await transpile("src/studio/editor/editorHistoryReducer.ts")).replace('from "./editorReducer";',`from "${reducerUrl}";`);
  const {editorHistoryReducer}=await import(`data:text/javascript;base64,${Buffer.from(historyOutput).toString("base64")}`);
  let historyState=createEditorState(project);
  historyState=editorHistoryReducer(historyState,{type:"SET_SUBTITLE_EMPHASIS",itemId:"sub-1",text:"곳이죠.",color:"#D79A32",enabled:true});
  historyState=editorHistoryReducer(historyState,{type:"UNDO"});
  assert.equal(historyState.project.items[0].emphasisRanges,undefined);
  historyState=editorHistoryReducer(historyState,{type:"REDO"});
  assert.deepEqual(historyState.project.items[0].emphasisRanges,[{start:5,end:9,color:"#D79A32",enabled:true}]);
});

test("P1-13 Inspector exposes exact emphasis text, color and on/off controls",async()=>{
  const [renderer,inspector,editor]=await Promise.all([read("src/editor/TextItemRenderer.tsx"),read("src/studio/editor/inspector/Inspector.tsx"),read("src/studio/editor/subtitles/SubtitleEmphasisEditor.tsx")]);
  assert.match(renderer,/subtitleTextSegments/);
  assert.match(renderer,/data-editor-subtitle-emphasis/);
  assert.match(inspector,/<SubtitleEmphasisEditor item=\{subtitle\}\/>/);
  for(const token of ["data-editor-subtitle-emphasis-text","data-editor-subtitle-emphasis-color","data-editor-subtitle-emphasis-enabled","apply-subtitle-emphasis","setSubtitleEmphasis"])assert.ok(editor.includes(token),`missing ${token}`);
});
