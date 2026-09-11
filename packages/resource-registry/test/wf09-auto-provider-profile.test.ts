import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { FileSystemResourceRegistry } from "../src/index.js";

const resourcesRoot = fileURLToPath(new URL("../../../resources/", import.meta.url));

test("WF-09 AUTO adds ChatGPT Browser provider without mutating v1.0.0", async () => {
  const registry = new FileSystemResourceRegistry(resourcesRoot);
  const oldProfile = await registry.resolve({
    resourceType: "PROVIDER_PROFILE",
    resourceId: "IMAGE_PROVIDER_EXECUTION_V1",
    version: "1.0.0"
  });
  const browserProfile = await registry.resolve({
    resourceType: "PROVIDER_PROFILE",
    resourceId: "IMAGE_PROVIDER_EXECUTION_V1",
    version: "1.1.0"
  });
  const channel = await registry.resolve({
    resourceType: "CHANNEL_PROFILE",
    resourceId: "HISTORY_MYSTERY_V1",
    version: "1.2.0"
  });

  assert.ok(oldProfile);
  assert.ok(browserProfile);
  assert.ok(channel);

  const oldPayload = oldProfile.payload as Record<string, unknown>;
  const browserPayload = browserProfile.payload as Record<string, unknown>;
  const channelPayload = channel.payload as {
    providers: Record<string, { resourceId: string; version: string }>;
  };

  assert.deepEqual(oldPayload.runtimeSecretNames, ["IMAGE_PROVIDER_API_KEY"]);
  assert.equal(browserPayload.provider, "CHATGPT_BROWSER");
  assert.deepEqual(browserPayload.runtimeSecretNames, []);
  assert.deepEqual(browserPayload.runtimeConfig, {
    cdpUrlEnvironment: "CHATGPT_CDP_URL",
    timeoutEnvironment: "CHATGPT_IMAGE_TIMEOUT_SECONDS"
  });
  assert.equal(channelPayload.providers.IMAGE?.resourceId, "IMAGE_PROVIDER_EXECUTION_V1");
  assert.equal(channelPayload.providers.IMAGE?.version, "1.1.0");
});
