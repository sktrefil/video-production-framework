import type {SubtitleTimelineItem} from "../editorTypes";
import type {SubtitleTimingQcIssue} from "./subtitleTimingQc";

export type SubtitleQcNavigationTarget = {
  subtitleId: string | null;
  frame: number;
};

const clampFrame = (frame: number, durationInFrames: number) =>
  Math.max(
    0,
    Math.min(
      Math.max(0, Math.round(durationInFrames) - 1),
      Math.round(frame),
    ),
  );

const cueEnd = (item: SubtitleTimelineItem) =>
  item.timelineStartFrame + item.durationInFrames;

export const resolveSubtitleQcNavigationTarget = ({
  issue,
  subtitles,
  durationInFrames,
}: {
  issue: SubtitleTimingQcIssue;
  subtitles: SubtitleTimelineItem[];
  durationInFrames: number;
}): SubtitleQcNavigationTarget => {
  const byId = new Map(subtitles.map((item) => [item.id, item]));
  const referenced = issue.subtitleIds
    .map((id) => byId.get(id))
    .filter((item): item is SubtitleTimelineItem => Boolean(item));

  const fallbackFrame =
    referenced[0]?.timelineStartFrame ??
    issue.frame ??
    0;
  const rawFrame =
    Number.isFinite(issue.frame) && issue.frame !== undefined
      ? issue.frame
      : fallbackFrame;
  const frame = clampFrame(rawFrame, durationInFrames);

  if (referenced.length === 0) {
    const nearest = subtitles
      .slice()
      .sort((left, right) => {
        const leftDistance =
          frame < left.timelineStartFrame
            ? left.timelineStartFrame - frame
            : frame > cueEnd(left)
              ? frame - cueEnd(left)
              : 0;
        const rightDistance =
          frame < right.timelineStartFrame
            ? right.timelineStartFrame - frame
            : frame > cueEnd(right)
              ? frame - cueEnd(right)
              : 0;
        return (
          leftDistance - rightDistance ||
          Math.abs(left.timelineStartFrame - frame) -
            Math.abs(right.timelineStartFrame - frame) ||
          left.id.localeCompare(right.id)
        );
      })[0];

    return {
      subtitleId: nearest?.id ?? null,
      frame,
    };
  }

  const selected = referenced
    .slice()
    .sort(
      (left, right) =>
        Math.abs(left.timelineStartFrame - frame) -
          Math.abs(right.timelineStartFrame - frame) ||
        left.id.localeCompare(right.id),
    )[0];

  return {
    subtitleId: selected?.id ?? null,
    frame,
  };
};

export const scrollTimelineSubtitleIntoView = (subtitleId: string) => {
  if (typeof document === "undefined") {
    return;
  }

  const scroll = () => {
    const element = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-editor-timeline-item]",
      ),
    ).find(
      (candidate) =>
        candidate.dataset.editorTimelineItem === subtitleId,
    );
    if (!element) {
      return;
    }
    element.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
    element.focus({preventScroll: true});
  };

  if (typeof window === "undefined") {
    scroll();
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(scroll);
  });
};
