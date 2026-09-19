import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");

test("P1-14 Studio exposes the configured BGM library and imports a selected asset only into A3 review media",async()=>{
  const [panel,server]=await Promise.all([read("src/studio/editor/audio/AudioAssetPanel.tsx"),read("scripts/editor-studio-server.mjs")]);
  for(const token of ["data-editor-bgm-library","data-editor-bgm-library-select","add-bgm-to-a3","trackId:a3.id","type:\"BGM\"","/api/editor/bgm-library/import"])assert.ok(panel.includes(token),`missing ${token}`);
  for(const token of ["DEFAULT_BGM_LIBRARY_ROOT","VPF_BGM_LIBRARY_ROOT","BGM_LIBRARY_EXTENSIONS","bgmLibraryAssets","importBgmLibraryAsset","bgmLibraryImportEndpoint","studio-review/media/bgm"])assert.ok(server.includes(token),`missing ${token}`);
  assert.match(server,/BGM_LIBRARY_EXTENSIONS=new Set\(\["\.mp3","\.wav","\.m4a","\.aac","\.flac","\.ogg","\.opus"\]\)/);
});
