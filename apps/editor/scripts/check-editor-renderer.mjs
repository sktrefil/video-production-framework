import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

const read = (path) => readFile(resolve(ROOT, path), "utf8");

const sample = JSON.parse(
  await read("src/generated/edit_project.sample.json"),
);
const projectRenderer = await read("src/editor/ProjectRenderer.tsx");
const videoRenderer = await read("src/editor/VideoItemRenderer.tsx");
const audioRenderer = await read("src/editor/AudioItemRenderer.tsx");
const rootSource = await read("src/Root.tsx");

assert.equal(sample.schemaVersion, 1, "schema version");
assert.equal(sample.project.fps, 30, "sample fps");
assert.equal(sample.project.width, 1080, "sample width");
assert.equal(sample.project.height, 1920, "sample height");

const tracks = new Map(sample.tracks.map((track) => [track.id, track]));
const expectedTrackType = (itemType) => {
  if (itemType === "VIDEO" || itemType === "IMAGE") return "VIDEO";
  if (
    itemType === "TTS" ||
    itemType === "CLIP_AUDIO" ||
    itemType === "BGM" ||
    itemType === "SFX"
  ) {
    return "AUDIO";
  }
  if (itemType === "SUBTITLE" || itemType === "TEXT") return "TEXT";
  return "GRAPHIC";
};

for (const item of sample.items) {
  const track = tracks.get(item.trackId);
  assert.ok(track, `missing track for ${item.id}`);
  assert.equal(
    track.type,
    expectedTrackType(item.type),
    `track type mismatch for ${item.id}`,
  );
  assert.ok(item.timelineStartFrame >= 0, `negative start: ${item.id}`);
  assert.ok(item.durationInFrames >= 1, `invalid duration: ${item.id}`);
  assert.ok(
    item.timelineStartFrame + item.durationInFrames <=
      sample.project.durationInFrames,
    `item exceeds composition: ${item.id}`,
  );

  if (
    item.type === "VIDEO" ||
    item.type === "TTS" ||
    item.type === "CLIP_AUDIO" ||
    item.type === "BGM" ||
    item.type === "SFX"
  ) {
    assert.ok(item.sourceStartFrame >= 0, `negative source: ${item.id}`);
    assert.ok(item.sourceDurationInFrames >= 1, `empty source: ${item.id}`);
    assert.ok(
      item.sourceStartFrame + item.sourceDurationInFrames <=
        item.sourceAssetDurationInFrames,
      `source range exceeds asset: ${item.id}`,
    );
  }
}

const videoItems = sample.items.filter((item) => item.type === "VIDEO");
assert.equal(videoItems.length, 3, "three independent video items");
assert.deepEqual(
  videoItems.map((item) => item.timelineStartFrame),
  [0, 120, 240],
  "independent video timeline positions",
);
assert.equal(
  sample.items.filter((item) => item.type === "TTS").length,
  1,
  "tts fixture",
);
assert.equal(
  sample.items.filter((item) => item.type === "SUBTITLE").length,
  2,
  "subtitle fixture",
);
assert.equal(
  sample.items.filter((item) => item.type === "GRAPHIC").length,
  1,
  "graphic fixture",
);

assert.match(projectRenderer, /<Sequence/, "uses independent Sequence");
assert.match(
  projectRenderer,
  /from=\{item\.timelineStartFrame\}/,
  "Sequence uses timeline start",
);
assert.match(
  projectRenderer,
  /durationInFrames=\{item\.durationInFrames\}/,
  "Sequence uses item duration",
);
assert.doesNotMatch(projectRenderer, /<Series/, "does not use Series");

assert.match(
  projectRenderer,
  /useCurrentFrame/,
  "image motion uses current Remotion frame",
);
assert.match(
  projectRenderer,
  /interpolate\(/,
  "image motion uses deterministic frame interpolation",
);
assert.match(
  projectRenderer,
  /motion\.from\.scale/,
  "image motion reads compiled start transform",
);
assert.match(
  projectRenderer,
  /motion\.to\.scale/,
  "image motion reads compiled end transform",
);
assert.match(
  projectRenderer,
  /Easing\.inOut\(Easing\.ease\)/,
  "image motion supports ease-in-out",
);
assert.match(
  projectRenderer,
  /extrapolateLeft: "clamp"/,
  "image motion clamps before its window",
);
assert.match(
  projectRenderer,
  /extrapolateRight: "clamp"/,
  "image motion clamps after its window",
);

assert.match(
  videoRenderer,
  /from "@remotion\/media"/,
  "uses recommended media Video",
);
assert.match(
  videoRenderer,
  /trimBefore=\{item\.sourceStartFrame\}/,
  "video source in",
);
assert.match(
  videoRenderer,
  /trimAfter=\{item\.sourceStartFrame \+ item\.sourceDurationInFrames\}/,
  "video source out",
);
assert.match(
  videoRenderer,
  /playbackRate=\{item\.playbackRate\}/,
  "video playback rate",
);
assert.match(videoRenderer, /masterVolume/, "video master volume");

assert.match(
  audioRenderer,
  /from "@remotion\/media"/,
  "uses recommended media Audio",
);
assert.match(
  audioRenderer,
  /trimBefore=\{item\.sourceStartFrame\}/,
  "audio source in",
);
assert.match(audioRenderer, /fadeInFrames/, "audio fade in");
assert.match(audioRenderer, /fadeOutFrames/, "audio fade out");
assert.match(audioRenderer, /masterVolume/, "audio master volume");

assert.match(
  rootSource,
  /id="GenericVideoEditor"/,
  "GenericVideoEditor composition registered",
);

console.log(
  "[editor-renderer] PASS: generic renderer, executable image motion, fixture, source ranges, and Root registration",
);
