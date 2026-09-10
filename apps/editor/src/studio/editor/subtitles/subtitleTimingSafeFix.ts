import type {
  AudioTimelineItem,
  SubtitleTimelineItem,
} from "../editorTypes";
import type {
  SubtitleTimingQcCode,
  SubtitleTimingQcIssue,
} from "./subtitleTimingQc";

export const SAFE_FIXABLE_SUBTITLE_QC_CODES = new Set<
  SubtitleTimingQcCode
>([
  "OVERLAP",
  "TOO_SHORT",
  "OUTSIDE_TTS_RANGE",
]);

export type SubtitleTimingSafeFixResult = {
  applied: boolean;
  subtitles: SubtitleTimelineItem[];
  summary: string;
  affectedSubtitleIds: string[];
};

const cueEnd = (item: SubtitleTimelineItem) =>
  item.timelineStartFrame + item.durationInFrames;

const audioEnd = (item: AudioTimelineItem) =>
  item.timelineStartFrame + item.durationInFrames;

const replaceCue = (
  subtitles: SubtitleTimelineItem[],
  updated: SubtitleTimelineItem,
) =>
  subtitles.map((item) => (item.id === updated.id ? updated : item));

const referencedTtsBounds = (
  item: SubtitleTimelineItem,
  ttsItems: AudioTimelineItem[],
) => {
  const ids = new Set(item.generatedFromTtsIds ?? []);
  const referenced = ttsItems.filter(
    (candidate) =>
      candidate.type === "TTS" &&
      candidate.enabled &&
      ids.has(candidate.id),
  );
  if (referenced.length === 0) {
    return null;
  }
  return {
    startFrame: Math.min(
      ...referenced.map((candidate) => candidate.timelineStartFrame),
    ),
    endFrame: Math.max(...referenced.map((candidate) => audioEnd(candidate))),
  };
};

const neighborsForCue = (
  cue: SubtitleTimelineItem,
  subtitles: SubtitleTimelineItem[],
) => {
  const enabled = subtitles
    .filter(
      (candidate) =>
        candidate.enabled &&
        candidate.id !== cue.id &&
        candidate.type === "SUBTITLE",
    )
    .slice()
    .sort(
      (left, right) =>
        left.timelineStartFrame - right.timelineStartFrame ||
        left.id.localeCompare(right.id),
    );
  const previousCandidates = enabled.filter(
    (candidate) =>
      candidate.timelineStartFrame < cue.timelineStartFrame,
  );
  const previous =
    previousCandidates[previousCandidates.length - 1];
  const next = enabled.find(
    (candidate) =>
      candidate.timelineStartFrame > cue.timelineStartFrame,
  );
  return {previous, next};
};

const noChange = (
  subtitles: SubtitleTimelineItem[],
  summary: string,
): SubtitleTimingSafeFixResult => ({
  applied: false,
  subtitles,
  summary,
  affectedSubtitleIds: [],
});

const isGeneratedSafeFixCue = (item: SubtitleTimelineItem) =>
  Boolean(
    item.generationSource &&
      item.generationSource !== "MANUAL",
  );

export const canSafeFixSubtitleTimingIssue = (
  issue: SubtitleTimingQcIssue,
) => SAFE_FIXABLE_SUBTITLE_QC_CODES.has(issue.code);

export const applySubtitleTimingSafeFix = ({
  issue,
  subtitles,
  ttsItems,
  fps,
  projectDurationInFrames,
}: {
  issue: SubtitleTimingQcIssue;
  subtitles: SubtitleTimelineItem[];
  ttsItems: AudioTimelineItem[];
  fps: number;
  projectDurationInFrames: number;
}): SubtitleTimingSafeFixResult => {
  if (!canSafeFixSubtitleTimingIssue(issue)) {
    return noChange(
      subtitles,
      `${issue.code}: 자동 수정하지 않는 QC 항목입니다.`,
    );
  }

  const byId = new Map(subtitles.map((item) => [item.id, item]));

  if (issue.code === "OVERLAP") {
    const pair = issue.subtitleIds
      .map((id) => byId.get(id))
      .filter((item): item is SubtitleTimelineItem => Boolean(item))
      .sort(
        (left, right) =>
          left.timelineStartFrame - right.timelineStartFrame ||
          left.id.localeCompare(right.id),
      );
    if (pair.length < 2) {
      return noChange(subtitles, "겹침 자막 쌍을 찾지 못했습니다.");
    }

    const previous = pair[0];
    const current = pair[1];
    if (previous.locked || current.locked) {
      return noChange(subtitles, "잠긴 자막은 Safe Fix하지 않습니다.");
    }
    if (
      !isGeneratedSafeFixCue(previous) ||
      !isGeneratedSafeFixCue(current)
    ) {
      return noChange(
        subtitles,
        "수동 자막이 포함된 겹침은 자동 수정하지 않습니다.",
      );
    }

    const nextDuration =
      current.timelineStartFrame - previous.timelineStartFrame;
    if (
      nextDuration < 1 ||
      nextDuration >= previous.durationInFrames
    ) {
      return noChange(
        subtitles,
        "앞 자막을 안전하게 축소할 수 없는 겹침입니다.",
      );
    }

    return {
      applied: true,
      subtitles: replaceCue(subtitles, {
        ...previous,
        durationInFrames: nextDuration,
      }),
      summary: `${previous.id} 끝을 F${current.timelineStartFrame}에 맞춰 겹침을 제거했습니다.`,
      affectedSubtitleIds: [previous.id],
    };
  }

  const targetId = issue.subtitleIds[0];
  const target = targetId ? byId.get(targetId) : undefined;
  if (!target) {
    return noChange(subtitles, "QC 대상 자막을 찾지 못했습니다.");
  }
  if (target.locked) {
    return noChange(subtitles, "잠긴 자막은 Safe Fix하지 않습니다.");
  }
  if (!isGeneratedSafeFixCue(target)) {
    return noChange(subtitles, "수동 자막은 Safe Fix하지 않습니다.");
  }

  const projectEnd = Math.max(1, Math.round(projectDurationInFrames));
  const bounds = referencedTtsBounds(target, ttsItems);
  const {previous, next} = neighborsForCue(target, subtitles);
  const neighborLeft = previous ? cueEnd(previous) : 0;
  const neighborRight = next
    ? next.timelineStartFrame
    : projectEnd;

  if (issue.code === "OUTSIDE_TTS_RANGE") {
    if (!bounds) {
      return noChange(
        subtitles,
        "연결된 TTS Segment가 없어 범위를 안전하게 보정할 수 없습니다.",
      );
    }

    const currentStart = target.timelineStartFrame;
    const currentEnd = cueEnd(target);
    const allowedStart = Math.max(
      0,
      bounds.startFrame,
      neighborLeft,
    );
    const allowedEnd = Math.min(
      projectEnd,
      bounds.endFrame,
      neighborRight,
    );
    const nextStart = Math.max(currentStart, allowedStart);
    const nextEnd = Math.min(currentEnd, allowedEnd);

    if (
      nextEnd <= nextStart ||
      (nextStart === currentStart && nextEnd === currentEnd)
    ) {
      return noChange(
        subtitles,
        "TTS 범위와 자막이 충분히 겹치지 않아 자동 이동하지 않습니다.",
      );
    }

    return {
      applied: true,
      subtitles: replaceCue(subtitles, {
        ...target,
        timelineStartFrame: nextStart,
        durationInFrames: nextEnd - nextStart,
      }),
      summary: `${target.id}를 연결된 TTS 범위 F${nextStart}–F${nextEnd} 안으로 잘랐습니다.`,
      affectedSubtitleIds: [target.id],
    };
  }

  const minimumDurationFrames = Math.max(
    1,
    Math.round(Math.max(1, fps) * 0.3),
  );
  if (target.durationInFrames >= minimumDurationFrames) {
    return noChange(subtitles, "이미 최소 자막 길이를 충족합니다.");
  }

  if (!bounds) {
    return noChange(
      subtitles,
      "연결된 TTS Segment가 없는 짧은 자막은 자동 확장하지 않습니다.",
    );
  }

  const leftBound = Math.max(
    0,
    neighborLeft,
    bounds.startFrame,
  );
  const rightBound = Math.min(
    projectEnd,
    neighborRight,
    bounds.endFrame,
  );
  if (rightBound - leftBound < minimumDurationFrames) {
    return noChange(
      subtitles,
      "주변 자막/TTS 범위가 좁아 안전하게 최소 길이까지 늘릴 수 없습니다.",
    );
  }

  let nextStart = target.timelineStartFrame;
  let nextEnd = cueEnd(target);
  let needed = minimumDurationFrames - target.durationInFrames;

  const extendRight = Math.max(
    0,
    Math.min(needed, rightBound - nextEnd),
  );
  nextEnd += extendRight;
  needed -= extendRight;

  const extendLeft = Math.max(
    0,
    Math.min(needed, nextStart - leftBound),
  );
  nextStart -= extendLeft;
  needed -= extendLeft;

  if (needed > 0 || nextEnd - nextStart < minimumDurationFrames) {
    return noChange(
      subtitles,
      "최소 길이 확보에 필요한 안전 여유를 찾지 못했습니다.",
    );
  }

  return {
    applied: true,
    subtitles: replaceCue(subtitles, {
      ...target,
      timelineStartFrame: nextStart,
      durationInFrames: nextEnd - nextStart,
    }),
    summary: `${target.id}를 ${(minimumDurationFrames / Math.max(1, fps)).toFixed(2)}초까지 안전 범위 안에서 확장했습니다.`,
    affectedSubtitleIds: [target.id],
  };
};

export const applyAllSubtitleTimingSafeFixes = ({
  issues,
  subtitles,
  ttsItems,
  fps,
  projectDurationInFrames,
}: {
  issues: SubtitleTimingQcIssue[];
  subtitles: SubtitleTimelineItem[];
  ttsItems: AudioTimelineItem[];
  fps: number;
  projectDurationInFrames: number;
}) => {
  const priority: Record<SubtitleTimingQcCode, number> = {
    OUTSIDE_TTS_RANGE: 0,
    OVERLAP: 1,
    TOO_SHORT: 2,
    INVALID_TIMING: 99,
    TOO_LONG: 99,
    TOO_MANY_LINES: 99,
    LINE_TOO_LONG: 99,
    MISSING_TTS_REFERENCE: 99,
    NO_SPEECH_OVERLAP: 99,
    LONG_GAP: 99,
    LEADING_GAP: 99,
    TRAILING_GAP: 99,
  };

  let working = subtitles;
  const summaries: string[] = [];
  const affected = new Set<string>();

  for (const entry of issues
    .filter(canSafeFixSubtitleTimingIssue)
    .slice()
    .sort(
      (left, right) =>
        priority[left.code] - priority[right.code] ||
        (left.frame ?? 0) - (right.frame ?? 0),
    )) {
    const result = applySubtitleTimingSafeFix({
      issue: entry,
      subtitles: working,
      ttsItems,
      fps,
      projectDurationInFrames,
    });
    if (!result.applied) {
      continue;
    }
    working = result.subtitles;
    summaries.push(result.summary);
    result.affectedSubtitleIds.forEach((id) => affected.add(id));
  }

  return {
    appliedCount: summaries.length,
    subtitles: working,
    summaries,
    affectedSubtitleIds: [...affected],
  };
};
