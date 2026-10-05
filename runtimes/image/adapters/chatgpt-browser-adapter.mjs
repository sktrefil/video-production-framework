import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const workerPath = fileURLToPath(new URL("./chatgpt_browser_worker_v2.py", import.meta.url));
const DEFAULT_CDP_URL = "http://127.0.0.1:9222";

function enabled(value, fallback = true) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
}

export function browserLaunchCandidates(env = process.env, platformName = process.platform) {
  const explicit = [env.CHATGPT_BROWSER_EXECUTABLE, env.VPF_CHROME_EXECUTABLE]
    .map(value => String(value ?? "").trim())
    .filter(Boolean);
  const platformCandidates = platformName === "win32"
    ? [
        env.LOCALAPPDATA && join(env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
        env.PROGRAMFILES && join(env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
        env["PROGRAMFILES(X86)"] && join(env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
        env.PROGRAMFILES && join(env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
        env["PROGRAMFILES(X86)"] && join(env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe")
      ]
    : platformName === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
        ]
      : [
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
          "/usr/bin/microsoft-edge"
        ];
  return [...new Set([...explicit, ...platformCandidates.filter(Boolean)])];
}

function browserProfileDirectory(env = process.env, platformName = process.platform) {
  const explicit = String(env.CHATGPT_CDP_USER_DATA_DIR ?? "").trim();
  if (explicit) return explicit;
  if (platformName === "win32" && env.LOCALAPPDATA) {
    return join(env.LOCALAPPDATA, "VPF", "ChromeCDP");
  }
  return join(homedir(), ".vpf", "chrome-cdp");
}

async function probeCdp(cdpUrl, fetchImpl = globalThis.fetch) {
  try {
    const endpoint = new URL("/json/version", cdpUrl).toString();
    const response = await fetchImpl(endpoint, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    const payload = await response.json();
    return Boolean(payload?.webSocketDebuggerUrl || payload?.Browser);
  } catch {
    return false;
  }
}

async function launchLocalBrowser({ cdpUrl, env, platformName, spawnImpl = spawn, existsImpl = existsSync }) {
  const url = new URL(cdpUrl);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("CHATGPT_CDP_URL must point to a local Chrome CDP endpoint.");
  }
  const executable = browserLaunchCandidates(env, platformName).find(candidate => existsImpl(candidate));
  if (!executable) {
    throw new Error("Chrome/Edge executable was not found. Set CHATGPT_BROWSER_EXECUTABLE to an installed Chromium browser.");
  }
  const port = url.port || "9222";
  const profile = browserProfileDirectory(env, platformName);
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "https://chatgpt.com/"
  ];
  await new Promise((resolve, reject) => {
    const child = spawnImpl(executable, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(); });
  });
  return { executable, profile };
}

export async function ensureLocalCdp(cdpUrl = DEFAULT_CDP_URL, options = {}) {
  const url = new URL(cdpUrl);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("CHATGPT_CDP_URL must point to a local Chrome CDP endpoint.");
  }
  const env = options.env ?? process.env;
  const platformName = options.platformName ?? process.platform;
  const probe = options.cdpProbe ?? (value => probeCdp(value, options.fetchImpl ?? globalThis.fetch));
  if (await probe(cdpUrl)) return { status: "READY", launched: false, cdpUrl };

  const autoLaunch = options.autoLaunchBrowser ?? enabled(env.CHATGPT_AUTO_LAUNCH_BROWSER, true);
  if (!autoLaunch) {
    throw new Error(`Chrome CDP is unavailable at ${cdpUrl} and CHATGPT_AUTO_LAUNCH_BROWSER is disabled.`);
  }

  const launcher = options.browserLauncher ?? launchLocalBrowser;
  process.stderr.write(`[chatgpt-browser-adapter] Chrome CDP unavailable at ${cdpUrl}; auto-launching browser.\n`);
  const launched = await launcher({
    cdpUrl, env, platformName,
    spawnImpl: options.spawnImpl ?? spawn,
    existsImpl: options.existsImpl ?? existsSync
  });

  const timeoutMs = positiveNumber(options.cdpReadyTimeoutMs ?? env.CHATGPT_CDP_START_TIMEOUT_MS, 20000);
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe(cdpUrl)) {
      process.stderr.write(`[chatgpt-browser-adapter] Chrome CDP ready at ${cdpUrl}.\n`);
      return { status: "READY", launched: true, cdpUrl, ...launched };
    }
    await sleep(250);
  }
  throw new Error(`Browser auto-launched but Chrome CDP did not become ready at ${cdpUrl} within ${timeoutMs}ms.`);
}

function isKnfLayoutReference(reference) {
  return String(reference?.role ?? "").toUpperCase().includes("REFERENCE_LIBRARY:KNF_LAYOUT:");
}

export function buildReferenceGuidance(references) {
  if (!Array.isArray(references) || references.length === 0) return "";
  const visualReferences = references.filter(reference => !isKnfLayoutReference(reference));
  if (visualReferences.length === 0) return "";
  return [
    "ATTACHED REFERENCE INVENTORY:",
    ...visualReferences.map((reference, index) => {
      const role = String(reference?.role ?? "REFERENCE");
      const file = basename(String(reference?.absolutePath ?? `reference-${index + 1}`));
      return `Reference ${index + 1}: ${file} [${role}]`;
    })
  ].join("\n");
}

export function buildChatGptTransmissionText(request) {
  const prompt = String(request?.prompt ?? "").trim();
  if (!prompt) throw new Error("ChatGPT Browser adapter requires a non-empty prompt.");
  const negativePrompt = String(request?.negativePrompt ?? "").trim();
  const referenceGuidance = buildReferenceGuidance(request?.references);
  return [
    "Generate an image from the following production brief.",
    ...(referenceGuidance ? [referenceGuidance] : []),
    prompt,
    ...(negativePrompt ? ["NEGATIVE CONSTRAINTS (transported verbatim):\n" + negativePrompt] : [])
  ].join("\n\n");
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function runPythonWorker(payload, options = {}) {
  const python = options.pythonExecutable
    ?? process.env.VPF_PYTHON_EXECUTABLE
    ?? process.env.PYTHON
    ?? "python";
  const timeoutSeconds = positiveNumber(
    process.env.CHATGPT_IMAGE_TIMEOUT_SECONDS,
    options.timeoutSeconds ?? 180
  );
  return new Promise((resolve, reject) => {
    const child = spawn(python, [workerPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8"
      }
    });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`ChatGPT Browser worker timed out after ${timeoutSeconds + 60}s.`));
    }, (timeoutSeconds + 60) * 1000);
    child.stdout.on("data", chunk => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", chunk => {
      const bytes = Buffer.from(chunk);
      stderr.push(bytes);
      // The worker is otherwise silent until its multi-minute timeout. Relay
      // progress to the CLI so a stalled ChatGPT UI can be diagnosed in place.
      process.stderr.write(bytes);
    });
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", code => {
      clearTimeout(timer);
      const errorText = Buffer.concat(stderr).toString("utf8").trim();
      if (code !== 0) {
        reject(new Error(errorText || `ChatGPT Browser worker exited with code ${code}.`));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(stdout).toString("utf8")));
      } catch (error) {
        reject(new Error(`ChatGPT Browser worker returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
    child.stdin.end(JSON.stringify({
      ...payload,
      cdpUrl: String(payload?.cdpUrl ?? "").trim() || process.env.CHATGPT_CDP_URL?.trim() || DEFAULT_CDP_URL,
      timeoutSeconds
    }));
  });
}

function normalizeReferences(request) {
  if (!Array.isArray(request?.references)) return [];
  return request.references.map((reference, index) => {
    const absolutePath = String(reference?.absolutePath ?? "").trim();
    if (!absolutePath) throw new Error(`ChatGPT Browser reference ${index + 1} has no absolutePath.`);
    return {
      absolutePath,
      mediaId: String(reference?.mediaId ?? `reference-${index + 1}`),
      role: String(reference?.role ?? "REFERENCE"),
      sha256: String(reference?.sha256 ?? "")
    };
  });
}

export function createImageProviderAdapter(options = {}) {
  const workerRunner = options.workerRunner ?? runPythonWorker;
  const browserPreflight = options.browserPreflight ?? ensureLocalCdp;
  async function prepareBrowser() {
    const cdpUrl = String(options.cdpUrl ?? process.env.CHATGPT_CDP_URL ?? "").trim() || DEFAULT_CDP_URL;
    await browserPreflight(cdpUrl, options);
    return cdpUrl;
  }
  return {
    async healthcheck() {
      const cdpUrl = await prepareBrowser();
      return await workerRunner({ action: "probe", references: [], cdpUrl }, options);
    },
    async generate(request) {
      const cdpUrl = await prepareBrowser();
      const references = normalizeReferences(request);
      const transmissionText = buildChatGptTransmissionText({ ...request, references });
      // KNF examples are editor-layout metadata, not pixels for GPT image generation.
      // The approved Agent3 prompt owns all creative/layout instructions.
      const uploadedReferences = references.filter(reference => !isKnfLayoutReference(reference));
      const result = await workerRunner({
        action: "generate",
        transmissionText,
        sessionKey: String(request.sessionKey ?? ""),
        width: request.width,
        height: request.height,
        aspectRatio: request.aspectRatio,
        references: uploadedReferences,
        cdpUrl
      }, options);
      if (!result || typeof result.imageBase64 !== "string" || result.mimeType !== "image/png") {
        throw new Error("ChatGPT Browser worker did not return a PNG image result.");
      }
      const bytes = Buffer.from(result.imageBase64, "base64");
      if (bytes.length === 0) throw new Error("ChatGPT Browser worker returned an empty image.");
      return {
        bytes,
        mimeType: "image/png",
        providerRequestIds: Array.isArray(result.providerRequestIds)
          ? result.providerRequestIds.map(String)
          : []
      };
    }
  };
}

export default createImageProviderAdapter();
