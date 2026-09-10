export type BgmConfig = {
  enabled: boolean;
  path: string;
  originalName?: string;
  volume: number;
  startFrame: number;
};

export type StudioAudioState = {
  projectId: string;
  fps: number;
  durationInFrames: number;
  bgm: BgmConfig;
  inbox: BgmInboxAsset[];
};

export type BgmInboxAsset = {
  name: string;
  sizeBytes: number;
};

export type PatchBgmRequest = Partial<
  Pick<BgmConfig, "enabled" | "volume" | "startFrame">
>;
