import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import {readdir, readFile} from "node:fs/promises";
import {dirname, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = resolve(ROOT, "public");
const LOCAL_SUBTITLES_DIR = resolve(ROOT, ".local", "subtitles");

const cueEnd = (item) =>
  Number(item.timelineStartFrame) + Number(item.durationInFrames);

const audioEnd = (item) =>
  Number(item.timelineStartFrame) + Number(item.durationInFrames);

const safeResolveInside = (base, relativePath) => {
  const normalized = String(relativePath ?? "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");
  const parts = normalized.split("/");
  if (
    !normalized ||
    parts.some(
      (part) => part === "." || part === ".." || part.includes("\0"),
    )
  ) {
    return null;
  }
  const target = resolve(base, ...parts);
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    return null;
  }
  return target;
};

const fileSha256 = async (path) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");

const normalizedWords = (payload) =>
  Array.isArray(payload?.words)
    ? payload.words
        .map((word) => ({
          text: String(word?.word ?? word?.text ?? "").trim(),
          startMs:
            Number.isFinite(Number(word?.startMs))
              ? Number(word.startMs)
              : Number(word?.start) * 1000,
          endMs:
            Number.isFinite(Number(word?.endMs))
              ? Number(word.endMs)
              : Number(word?.end) * 1000,
        }))
        .filter(
          (word) =>
            word.text.length > 0 &&
            Number.isFinite(word.startMs) &&
            Number.isFinite(word.endMs) &&
            word.endMs > word.startMs,
        )
    : [];

const loadCachedWordsForSource = async ({
  projectId,
  src,
}) => {
  const projectCacheDir = safeResolveInside(
    LOCAL_SUBTITLES_DIR,
    projectId,
  );
  if (!projectCacheDir || !existsSync(projectCacheDir)) {
    return null;
  }

  let directories = [];
  try {
    directories = await readdir(projectCacheDir, {withFileTypes: true});
  } catch {
    return null;
  }

  const localAudioPath =
    /^https?:\/\//i.test(src)
      ? null
      : safeResolveInside(PUBLIC_DIR, src);
  const expectedAudioHash =
    localAudioPath && existsSync(localAudioPath)
      ? await fileSha256(localAudioPath).catch(() => null)
      : null;

  for (const entry of directories) {
    if (!entry.isDirectory()) {
      continue;
    }
    const directory = safeResolveInside(projectCacheDir, entry.name);
    if (!directory) {
      continue;
    }
    const metaPath = resolve(directory, "transcription_meta.json");
    const wordsPath = resolve(directory, "word_timestamps.json");
    if (!existsSync(metaPath) || !existsSync(wordsPath)) {
      continue;
    }

    try {
      const [meta, payload] = await Promise.all([
        readFile(metaPath, "utf8").then(JSON.parse),
        readFile(wordsPath, "utf8").then(JSON.parse),
      ]);
      if (meta?.source !== src) {
        continue;
      }
      if (
        expectedAudioHash &&
        meta?.audioHash !== expectedAudioHash
      ) {
        continue;
      }
      const words = normalizedWords(payload);
      if (words.length === 0) {
        continue;
      }
      return {
        words,
        cachePath: [
          ".local",
          "subtitles",
          projectId,
          entry.name,
          "word_timestamps.json",
        ].join("/"),
      };
    } catch {
      // Ignore malformed/stale cache entries and continue.
    }
  }

  return null;
};

const mapSpeechWordsForTts = (item, words, fps) => {
  const sourceStartMs = (Number(item.sourceStartFrame) / fps) * 1000;
  const sourceEndMs =
    ((Number(item.sourceStartFrame) +
      Number(item.sourceDurationInFrames)) /
      fps) *
    1000;

  return words
    .filter((word) => {
      const midpoint = (word.startMs + word.endMs) / 2;
      return midpoint >= sourceStartMs && midpoint < sourceEndMs;
    })
    .map((word) => {
      const startFrame =
        Number(item.timelineStartFrame) +
        Math.max(
          0,
          Math.round((word.startMs / 1000) * fps) -
            Number(item.sourceStartFrame),
        );
      const endFrame =
        Number(item.timelineStartFrame) +
        Math.max(
          1,
          Math.round((word.endMs / 1000) * fps) -
            Number(item.sourceStartFrame),
        );
      return {
        startFrame,
        endFrame: Math.max(startFrame + 1, endFrame),
      };
    });
};

const qcIssue = (
  code,
  severity,
  message,
  subtitleIds,
  frame = undefined,
  data = undefined,
) => ({
  code,
  severity,
  message,
  subtitleIds,
  ...(frame === undefined ? {} : {frame}),
  ...(data === undefined ? {} : {data}),
});

export const validateSubtitleProductionQc = async (project) => {
  const items = Array.isArray(project?.items) ? project.items : [];
  const fps = Math.max(1, Number(project?.project?.fps) || 30);
  const projectId = String(project?.project?.id ?? "");

  const subtitles = items
    .filter(
      (item) =>
        item?.type === "SUBTITLE" &&
        item.enabled !== false,
    )
    .slice()
    .sort(
      (left, right) =>
        Number(left.timelineStartFrame) -
          Number(right.timelineStartFrame) ||
        String(left.id).localeCompare(String(right.id)),
    );

  const ttsItems = items.filter(
    (item) => item?.type === "TTS" && item.enabled !== false,
  );
  const ttsById = new Map(
    ttsItems.map((item) => [String(item.id), item]),
  );

  const issues = [];

  for (const cue of subtitles) {
    const start = Number(cue.timelineStartFrame);
    const duration = Number(cue.durationInFrames);
    const end = start + duration;

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(duration) ||
      start < 0 ||
      duration <= 0 ||
      end <= start
    ) {
      issues.push(
        qcIssue(
          "INVALID_TIMING",
          "ERROR",
          `${cue.id}: 잘못된 시작/길이 값입니다.`,
          [String(cue.id)],
          Number.isFinite(start) ? start : undefined,
        ),
      );
      continue;
    }

    const referenceIds = Array.isArray(cue.generatedFromTtsIds)
      ? cue.generatedFromTtsIds.map(String)
      : [];
    const referencedTts = referenceIds
      .map((id) => ttsById.get(id))
      .filter(Boolean);

    if (referencedTts.length > 0) {
      const referenceStart = Math.min(
        ...referencedTts.map((item) => Number(item.timelineStartFrame)),
      );
      const referenceEnd = Math.max(
        ...referencedTts.map((item) => audioEnd(item)),
      );
      if (start < referenceStart - 2 || end > referenceEnd + 2) {
        issues.push(
          qcIssue(
            "OUTSIDE_TTS_RANGE",
            "ERROR",
            `${cue.id}: 자막이 연결된 TTS Segment 범위를 벗어납니다.`,
            [String(cue.id)],
            start,
            {referenceStart, referenceEnd},
          ),
        );
      }
    }
  }

  for (let index = 1; index < subtitles.length; index += 1) {
    const previous = subtitles[index - 1];
    const current = subtitles[index];
    const overlap =
      cueEnd(previous) - Number(current.timelineStartFrame);
    if (overlap > 0) {
      issues.push(
        qcIssue(
          "OVERLAP",
          "ERROR",
          `${previous.id} / ${current.id}: ${overlap} frame 겹칩니다.`,
          [String(previous.id), String(current.id)],
          Number(current.timelineStartFrame),
          {frames: overlap},
        ),
      );
    }
  }

  const sources = [
    ...new Set(
      ttsItems
        .map((item) => String(item.src ?? "").trim())
        .filter(Boolean),
    ),
  ];
  const cacheBySource = new Map();
  for (const src of sources) {
    const cached = await loadCachedWordsForSource({
      projectId,
      src,
    });
    if (cached) {
      cacheBySource.set(src, cached);
    }
  }

  const cacheWarnings = new Set();
  for (const cue of subtitles) {
    if (
      !cue.generationSource ||
      cue.generationSource === "MANUAL"
    ) {
      continue;
    }

    const start = Number(cue.timelineStartFrame);
    const end = cueEnd(cue);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start
    ) {
      continue;
    }

    const referenceIds = Array.isArray(cue.generatedFromTtsIds)
      ? cue.generatedFromTtsIds.map(String)
      : [];
    const referencedTts = referenceIds
      .map((id) => ttsById.get(id))
      .filter(Boolean);
    if (referencedTts.length === 0) {
      continue;
    }

    const speechWindows = [];
    for (const item of referencedTts) {
      const src = String(item.src ?? "").trim();
      const cached = cacheBySource.get(src);
      if (!cached) {
        if (src) {
          cacheWarnings.add(src);
        }
        continue;
      }
      speechWindows.push(
        ...mapSpeechWordsForTts(item, cached.words, fps),
      );
    }

    if (speechWindows.length === 0) {
      continue;
    }

    const overlapsSpeech = speechWindows.some(
      (window) =>
        window.startFrame < end &&
        window.endFrame > start,
    );
    if (!overlapsSpeech) {
      issues.push(
        qcIssue(
          "NO_SPEECH_OVERLAP",
          "ERROR",
          `${cue.id}: 실제 Local Whisper word timing과 겹치지 않아 무음 구간 자막 가능성이 있습니다.`,
          [String(cue.id)],
          start,
        ),
      );
    }
  }

  for (const src of cacheWarnings) {
    issues.push(
      qcIssue(
        "WORD_TIMING_UNAVAILABLE",
        "WARN",
        `Local Whisper word timing 캐시를 찾지 못해 실제 발화 겹침 검사를 생략했습니다: ${src}`,
        [],
        undefined,
        {src},
      ),
    );
  }

  const errorCount = issues.filter(
    (entry) => entry.severity === "ERROR",
  ).length;
  const warningCount = issues.length - errorCount;

  return {
    status:
      errorCount > 0
        ? "FAIL"
        : warningCount > 0
          ? "WARN"
          : "PASS",
    cueCount: subtitles.length,
    errorCount,
    warningCount,
    issues,
    cacheSources: [...cacheBySource.entries()].map(
      ([src, value]) => ({
        src,
        cachePath: value.cachePath,
      }),
    ),
  };
};
