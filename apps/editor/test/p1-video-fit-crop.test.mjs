import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");

test("P1-05 Inspector exposes video fit, crop position, reset and vertical preset",async()=>{const inspector=await read("src/studio/editor/inspector/Inspector.tsx");for(const token of ["data-editor-video-fit","data-editor-video-crop-x","data-editor-video-crop-y","data-editor-video-crop-scale","data-editor-command=\"reset-video-crop\"","data-editor-command=\"vertical-video-preset\"","changeVideoFit","updateTransform","beginEditTransaction","endEditTransaction"])assert.ok(inspector.includes(token),`missing ${token}`);});

test("P1-05 presets are generic centered cover values",async()=>{const preset=await read("src/studio/editor/videoFitCrop.ts");assert.match(preset,/VIDEO_CROP_RESET.*fit:\"cover\",x:0,y:0,scale:1/);assert.match(preset,/VIDEO_VERTICAL_CENTER_COVER.*fit:\"cover\",x:0,y:0,scale:1/);assert.doesNotMatch(preset,/roman|pilot_short/i);});

test("P1-05 final renderer applies fit and crop transform without changing media source window",async()=>{const renderer=await read("src/editor/VideoItemRenderer.tsx");assert.match(renderer,/objectFit=\{item\.fit\}/);assert.match(renderer,/translate\(\$\{item\.x\}px, \$\{item\.y\}px\) scale\(\$\{item\.scale\}\)/);assert.match(renderer,/trimBefore=\{item\.sourceStartFrame\}/);assert.match(renderer,/trimAfter=\{item\.sourceStartFrame\+item\.sourceDurationInFrames\}/);});
