import { spawn } from "node:child_process";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const workerPath = fileURLToPath(new URL("./chatgpt_browser_worker_v2.py", import.meta.url));

function referenceRoleInstruction(role) {
  const normalized = String(role ?? "").toUpperCase();
  if (normalized.includes("COMPOSITION_GRAMMAR")) return "mandatory show-level visual authority: inherit the cinematic fantasy matte-painting scale, layered environmental depth, grand silhouette design, directional foreground framing, and controlled painterly composition";
  if (normalized.includes("ATMOSPHERE_GRAMMAR")) return "mandatory show-level visual authority: inherit the full cool-to-warm cinematic grade, luminous cloud breaks, volumetric haze, atmospheric depth, and painterly finish";
  if (normalized.includes("NARRATIVE_GRAMMAR")) return "mandatory show-level visual authority: inherit the full evidence-and-mystery visual hierarchy, tactile materials, dramatic object lighting, and cinematic information staging";
  if (normalized.includes("MYSTERY_CLOSURE_GRAMMAR")) return "mandatory show-level visual authority: inherit the full epic fantasy-mystery scale, monumental negative space, distant geography, and unresolved cinematic atmosphere";
  if (normalized.includes("KNF_LAYOUT")) return "do not upload or recreate this editorial template; use its named safe-zone pattern only";
  if (normalized.includes("PROJECT")) return "preserve approved project-specific continuity without overriding the global visual grammar";
  return "use as supporting visual reference without copying unsupported content";
}

function isKnfLayoutReference(reference) {
  return String(reference?.role ?? "").toUpperCase().includes("REFERENCE_LIBRARY:KNF_LAYOUT:");
}

function layoutSafeZoneInstruction(role) {
  const normalized = String(role ?? "").toUpperCase();
  if (normalized.includes("PERSISTENT_HEADER") || normalized.includes("HOOK_TITLE")) {
    return "Reserve the upper 18% as low-detail, even-toned atmospheric picture space for a later editorial header; generate no band, box, border, lettering, or logo.";
  }
  if (normalized.includes("TWO_LINE_CAPTION_BLUR")) {
    return "Keep the lower 22% visually simple and lower contrast for a later two-line caption; generate no blur panel, box, or lettering.";
  }
  if (normalized.includes("INFO_LABEL_OBJECT") || normalized.includes("EMPHASIS_CAPTION")) {
    return "Keep the central subject readable with uncluttered adjacent negative space for a later label; generate no label, pointer, border, or text.";
  }
  return "Keep the upper 16% and lower 18% low-detail and text-free for later editorial overlays; generate no header band, caption panel, frame, border, or lettering.";
}

export function buildReferenceGuidance(references) {
  if (!Array.isArray(references) || references.length === 0) return "";
  const visualReferences = references.filter(reference => !isKnfLayoutReference(reference));
  const layoutReferences = references.filter(isKnfLayoutReference);
  const visualLines = visualReferences.map((reference, index) => {
    const role = String(reference?.role ?? "REFERENCE");
    const file = basename(String(reference?.absolutePath ?? `reference-${index + 1}`));
    return `Reference ${index + 1} (${file}, ${role}): ${referenceRoleInstruction(role)}.`;
  });
  const layoutLines = layoutReferences.map((reference, index) =>
    `Layout cue ${index + 1} (${String(reference?.role ?? "KNF_LAYOUT")}): ${layoutSafeZoneInstruction(reference?.role)}`
  );
  return [
    ...(visualLines.length === 0 ? [] : [
      "MANDATORY GLOBAL VISUAL BIBLE:",
      "The attached GLOBAL_VISUAL images are the non-negotiable show tone and manner. Every generated image must visibly inherit their shared cinematic fantasy matte-painting identity: monumental layered environments, stylized painterly surfaces, bold cool-versus-warm tonal design, volumetric cloud and haze, dramatic but controlled light, and epic compositional depth. Do not fall back to grey photographic documentary, generic game-render, or an unrelated visual style.",
      "The scene prompt may change the story event, characters, and location, but it must not weaken or replace this global visual identity. Fantasy reconstruction is permitted. Historical uncertainty or deviation is handled by later editorial disclosure, not by flattening the generated image's fantasy visual language.",
      ...visualLines,
      "Do not generate readable text, captions, borders, logos, UI panels, or baked editorial labels. Those belong to the later editor overlay."
    ]),
    ...(layoutLines.length === 0 ? [] : [
      "EDITORIAL SAFE-ZONE CONTRACT:",
      "The listed KNF templates are metadata only and are deliberately not attached. Their text, black panels, frames, borders, arrows, and labels belong to the later editor overlay, never to the generated image.",
      ...layoutLines
    ])
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
      // KNF examples are editing templates, not visual source material. Sending
      // their pixels to an image model causes it to bake header/caption panels
      // into the plate. Their safe-zone instructions remain in transmissionText.
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
