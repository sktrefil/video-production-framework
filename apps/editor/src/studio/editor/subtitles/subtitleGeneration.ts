import type {
  AudioTimelineItem,
  EditProject,
  SubtitleTimelineItem,
} from "../editorTypes";

export type TranscribedWord = {
  text: string;
  startMs: number;
  endMs: number;
};

type SubtitleGenerationOptions = {
  trackId: string;
  fps: number;
  compositionWidth: number;
  compositionHeight: number;
  existingIds: string[];
  maxCharsPerLine: number;
  maxLines: number;
  maxCueDurationFrames: number;
};

const punctuationBreak = /[.!?。！？…]$/u;

export const SHORTS_LOWER_SUBTITLE_STYLE = {
  fontFamily: "VITRO",
  fontSizeAt1080: 104,
  baselineYAt1920: 1790,
  widthAt1080: 964,
  outlinePx: 4,
  lineHeight: 1.24,
  maxLines: 2,
} as const;

const normalizeWord = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const appendWord = (current: string, word: string) => {
  const normalized = normalizeWord(word);
  if (!normalized) {
    return current;
  }
  if (!current) {
    return normalized;
  }
  if (/^[,.;:!?%)]/u.test(normalized)) {
    return `${current}${normalized}`;
  }
  return `${current} ${normalized}`;
};

export const wrapSubtitleText = (
  text: string,
  maxCharsPerLine: number,
  maxLines: number,
): string => {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) {
    return "";
  }

  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (
      line &&
      next.length > maxCharsPerLine &&
      lines.length < maxLines - 1
    ) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) {
    lines.push(line);
  }

  if (lines.length <= maxLines) {
    return lines.join("\n");
  }

  return [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(" ")]
    .join("\n");
};

const createIdFactory = (existingIds: string[]) => {
  const used = new Set(existingIds);
  let counter = 1;
  return () => {
    while (used.has(`subtitle-auto-${String(counter).padStart(3, "0")}`)) {
      counter += 1;
    }
    const id = `subtitle-auto-${String(counter).padStart(3, "0")}`;
    used.add(id);
    counter += 1;
    return id;
  };
};

const defaultSubtitle = (
  id: string,
  text: string,
  startFrame: number,
  durationInFrames: number,
  source: SubtitleTimelineItem["generationSource"],
  ttsIds: string[],
  options: SubtitleGenerationOptions,
): SubtitleTimelineItem => ({
  id,
  type: "SUBTITLE",
  trackId: options.trackId,
  timelineStartFrame: Math.max(0, Math.round(startFrame)),
  durationInFrames: Math.max(1, Math.round(durationInFrames)),
  enabled: true,
  locked: false,
  text: wrapSubtitleText(
    text,
    options.maxCharsPerLine,
    options.maxLines,
  ),
  zIndex: 40,
  x: options.compositionWidth / 2,
  y:
    options.compositionHeight *
    (SHORTS_LOWER_SUBTITLE_STYLE.baselineYAt1920 / 1920),
  width:
    options.compositionWidth *
    (SHORTS_LOWER_SUBTITLE_STYLE.widthAt1080 / 1080),
  fontFamily: SHORTS_LOWER_SUBTITLE_STYLE.fontFamily,
  fontSize: Math.round(
    options.compositionWidth *
      (SHORTS_LOWER_SUBTITLE_STYLE.fontSizeAt1080 / 1080),
  ),
  fontWeight: 700,
  color: "#FFFDF7",
  strokeColor: "#17130F",
  strokeWidth: SHORTS_LOWER_SUBTITLE_STYLE.outlinePx,
  textAlign: "center",
  lineHeight: SHORTS_LOWER_SUBTITLE_STYLE.lineHeight,
  maxLines: Math.min(
    options.maxLines,
    SHORTS_LOWER_SUBTITLE_STYLE.maxLines,
  ),
  backgroundEnabled: false,
  backgroundColor: "#000000",
  backgroundOpacity: 0.42,
  generationSource: source,
  generatedFromTtsIds: [...ttsIds],
});

type MappedWord = {
  text: string;
  startFrame: number;
  endFrame: number;
  ttsId: string;
};

const mapWordsForSegment = (
  item: AudioTimelineItem,
  words: TranscribedWord[],
  fps: number,
): MappedWord[] => {
  const sourceStartMs = (item.sourceStartFrame / fps) * 1000;
  const sourceEndMs =
    ((item.sourceStartFrame + item.sourceDurationInFrames) / fps) * 1000;

  return words
    .filter((word) => {
      const midpoint = (word.startMs + word.endMs) / 2;
      return midpoint >= sourceStartMs && midpoint < sourceEndMs;
    })
    .map((word) => ({
      text: word.text,
      startFrame:
        item.timelineStartFrame +
        Math.max(
          0,
          Math.round(((word.startMs - sourceStartMs) / 1000) * fps),
        ),
      endFrame:
        item.timelineStartFrame +
        Math.min(
          item.durationInFrames,
          Math.max(
            1,
            Math.round(((word.endMs - sourceStartMs) / 1000) * fps),
          ),
        ),
      ttsId: item.id,
    }))
    .filter((word) => word.endFrame > word.startFrame);
};

const groupMappedWords = (
  words: MappedWord[],
  options: SubtitleGenerationOptions,
): Array<{
  text: string;
  startFrame: number;
  endFrame: number;
  ttsIds: string[];
}> => {
  const groups: Array<{
    text: string;
    startFrame: number;
    endFrame: number;
    ttsIds: string[];
  }> = [];

  let current:
    | {
        text: string;
        startFrame: number;
        endFrame: number;
        ttsIds: Set<string>;
      }
    | null = null;

  const flush = () => {
    if (!current || !current.text.trim()) {
      current = null;
      return;
    }
    groups.push({
      text: current.text.trim(),
      startFrame: current.startFrame,
      endFrame: Math.max(current.startFrame + 1, current.endFrame),
      ttsIds: [...current.ttsIds],
    });
    current = null;
  };

  for (const word of words) {
    if (!current) {
      current = {
        text: normalizeWord(word.text),
        startFrame: word.startFrame,
        endFrame: word.endFrame,
        ttsIds: new Set([word.ttsId]),
      };
      continue;
    }

    const candidate = appendWord(current.text, word.text);
    const charLimit = options.maxCharsPerLine * options.maxLines;
    const wouldExceedChars = candidate.length > charLimit;
    const wouldExceedDuration =
      word.endFrame - current.startFrame > options.maxCueDurationFrames;
    const ttsBoundary =
      !current.ttsIds.has(word.ttsId) && current.text.trim().length > 0;
    const punctuation =
      punctuationBreak.test(current.text.trim()) &&
      current.endFrame - current.startFrame >= Math.round(options.fps * 0.45);

    if (
      wouldExceedChars ||
      wouldExceedDuration ||
      ttsBoundary ||
      punctuation
    ) {
      flush();
      current = {
        text: normalizeWord(word.text),
        startFrame: word.startFrame,
        endFrame: word.endFrame,
        ttsIds: new Set([word.ttsId]),
      };
      continue;
    }

    current.text = candidate;
    current.endFrame = word.endFrame;
    current.ttsIds.add(word.ttsId);
  }

  flush();
  return groups;
};

export const generateSubtitlesFromTranscription = ({
  ttsItems,
  wordsBySource,
  options,
}: {
  ttsItems: AudioTimelineItem[];
  wordsBySource: Record<string, TranscribedWord[]>;
  options: SubtitleGenerationOptions;
}): SubtitleTimelineItem[] => {
  const mapped = ttsItems
    .filter((item) => item.type === "TTS" && item.enabled)
    .slice()
    .sort(
      (left, right) =>
        left.timelineStartFrame - right.timelineStartFrame ||
        left.id.localeCompare(right.id),
    )
    .flatMap((item) =>
      mapWordsForSegment(item, wordsBySource[item.src] ?? [], options.fps),
    )
    .sort(
      (left, right) =>
        left.startFrame - right.startFrame ||
        left.endFrame - right.endFrame,
    );

  const groups = groupMappedWords(mapped, options);
  const nextId = createIdFactory(options.existingIds);

  return groups.map((group) =>
    defaultSubtitle(
      nextId(),
      group.text,
      group.startFrame,
      group.endFrame - group.startFrame,
      "TTS_TRANSCRIBE",
      group.ttsIds,
      options,
    ),
  );
};

const splitScriptIntoChunks = (
  script: string,
  maxChars: number,
): string[] => {
  const compact = script.replace(/\s+/g, " ").trim();
  if (!compact) {
    return [];
  }

  const sentences = compact
    .split(/(?<=[.!?。！？…])\s+/u)
    .map((value) => value.trim())
    .filter(Boolean);
  const chunks: string[] = [];

  for (const sentence of sentences) {
    if (sentence.length <= maxChars) {
      chunks.push(sentence);
      continue;
    }

    const words = sentence.split(" ").filter(Boolean);
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (current && next.length > maxChars) {
        chunks.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) {
      chunks.push(current);
    }
  }

  return chunks;
};

const distributeChunksAcrossTts = (
  chunks: string[],
  ttsItems: AudioTimelineItem[],
): Array<{text: string; item: AudioTimelineItem}> => {
  if (chunks.length === 0 || ttsItems.length === 0) {
    return [];
  }

  const totalFrames = ttsItems.reduce(
    (sum, item) => sum + item.durationInFrames,
    0,
  );
  const assignments: Array<{text: string; item: AudioTimelineItem}> = [];
  let chunkIndex = 0;

  for (let itemIndex = 0; itemIndex < ttsItems.length; itemIndex += 1) {
    const item = ttsItems[itemIndex];
    const remainingItems = ttsItems.length - itemIndex;
    const remainingChunks = chunks.length - chunkIndex;
    if (remainingChunks <= 0) {
      break;
    }

    const targetCount =
      itemIndex === ttsItems.length - 1
        ? remainingChunks
        : Math.max(
            1,
            Math.min(
              remainingChunks - (remainingItems - 1),
              Math.round((chunks.length * item.durationInFrames) / totalFrames),
            ),
          );

    for (let count = 0; count < targetCount && chunkIndex < chunks.length; count += 1) {
      assignments.push({text: chunks[chunkIndex], item});
      chunkIndex += 1;
    }
  }

  while (chunkIndex < chunks.length) {
    assignments.push({
      text: chunks[chunkIndex],
      item: ttsItems[ttsItems.length - 1],
    });
    chunkIndex += 1;
  }

  return assignments;
};

const compactTextWeight = (value: string) =>
  Math.max(
    1,
    value
      .normalize("NFKC")
      .replace(/[\s\p{P}\p{S}]+/gu, "")
      .length,
  );

const mapAllTtsWords = ({
  ttsItems,
  wordsBySource,
  fps,
}: {
  ttsItems: AudioTimelineItem[];
  wordsBySource: Record<string, TranscribedWord[]>;
  fps: number;
}): MappedWord[] =>
  ttsItems
    .filter((item) => item.type === "TTS" && item.enabled)
    .slice()
    .sort(
      (left, right) =>
        left.timelineStartFrame - right.timelineStartFrame ||
        left.id.localeCompare(right.id),
    )
    .flatMap((item) =>
      mapWordsForSegment(item, wordsBySource[item.src] ?? [], fps),
    )
    .sort(
      (left, right) =>
        left.startFrame - right.startFrame ||
        left.endFrame - right.endFrame,
    );

export const generateSubtitlesFromScriptAndTranscription = ({
  script,
  ttsItems,
  wordsBySource,
  options,
}: {
  script: string;
  ttsItems: AudioTimelineItem[];
  wordsBySource: Record<string, TranscribedWord[]>;
  options: SubtitleGenerationOptions;
}): SubtitleTimelineItem[] => {
  const chunks = splitScriptIntoChunks(
    script,
    options.maxCharsPerLine * options.maxLines,
  );
  const mapped = mapAllTtsWords({
    ttsItems,
    wordsBySource,
    fps: options.fps,
  });

  if (chunks.length === 0 || mapped.length === 0) {
    return [];
  }

  const scriptWeights = chunks.map(compactTextWeight);
  const totalScriptWeight = scriptWeights.reduce(
    (sum, value) => sum + value,
    0,
  );
  const mappedWeights = mapped.map((word) => compactTextWeight(word.text));
  const mappedCumulative: number[] = [];
  let mappedTotalWeight = 0;
  for (const weight of mappedWeights) {
    mappedTotalWeight += weight;
    mappedCumulative.push(mappedTotalWeight);
  }

  const nextId = createIdFactory(options.existingIds);
  const subtitles: SubtitleTimelineItem[] = [];
  let mappedStartIndex = 0;
  let cumulativeScriptWeight = 0;

  chunks.forEach((chunk, chunkIndex) => {
    if (mappedStartIndex >= mapped.length) {
      return;
    }

    cumulativeScriptWeight += scriptWeights[chunkIndex];
    const remainingChunks = chunks.length - chunkIndex - 1;
    let mappedEndIndex = mapped.length - 1;

    if (remainingChunks > 0) {
      const desiredMappedWeight =
        (mappedTotalWeight * cumulativeScriptWeight) /
        Math.max(1, totalScriptWeight);
      const maximumEndIndex = Math.max(
        mappedStartIndex,
        mapped.length - remainingChunks - 1,
      );

      mappedEndIndex = mappedStartIndex;
      while (
        mappedEndIndex < maximumEndIndex &&
        mappedCumulative[mappedEndIndex] < desiredMappedWeight
      ) {
        mappedEndIndex += 1;
      }
    }

    mappedEndIndex = Math.max(mappedStartIndex, mappedEndIndex);
    const mappedSlice = mapped.slice(
      mappedStartIndex,
      mappedEndIndex + 1,
    );
    const firstWord = mappedSlice[0];
    const lastWord = mappedSlice[mappedSlice.length - 1];
    if (!firstWord || !lastWord) {
      return;
    }

    subtitles.push(
      defaultSubtitle(
        nextId(),
        chunk,
        firstWord.startFrame,
        Math.max(1, lastWord.endFrame - firstWord.startFrame),
        "SCRIPT_TTS_ALIGN",
        [...new Set(mappedSlice.map((word) => word.ttsId))],
        options,
      ),
    );
    mappedStartIndex = mappedEndIndex + 1;
  });

  if (
    mappedStartIndex < mapped.length &&
    subtitles.length > 0
  ) {
    const last = subtitles[subtitles.length - 1];
    const finalWord = mapped[mapped.length - 1];
    last.durationInFrames = Math.max(
      1,
      finalWord.endFrame - last.timelineStartFrame,
    );
    last.generatedFromTtsIds = [
      ...new Set([
        ...(last.generatedFromTtsIds ?? []),
        ...mapped
          .slice(mappedStartIndex)
          .map((word) => word.ttsId),
      ]),
    ];
  }

  return subtitles;
};

export const generateSubtitlesFromScript = ({
  script,
  ttsItems,
  options,
}: {
  script: string;
  ttsItems: AudioTimelineItem[];
  options: SubtitleGenerationOptions;
}): SubtitleTimelineItem[] => {
  const sortedTts = ttsItems
    .filter((item) => item.type === "TTS" && item.enabled)
    .slice()
    .sort(
      (left, right) =>
        left.timelineStartFrame - right.timelineStartFrame ||
        left.id.localeCompare(right.id),
    );
  const chunks = splitScriptIntoChunks(
    script,
    options.maxCharsPerLine * options.maxLines,
  );
  const assignments = distributeChunksAcrossTts(chunks, sortedTts);
  const nextId = createIdFactory(options.existingIds);

  const perItem = new Map<string, Array<{text: string; item: AudioTimelineItem}>>();
  for (const assignment of assignments) {
    const current = perItem.get(assignment.item.id) ?? [];
    current.push(assignment);
    perItem.set(assignment.item.id, current);
  }

  const subtitles: SubtitleTimelineItem[] = [];
  for (const item of sortedTts) {
    const assigned = perItem.get(item.id) ?? [];
    if (assigned.length === 0) {
      continue;
    }

    const weights = assigned.map((entry) =>
      Math.max(1, entry.text.replace(/\s+/g, "").length),
    );
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    let cursor = item.timelineStartFrame;

    assigned.forEach((entry, index) => {
      const remaining =
        item.timelineStartFrame + item.durationInFrames - cursor;
      const duration =
        index === assigned.length - 1
          ? Math.max(1, remaining)
          : Math.max(
              1,
              Math.round(
                (item.durationInFrames * weights[index]) / totalWeight,
              ),
            );
      subtitles.push(
        defaultSubtitle(
          nextId(),
          entry.text,
          cursor,
          Math.min(duration, Math.max(1, remaining)),
          "SCRIPT_TIMING",
          [item.id],
          options,
        ),
      );
      cursor += duration;
    });
  }

  return subtitles;
};

export const findSubtitleTrackId = (project: EditProject): string | null => {
  const textTracks = project.tracks
    .filter((track) => track.type === "TEXT" && track.enabled)
    .sort((left, right) => left.order - right.order);
  return (
    textTracks.find((track) => /subtitle|caption|자막/i.test(track.name))?.id ??
    textTracks[0]?.id ??
    null
  );
};
