import {createHash} from "node:crypto";
import {assertUnifiedProject, type UnifiedProjectPolicy} from "@vpf/legacy-guard";
import {assertIsolatedPath} from "@vpf/legacy-guard/filesystem";
import {copyFile, mkdir, readFile, rename, rm, stat} from "node:fs/promises";
import {basename, dirname, extname, resolve} from "node:path";
import {parseMedia} from "@remotion/media-parser";
import {nodeReader} from "@remotion/media-parser/node";
import type {MediaArtifact} from "@vpf/domain";
import type {OutboxRecord, WorkflowEvent} from "@vpf/workflow";
import {
  normalizeProjectRelativePath,
  resolveProjectRelativePath,
  resolveProjectWorkspace,
  type WorkspaceResolverOptions
} from "@vpf/workspace";

export type LocalAudioKind = "CLIP_AUDIO" | "BGM" | "SFX";

export interface AudioImportProbe {
  mimeType: string;
  durationMs: number;
  sizeBytes: number;
  audioCodec: string;
  container: string;
}

export interface AudioImportPersistencePort {
  getProjectPolicy(projectId: string): Promise<UnifiedProjectPolicy | null>;
  findAvailableAudio(input: {
    projectId: string;
    checksum: string;
    relativePath: string;
  }): Promise<MediaArtifact | null>;
  commitImportedAudio(input: {
    media: MediaArtifact;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
}

export interface AudioImportClock {
  nowIso(): string;
}

export interface AudioImportIdFactory {
  next(prefix: "media" | "evt" | "outbox"): string;
}

export class LocalAudioImportError extends Error {
  constructor(
    public readonly code:
      | "AUDIO_IMPORT_SOURCE_MISSING"
      | "AUDIO_IMPORT_UNSUPPORTED_TYPE"
      | "AUDIO_IMPORT_INVALID_MEDIA"
      | "AUDIO_IMPORT_DESTINATION_CONFLICT",
    message: string
  ) {
    super(message);
    this.name = "LocalAudioImportError";
  }
}

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg"
};

type SelectedMediaProbe = {
  container?: string | null;
  audioCodec?: string | null;
  videoCodec?: string | null;
  slowDurationInSeconds?: number | null;
};

function roleDirectory(kind: LocalAudioKind): string {
  if (kind === "CLIP_AUDIO") return "07_audio/clip_audio";
  if (kind === "BGM") return "07_audio/bgm";
  return "07_audio/sfx";
}

function safeFileName(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^[_ .-]+|[_ .-]+$/gu, "");
  return normalized || "audio";
}

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

export async function probeLocalAudioFile(sourcePath: string): Promise<AudioImportProbe> {
  const absolutePath = resolve(sourcePath);
  let info;
  try {
    info = await stat(absolutePath);
  } catch {
    throw new LocalAudioImportError(
      "AUDIO_IMPORT_SOURCE_MISSING",
      `Audio import source does not exist: ${absolutePath}`
    );
  }
  if (!info.isFile() || info.size <= 0) {
    throw new LocalAudioImportError(
      "AUDIO_IMPORT_SOURCE_MISSING",
      `Audio import source must be a non-empty file: ${absolutePath}`
    );
  }

  const extension = extname(absolutePath).toLowerCase();
  const mimeType = MIME_BY_EXTENSION[extension];
  if (mimeType === undefined) {
    throw new LocalAudioImportError(
      "AUDIO_IMPORT_UNSUPPORTED_TYPE",
      `Unsupported local audio extension: ${extension || "<none>"}`
    );
  }

  let parsed: SelectedMediaProbe;
  try {
    parsed = await parseMedia({
      src: absolutePath,
      reader: nodeReader,
      fields: {
        container: true,
        audioCodec: true,
        videoCodec: true,
        slowDurationInSeconds: true
      },
      logLevel: "error",
      acknowledgeRemotionLicense: true
    }) as unknown as SelectedMediaProbe;
  } catch (error) {
    throw new LocalAudioImportError(
      "AUDIO_IMPORT_INVALID_MEDIA",
      `Audio probe failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const durationSeconds = Number(parsed.slowDurationInSeconds ?? 0);
  const audioCodec = String(parsed.audioCodec ?? "");
  const videoCodec = String(parsed.videoCodec ?? "");
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    audioCodec.length === 0 ||
    videoCodec.length > 0
  ) {
    throw new LocalAudioImportError(
      "AUDIO_IMPORT_INVALID_MEDIA",
      "Imported media must be a valid audio-only file with positive duration."
    );
  }

  return {
    mimeType,
    durationMs: Math.max(1, Math.round(durationSeconds * 1000)),
    sizeBytes: info.size,
    audioCodec,
    container: String(parsed.container ?? "")
  };
}

export class LocalAudioImportService {
  constructor(
    private readonly persistence: AudioImportPersistencePort,
    private readonly clock: AudioImportClock,
    private readonly ids: AudioImportIdFactory,
    private readonly workspaceOptions: WorkspaceResolverOptions = {}
  ) {}

  async importFile(input: {
    projectId: string;
    kind: LocalAudioKind;
    sourcePath: string;
  }): Promise<{media: MediaArtifact; probe: AudioImportProbe; created: boolean}> {
    // Fail closed on project identity before stat/realpath/probe/hash/copy of the
    // user-selected source file. A missing/legacy project must not cause source
    // bytes to be inspected as a side effect of an invalid import request.
    assertUnifiedProject(await this.persistence.getProjectPolicy(input.projectId));

    const sourceAbsolutePath = resolve(input.sourcePath);
    assertIsolatedPath(dirname(sourceAbsolutePath), sourceAbsolutePath);
    const probe = await probeLocalAudioFile(sourceAbsolutePath);
    const checksum = await sha256File(sourceAbsolutePath);
    const workspace = resolveProjectWorkspace(input.projectId, this.workspaceOptions);
    const extension = extname(sourceAbsolutePath).toLowerCase();
    const originalStem = basename(sourceAbsolutePath, extname(sourceAbsolutePath));
    const fileName = `${checksum.slice(0, 16)}-${safeFileName(originalStem)}${extension}`;
    const relativePath = normalizeProjectRelativePath(`${roleDirectory(input.kind)}/${fileName}`);

    const existing = await this.persistence.findAvailableAudio({
      projectId: input.projectId,
      checksum,
      relativePath
    });
    if (existing !== null) {
      return {media: existing, probe, created: false};
    }

    const destination = resolveProjectRelativePath(workspace.projectRoot, relativePath);
    assertIsolatedPath(workspace.projectRoot, destination);
    await mkdir(dirname(destination), {recursive: true});
    let wroteFile = false;

    try {
      try {
        const destinationInfo = await stat(destination);
        if (!destinationInfo.isFile() || destinationInfo.size <= 0) {
          throw new LocalAudioImportError(
            "AUDIO_IMPORT_DESTINATION_CONFLICT",
            `Audio destination exists but is not a valid file: ${relativePath}`
          );
        }
        const destinationSha = await sha256File(destination);
        if (destinationSha !== checksum) {
          throw new LocalAudioImportError(
            "AUDIO_IMPORT_DESTINATION_CONFLICT",
            `Audio destination already exists with a different checksum: ${relativePath}`
          );
        }
      } catch (error) {
        if (error instanceof LocalAudioImportError) throw error;
        const tempPath = `${destination}.tmp-${process.pid}-${Date.now()}`;
        try {
          await copyFile(sourceAbsolutePath, tempPath);
          const copiedSha = await sha256File(tempPath);
          if (copiedSha !== checksum) {
            throw new LocalAudioImportError(
              "AUDIO_IMPORT_INVALID_MEDIA",
              "Copied audio checksum differs from the selected source file."
            );
          }
          await rename(tempPath, destination);
          wroteFile = true;
        } finally {
          await rm(tempPath, {force: true}).catch(() => undefined);
        }
      }

      const now = this.clock.nowIso();
      const media: MediaArtifact = {
        id: this.ids.next("media"),
        projectId: input.projectId,
        revision: 1,
        lifecycleStatus: "ACTIVE",
        createdAt: now,
        updatedAt: now,
        mediaType: "AUDIO",
        relativePath,
        mimeType: probe.mimeType,
        durationMs: probe.durationMs,
        checksum,
        mediaStatus: "AVAILABLE"
      };
      const event: WorkflowEvent = {
        eventId: this.ids.next("evt"),
        projectId: input.projectId,
        eventType: "LOCAL_AUDIO_IMPORTED",
        targetType: "AUDIO",
        targetId: media.id,
        trigger: "USER",
        payload: {
          mediaId: media.id,
          kind: input.kind,
          relativePath,
          mimeType: probe.mimeType,
          durationMs: probe.durationMs,
          checksum
        },
        createdAt: now
      };
      const outbox: OutboxRecord = {
        outboxId: this.ids.next("outbox"),
        eventId: event.eventId,
        status: "PENDING",
        attempts: 0,
        createdAt: now
      };

      await this.persistence.commitImportedAudio({media, event, outbox});
      return {media, probe, created: true};
    } catch (error) {
      if (wroteFile) await rm(destination, {force: true}).catch(() => undefined);
      throw error;
    }
  }
}
