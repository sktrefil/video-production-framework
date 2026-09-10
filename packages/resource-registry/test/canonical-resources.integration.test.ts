import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ChannelVisualBibleRegistryAdapter,
  FileSystemResourceRegistry,
  FormatProfileRegistryAdapter,
  ProviderProfileRegistryAdapter
} from "../src/index.js";

const resourcesRoot = fileURLToPath(new URL("../../../resources/", import.meta.url));

test("canonical resources validate and WF-08/WF-09 adapters resolve real snapshots", async () => {
  const registry = new FileSystemResourceRegistry(resourcesRoot);
  const summary = await registry.validateAll();
  assert.equal(summary.valid, true);
  assert.ok(summary.resourceCount >= 9);

  const bibleAdapter = new ChannelVisualBibleRegistryAdapter(
    registry,
    "HISTORY_MYSTERY_VISUAL_BIBLE"
  );
  const longformAdapter = new FormatProfileRegistryAdapter(
    registry,
    "LONGFORM_16X9_V1"
  );
  const shortformAdapter = new FormatProfileRegistryAdapter(
    registry,
    "SHORTFORM_9X16_V1"
  );

  const bibleForWf08 = await bibleAdapter.resolve("1.0.0");
  const bibleForWf09 = await bibleAdapter.resolve("1.0.0");
  const longform = await longformAdapter.resolve("1.0.0");
  const shortform = await shortformAdapter.resolve("1.0.0");

  assert.ok(bibleForWf08);
  assert.ok(bibleForWf09);
  assert.equal(bibleForWf08.contentHash, bibleForWf09.contentHash);
  assert.ok(longform);
  assert.ok(shortform);
  assert.equal((longform.payload as { aspectRatio: string }).aspectRatio, "16:9");
  assert.equal((shortform.payload as { aspectRatio: string }).aspectRatio, "9:16");
});

test("initial provider profiles are execution-only resources", async () => {
  const registry = new FileSystemResourceRegistry(resourcesRoot);
  const ids = [
    "ELEVENLABS_V3_HISTORY_V1",
    "IMAGE_PROVIDER_EXECUTION_V1",
    "GOOGLE_FLOW_MANUAL_EXTERNAL_V1",
    "REMOTION_FINAL_RENDER_V1"
  ];
  for (const id of ids) {
    const profile = await new ProviderProfileRegistryAdapter(registry, id).resolve("1.0.0");
    assert.ok(profile, id);
    const payload = profile.payload as Record<string, unknown>;
    assert.equal("palette" in payload, false);
    assert.equal("visualStyle" in payload, false);
    assert.equal("narrativeRules" in payload, false);
  }
});

test("channel profile selects one Visual Bible across LONGFORM and SHORTFORM", async () => {
  const registry = new FileSystemResourceRegistry(resourcesRoot);
  const channel = await registry.resolve({
    resourceType: "CHANNEL_PROFILE",
    resourceId: "HISTORY_MYSTERY_V1",
    version: "1.0.0"
  });
  assert.ok(channel);
  const payload = channel.payload as {
    visualBible: { resourceId: string; version: string };
    formats: Record<string, { resourceId: string; version: string }>;
  };
  assert.equal(payload.visualBible.resourceId, "HISTORY_MYSTERY_VISUAL_BIBLE");
  assert.equal(payload.formats.LONGFORM?.resourceId, "LONGFORM_16X9_V1");
  assert.equal(payload.formats.SHORTFORM?.resourceId, "SHORTFORM_9X16_V1");
});
