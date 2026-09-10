import type {
  BgmConfig,
  PatchBgmRequest,
  StudioAudioState,
} from "./audio-types";

import {getEditorApiBase} from "../../editor/runtimeConfig.ts";

type Envelope<T> = {success: boolean; error?: string} & T;

const jsonRequest = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${getEditorApiBase()}${path}`, {
    ...init,
    headers: {"Content-Type": "application/json", ...(init?.headers ?? {})},
  });
  const payload = (await response.json()) as Envelope<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `Studio audio API failed (${response.status})`);
  }
  return payload;
};

export const getStudioAudioState = () =>
  jsonRequest<StudioAudioState>("/api/editor-state");

export const bgmInboxPreviewUrl = (name: string) =>
  `${getEditorApiBase()}/api/bgm/inbox/audio?name=${encodeURIComponent(name)}`;

export const importInboxBgm = (input: {
  name: string;
  volume: number;
  startFrame: number;
}) =>
  jsonRequest<StudioAudioState>("/api/bgm/inbox/import", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const uploadBgm = async (
  file: File,
  volume: number,
  startFrame: number,
): Promise<StudioAudioState> => {
  const response = await fetch(`${getEditorApiBase()}/api/bgm`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
      "X-Volume": String(volume),
      "X-Start-Frame": String(startFrame),
    },
    body: file,
  });
  const payload = (await response.json()) as Envelope<StudioAudioState>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `BGM upload failed (${response.status})`);
  }
  return payload;
};

export const patchBgm = async (patch: PatchBgmRequest): Promise<BgmConfig> => {
  const payload = await jsonRequest<{bgm: BgmConfig}>("/api/bgm", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return payload.bgm;
};

export const removeBgm = async (): Promise<BgmConfig> => {
  const payload = await jsonRequest<{bgm: BgmConfig}>("/api/bgm", {
    method: "DELETE",
  });
  return payload.bgm;
};
