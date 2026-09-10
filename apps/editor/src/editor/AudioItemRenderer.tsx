import {Audio} from "@remotion/media";
import {interpolate} from "remotion";
import type {FC} from "react";
import type {AudioTimelineItem} from "../studio/editor/editorTypes";
import {resolveEditorMediaSrc} from "./mediaSource";

const envelope = (
  frame: number,
  durationInFrames: number,
  fadeInFrames: number,
  fadeOutFrames: number,
): number => {
  const fadeIn =
    fadeInFrames > 0
      ? interpolate(frame, [0, fadeInFrames], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;
  const fadeOutStart = Math.max(0, durationInFrames - fadeOutFrames);
  const fadeOut =
    fadeOutFrames > 0
      ? interpolate(frame, [fadeOutStart, durationInFrames], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  return Math.min(fadeIn, fadeOut);
};

export const AudioItemRenderer: FC<{
  item: AudioTimelineItem;
  masterVolume: number;
}> = ({item, masterVolume}) => {
  return (
    <Audio
      src={resolveEditorMediaSrc(item.src)}
      trimBefore={item.sourceStartFrame}
      trimAfter={item.sourceStartFrame + item.sourceDurationInFrames}
      muted={item.muted}
      loop={item.loop === true}
      loopVolumeCurveBehavior="extend"
      volume={(frame: number) =>
        item.volume *
        masterVolume *
        envelope(frame, item.durationInFrames, item.fadeInFrames, item.fadeOutFrames)
      }
    />
  );
};
