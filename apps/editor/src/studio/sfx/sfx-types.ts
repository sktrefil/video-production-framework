export type SfxItem = {
  id?: string;
  label?: string;
  enabled?: boolean;
  path: string;
  startFrame: number;
  durationInFrames: number;
  volume: number;
};

export type SfxState = {
  ready: boolean;
  fps: number | null;
  durationInFrames: number | null;
  projectId: string;
  sfx: SfxItem[];
  inbox: InboxSfxAsset[];
};

export type InboxSfxAsset = {
  name: string;
  sizeBytes: number;
};

export type GenerateSfxRequest = {
  startFrame: number;
  fps: number;
  prompt: string;
  durationSeconds: number;
  volume: number;
  promptInfluence: number;
  loop: boolean;
  label?: string;
};

export type PatchSfxRequest = Partial<
  Pick<
    SfxItem,
    "path" | "startFrame" | "durationInFrames" | "volume" | "enabled" | "label"
  >
>;

export type UploadSfxRequest = {
  file: File;
  startFrame: number;
  durationSeconds: number;
  volume: number;
};

export type RestoreSfxRequest = {
  item: SfxItem;
};

export type ImportInboxSfxRequest = {
  name: string;
  startFrame: number;
  fps: number;
  durationSeconds: number;
  volume: number;
  targetId?: string;
};
