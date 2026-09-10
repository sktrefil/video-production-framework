import assert from "node:assert/strict";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import type {MediaArtifact} from "@vpf/domain";
import {SqliteAudioImportRepository} from "../src/audio-import.js";

test("SQLite audio importer persists one AVAILABLE AUDIO MediaArtifact with durable event", async () => {
  const root = await mkdtemp(join(tmpdir(), "vpf-audio-db-"));
  const repo = new SqliteAudioImportRepository(join(root, "project.db"));
  try {
    const media: MediaArtifact = {
      id: "audio-local-1",
      projectId: "project",
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: "2026-09-10T12:00:00.000Z",
      updatedAt: "2026-09-10T12:00:00.000Z",
      mediaType: "AUDIO",
      relativePath: "07_audio/bgm/abc-theme.wav",
      mimeType: "audio/wav",
      durationMs: 1500,
      checksum: "a".repeat(64),
      mediaStatus: "AVAILABLE"
    };
    await repo.commitImportedAudio({
      media,
      event: {
        eventId: "evt-audio-1",
        projectId: "project",
        eventType: "LOCAL_AUDIO_IMPORTED",
        targetType: "AUDIO",
        targetId: media.id,
        trigger: "USER",
        createdAt: media.createdAt
      },
      outbox: {
        outboxId: "outbox-audio-1",
        eventId: "evt-audio-1",
        status: "PENDING",
        attempts: 0,
        createdAt: media.createdAt
      }
    });

    const loaded = await repo.findAvailableAudio({
      projectId: "project",
      checksum: media.checksum,
      relativePath: media.relativePath
    });
    assert.deepEqual(loaded, media);
    const event = repo.db.prepare(
      "SELECT event_type, trigger_type FROM workflow_events WHERE event_id = ?"
    ).get("evt-audio-1") as {event_type: string; trigger_type: string};
    assert.deepEqual(event, {event_type: "LOCAL_AUDIO_IMPORTED", trigger_type: "USER"});
  } finally {
    repo.close();
  }
});
