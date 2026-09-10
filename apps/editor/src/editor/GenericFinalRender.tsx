import type {CalculateMetadataFunction} from "remotion";
import type {FC} from "react";
import type {EditProject} from "../studio/editor/editorTypes";
import {ProjectRenderer} from "./ProjectRenderer";

export type GenericFinalRenderProps = {
  project: EditProject;
};

export const GenericFinalRender: FC<GenericFinalRenderProps> = ({
  project,
}) => <ProjectRenderer project={project} />;

export const calculateGenericFinalRenderMetadata: CalculateMetadataFunction<
  GenericFinalRenderProps
> = ({props}) => {
  const metadata = props.project.project;
  return {
    durationInFrames: metadata.durationInFrames,
    fps: metadata.fps,
    width: metadata.width,
    height: metadata.height,
    props,
    defaultCodec: "h264",
    defaultPixelFormat: "yuv420p",
  };
};
