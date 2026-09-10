import type {
  GenerateSfxRequest,
  ImportInboxSfxRequest,
  PatchSfxRequest,
  RestoreSfxRequest,
  SfxItem,
  SfxState,
  UploadSfxRequest,
} from "./sfx-types";

import {getEditorApiBase} from "../../editor/runtimeConfig.ts";

type ApiEnvelope<T> = {
  success: boolean;
  error?: string;
} & T;

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${getEditorApiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.success) {
    throw new Error(
      payload.error || `SFX API request failed (${response.status})`,
    );
  }

  return payload;
};

export const getSfxState = async (): Promise<SfxState> => {
  const payload = await request<SfxState>("/api/sfx");
  return {
    ready: payload.ready,
    fps: payload.fps,
    durationInFrames: payload.durationInFrames,
    projectId: payload.projectId,
    sfx: payload.sfx,
    inbox: payload.inbox,
  };
};

export const inboxPreviewUrl = (name: string) =>
  `${getEditorApiBase()}/api/sfx/inbox/audio?name=${encodeURIComponent(name)}`;

export const importInboxSfx = async (
  input: ImportInboxSfxRequest,
): Promise<SfxItem> => {
  const payload = await request<{ sfx: SfxItem }>("/api/sfx/inbox/import", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return payload.sfx;
};

export const generateSfx = async (
  input: GenerateSfxRequest,
): Promise<SfxItem> => {
  const payload = await request<{ sfx: SfxItem }>("/api/sfx/generate", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return payload.sfx;
};

export const patchSfx = async (
  id: string,
  patch: PatchSfxRequest,
): Promise<SfxItem> => {
  const payload = await request<{ sfx: SfxItem }>(
    `/api/sfx/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
  return payload.sfx;
};

export const deleteSfx = async (id: string): Promise<SfxItem> => {
  const payload = await request<{ sfx: SfxItem }>(
    `/api/sfx/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
  return payload.sfx;
};

export const restoreSfx = async (
  input: RestoreSfxRequest,
): Promise<SfxItem> => {
  const payload = await request<{ sfx: SfxItem }>("/api/sfx/restore", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return payload.sfx;
};

export const uploadSfx = async ({
  file,
  startFrame,
  durationSeconds,
  volume,
}: UploadSfxRequest): Promise<SfxItem> => {
  const response = await fetch(`${getEditorApiBase()}/api/sfx/upload`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
      "X-Start-Frame": String(startFrame),
      "X-Duration-Seconds": String(durationSeconds),
      "X-Volume": String(volume),
    },
    body: file,
  });
  const payload = (await response.json()) as ApiEnvelope<{ sfx: SfxItem }>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `SFX upload failed (${response.status})`);
  }
  return payload.sfx;
};
