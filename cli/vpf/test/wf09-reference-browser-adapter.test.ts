import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {readFile} from "node:fs/promises";

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
    `Generate an image from the following production brief.\n\n${prompt}\n\nNEGATIVE CONSTRAINTS (transported verbatim):\n${negativePrompt}`
  );
});

test("reference guidance is a transport inventory and does not inject creative policy", async () => {
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
  assert.match(guidance, /ATTACHED REFERENCE INVENTORY/u);
  assert.match(guidance, /COMPOSITION_GRAMMAR/u);
  assert.doesNotMatch(guidance, /KNF_LAYOUT/u);
  assert.doesNotMatch(guidance, /MANDATORY GLOBAL VISUAL BIBLE/u);
  assert.doesNotMatch(guidance, /SAFE-ZONE CONTRACT/u);

  const transmitted = module.buildChatGptTransmissionText({ prompt: "exact prompt", references });
  assert.ok(transmitted.includes(guidance));
  assert.ok(transmitted.endsWith("exact prompt"));
});

test("ChatGPT Browser adapter uploads visual references and excludes KNF layout pixels without creative injection", async () => {
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
  assert.deepEqual(captured?.references, [references[0]].map(reference => ({
    absolutePath: reference.absolutePath,
    mediaId: reference.mediaId,
    role: reference.role,
    sha256: reference.sha256
  })));
  assert.equal(captured?.width, 864);
  assert.equal(captured?.height, 1536);
  const transmission = String(captured?.transmissionText);
  assert.match(transmission, /ATTACHED REFERENCE INVENTORY/u);
  assert.match(transmission, /COMPOSITION_GRAMMAR/u);
  assert.match(transmission, /exact prompt/u);
  assert.match(transmission, /exact negative/u);
  assert.doesNotMatch(transmission, /KNF_LAYOUT/u);
  assert.doesNotMatch(transmission, /SAFE-ZONE CONTRACT/u);
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

test("ChatGPT Browser worker accepts only a stable new assistant image and downloads its source", async () => {
  const worker = await readFile(
    new URL("../../../runtimes/image/adapters/chatgpt_browser_worker_v2.py", import.meta.url),
    "utf8"
  );
  assert.match(worker, /main \[class~='group\/imagegen-image'\] img, main img\[alt\]:not\(\[alt=''\]\)/);
  assert.match(worker, /str\(item\.get\("authorRole"\) or ""\)\.lower\(\) != "user"/);
  assert.match(worker, /str\(item\.get\("src"\) or ""\) not in before_sources/);
  assert.match(worker, /stable_polls >= 3 and not generation_in_progress\(page\)/);
  assert.match(worker, /Generated ChatGPT image has no downloadable source URL/);
  assert.match(worker, /Could not download the generated ChatGPT image source/);
  assert.match(worker, /"downloadVerified": True/);
  assert.doesNotMatch(worker, /locator\.screenshot/);
});

test("ChatGPT Browser worker reuses one managed conversation per exact reference set", async () => {
  const worker = await readFile(
    new URL("../../../runtimes/image/adapters/chatgpt_browser_worker_v2.py", import.meta.url),
    "utf8"
  );
  assert.match(worker, /def reference_session_marker\(request: dict\[str, Any\]\)/);
  assert.match(worker, /def open_or_reuse_chatgpt_page\(browser, marker: str\)/);
  assert.match(worker, /page, reused_session = open_or_reuse_chatgpt_page\(browser, session_marker\)/);
  assert.match(worker, /mark_managed_session_page\(page, session_marker\)/);
  assert.match(worker, /"reused": True/);
  assert.match(worker, /def generate[\s\S]*?finally:\r?\n        # Keep the worker-managed ChatGPT tab alive[\s\S]*?playwright\.stop\(\)/);
});
