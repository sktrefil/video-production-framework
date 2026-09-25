import { spawn } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import * as path from "node:path";

const args = process.argv.slice(2);

if (process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY || process.env.CODEX_ACCESS_TOKEN) {
  process.stderr.write("direct API/token credential leaked into Codex child process\n");
  process.exit(55);
}

if (args[0] === "--version") {
  process.stdout.write("codex-cli 0.test.0\n");
  process.exit(0);
}

if (args[0] === "login" && args[1] === "status") {
  process.stdout.write("Logged in using ChatGPT\n");
  process.exit(0);
}

if (args[0] === "exec" && args[1] === "--help") {
  process.stdout.write([
    "codex exec",
    "--json",
    "--ephemeral",
    "--skip-git-repo-check",
    "--sandbox <MODE>",
    "--cd <DIR>",
    "--config <KEY=VALUE>",
    "--output-schema <FILE>",
    "--output-last-message <FILE>",
    "--image <FILE>",
    "--model <MODEL>"
  ].join("\n"));
  process.exit(0);
}

if (args[0] !== "exec") {
  process.stderr.write("unsupported fake codex invocation\n");
  process.exit(2);
}

const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const cwd = valueAfter("--cd");
const outputPath = valueAfter("--output-last-message");
if (!cwd || !outputPath) {
  process.stderr.write("missing --cd or --output-last-message\n");
  process.exit(3);
}

const instructions = await readFile(path.join(cwd, "instructions.md"), "utf8");
const taskMatch = instructions.match(/^Task:\s+(.+)$/mu);
const taskId = taskMatch?.[1]?.trim();
if (!taskId) {
  process.stderr.write("Task line missing\n");
  process.exit(4);
}

if (taskId.startsWith("MANAGER_VISUAL:")) {
  const imageIndex = args.indexOf("--image");
  const terminatorIndex = args.indexOf("--", imageIndex + 1);
  if (imageIndex < 0 || terminatorIndex <= imageIndex + 1) {
    process.stderr.write("MANAGER_VISUAL requires attached --image inputs\n");
    process.exit(41);
  }
  const imagePaths = args.slice(imageIndex + 1, terminatorIndex);
  for (const imagePath of imagePaths) {
    try {
      const info = await stat(imagePath);
      if (!info.isFile() || info.size <= 0) throw new Error("empty image");
    } catch (error) {
      process.stderr.write("MANAGER_VISUAL image unavailable: " + imagePath + "\n");
      process.exit(42);
    }
  }
}

const fixtureDir = process.env.VPF_FAKE_CODEX_OUTPUT_DIR;
if (!fixtureDir) {
  process.stderr.write("VPF_FAKE_CODEX_OUTPUT_DIR missing\n");
  process.exit(5);
}

if (process.env.VPF_FAKE_CODEX_HANG_TASK === taskId) {
  const grandchild = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    { stdio: "inherit" }
  );
  grandchild.once("error", error => {
    process.stderr.write("fake Codex grandchild failed: " + error.message + "\n");
  });
  process.stdout.write(JSON.stringify({
    type: "runtime.activity",
    task_id: taskId,
    status: "HANGING_FOR_TIMEOUT_TEST"
  }) + "\n");
  await new Promise(() => undefined);
}

const fixtureName = taskId.replace(/[^A-Za-z0-9._-]+/gu, "_") + ".json";
const source = path.join(fixtureDir, fixtureName);
const output = await readFile(source, "utf8");
await writeFile(outputPath, output, "utf8");

if (taskId === "T010") {
  process.stdout.write(JSON.stringify({
    type: "item.completed",
    item: {
      type: "web_search",
      query: "Roman Ninth Legion reliable source",
      action: { type: "search" },
      results: [
        { url: "https://example.org/roman-ix" },
        { url: "https://example.edu/roman-ix" }
      ]
    }
  }) + "\n");
}
process.stdout.write(JSON.stringify({
  type: "item.completed",
  item: { type: "agent_message", text: output }
}) + "\n");
process.exit(0);
