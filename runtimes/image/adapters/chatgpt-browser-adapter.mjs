import { spawn } from "node:child_process";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const workerPath = fileURLToPath(new URL("./chatgpt_browser_worker_v2.py", import.meta.url));

function referenceRoleInstruction(role) {
  const normalized = String(role ?? "").toUpperCase();
  if (normalized.includes("COMPOSITION_GRAMMAR")) return "match the environment-first wide/medium-wide composition, restrained subject scale, and readable depth structure";
  if (normalized.includes("ATMOSPHERE_GRAMMAR")) return "match the subdued atmosphere, natural depth, and restrained painterly-matte surface treatment";
  if (normalized.includes("NARRATIVE_GRAMMAR")) return "match the explanatory historical storytelling hierarchy and relationship between evidence, subject, and environment";
  if (normalized.includes("MYSTERY_CLOSURE_GRAMMAR")) return "match the unresolved historical-mystery spacing, negative space, and distant/open geography";
  if (normalized.includes("KNF_LAYOUT")) return "use only as a layout/hierarchy cue for this scene beat; do not copy text from the reference";
  if (normalized.includes("PROJECT")) return "preserve approved project-specific continuity without overriding the global visual grammar";
  return "use as supporting visual reference without copying unsupported content";
}

export function buildReferenceGuidance(references) {
  if (!Array.isArray(references) || references.length === 0) return "";
  const lines = references.map((reference, index) => {
    const role = String(reference?.role ?? "REFERENCE");
    const file = basename(String(reference?.absolutePath ?? `reference-${index + 1}`));
    return `Reference ${index + 1} (${file}, ${role}): ${referenceRoleInstruction(role)}.`;
  });
  return [
    "REFERENCE USAGE CONTRACT:",
    "The attached images are approved visual references. Follow their assigned roles strongly for composition, atmosphere and visual hierarchy; do not merely treat them as generic inspiration.",
    ...lines,
    "Do not copy readable text, unsupported symbols, people, places, or factual claims from a reference unless the scene prompt explicitly requires them."
  ].join("\n");
}

export function buildChatGptTransmissionText(request) {
  const prompt = String(request?.prompt ?? "").trim();
  if (!prompt) throw new Error("ChatGPT Browser adapter requires a non-empty prompt.");
  const negativePrompt = String(request?.negativePrompt ?? "").trim();
  const referenceGuidance = buildReferenceGuidance(request?.references);
  return [
    "이미지 생성해줘",
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
  const workerRunner = options.workerRunner ?? runPythonWorker;
  return {
    async healthcheck() {
      return await workerRunner({ action: "probe", references: [] }, options);
    },
    async generate(request) {
      const references = normalizeReferences(request);
      const transmissionText = buildChatGptTransmissionText({ ...request, references });
      const result = await workerRunner({
        action: "generate",
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
