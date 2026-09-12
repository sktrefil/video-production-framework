#!/usr/bin/env node
import { resolve } from "node:path";
import {
  ROMAN_IX_REFERENCE_FILES,
  loadVerifiedReferenceLibrary,
  registerReferenceLibrary
} from "./index.js";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const source = arg("--source");
  const target = arg("--target");
  const verifyOnly = process.argv.includes("--verify-only");
  if (!target || (!verifyOnly && !source)) {
    throw new Error(
      "Usage: register-cli --source <approved-reference-dir> --target <project-reference-dir> OR --target <dir> --verify-only"
    );
  }
  const targetDirectory = resolve(target);
  if (verifyOnly) {
    const manifest = await loadVerifiedReferenceLibrary(targetDirectory);
    process.stdout.write(`${JSON.stringify({ status: "VERIFIED", manifest }, null, 2)}\n`);
    return;
  }
  const manifest = await registerReferenceLibrary({
    libraryId: "ROMAN_IX_KNF_V2",
    version: "1.0.0",
    sourceDirectory: resolve(source!),
    targetDirectory,
    files: ROMAN_IX_REFERENCE_FILES
  });
  process.stdout.write(`${JSON.stringify({ status: "REGISTERED", manifest }, null, 2)}\n`);
}

main().catch(error => {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  process.stderr.write(`${code ? `${code}: ` : ""}${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
