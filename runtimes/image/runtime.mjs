#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertNoLegacyReference } from "../../packages/legacy-guard/dist/index.js";
import { ImageRuntimeExecutor } from "../../packages/provider-orchestrator/dist/image-runtime.js";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function loadAdapter() {
  const configured = process.env.VPF_IMAGE_ADAPTER_MODULE;
  if (!configured) {
    throw new Error("VPF_IMAGE_ADAPTER_MODULE is required for automated image execution.");
  }
  // Provider adapters may live outside the repository, but an old production
  // repository or known legacy runtime path is never an allowed execution target.
  assertNoLegacyReference(configured);
  const specifier = configured.startsWith("file:")
    ? configured
    : pathToFileURL(resolve(configured)).href;
  const module = await import(specifier);
  const adapter = typeof module.createImageProviderAdapter === "function"
    ? await module.createImageProviderAdapter()
    : module.default;
  if (!adapter || typeof adapter.generate !== "function") {
    throw new Error("Configured image adapter must expose generate(request).");
  }
  return adapter;
}

try {
  const source = await readStdin();
  if (!source.trim()) throw new Error("Image runtime expects one RuntimeJob JSON object on stdin.");
  const runtimeJob = JSON.parse(source);
  const adapter = await loadAdapter();
  const workspaceRoot = process.env.VPF_WORKSPACE_ROOT;
  const executor = new ImageRuntimeExecutor(adapter, {
    workspace: workspaceRoot ? { workspaceRoot } : {}
  });
  const result = await executor.execute(runtimeJob);
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stderr.write(`[image-runtime] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
