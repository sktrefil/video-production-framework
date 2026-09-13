import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { buildTtsAlignedSubtitleCues } from "@vpf/tts-generation/subtitle-bridge";

const [projectRootArg] = process.argv.slice(2);
if (!projectRootArg) throw new Error("Usage: node generate-subtitle-cues.mjs <project-root>");

const projectRoot = resolve(projectRootArg);
const ttsRoot = resolve(projectRoot, "03_tts");
const alignmentPath = resolve(ttsRoot, "character_alignment.json");
const metadataPath = resolve(ttsRoot, "tts_metadata.json");
const raw = JSON.parse(await readFile(alignmentPath, "utf8"));
const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
const alignment = {
  characters: raw.characters,
  characterStartTimesSeconds: raw.character_start_times_seconds,
  characterEndTimesSeconds: raw.character_end_times_seconds
};
const durationMs = Math.round(Math.max(...alignment.characterEndTimesSeconds) * 1000);
const cues = buildTtsAlignedSubtitleCues({
  displayText: alignment.characters.join(""),
  alignment,
  audioPlacementId: "narration",
  audioDurationMs: durationMs,
  maximumCharacters: 24
});

const output = {
  schemaVersion: 1,
  kind: "TTS_ALIGNED_SUBTITLE_CUES",
  projectId: metadata.projectId ?? basename(projectRoot),
  source: {
    narrationRelativePath: "03_tts/narration.mp3",
    characterAlignmentRelativePath: "03_tts/character_alignment.json",
    characterAlignmentSha256: createHash("sha256").update(await readFile(alignmentPath)).digest("hex"),
    audioDurationMs: durationMs,
    audioPlacementId: "narration"
  },
  cues
};

function srtTime(ms) {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  const milliseconds = ms % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

const srt = cues.map((cue, index) => `${index + 1}\r\n${srtTime(cue.startMs)} --> ${srtTime(cue.endMs)}\r\n${cue.text}\r\n`).join("\r\n");
await writeFile(resolve(ttsRoot, "subtitle-cues.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
await writeFile(resolve(ttsRoot, "subtitles.srt"), `${srt}\r\n`, "utf8");
console.log(JSON.stringify({ cueCount: cues.length, durationMs, output: ["03_tts/subtitle-cues.json", "03_tts/subtitles.srt"] }));
