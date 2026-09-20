import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { buildTtsAlignedSubtitleCues } from "@vpf/tts-generation/subtitle-bridge";

const [projectRootArg] = process.argv.slice(2);
if (!projectRootArg) throw new Error("Usage: node generate-subtitle-cues.mjs <project-root>");

const projectRoot = resolve(projectRootArg);
const ttsRoot = resolve(projectRoot, "03_tts");
const metadataPath = resolve(ttsRoot, "tts_metadata.json");
const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
const sha256 = value => createHash("sha256").update(value).digest("hex");

function alignmentFromRaw(raw) {
  return {
    characters: raw.characters,
    characterStartTimesSeconds: raw.character_start_times_seconds,
    characterEndTimesSeconds: raw.character_end_times_seconds
  };
}

function srtTime(ms) {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  const milliseconds = ms % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

let cues;
let source;

if (metadata.narrationMode === "SEGMENTED") {
  const manifestPath = resolve(ttsRoot, "narration_manifest.json");
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest.mode !== "SEGMENTED" || !Array.isArray(manifest.sections) || manifest.sections.length === 0) {
    throw new Error("narration_manifest.json is not a valid SEGMENTED narration manifest.");
  }

  cues = [];
  let offsetMs = 0;
  for (const section of [...manifest.sections].sort((a,b)=>a.index-b.index)) {
    const alignmentPath = resolve(projectRoot, section.characterAlignmentRelativePath);
    const alignmentBytes = await readFile(alignmentPath);
    const alignment = alignmentFromRaw(JSON.parse(alignmentBytes.toString("utf8")));
    const spoken = alignment.characters.join("");
    if (typeof section.text !== "string" || sha256(Buffer.from(section.text,"utf8")) !== section.textSha256) {
      throw new Error(`Section ${section.id} text provenance is invalid.`);
    }
    if (sha256(alignmentBytes) !== section.characterAlignmentSha256) {
      throw new Error(`Section ${section.id} alignment checksum mismatch.`);
    }
    if (spoken !== section.text) {
      throw new Error(`Section ${section.id} alignment text mismatch.`);
    }
    const local = buildTtsAlignedSubtitleCues({
      displayText: section.text,
      alignment,
      audioPlacementId: section.id,
      audioDurationMs: section.audioDurationMs,
      maximumCharacters: 24
    });
    for (const cue of local) {
      cues.push({
        ...cue,
        id: `${section.id}-${cue.id}`,
        startMs: cue.startMs + offsetMs,
        endMs: cue.endMs + offsetMs,
        generatedFromAudioPlacementIds: [section.id]
      });
    }
    offsetMs += section.audioDurationMs;
  }
  source = {
    narrationMode: "SEGMENTED",
    narrationManifestRelativePath: "03_tts/narration_manifest.json",
    narrationManifestSha256: sha256(manifestBytes),
    audioDurationMs: offsetMs,
    audioPlacementIds: manifest.sections.map(section => section.id)
  };
} else {
  const alignmentPath = resolve(ttsRoot, "character_alignment.json");
  const alignmentBytes = await readFile(alignmentPath);
  const alignment = alignmentFromRaw(JSON.parse(alignmentBytes.toString("utf8")));
  const durationMs = Math.round(Math.max(...alignment.characterEndTimesSeconds) * 1000);
  cues = buildTtsAlignedSubtitleCues({
    displayText: alignment.characters.join(""),
    alignment,
    audioPlacementId: "narration",
    audioDurationMs: durationMs,
    maximumCharacters: 24
  });
  source = {
    narrationMode: "SINGLE",
    narrationRelativePath: "03_tts/narration.mp3",
    characterAlignmentRelativePath: "03_tts/character_alignment.json",
    characterAlignmentSha256: sha256(alignmentBytes),
    audioDurationMs: durationMs,
    audioPlacementIds: ["narration"]
  };
}

const output = {
  schemaVersion: 2,
  kind: "TTS_ALIGNED_SUBTITLE_CUES",
  projectId: metadata.projectId ?? basename(projectRoot),
  source,
  cues
};

const srt = cues.map((cue, index) => `${index + 1}\r\n${srtTime(cue.startMs)} --> ${srtTime(cue.endMs)}\r\n${cue.text}\r\n`).join("\r\n");
await writeFile(resolve(ttsRoot, "subtitle-cues.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
await writeFile(resolve(ttsRoot, "subtitles.srt"), `${srt}\r\n`, "utf8");
console.log(JSON.stringify({
  narrationMode: source.narrationMode,
  cueCount: cues.length,
  durationMs: source.audioDurationMs,
  output: ["03_tts/subtitle-cues.json", "03_tts/subtitles.srt"]
}));
