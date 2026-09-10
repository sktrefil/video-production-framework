import {lstatSync} from "node:fs";
import {dirname, isAbsolute, relative, resolve} from "node:path";
import {assertNoLegacyReference, LegacyGuardError} from "./index.js";

/** Check all existing ancestors, including the root. Never follow an external symlink. */
export function assertIsolatedPath(root: string, target: string): void {
  assertNoLegacyReference(root); assertNoLegacyReference(target);
  const base = resolve(root), absolute = resolve(target), rel = relative(base, absolute);
  if (rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || isAbsolute(rel))
    throw new LegacyGuardError("LEGACY_RUNTIME_FORBIDDEN", "Path is outside the configured unified root.");
  let cursor = absolute;
  while (true) {
    try {
      if (lstatSync(cursor).isSymbolicLink()) throw new LegacyGuardError("LEGACY_RUNTIME_FORBIDDEN", "Symlinks are forbidden at unified operational boundaries.");
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const parent = dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
}
