import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const checks = ["port", "state", "renderer", "timeline", "video", "audio", "subtitles", "overlays", "bgm-sfx", "persistence", "production", "wf16", "wf17"];
for (const name of checks) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(new URL(`check-editor-${name}.mjs`, import.meta.url))], {stdio: "inherit"});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
