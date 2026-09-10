import {staticFile} from "remotion";
import type {TranscribedWord} from "./subtitleGeneration";

import {getEditorApiBase} from "../../../editor/runtimeConfig.ts";

type TranscriptionResponse = {
  success: boolean;
  words?: Array<{
    word?: string;
    text?: string;
    start?: number;
    end?: number;
    startMs?: number;
    endMs?: number;
  }>;
  error?: string;
  engine?: string;
  model?: string;
  device?: string;
  computeType?: string;
  pythonSource?: string;
  cacheHit?: boolean;
  cachePath?: string;
  audioHash?: string;
};

export type LocalWhisperTranscriptionMeta = {
  source: string;
  engine: string;
  model: string;
  device: string;
  computeType: string;
  pythonSource: string;
  cacheHit: boolean;
  cachePath: string;
  audioHash: string;
};

export type LocalWhisperTranscriptionResult = {
  words: TranscribedWord[];
  meta: LocalWhisperTranscriptionMeta;
};

type EditorCapabilitiesResponse = {
  success: boolean;
  version?: number;
  subtitleScript?: boolean;
  subtitleTranscribe?: boolean;
  localWhisper?: boolean;
  localWhisperCache?: boolean;
  localWhisperPython?: string;
  error?: string;
};

export type LocalWhisperCapabilities = {
  version: number;
  localWhisper: boolean;
  cacheEnabled: boolean;
  pythonSource: string;
};

const normalizeTranscribedWords = (
  payload: TranscriptionResponse,
): TranscribedWord[] =>
  (payload.words ?? [])
    .map((word) => ({
      text: String(word.word ?? word.text ?? "").trim(),
      startMs:
        typeof word.startMs === "number"
          ? word.startMs
          : Number(word.start ?? 0) * 1000,
      endMs:
        typeof word.endMs === "number"
          ? word.endMs
          : Number(word.end ?? 0) * 1000,
    }))
    .filter(
      (word) =>
        word.text.length > 0 &&
        Number.isFinite(word.startMs) &&
        Number.isFinite(word.endMs) &&
        word.endMs > word.startMs,
    );

export const transcribeTtsSourceDetailed = async ({
  src,
  language,
  force = false,
}: {
  src: string;
  language: string;
  force?: boolean;
}): Promise<LocalWhisperTranscriptionResult> => {
  const response = await fetch(
    `${getEditorApiBase()}/api/editor/subtitles/transcribe`,
    {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({src, language, force}),
    },
  );
  const payload = (await response.json()) as TranscriptionResponse;
  if (!response.ok || !payload.success || !payload.words) {
    throw new Error(payload.error ?? "TTS transcription failed");
  }

  const words = normalizeTranscribedWords(payload);
  if (words.length === 0) {
    throw new Error("Local Whisper returned no valid word timestamps");
  }

  return {
    words,
    meta: {
      source: src,
      engine: String(payload.engine ?? "faster-whisper"),
      model: String(payload.model ?? ""),
      device: String(payload.device ?? ""),
      computeType: String(payload.computeType ?? ""),
      pythonSource: String(payload.pythonSource ?? ""),
      cacheHit: payload.cacheHit === true,
      cachePath: String(payload.cachePath ?? ""),
      audioHash: String(payload.audioHash ?? ""),
    },
  };
};

export const transcribeTtsSource = async ({
  src,
  language,
  force = false,
}: {
  src: string;
  language: string;
  force?: boolean;
}): Promise<TranscribedWord[]> =>
  (
    await transcribeTtsSourceDetailed({
      src,
      language,
      force,
    })
  ).words;

export const loadLocalWhisperCapabilities =
  async (): Promise<LocalWhisperCapabilities> => {
    const response = await fetch(
      `${getEditorApiBase()}/api/editor/capabilities`,
      {cache: "no-store"},
    );
    const payload = (await response.json()) as EditorCapabilitiesResponse;
    if (
      !response.ok ||
      !payload.success ||
      payload.localWhisper !== true
    ) {
      throw new Error(
        payload.error ?? "Local Whisper Sidecar capability is unavailable",
      );
    }

    return {
      version: Number(payload.version ?? 0),
      localWhisper: true,
      cacheEnabled: payload.localWhisperCache === true,
      pythonSource: String(payload.localWhisperPython ?? "unknown"),
    };
  };

type ProjectSubtitleScriptResponse = {
  success: boolean;
  script?: string;
  source?: string;
  error?: string;
};

const looksLikeHtml = (value: string) => {
  const normalized = value.trimStart().toLowerCase();
  return (
    normalized.startsWith("<!doctype html") ||
    normalized.startsWith("<html") ||
    normalized.includes("<head>")
  );
};

const loadProjectScriptFromSidecar = async (
  projectId: string,
): Promise<{script: string; source: string} | null> => {
  try {
    const response = await fetch(
      `${getEditorApiBase()}/api/editor/subtitles/script?projectId=${encodeURIComponent(projectId)}`,
      {cache: "no-store"},
    );
    const payload =
      (await response.json()) as ProjectSubtitleScriptResponse;
    if (
      !response.ok ||
      !payload.success ||
      typeof payload.script !== "string"
    ) {
      return null;
    }
    const script = payload.script.trim();
    if (!script || looksLikeHtml(script)) {
      return null;
    }
    return {
      script,
      source: String(payload.source ?? ""),
    };
  } catch {
    return null;
  }
};

const loadStaticProjectScript = async (
  projectId: string,
): Promise<{script: string; source: string} | null> => {
  const candidates = [
    `projects/${projectId}/script/script.txt`,
    `projects/${projectId}/script/script_display.txt`,
    `projects/${projectId}/script.txt`,
  ];

  for (const source of candidates) {
    try {
      const response = await fetch(staticFile(source), {
        cache: "no-store",
      });
      if (!response.ok) {
        continue;
      }
      const script = (await response.text()).trim();
      if (!script || looksLikeHtml(script)) {
        continue;
      }
      return {script, source};
    } catch {
      // Try the next project script candidate.
    }
  }

  return null;
};

export const loadProjectSubtitleScript = async (
  projectId: string,
): Promise<{script: string; source: string}> => {
  // Prefer the filesystem-backed sidecar route. It reads the exact file from
  // public/projects/<projectId>/script/script.txt and cannot accidentally
  // return Remotion Studio's HTML shell.
  const sidecarScript = await loadProjectScriptFromSidecar(projectId);
  if (sidecarScript) {
    return sidecarScript;
  }

  // Fallback to Remotion's staticFile() URL. Never accept HTML fallback pages
  // as subtitle text.
  const staticScript = await loadStaticProjectScript(projectId);
  if (staticScript) {
    return staticScript;
  }

  throw new Error(
    `대본 파일을 찾지 못했습니다: public/projects/${projectId}/script/script.txt`,
  );
};
