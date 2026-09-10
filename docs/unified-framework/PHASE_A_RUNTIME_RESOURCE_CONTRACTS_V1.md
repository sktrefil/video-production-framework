# PHASE A — Runtime and Resource Contracts v1

Status: **FINAL DESIGN**

## 1. Purpose

Define the boundary between Framework decisions and execution implementations.

The contract must work for:

- ElevenLabs TTS,
- image generation,
- Google Flow/manual video generation,
- future automated video providers,
- editor materialization,
- Remotion final render.

---

## 2. Canonical execution envelope

The existing domain `ProviderJob` remains the durable orchestration record.

A new runtime-contract package materializes a provider-neutral execution envelope.

```ts
type RuntimeJob = {
  schemaVersion: 1;
  jobId: string;
  projectId: string;
  jobType: "IMAGE_GENERATION" | "VIDEO_GENERATION" | "TTS_GENERATION" | "OTHER";
  target: {
    type: "ASSET" | "CLIP" | "AUDIO";
    id: string;
    revision: number;
  };
  provider: string;
  providerProfileVersion: string;
  executionMode: "AUTOMATED" | "MANUAL_EXTERNAL";
  attempt: number;
  inputHash: string;
  input: unknown;
  expectedOutputs: RuntimeExpectedOutput[];
};
```

RuntimeJob is an execution snapshot. It does not replace ProviderJob.

---

## 3. Runtime result

```ts
type RuntimeResult = {
  schemaVersion: 1;
  jobId: string;
  projectId: string;
  attempt: number;
  status: "COMPLETE" | "FAILED" | "BLOCKED";
  providerRequestIds: string[];
  outputs: RuntimeOutputArtifact[];
  startedAt: string;
  completedAt: string;
  error?: {
    code: string;
    detail?: string;
  };
};
```

Each output artifact contains only execution facts:

```ts
type RuntimeOutputArtifact = {
  role: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  width?: number;
  height?: number;
  durationMs?: number;
};
```

Approval state is deliberately absent.

---

## 4. Image runtime input

The Framework compiles the final provider prompt before runtime execution.

```ts
type ImageRuntimeInput = {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  aspectRatio: string;
  referenceMedia?: Array<{
    mediaId: string;
    relativePath: string;
    sha256: string;
    role: "IDENTITY" | "COMPOSITION" | "SOURCE";
  }>;
  outputRelativePath: string;
};
```

### Hard rule

The image runtime must submit the supplied prompt semantically unchanged.

Allowed provider formatting:

- field-name conversion,
- required wrapper syntax,
- reference-media upload,
- provider-safe file naming.

Not allowed:

- style prepend/append,
- old palette injection,
- character rewrite,
- scene rewrite,
- old master prompt,
- provider-side creative planning.

If a provider needs alternative wording for capability/safety reasons, that is a
new Framework revision/preflight decision, not an invisible runtime mutation.

---

## 5. TTS runtime input

The existing `packages/tts-generation` plan remains authoritative.

Runtime implementation reuses the proven behavior from the existing Python
runtime:

- approved FINAL script only,
- ElevenLabs `/with-timestamps`,
- `model_id = eleven_v3`,
- LONGFORM chunk ceiling 4,000 characters,
- narration MP3,
- character alignment,
- request IDs,
- hashes and metadata,
- provider-native cadence for History/Mystery v3.

Runtime secrets are resolved locally.

The durable Framework record stores secret references only.

---

## 6. Video runtime input

```ts
type VideoRuntimeInput = {
  mode: "DIRECT_START_END_I2V" | "SINGLE_IMAGE_I2V";
  durationMs: number;
  prompt: string;
  startMedia: RuntimeMediaRef;
  endMedia?: RuntimeMediaRef;
  outputRelativePath: string;
};
```

The runtime must not modify:

- clip mode,
- duration intent,
- start/end asset identity,
- transition method,
- camera/subject/environment intent.

Those are decided before provider execution.

---

## 7. Google Flow manual-external contract

Initial implementation is first-class manual execution.

Export package:

```
jobs/<job_id>/
├─ runtime_job.json
├─ prompt.txt
├─ start_image.*
├─ end_image.*           # when applicable
└─ INSTRUCTIONS.md
```

Import:

```powershell
vpf job import-result <job_id> <generated-video-file>
```

Import validates:

- current job ID/revision,
- job still awaiting external result,
- file exists,
- expected media type,
- duration/metadata when available,
- checksum,
- no target revision drift.

Then it creates candidate MediaArtifact data and sends the clip to normal WF-12
QC. Manual Flow generation never directly approves the clip.

---

## 8. Runtime registry

A new registry resolves logical provider/profile to executor.

Example:

```json
{
  "ELEVENLABS": {
    "profile": "elevenlabs-v3-history-v1",
    "executor": "runtimes/elevenlabs"
  },
  "OPENAI_IMAGE": {
    "profile": "openai-image-v1",
    "executor": "runtimes/image"
  },
  "GOOGLE_FLOW": {
    "profile": "google-flow-manual-v1",
    "executor": "runtimes/google-flow",
    "executionMode": "MANUAL_EXTERNAL"
  }
}
```

The registry is infrastructure configuration. It does not contain creative style
rules.

---

## 9. Resource registry

Versioned production resources move under:

```
resources/
```

Resource categories:

```
CHANNEL_VISUAL_BIBLE
FORMAT_PROFILE
PROVIDER_PROFILE
CHANNEL_PROFILE
RULE_REGISTRY
SCHEMA
```

Every resolved resource returns:

```ts
type ResourceSnapshot = {
  resourceType: string;
  resourceId: string;
  version: string;
  contentHash: string;
  payload: unknown;
};
```

The project pins version and hash.

A resource update never silently changes an existing project.

---

## 10. Visual Bible contract

The canonical Channel Visual Bible is a versioned resource, not a legacy runtime
configuration file.

It provides channel-level visual language and adaptation principles.

Project-specific appearance is materialized by WF-08 into Project Style.

The Visual Bible must not be duplicated into runtime code.

### Style precedence

```
Channel Visual Bible
        ↓
Project Style
        ↓
Identity Anchors
        ↓
Scene / Asset Design
        ↓
Format Profile
        ↓
Image Prompt
```

The provider runtime sees only the final compiled execution data.

---

## 11. Format profile contract

Format profiles contain delivery/layout constraints rather than channel style.

Examples:

```
LONGFORM_16X9_V1
SHORTFORM_9X16_V1
```

Typical fields:

- width,
- height,
- aspect ratio,
- fps preference,
- safe areas,
- image generation dimensions,
- editor defaults,
- subtitle layout envelope.

A format profile cannot replace Project Style.

---

## 12. Provider profile contract

Provider profiles contain capability/execution constraints:

- provider/model identifier,
- supported input media,
- supported duration range,
- image dimensions/aspect ratios,
- execution mode,
- retry policy,
- result type,
- runtime secret names,
- provider-specific payload mapping.

Provider profiles must not contain:

- channel visual style,
- narrative rules,
- historical palette,
- character design policy.

---

## 13. Project resource pinning

The existing `VersionPins` remains the project-level pointer contract.

At project creation, all mandatory pins resolve and are recorded.

Before a production decision or runtime job:

1. verify pinned version exists,
2. verify content hash,
3. reject stale/missing resource,
4. never auto-upgrade an existing project.

Explicit project resource upgrade creates a new revision and triggers stale
impact handling.

---

## 14. Editor materialization contract

Input:

- current READY timeline assembly,
- current editor project snapshot,
- all referenced AVAILABLE MediaArtifacts.

Output:

```
workspace/projects/<id>/08_editor/edit_project.json
apps/editor/public/projects/<id>/... generated mirror
```

Materialization report contains:

- project ID,
- assembly ID/revision,
- edit-project SHA,
- copied/linked media list,
- source checksum,
- destination checksum,
- missing files,
- status.

Render is blocked if any materialized media hash differs.

---

## 15. Render runtime contract

The current final-render contract is preserved:

```
GenericFinalRender
h264
aac
yuv420p
CRF 18
```

The unified runtime executes from `apps/editor`, but Framework WF-17 remains the
owner of:

- attempt state,
- timeline hash pinning,
- technical QC acceptance,
- delivery-ready state.

The Remotion script is an executor, not the state owner.

---

## 16. Error contract

Runtime errors use stable categories:

```
RUNTIME_CONFIG_INVALID
RUNTIME_SECRET_MISSING
RUNTIME_INPUT_MISSING
RUNTIME_INPUT_HASH_MISMATCH
PROVIDER_REQUEST_FAILED
PROVIDER_RESULT_INVALID
PROVIDER_TIMEOUT
MANUAL_RESULT_NOT_READY
ARTIFACT_WRITE_FAILED
ARTIFACT_HASH_MISMATCH
LEGACY_RUNTIME_FORBIDDEN
```

Provider-specific raw errors may be recorded as detail but not used as stable
workflow state names.

---

## 17. Idempotency

A runtime execution is identified by:

```
jobId + job revision + attempt + inputHash
```

The same successful result may be reused only when:

- target revision is still current,
- input hash is unchanged,
- output file/hash still matches,
- the corresponding MediaArtifact is current and AVAILABLE.

Retry creates a new attempt and never overwrites execution history.

---

## 18. Security boundary

No execution package may include a secret value.

Manual job export must not contain:

- API keys,
- access tokens,
- cookies,
- browser session storage,
- provider credentials.

Runtime-local browser automation, if ever adopted, must use machine-local
credential/session storage outside the project package.
