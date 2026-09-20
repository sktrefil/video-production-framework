import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../../..");
const read=(relative:string)=>readFileSync(resolve(root,relative),"utf8");

test("architecture freeze: Codex authority and worker boundaries match the master contract",()=>{
  const agents=read("AGENTS.md");
  const story=read(".codex/agents/story_audio.toml");
  const visual=read(".codex/agents/visual_image.toml");
  const config=read(".codex/config.toml");

  assert.match(agents,/main Codex thread is Agent1/);
  assert.match(agents,/only agent allowed to advance canonical project approvals/);
  assert.match(agents,/project\.db.*single canonical production state/);
  assert.match(agents,/Do not merge all section narration into one final `narration\.mp3`/);
  assert.match(agents,/browser automation may only transport that package/);
  assert.match(agents,/prompt revisions v1\/v2\/v3/);
  assert.match(story,/Do not approve canonical project gates/);
  assert.match(visual,/RETRY .*REGENERATE .*REDESIGN/);
  assert.match(visual,/sequence continuity/);
  assert.match(visual,/manager-approved recurring characters/);
  assert.match(config,/max_concurrent_threads_per_session = 2/);
});

test("architecture freeze: LONGFORM format profile and bootstrap pin the canonical 16:9 resources",()=>{
  const profile=JSON.parse(read("resources/format-profiles/LONGFORM_16X9_V1/1.0.0.json"));
  const bootstrap=read("packages/project-bootstrap/src/index.ts");
  assert.equal(profile.payload.format,"LONGFORM");
  assert.equal(profile.payload.width,1920);
  assert.equal(profile.payload.height,1080);
  assert.deepEqual(profile.payload.imageGeneration,{width:1536,height:864});
  assert.equal(profile.payload.editorDefaults.primaryAudioTrack,"A1");
  assert.equal(profile.payload.delivery.audioCodec,"aac");
  assert.equal(profile.payload.delivery.pixelFormat,"yuv420p");
  assert.match(bootstrap,/DEFAULT_CHANNEL_PROFILE_VERSION = "1\.5\.0"/);
});

test("architecture freeze: LONGFORM visual authoring is Agent3-reviewed and browser transport is non-creative",()=>{
  const auto=read("cli/vpf/src/wf09-auto.ts");
  const adapter=read("runtimes/image/adapters/chatgpt-browser-adapter.mjs");
  const worker=read("runtimes/image/adapters/chatgpt_browser_worker_v2.py");

  assert.match(auto,/LONGFORM visual production must use the Agent3-reviewed explicit WF09A\/WF09B prompt package path/);
  assert.doesNotMatch(auto,/Roman Britain|Roman-inspired|northern Britannia/);
  assert.doesNotMatch(adapter,/cinematic fantasy matte-painting|upper 18%|lower 22%/);
  assert.match(adapter,/NEGATIVE CONSTRAINTS \(transported verbatim\)/);
  assert.match(worker,/regenerate instead of destructive crop/);
});

test("architecture freeze: segmented LONGFORM TTS, subtitle offsets, and A1 routing are wired",()=>{
  const tts=read("packages/tts-generation/src/index.ts");
  const runtime=read("runtimes/elevenlabs/runtime.py");
  const subtitles=read("packages/tts-generation/src/subtitle-bridge.ts");
  const assembly=read("cli/vpf/src/editor-assembly-service.ts");
  const timeline=read("packages/editor-timeline/src/index.ts");

  assert.match(tts,/input\.format === "LONGFORM" \? "SEGMENTED"/);
  assert.match(tts,/buildLongformSections/);
  assert.match(tts,/Split the Scene at the Story stage/);
  assert.match(runtime,/if mode=="SEGMENTED"/);
  assert.match(runtime,/narration_manifest/);
  assert.match(subtitles,/buildSegmentedTtsTimelineFromArtifacts/);
  assert.match(subtitles,/timelineOffsetMs \+= durationMs/);
  assert.match(assembly,/buildSegmentedTtsTimelineFromArtifacts/);
  assert.match(timeline,/if \(type === "TTS"\) return "A1"/);
  assert.match(timeline,/if \(type === "CLIP_AUDIO"\) return "A2"/);
  assert.match(timeline,/if \(type === "BGM"\) return "A3"/);
  assert.match(timeline,/return "A4"/);
});

test("architecture freeze: LONGFORM header is non-persistent and reference roles are semantic",()=>{
  const assembly=read("cli/vpf/src/editor-assembly-service.ts");
  const globals=JSON.parse(read("workspace/reference_library/global_visual/manifest.json"));
  const selector=read("packages/reference-library/src/tiered-selector.ts");

  assert.match(assembly,/if \(isShortform && !header\)/);
  assert.match(assembly,/Math\.min\(narrationDurationMs, 3000\)/);
  assert.deepEqual(
    globals.entries.map((entry:{role:string})=>entry.role),
    ["COMPOSITION_GRAMMAR","ATMOSPHERE_GRAMMAR","NARRATIVE_GRAMMAR","MYSTERY_CLOSURE_GRAMMAR"]
  );
  assert.doesNotMatch(selector,/GLOBAL_ROLE_BY_FILE/);
  assert.match(selector,/entry\.role\?\.trim\(\) \|\| "VISUAL_GRAMMAR"/);
});

test("architecture freeze: image failure states and revision-safe outputs remain distinct",()=>{
  const assets=read("packages/scene-assets/src/index.ts");
  const runtime=read("packages/scene-assets/src/image-runtime.ts");
  assert.match(assets,/qcStatus === "REGENERATE"/);
  assert.match(assets,/REGENERATE_REQUIRED/);
  assert.match(assets,/qcStatus === "REDESIGN"/);
  assert.match(assets,/REDESIGN_REQUIRED/);
  assert.match(runtime,/--r\$\{assetRevision\}--attempt-\$\{attempt\}\.png/);
});
