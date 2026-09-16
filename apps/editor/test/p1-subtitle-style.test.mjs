import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");
const importTs=async(path)=>{const source=await read(path);const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);};

test("P1-08 subtitle style editor exposes full typography position background and preset controls",async()=>{const editor=await read("src/studio/editor/subtitles/SubtitleStyleEditor.tsx");for(const token of ["data-editor-subtitle-font-family","data-editor-subtitle-font-size","data-editor-subtitle-font-weight","data-editor-subtitle-fill","data-editor-subtitle-stroke","data-editor-subtitle-stroke-width","data-editor-subtitle-align","data-editor-subtitle-line-height","data-editor-subtitle-width","data-editor-subtitle-max-lines","data-editor-subtitle-x","data-editor-subtitle-y","data-editor-subtitle-background-enabled","data-editor-subtitle-preset","save-subtitle-preset","apply-custom-subtitle-preset"])assert.ok(editor.includes(token),`missing ${token}`);});

test("P1-08 subtitle presets are data driven and custom preset serialization roundtrips",async()=>{const {SUBTITLE_STYLE_PRESETS,serializeSubtitleStylePreset,parseSubtitleStylePreset}=await importTs("src/studio/editor/subtitleStylePresets.ts");assert.ok(SUBTITLE_STYLE_PRESETS.length>=3);const item={x:540,y:1650,width:900,fontFamily:"KoddiUD OnGothic",fontSize:60,fontWeight:700,color:"#fff",strokeColor:"#000",strokeWidth:4,textAlign:"center",lineHeight:1.1,maxLines:2,backgroundEnabled:false,backgroundColor:"#000",backgroundOpacity:.4};const parsed=parseSubtitleStylePreset(serializeSubtitleStylePreset(item));assert.equal(parsed.fontFamily,item.fontFamily);assert.equal(parsed.x,540);assert.equal(parsed.maxLines,2);assert.equal(parseSubtitleStylePreset("not-json"),null);});

test("P1-08 Inspector delegates subtitle styling to the full style editor",async()=>{const inspector=await read("src/studio/editor/inspector/Inspector.tsx");assert.match(inspector,/SubtitleStyleEditor/);assert.match(inspector,/<SubtitleStyleEditor item=\{subtitle\}\/>/);});
