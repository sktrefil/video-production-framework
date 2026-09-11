import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const adapterPath = fileURLToPath(
  new URL("../../../runtimes/image/adapters/chatgpt-browser-adapter.mjs", import.meta.url)
);

async function loadAdapterModule() {
  return await import(pathToFileURL(adapterPath).href) as {
    buildChatGptTransmissionText(request: { prompt: string; negativePrompt?: string }): string;
    createImageProviderAdapter(options?: Record<string, unknown>): {
      generate(request: Record<string, unknown>): Promise<Record<string, unknown>>;
    };
  };
}

test("ChatGPT Browser transport preserves approved semantic prompt verbatim", async () => {
  const module = await loadAdapterModule();
  const prompt = "Roman Britain evidence-led reconstruction. No readable fabricated Latin.";
  const negativePrompt = "fantasy armor, unsupported heraldry";
  const transmitted = module.buildChatGptTransmissionText({ prompt, negativePrompt });

  assert.equal(
    transmitted,
    `이미지 생성해줘\n\n${prompt}\n\nNEGATIVE CONSTRAINTS (transported verbatim):\n${negativePrompt}`
  );
  assert.ok(transmitted.includes(prompt));
  assert.ok(transmitted.includes(negativePrompt));
  for (const forbidden of ["master style", "visual bible", "safe area", "character bible", "palette preset"]) {
    assert.equal(transmitted.toLowerCase().includes(forbidden), false);
  }
});

test("ChatGPT Browser adapter returns worker PNG bytes without creative mutation", async () => {
  const module = await loadAdapterModule();
  let captured: Record<string, unknown> | undefined;
  const adapter = module.createImageProviderAdapter({
    workerRunner: async (payload: Record<string, unknown>) => {
      captured = payload;
      return {
        imageBase64: Buffer.from("fixture-png").toString("base64"),
        mimeType: "image/png",
        providerRequestIds: ["fixture-request"]
      };
    }
  });
  const result = await adapter.generate({
    prompt: "exact prompt",
    negativePrompt: "exact negative",
    width: 864,
    height: 1536,
    aspectRatio: "9:16",
    references: []
  });

  assert.equal(
    captured?.transmissionText,
    "이미지 생성해줘\n\nexact prompt\n\nNEGATIVE CONSTRAINTS (transported verbatim):\nexact negative"
  );
  assert.equal(captured?.width, 864);
  assert.equal(captured?.height, 1536);
  assert.equal(Buffer.from(result.bytes as Uint8Array).toString("utf8"), "fixture-png");
  assert.deepEqual(result.providerRequestIds, ["fixture-request"]);
});

test("ChatGPT Browser profile v1.1.0 blocks unsupported reference media before browser execution", async () => {
  const module = await loadAdapterModule();
  const adapter = module.createImageProviderAdapter({
    workerRunner: async () => {
      throw new Error("worker must not run");
    }
  });
  await assert.rejects(
    () => adapter.generate({
      prompt: "exact prompt",
      width: 864,
      height: 1536,
      aspectRatio: "9:16",
      references: [{ mediaId: "m1" }]
    }),
    /does not accept reference media/
  );
});
