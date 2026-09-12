import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const workerPath = fileURLToPath(new URL("./chatgpt_browser_worker.py", import.meta.url));

export function buildChatGptTransmissionText(request) {
  const prompt = String(request?.prompt ?? "").trim();
  if (!prompt) throw new Error("ChatGPT Browser adapter requires a non-empty prompt.");
  const negativePrompt = String(request?.negativePrompt ?? "").trim();
  return [
    "이미지 생성해줘",
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
    child.stderr.on("data", chunk => stderr.push(Buffer.from(chunk)));
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
      cdpUrl: process.env.CHATGPT_CDP_URL?.trim() || "http://127.0.0.1:9222",
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
  return {
    async generate(request) {
      const transmissionText = buildChatGptTransmissionText(request);
      const references = normalizeReferences(request);
      const result = await (options.workerRunner ?? runPythonWorker)({
        transmissionText,
        width: request.width,
        height: request.height,
        aspectRatio: request.aspectRatio,
        references
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
