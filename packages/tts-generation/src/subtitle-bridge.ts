import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import type {
  EditorSubtitleCue,
  ScriptVersion,
  TtsCharacterAlignment,
  TtsGenerationResult
} from "@vpf/domain";
import {resolveProjectRelativePath} from "@vpf/workspace";
import {sanitizeTtsText} from "./index.js";
import {parseElevenLabsAlignmentDocument} from "./runtime-adapter.js";

export class TtsSubtitleBridgeError extends Error {
  constructor(
    public readonly code:
      | "SUBTITLE_ALIGNMENT_INVALID"
      | "SUBTITLE_SCRIPT_PROVENANCE_MISMATCH"
      | "SUBTITLE_DISPLAY_TEXT_MISMATCH"
      | "SUBTITLE_ALIGNMENT_HASH_MISMATCH",
    message: string
  ) {
    super(message);
    this.name = "TtsSubtitleBridgeError";
  }
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function wrapUnit(unit: string, maximumCharacters: number): string[] {
  const normalized = normalizeWhitespace(unit);
  if (!normalized) return [];
  if (normalized.length <= maximumCharacters) return [normalized];

  const chunks: string[] = [];
  let current = "";
  for (const word of normalized.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > maximumCharacters) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }

    while (current.length > maximumCharacters && !current.includes(" ")) {
      chunks.push(current.slice(0, maximumCharacters));
      current = current.slice(maximumCharacters);
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function splitSubtitleCaptionUnits(
  text: string,
  maximumCharacters = 24
): string[] {
  if (!Number.isInteger(maximumCharacters) || maximumCharacters < 8 || maximumCharacters > 80) {
    throw new TtsSubtitleBridgeError(
      "SUBTITLE_ALIGNMENT_INVALID",
      "Subtitle maximumCharacters must be an integer between 8 and 80."
    );
  }

  const normalized = normalizeWhitespace(text);
  const sentences = normalized.match(/[^.!?。！？]+[.!?。！？]?/gu) ?? [];
  const result: string[] = [];
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maximumCharacters) {
      result.push(trimmed);
      continue;
    }

    const commaParts = trimmed
      .split(/(?<=[,，])\s*/gu)
      .map(part => part.trim())
      .filter(Boolean);
    let current = "";
    for (const part of commaParts) {
      const candidate = current ? `${current} ${part}` : part;
      if (current && candidate.length > maximumCharacters) {
        result.push(...wrapUnit(current, maximumCharacters));
        current = part;
      } else {
        current = candidate;
      }
    }
    if (current) result.push(...wrapUnit(current, maximumCharacters));
  }

  return result.length > 0 ? result : wrapUnit(normalized, maximumCharacters);
}

function validateAlignment(
  alignment: TtsCharacterAlignment,
  expectedText: string
): void {
  const count = alignment.characters.length;
  if (
    count === 0 ||
    alignment.characterStartTimesSeconds.length !== count ||
    alignment.characterEndTimesSeconds.length !== count ||
    alignment.characters.join("") !== expectedText
  ) {
    throw new TtsSubtitleBridgeError(
      "SUBTITLE_ALIGNMENT_INVALID",
      "TTS character alignment does not exactly match the approved spoken text."
    );
  }

  let previousStart = -1;
  for (let index = 0; index < count; index += 1) {
    const start = alignment.characterStartTimesSeconds[index]!;
    const end = alignment.characterEndTimesSeconds[index]!;
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start ||
      start < previousStart
    ) {
      throw new TtsSubtitleBridgeError(
        "SUBTITLE_ALIGNMENT_INVALID",
        "TTS character alignment timestamps are invalid or out of order."
      );
    }
    previousStart = start;
  }
}

export function buildTtsAlignedSubtitleCues(input: {
  displayText: string;
  alignment: TtsCharacterAlignment;
  audioPlacementId: string;
  audioDurationMs: number;
  maximumCharacters?: number;
}): EditorSubtitleCue[] {
  if (!input.audioPlacementId.trim()) {
    throw new TtsSubtitleBridgeError(
      "SUBTITLE_ALIGNMENT_INVALID",
      "TTS audio placement id is required for subtitle provenance."
    );
  }
  if (!Number.isFinite(input.audioDurationMs) || input.audioDurationMs <= 0) {
    throw new TtsSubtitleBridgeError(
      "SUBTITLE_ALIGNMENT_INVALID",
      "TTS audio duration must be positive."
    );
  }

  const spokenText = input.alignment.characters.join("");
  const approvedSpokenText = sanitizeTtsText(input.displayText);
  if (approvedSpokenText !== spokenText) {
    throw new TtsSubtitleBridgeError(
      "SUBTITLE_DISPLAY_TEXT_MISMATCH",
      "Approved display text does not normalize to the exact TTS alignment text."
    );
  }
  validateAlignment(input.alignment, approvedSpokenText);

  const units = splitSubtitleCaptionUnits(
    approvedSpokenText,
    input.maximumCharacters ?? 24
  );
  const timed = input.alignment.characters
    .map((character, index) => ({
      character,
      start: input.alignment.characterStartTimesSeconds[index]!,
      end: input.alignment.characterEndTimesSeconds[index]!
    }))
    .filter(item => !/\s/u.test(item.character));

  const cues: EditorSubtitleCue[] = [];
  let cursor = 0;
  for (let index = 0; index < units.length; index += 1) {
    const text = units[index]!;
    const expected = [...text].filter(character => !/\s/u.test(character));
    const selected = timed.slice(cursor, cursor + expected.length);
    if (
      selected.length !== expected.length ||
      selected.some((item, selectedIndex) => item.character !== expected[selectedIndex])
    ) {
      throw new TtsSubtitleBridgeError(
        "SUBTITLE_ALIGNMENT_INVALID",
        `Subtitle caption ${index + 1} diverges from TTS character alignment.`
      );
    }
    if (selected.length === 0) continue;

    const startMs = Math.max(0, Math.round(selected[0]!.start * 1000));
    const endMs = Math.min(
      Math.round(input.audioDurationMs),
      Math.max(startMs + 1, Math.round(selected.at(-1)!.end * 1000))
    );
    cues.push({
      id: `tts-align-${String(index + 1).padStart(4, "0")}`,
      startMs,
      endMs,
      text,
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromAudioPlacementIds: [input.audioPlacementId]
    });
    cursor += expected.length;
  }

  if (cursor !== timed.length || cues.length === 0) {
    throw new TtsSubtitleBridgeError(
      "SUBTITLE_ALIGNMENT_INVALID",
      "Unused or missing TTS characters remain after subtitle cue generation."
    );
  }

  for (let index = 0; index < cues.length - 1; index += 1) {
    const current = cues[index]!;
    const next = cues[index + 1]!;
    if (current.endMs > next.startMs) current.endMs = next.startMs;
    if (current.endMs <= current.startMs) {
      throw new TtsSubtitleBridgeError(
        "SUBTITLE_ALIGNMENT_INVALID",
        `Subtitle cue ${current.id} has no non-overlapping display interval.`
      );
    }
  }
  const finalCue = cues.at(-1)!;
  if (finalCue.endMs > input.audioDurationMs || finalCue.endMs <= finalCue.startMs) {
    throw new TtsSubtitleBridgeError(
      "SUBTITLE_ALIGNMENT_INVALID",
      "Final subtitle cue exceeds the TTS audio duration."
    );
  }

  const cueText = normalizeWhitespace(cues.map(cue => cue.text).join(" "));
  if (cueText !== normalizeWhitespace(approvedSpokenText)) {
    throw new TtsSubtitleBridgeError(
      "SUBTITLE_DISPLAY_TEXT_MISMATCH",
      "Generated subtitle cues do not preserve the approved display text."
    );
  }

  return cues;
}

export function buildTtsAlignedSubtitleCuesFromResult(input: {
  script: ScriptVersion;
  result: TtsGenerationResult;
  alignment: TtsCharacterAlignment;
  audioPlacementId: string;
  maximumCharacters?: number;
}): EditorSubtitleCue[] {
  if (
    input.script.kind !== "FINAL" ||
    input.result.sourceScriptId !== input.script.id ||
    input.result.sourceScriptRevision !== input.script.revision ||
    input.result.sourceScriptSha256 !== sha256Text(input.script.body)
  ) {
    throw new TtsSubtitleBridgeError(
      "SUBTITLE_SCRIPT_PROVENANCE_MISMATCH",
      "TTS result does not target the supplied approved FINAL script revision."
    );
  }
  return buildTtsAlignedSubtitleCues({
    displayText: input.script.body,
    alignment: input.alignment,
    audioPlacementId: input.audioPlacementId,
    audioDurationMs: input.result.audioDurationMs,
    ...(input.maximumCharacters === undefined
      ? {}
      : {maximumCharacters: input.maximumCharacters})
  });
}

export async function loadVerifiedTtsAlignmentArtifact(input: {
  projectRoot: string;
  result: TtsGenerationResult;
}): Promise<TtsCharacterAlignment> {
  const absolutePath = resolveProjectRelativePath(
    input.projectRoot,
    input.result.characterAlignmentRelativePath
  );
  let bytes: Uint8Array;
  try {
    bytes = await readFile(absolutePath);
  } catch {
    throw new TtsSubtitleBridgeError(
      "SUBTITLE_ALIGNMENT_INVALID",
      `TTS alignment artifact is missing: ${input.result.characterAlignmentRelativePath}`
    );
  }
  const actualSha = sha256Bytes(bytes);
  if (actualSha !== input.result.characterAlignmentSha256.toLowerCase()) {
    throw new TtsSubtitleBridgeError(
      "SUBTITLE_ALIGNMENT_HASH_MISMATCH",
      "TTS alignment artifact checksum does not match the completed TTS result."
    );
  }
  return parseElevenLabsAlignmentDocument(Buffer.from(bytes).toString("utf8"));
}

export async function buildTtsAlignedSubtitleCuesFromArtifacts(input: {
  projectRoot: string;
  script: ScriptVersion;
  result: TtsGenerationResult;
  audioPlacementId: string;
  maximumCharacters?: number;
}): Promise<EditorSubtitleCue[]> {
  const alignment = await loadVerifiedTtsAlignmentArtifact({
    projectRoot: input.projectRoot,
    result: input.result
  });
  return buildTtsAlignedSubtitleCuesFromResult({
    script: input.script,
    result: input.result,
    alignment,
    audioPlacementId: input.audioPlacementId,
    ...(input.maximumCharacters === undefined
      ? {}
      : {maximumCharacters: input.maximumCharacters})
  });
}
