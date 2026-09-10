import * as path from "node:path";
import { FileSystemResourceRegistry } from "./index.js";

const rootDir = path.resolve(process.argv[2] ?? "resources");
const registry = new FileSystemResourceRegistry(rootDir);
const summary = await registry.validateAll();

if (!summary.valid) {
  for (const diagnostic of summary.diagnostics) {
    console.error(`[${diagnostic.code}] ${diagnostic.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Validated ${summary.resourceCount} canonical resource(s) under ${rootDir}`);
}
