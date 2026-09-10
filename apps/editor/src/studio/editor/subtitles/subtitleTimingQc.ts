import type {
  AudioTimelineItem,
  SubtitleTimelineItem,
} from "../editorTypes";

export type SubtitleTimingQcSeverity = "ERROR" | "WARN";

export type SubtitleTimingQcCode =
  | "INVALID_TIMING"
  | "OVERLAP"
  | "TOO_SHORT"
  | "TOO_LONG"
  | "TOO_MANY_LINES"
  | "LINE_TOO_LONG"
  | "MISSING_TTS_REFERENCE"
  | "OUTSIDE_TTS_RANGE"
  | "NO_SPEECH_OVERLAP"
  | "LONG_GAP"
  | "LEADING_GAP"
  | "TRAILING_GAP";

export type SubtitleTimingQcIssue = {
  code: SubtitleTimingQcCode;
  severity: SubtitleTimingQcSeverity;
  message: string;
  subtitleIds: string[];
  frame?: number;
  frames?: number;
};

export type SubtitleTimingQcReport = {
  status: "PASS" | "WARN" | "FAIL";
  cueCount: number;
  errorCount: number;
  warningCount: number;
  issues: SubtitleTimingQcIssue[];
  metrics: {
    minimumDurationFrames: number | null;
    maximumDurationFrames: number | null;
    maximumGapFrames: number;
  };
};

export type SubtitleTimingQcWord = {
  text: string;
  startMs: number;
  endMs: number;
};

export type SubtitleTimingQcOptions = {
  fps: number;
  maxCharsPerLine: number;
  maxLines: number;
  minCueDurationSeconds?: number;
  maxCueDurationSeconds?: number;
  maxGapSeconds?: number;
  edgeGapSeconds?: number;
  ttsToleranceFrames?: number;
};

const enabledTts = (items: AudioTimelineItem[]) =>
  items
    .filter((item) => item.type === "TTS" && item.enabled)
    .slice()
    .sort(
      (left, right) =>
        left.timelineStartFrame - right.timelineStartFrame ||
        left.id.localeCompare(right.id),
    );

const cueEnd = (item: SubtitleTimelineItem) =>
  item.timelineStartFrame + item.durationInFrames;

const audioEnd = (item: AudioTimelineItem) =>
  item.timelineStartFrame + item.durationInFrames;

const overlapsAnyTtsWindow = (
  startFrame: number,
  endFrame: number,
  ttsItems: AudioTimelineItem[],
) =>
  ttsItems.some(
    (item) =>
      item.timelineStartFrame < endFrame &&
      audioEnd(item) > startFrame,
  );

const mapSpeechWordsForTts = (
  item: AudioTimelineItem,
  words: SubtitleTimingQcWord[],
  fps: number,
) => {
  const sourceStartMs = (item.sourceStartFrame / fps) * 1000;
  const sourceEndMs =
    ((item.sourceStartFrame + item.sourceDurationInFrames) / fps) * 1000;

  return words
    .filter((word) => {
      const midpoint = (word.startMs + word.endMs) / 2;
      return midpoint >= sourceStartMs && midpoint < sourceEndMs;
    })
    .map((word) => {
      const startFrame =
        item.timelineStartFrame +
        Math.max(
          0,
          Math.round((word.startMs / 1000) * fps) -
            item.sourceStartFrame,
        );
      const endFrame =
        item.timelineStartFrame +
        Math.max(
          1,
          Math.round((word.endMs / 1000) * fps) -
            item.sourceStartFrame,
        );
      return {
        startFrame,
        endFrame: Math.max(startFrame + 1, endFrame),
      };
    });
};

const issue = (
  code: SubtitleTimingQcCode,
  severity: SubtitleTimingQcSeverity,
  message: string,
  subtitleIds: string[],
  frame?: number,
  frames?: number,
): SubtitleTimingQcIssue => ({
  code,
  severity,
  message,
  subtitleIds,
  ...(frame === undefined ? {} : {frame}),
  ...(frames === undefined ? {} : {frames}),
});

export const runSubtitleTimingQc = ({
  subtitles,
  ttsItems,
  options,
  wordsBySource,
}: {
  subtitles: SubtitleTimelineItem[];
  ttsItems: AudioTimelineItem[];
  options: SubtitleTimingQcOptions;
  wordsBySource?: Record<string, SubtitleTimingQcWord[]>;
}): SubtitleTimingQcReport => {
  const fps = Math.max(1, Number(options.fps) || 30);
  const minCueFrames = Math.max(
    1,
    Math.round(fps * (options.minCueDurationSeconds ?? 0.3)),
  );
  const maxCueFrames = Math.max(
    minCueFrames,
    Math.round(fps * (options.maxCueDurationSeconds ?? 2.6)),
  );
  const maxGapFrames = Math.max(
    1,
    Math.round(fps * (options.maxGapSeconds ?? 1.25)),
  );
  const edgeGapFrames = Math.max(
    1,
    Math.round(fps * (options.edgeGapSeconds ?? 1.0)),
  );
  const toleranceFrames = Math.max(
    0,
    Math.round(options.ttsToleranceFrames ?? 2),
  );
  const maxCharsPerLine = Math.max(1, Math.round(options.maxCharsPerLine));
  const maxLines = Math.max(1, Math.round(options.maxLines));

  const cues = subtitles
    .filter((item) => item.type === "SUBTITLE" && item.enabled)
    .slice()
    .sort(
      (left, right) =>
        left.timelineStartFrame - right.timelineStartFrame ||
        left.id.localeCompare(right.id),
    );
  const tts = enabledTts(ttsItems);
  const ttsById = new Map(tts.map((item) => [item.id, item]));
  const issues: SubtitleTimingQcIssue[] = [];

  for (const cue of cues) {
    const start = cue.timelineStartFrame;
    const end = cueEnd(cue);

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(cue.durationInFrames) ||
      start < 0 ||
      cue.durationInFrames <= 0 ||
      end <= start
    ) {
      issues.push(
        issue(
          "INVALID_TIMING",
          "ERROR",
          `${cue.id}: 잘못된 시작/길이 값입니다.`,
          [cue.id],
          start,
          cue.durationInFrames,
        ),
      );
      continue;
    }

    if (cue.durationInFrames < minCueFrames) {
      issues.push(
        issue(
          "TOO_SHORT",
          "WARN",
          `${cue.id}: ${(cue.durationInFrames / fps).toFixed(2)}초로 너무 짧습니다.`,
          [cue.id],
          start,
          cue.durationInFrames,
        ),
      );
    }

    if (cue.durationInFrames > maxCueFrames) {
      issues.push(
        issue(
          "TOO_LONG",
          "WARN",
          `${cue.id}: ${(cue.durationInFrames / fps).toFixed(2)}초로 권장 길이를 초과합니다.`,
          [cue.id],
          start,
          cue.durationInFrames,
        ),
      );
    }

    const lines = cue.text.split(/\r?\n/);
    if (lines.length > maxLines) {
      issues.push(
        issue(
          "TOO_MANY_LINES",
          "WARN",
          `${cue.id}: ${lines.length}줄입니다. 최대 ${maxLines}줄을 권장합니다.`,
          [cue.id],
          start,
        ),
      );
    }

    const longestLine = lines.reduce(
      (longest, line) => Math.max(longest, [...line].length),
      0,
    );
    if (longestLine > maxCharsPerLine) {
      issues.push(
        issue(
          "LINE_TOO_LONG",
          "WARN",
          `${cue.id}: 한 줄 ${longestLine}자로 기준 ${maxCharsPerLine}자를 초과합니다.`,
          [cue.id],
          start,
        ),
      );
    }

    const referenceIds = cue.generatedFromTtsIds ?? [];
    const referencedTts = referenceIds
      .map((id) => ttsById.get(id))
      .filter((item): item is AudioTimelineItem => Boolean(item));

    if (
      cue.generationSource &&
      cue.generationSource !== "MANUAL" &&
      referencedTts.length === 0
    ) {
      issues.push(
        issue(
          "MISSING_TTS_REFERENCE",
          "WARN",
          `${cue.id}: 생성 근거 TTS Segment를 찾을 수 없습니다.`,
          [cue.id],
          start,
        ),
      );
    }

    if (referencedTts.length > 0) {
      const referenceStart = Math.min(
        ...referencedTts.map((item) => item.timelineStartFrame),
      );
      const referenceEnd = Math.max(
        ...referencedTts.map((item) => audioEnd(item)),
      );
      if (
        start < referenceStart - toleranceFrames ||
        end > referenceEnd + toleranceFrames
      ) {
        issues.push(
          issue(
            "OUTSIDE_TTS_RANGE",
            "ERROR",
            `${cue.id}: 자막이 연결된 TTS Segment 범위를 벗어납니다.`,
            [cue.id],
            start,
          ),
        );
      }

      if (wordsBySource) {
        const speechWindows = referencedTts.flatMap((item) =>
          mapSpeechWordsForTts(
            item,
            wordsBySource[item.src] ?? [],
            fps,
          ),
        );
        const overlapsSpeech = speechWindows.some(
          (window) =>
            window.startFrame < end &&
            window.endFrame > start,
        );
        if (speechWindows.length > 0 && !overlapsSpeech) {
          issues.push(
            issue(
              "NO_SPEECH_OVERLAP",
              "ERROR",
              `${cue.id}: 실제 발화 word timing과 겹치지 않아 무음 구간 자막 가능성이 있습니다.`,
              [cue.id],
              start,
              cue.durationInFrames,
            ),
          );
        }
      }
    }
  }

  let maximumObservedGap = 0;
  for (let index = 1; index < cues.length; index += 1) {
    const previous = cues[index - 1];
    const current = cues[index];
    const previousEnd = cueEnd(previous);
    const gap = current.timelineStartFrame - previousEnd;

    if (gap < 0) {
      issues.push(
        issue(
          "OVERLAP",
          "ERROR",
          `${previous.id} / ${current.id}: ${Math.abs(gap)} frame 겹칩니다.`,
          [previous.id, current.id],
          current.timelineStartFrame,
          Math.abs(gap),
        ),
      );
      continue;
    }

    maximumObservedGap = Math.max(maximumObservedGap, gap);
    if (
      gap > maxGapFrames &&
      overlapsAnyTtsWindow(previousEnd, current.timelineStartFrame, tts)
    ) {
      issues.push(
        issue(
          "LONG_GAP",
          "WARN",
          `${previous.id} → ${current.id}: 자막 사이 공백이 ${(gap / fps).toFixed(2)}초입니다.`,
          [previous.id, current.id],
          previousEnd,
          gap,
        ),
      );
    }
  }

  if (cues.length > 0 && tts.length > 0) {
    const firstCue = cues[0];
    const lastCue = cues[cues.length - 1];
    const firstTtsFrame = Math.min(
      ...tts.map((item) => item.timelineStartFrame),
    );
    const lastTtsFrame = Math.max(...tts.map((item) => audioEnd(item)));

    const leadingGap = firstCue.timelineStartFrame - firstTtsFrame;
    if (leadingGap > edgeGapFrames) {
      issues.push(
        issue(
          "LEADING_GAP",
          "WARN",
          `첫 TTS 시작 후 ${(leadingGap / fps).toFixed(2)}초 동안 자막이 없습니다.`,
          [firstCue.id],
          firstTtsFrame,
          leadingGap,
        ),
      );
    }

    const trailingGap = lastTtsFrame - cueEnd(lastCue);
    if (trailingGap > edgeGapFrames) {
      issues.push(
        issue(
          "TRAILING_GAP",
          "WARN",
          `마지막 자막 뒤 TTS가 ${(trailingGap / fps).toFixed(2)}초 더 이어집니다.`,
          [lastCue.id],
          cueEnd(lastCue),
          trailingGap,
        ),
      );
    }
  }

  const errorCount = issues.filter((entry) => entry.severity === "ERROR").length;
  const warningCount = issues.length - errorCount;
  const durations = cues
    .map((item) => item.durationInFrames)
    .filter((value) => Number.isFinite(value) && value > 0);

  return {
    status: errorCount > 0 ? "FAIL" : warningCount > 0 ? "WARN" : "PASS",
    cueCount: cues.length,
    errorCount,
    warningCount,
    issues,
    metrics: {
      minimumDurationFrames:
        durations.length > 0 ? Math.min(...durations) : null,
      maximumDurationFrames:
        durations.length > 0 ? Math.max(...durations) : null,
      maximumGapFrames: maximumObservedGap,
    },
  };
};
