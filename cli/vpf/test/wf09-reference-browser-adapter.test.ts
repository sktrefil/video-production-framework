import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const adapterPath = fileURLToPath(
  new URL("../../../runtimes/image/adapters/chatgpt-browser-adapter.mjs", import.meta.url)
);

async function loadAdapterModule() {
  return await import(pathToFileURL(adapterPath).href) as {
    buildChatGptTransmissionText(request: { prompt: string; negativePrompt?: string; references?: Array<Record<string, unknown>> }): string;
    buildReferenceGuidance(references: Array<Record<string, unknown>>): string;
    createImageProviderAdapter(options?: Record<string, unknown>): {
      healthcheck(): Promise<Record<string, unknown>>;
      generate(request: Record<string, unknown>): Promise<Record<string, unknown>>;
    };
  };
}

test("ChatGPT Browser transport preserves approved prompt and negative constraints verbatim without references", async () => {
  const module = await loadAdapterModule();
  const prompt = "Roman Britain evidence-led reconstruction. No readable fabricated Latin.";
  const negativePrompt = "fantasy armor, unsupported heraldry";
  assert.equal(
    module.buildChatGptTransmissionText({ prompt, negativePrompt }),
    `이미지 생성해줘\n\n${prompt}\n\nNEGATIVE CONSTRAINTS (transported verbatim):\n${negativePrompt}`
  );
});

test("reference roles become explicit visual-use instructions instead of generic attachments", async () => {
  const module = await loadAdapterModule();
  const references = [
    {
      absolutePath: "C:\\vpf\\1.png",
      role: "REFERENCE_LIBRARY:GLOBAL_VISUAL:COMPOSITION_GRAMMAR:NORMAL_CAPTION"
    },
    {
      absolutePath: "C:\\vpf\\03_normal_caption.png",
      role: "REFERENCE_LIBRARY:KNF_LAYOUT:NORMAL_CAPTION"
    }
  ];
  const guidance = module.buildReferenceGuidance(references);
  assert.match(guidance, /COMPOSITION_GRAMMAR/u);
  assert.match(guidance, /environment-first wide\/medium-wide composition/u);
  assert.match(guidance, /layout\/hierarchy cue/u);
  assert.match(guidance, /do not merely treat them as generic inspiration/u);

  const transmitted = module.buildChatGptTransmissionText({ prompt: "exact prompt", references });
  assert.ok(transmitted.includes(guidance));
  assert.ok(transmitted.endsWith("exact prompt"));
});

test("ChatGPT Browser adapter forwards exact approved reference files to worker", async () => {
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

  const references = [
    {
      mediaId: "ref-global-1",
      role: "REFERENCE_LIBRARY:GLOBAL_VISUAL:COMPOSITION_GRAMMAR:NORMAL_CAPTION",
      absolutePath: "C:\\vpf\\project\\05_images\\reference_library\\_shared\\global_visual\\1.png",
      sha256: "a".repeat(64),
      mimeType: "image/png"
    },
    {
      mediaId: "ref-knf-1",
      role: "REFERENCE_LIBRARY:KNF_LAYOUT:EVIDENCE",
      absolutePath: "C:\\vpf\\project\\05_images\\reference_library\\_shared\\knf_layout\\03_normal_caption.png",
      sha256: "b".repeat(64),
      mimeType: "image/png"
    }
  ];

  const result = await adapter.generate({
    prompt: "exact prompt",
    negativePrompt: "exact negative",
    width: 864,
    height: 1536,
    aspectRatio: "9:16",
    references
  });

  assert.equal(captured?.action, "generate");
  assert.deepEqual(captured?.references, references.map(reference => ({
    absolutePath: reference.absolutePath,
    mediaId: reference.mediaId,
    role: reference.role,
    sha256: reference.sha256
  })));
  assert.equal(captured?.width, 864);
  assert.equal(captured?.height, 1536);
  assert.match(String(captured?.transmissionText), /REFERENCE USAGE CONTRACT/u);
  assert.equal(Buffer.from(result.bytes as Uint8Array).toString("utf8"), "fixture-png");
  assert.deepEqual(result.providerRequestIds, ["fixture-request"]);
});

test("ChatGPT Browser adapter exposes a non-generating browser health probe", async () => {
  const module = await loadAdapterModule();
  let captured: Record<string, unknown> | undefined;
  const adapter = module.createImageProviderAdapter({
    workerRunner: async (payload: Record<string, unknown>) => {
      captured = payload;
      return { status: "READY", composerVisible: true, pageState: "ready" };
    }
  });
  const result = await adapter.healthcheck();
  assert.equal(captured?.action, "probe");
  assert.equal(result.status, "READY");
});
