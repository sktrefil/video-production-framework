import { spawn } from "node:child_process";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const workerPath = fileURLToPath(new URL("./chatgpt_browser_worker_v2.py", import.meta.url));

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
  const workerRunner = options.workerRunner ?? runPythonWorker;
  return {
    async healthcheck() {
      return await workerRunner({ action: "probe", references: [] }, options);
    },
    async generate(request) {
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
        references: uploadedReferences
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
