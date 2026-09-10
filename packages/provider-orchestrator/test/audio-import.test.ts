import assert from "node:assert/strict";
import {mkdtemp, readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import type {MediaArtifact} from "@vpf/domain";
import {
  LocalAudioImportError,
  LocalAudioImportService,
  type AudioImportPersistencePort
} from "../src/audio-import.js";

function wavBuffer(durationSeconds = 1, sampleRate = 8000): Buffer {
  const samples = Math.round(durationSeconds * sampleRate);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

class MemoryAudioRepository implements AudioImportPersistencePort {
  readonly media: MediaArtifact[] = [];
  commits = 0;

  async findAvailableAudio(input: {
    projectId: string;
    checksum: string;
    relativePath: string;
  }): Promise<MediaArtifact | null> {
    return this.media.find(item =>
      item.projectId === input.projectId &&
      item.checksum === input.checksum &&
      item.relativePath === input.relativePath &&
      item.mediaStatus === "AVAILABLE"
    ) ?? null;
  }

  async commitImportedAudio(input: {media: MediaArtifact}): Promise<void> {
    this.media.push(structuredClone(input.media));
    this.commits += 1;
  }
}

function ids() {
  let counter = 0;
  return {next: (prefix: "media" | "evt" | "outbox") => `${prefix}-${++counter}`};
}

test("local audio import probes WAV, copies into canonical role folders, hashes and returns AUDIO MediaArtifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "vpf-audio-import-"));
  const source = join(root, "approved clip.wav");
  await writeFile(source, wavBuffer(1));
  const repository = new MemoryAudioRepository();
  const service = new LocalAudioImportService(
    repository,
    {nowIso: () => "2026-09-10T12:00:00.000Z"},
    ids(),
    {repositoryRoot: root, workspaceRoot: join(root, "workspace")}
  );

  for (const kind of ["CLIP_AUDIO", "BGM", "SFX"] as const) {
    const result = await service.importFile({projectId: `p-${kind}`, kind, sourcePath: source});
    assert.equal(result.created, true);
    assert.equal(result.media.mediaType, "AUDIO");
    assert.equal(result.media.mediaStatus, "AVAILABLE");
    assert.equal(result.media.mimeType, "audio/wav");
    assert.match(result.media.checksum, /^[a-f0-9]{64}$/);
    assert.ok(result.media.durationMs! >= 990 && result.media.durationMs! <= 1010);
    const expectedFolder = kind === "CLIP_AUDIO" ? "clip_audio" : kind.toLowerCase();
    assert.match(result.media.relativePath, new RegExp(`^07_audio/${expectedFolder}/`));
    const copied = join(root, "workspace", "projects", `p-${kind}`, ...result.media.relativePath.split("/"));
    assert.deepEqual(await readFile(copied), await readFile(source));
  }
  assert.equal(repository.commits, 3);
});

test("local audio import is idempotent for the same approved file and role", async () => {
  const root = await mkdtemp(join(tmpdir(), "vpf-audio-reuse-"));
  const source = join(root, "bgm.wav");
  await writeFile(source, wavBuffer(0.5));
  const repository = new MemoryAudioRepository();
  const service = new LocalAudioImportService(
    repository,
    {nowIso: () => "2026-09-10T12:00:00.000Z"},
    ids(),
    {repositoryRoot: root, workspaceRoot: join(root, "workspace")}
  );

  const first = await service.importFile({projectId: "reuse", kind: "BGM", sourcePath: source});
  const second = await service.importFile({projectId: "reuse", kind: "BGM", sourcePath: source});
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.media.id, first.media.id);
  assert.equal(repository.commits, 1);
});

test("local audio import rejects non-audio file types before MediaArtifact creation", async () => {
  const root = await mkdtemp(join(tmpdir(), "vpf-audio-invalid-"));
  const source = join(root, "not-audio.txt");
  await writeFile(source, "not audio");
  const repository = new MemoryAudioRepository();
  const service = new LocalAudioImportService(
    repository,
    {nowIso: () => "2026-09-10T12:00:00.000Z"},
    ids(),
    {repositoryRoot: root, workspaceRoot: join(root, "workspace")}
  );

  await assert.rejects(
    service.importFile({projectId: "bad", kind: "SFX", sourcePath: source}),
    (error: unknown) => error instanceof LocalAudioImportError && error.code === "AUDIO_IMPORT_UNSUPPORTED_TYPE"
  );
  assert.equal(repository.commits, 0);
});
