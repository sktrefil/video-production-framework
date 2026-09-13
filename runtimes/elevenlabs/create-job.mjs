import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";

const [projectRootArg, scriptArg, outputArg] = process.argv.slice(2);
if (!projectRootArg || !scriptArg || !outputArg) {
  throw new Error("Usage: node create-job.mjs <project-root> <script-file> <output-json>");
}

const projectRoot = resolve(projectRootArg);
const scriptPath = resolve(scriptArg);
const outputPath = resolve(outputArg);
const text = (await readFile(scriptPath, "utf8")).trim();
if (!text) throw new Error("The approved FINAL script is empty.");
if (text.length > 4000) throw new Error("SHORTFORM TTS accepts one script chunk of up to 4,000 characters.");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const projectId = basename(projectRoot);
const scriptRelativePath = relative(projectRoot, scriptPath).replaceAll("\\", "/");
const job = {
  schemaVersion: 1,
  jobId: `tts-${randomUUID()}`,
  jobRevision: 1,
  projectId,
  provider: "ELEVENLABS",
  providerProfileVersion: "1.0.0",
  jobType: "TTS_GENERATION",
  executionMode: "AUTOMATED",
  attempt: 1,
  inputHash: sha256(text),
  secretRequirements: [{ envName: "ELEVENLABS_API_KEY", required: true }],
  input: {
    schemaVersion: 1,
    providerProfile: {
      resourceId: "ELEVENLABS_V3_HISTORY_V1",
      version: "1.0.0",
      contentHash: "sha256:f85d629e9125ec931a2858c1219db453d983c4bbe000ee644c36d21c408607e2"
    },
    plan: {
      id: `tts-plan-${sha256(text).slice(0, 16)}`,
      revision: 1,
      sourceScript: { id: scriptRelativePath, revision: 1, sha256: sha256(text) },
      contentFormat: "SHORTFORM",
      endpoint: "/v1/text-to-speech/{voice_id}/with-timestamps",
      modelId: "eleven_v3",
      outputFormat: "mp3_44100_128",
      voiceIdResolution: "VOICE_PRESET_THEN_ENV",
      voiceIdFallbackEnv: "ELEVENLABS_VOICE_ID",
      voicePreset: "HISTORY_MYSTERY_SHORTS",
      configuredVoiceSettings: { stability: 0.6, similarityBoost: 0.8, style: 0.05, speed: 1, useSpeakerBoost: true },
      effectiveVoiceSettings: { stability: 0.6, style: 0.05 },
      droppedVoiceSettings: ["similarity_boost", "speed", "use_speaker_boost"],
      preserveProviderCadence: true,
      chunks: [{ index: 1, text, textCharacterCount: text.length, outputRelativePath: "03_tts/chunks/chunk_001.mp3" }],
      outputPaths: {
        narration: "03_tts/narration.mp3",
        characterAlignment: "03_tts/character_alignment.json",
        metadata: "03_tts/tts_metadata.json",
        resolvedVoiceProfile: "03_tts/resolved_voice_profile.json"
      }
    }
  }
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(job, null, 2)}\n`, "utf8");
console.log(outputPath);
