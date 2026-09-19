import {access, readdir, readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";

const directoryCandidates = [
  resolve(import.meta.dirname, "..", "node_modules", "@remotion", "studio", "dist", "esm"),
  resolve(import.meta.dirname, "..", "..", "..", "node_modules", "@remotion", "studio", "dist", "esm")
];
const studioEsmDirectory = (await Promise.all(directoryCandidates.map(async directory => {
  try {
    await access(directory);
    return directory;
  } catch {
    return null;
  }
}))).find((directory) => directory !== null);
const zoomSizes = ["auto", 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const replacement = `var commonPreviewSizes = [\n${zoomSizes.map(size => `  {\n    size: ${typeof size === "string" ? `"${size}"` : size},\n    translation: {\n      x: 0,\n      y: 0\n    }\n  }`).join(",\n")}\n];\nvar getPreviewSizeLabel`;
const selectorPattern = /var commonPreviewSizes = \[[\s\S]*?\n\];\nvar getPreviewSizeLabel/;

if (studioEsmDirectory === undefined) {
  console.warn("[editor-studio] @remotion/studio is not installed; run npm ci before starting Studio. Preview zoom presets will apply on the next start.");
  process.exit(0);
}

const files = (await readdir(studioEsmDirectory)).filter(filename => /^chunk-.*\.js$/.test(filename) || filename === "previewEntry.mjs" || filename === "internals.mjs");
let patched = 0;
let alreadyPatched = 0;

for (const filename of files) {
  const absolutePath = resolve(studioEsmDirectory, filename);
  const source = await readFile(absolutePath, "utf8");
  if (!source.includes("var commonPreviewSizes = [")) continue;
  if (source.includes("size: 0.1") && source.includes("size: 0.9")) {
    alreadyPatched += 1;
    continue;
  }
  if (!selectorPattern.test(source)) throw new Error(`Unsupported Remotion Studio Preview Size selector: ${absolutePath}`);
  await writeFile(absolutePath, source.replace(selectorPattern, replacement), "utf8");
  patched += 1;
}

if (patched + alreadyPatched !== 3) {
  throw new Error(`Expected three Remotion Studio Preview Size selectors, found ${patched + alreadyPatched}.`);
}

console.log(`[editor-studio] preview zoom presets: Fit, ${zoomSizes.slice(1).map(size => `${size * 100}%`).join(", ")}`);
