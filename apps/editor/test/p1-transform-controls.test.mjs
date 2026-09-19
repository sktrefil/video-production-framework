import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");
const importTs=async(path)=>{const source=await read(path);const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);};

test("P1-06 transform helper clamps scale and opacity and exposes reset",async()=>{const {RESET_TRANSFORM,normalizeTransformValue}=await importTs("src/studio/editor/transformControls.ts");assert.deepEqual(RESET_TRANSFORM,{x:0,y:0,scale:1,rotation:0,opacity:1});assert.equal(normalizeTransformValue("scale",0),.01);assert.equal(normalizeTransformValue("opacity",2),1);assert.equal(normalizeTransformValue("opacity",-1),0);assert.equal(normalizeTransformValue("rotation",35),35);});

test("P1-06 Inspector exposes full VIDEO IMAGE transform controls and reset",async()=>{const inspector=await read("src/studio/editor/inspector/Inspector.tsx");for(const token of ["data-editor-transform-x","data-editor-transform-y","data-editor-transform-scale","data-editor-transform-rotation","data-editor-transform-opacity","data-editor-command=\"reset-transform\"","RESET_TRANSFORM","normalizeTransformValue"])assert.ok(inspector.includes(token),`missing ${token}`);assert.match(inspector,/item\.type===?\"VIDEO\"|item\.type==\"VIDEO\"/);assert.match(inspector,/item\.type===?\"IMAGE\"|item\.type==\"IMAGE\"/);});

test("P1-06 preview and final render consume all transform fields",async()=>{const video=await read("src/editor/VideoItemRenderer.tsx");const project=await read("src/editor/ProjectRenderer.tsx");for(const token of ["item.x","item.y","item.scale","item.rotation","item.opacity"])assert.ok(video.includes(token),`video missing ${token}`);for(const token of ["motion.from.x","motion.from.scale","motion.from.rotation","motion.from.opacity","item.x","item.y","item.scale","item.rotation","item.opacity"])assert.ok(project.includes(token),`image missing ${token}`);});
