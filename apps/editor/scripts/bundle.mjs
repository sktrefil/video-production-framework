import {bundle} from "@remotion/bundler";
import {fileURLToPath} from "node:url";

// Use the same Rspack setting as Studio without spawning a config transpiler.
const app = new URL("../", import.meta.url);
const output = await bundle({
  entryPoint: fileURLToPath(new URL("src/index.ts", app)),
  outDir: fileURLToPath(new URL("dist/", app)),
  rootDir: fileURLToPath(app),
  rspack: true,
});
console.log(`Editor bundle: ${output}`);
