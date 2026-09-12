#!/usr/bin/env node
import { resolve } from "node:path";
import { indexReferenceTier } from "./tier-registration.js";
import { loadVerifiedReferenceLibrary } from "./index.js";
import type { ReferenceTier } from "./tiered-selector.js";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function tier(value: string | undefined): ReferenceTier {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "global_visual") return "GLOBAL_VISUAL";
  if (normalized === "knf_layout") return "KNF_LAYOUT";
  if (normalized === "project") return "PROJECT";
  throw new Error("--tier must be one of: global_visual, knf_layout, project");
}

async function main(): Promise<void> {
  const directory = arg("--dir");
  const requestedTier = arg("--tier");
  const verifyOnly = process.argv.includes("--verify-only");
  if (!directory) {
    throw new Error("Usage: tier-cli --tier <global_visual|knf_layout|project> --dir <directory> [--library-id ID] [--verify-only]");
  }
  const absolute = resolve(directory);
  if (verifyOnly) {
    const manifest = await loadVerifiedReferenceLibrary(absolute);
    process.stdout.write(`${JSON.stringify({ status: "VERIFIED", manifest }, null, 2)}\n`);
    return;
  }
  const selectedTier = tier(requestedTier);
  const libraryId = arg("--library-id") ?? `${selectedTier}_V1`;
  const manifest = await indexReferenceTier({
    tier: selectedTier,
    directory: absolute,
    libraryId,
    version: arg("--version") ?? "1.0.0"
  });
  process.stdout.write(`${JSON.stringify({ status: "INDEXED", tier: selectedTier, manifest }, null, 2)}\n`);
}

main().catch(error => {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  process.stderr.write(`${code ? `${code}: ` : ""}${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
