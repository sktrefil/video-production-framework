import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {deflateSync} from "node:zlib";
import {mkdir,readFile,readdir,writeFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {runCli} from "../../../cli/vpf/dist/index.js";
import {ResourceRegistryError} from "@vpf/resource-registry";
import {ImageRuntimeExecutor} from "@vpf/provider-orchestrator/image-runtime";
import {RuntimeContractError} from "@vpf/runtime-contracts";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const fixtureRoot = fileURLToPath(new URL("./fixtures/", import.meta.url));
const fixedNow = "2026-09-11T00:00:00.000Z";
const clock = {nowIso: () => fixedNow};

function makeIds(seed = 0) {
  let value = seed;
  return {next: prefix => `${prefix}_e2e_${++value}`};
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function solidPng(width, height, tone = 32) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const row = Buffer.alloc(1 + width * 3, tone);
  row[0] = 0;
  const raw = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y += 1) {
    row.copy(raw, y * row.length);
  }
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, {level: 9})),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

const storyDecisions = {
  async designStructure() {
    return {chapters: [{key: "c1", displayNumber: 1, title: "Fixture Chapter"}]};
  },
  async designSequences() {
    return {
      sequences: [{
        key: "q1",
        chapterKey: "c1",
        displayNumber: 1,
        title: "Fixture Sequence",
        storyPurpose: "single-repository continuity proof"
      }]
    };
  },
  async designScenes() {
    return {
      scenes: [
        {
          key: "s1",
          sequenceKey: "q1",
          displayNumber: 1,
          scriptSegment: "첫 장면.",
          stateIn: "A",
          stateCurrent: "B",
          stateOut: "C",
          primaryVisualIdea: "첫 번째 승인 장면",
          mustBeSeen: ["인물"],
          canBeNarrated: [],
          canBeImplied: [],
          requiredIdentityAnchorIds: []
        },
        {
          key: "s2",
          sequenceKey: "q1",
          displayNumber: 2,
          scriptSegment: "둘째 장면.",
          stateIn: "C",
          stateCurrent: "D",
          stateOut: "E",
          primaryVisualIdea: "두 번째 승인 장면",
          mustBeSeen: ["같은 인물"],
          canBeNarrated: [],
          canBeImplied: [],
          requiredIdentityAnchorIds: []
        }
      ]
    };
  }
};

function visualDecisions(sceneIds) {
  return {
    async designProjectStyle() {
      return {
        eraRegion: "조선 후기",
        visualApproach: "역사 다큐 재현",
        realismLevel: "사실적",
        colorLanguage: "저채도",
        lightingLanguage: "자연광",
        materialLanguage: "목재와 한지",
        environmentLanguage: "고증 공간",
        characterRenderingPrinciple: "동일 인물 유지",
        cameraCompositionTendency: "관찰형",
        moodRange: ["절제"],
        factualConstraints: [],
        avoidances: ["현대 물건"]
      };
    },
    async planIdentityAnchors() {
      return {
        anchors: [{
          key: "person",
          anchorType: "CHARACTER",
          name: "반복 인물",
          rationale: "두 장면 동일 인물",
          continuityReason: "RECURRING",
          productionPriority: "CRITICAL",
          requiredBySceneIds: sceneIds,
          specification: {
            locked: ["얼굴 구조", "연령대", "기본 복식"],
            contextual: ["표정"],
            temporary: []
          }
        }]
      };
    }
  };
}

class AssetDecisions {
  constructor() {
    this.anchorIds = [];
  }
  async planAsset() {
    return {
      assetClass: "PRIMARY_SCENE",
      assetRole: "STANDARD",
      productionPriority: "CRITICAL",
      sourceStrategy: "GENERATE",
      stateField: "STATE_CURRENT",
      rationale: "MIG-12 primary scene fixture"
    };
  }
  async designImageAsset() {
    return {
      visualGoal: "승인된 장면의 현재 상태",
      composition: "중경",
      continuityRequirements: ["반복 인물 동일성"],
      identityAnchorIds: [...this.anchorIds],
      factualConstraints: [],
      avoidances: ["현대 물건"]
    };
  }
  async compileImagePrompt(input) {
    return {
      prompt: `MIG12::${input.projectId}::${input.scene.id}::approved-image-prompt`,
      negativePrompt: "modern objects"
    };
  }
  async runImageQc() {
    return {qcStatus: "PASS", severity: "MINOR", confidence: 0.99};
  }
}

class LinkDecisions {
  async designPreLink() {
    return {
      decision: {
        preLinkRequired: true,
        continuityLevel: "STRICT",
        stateChange: "C to C",
        handoffIntent: "preserve approved state continuity",
        handoffAnchor: ["subject"],
        handoffChannels: ["VISUAL"],
        transitionIntent: "DIRECT"
      },
      status: "SUCCESS",
      confidence: 0.99,
      requiresHumanReview: false,
      warnings: [],
      decisionId: "mig12_prelink"
    };
  }
  async runHandoffQc() {
    return {
      decision: {
        qcStatus: "PASS",
        severity: "MINOR",
        confidence: 0.99,
        preLinkMatch: "MATCH",
        continuityUsable: true
      },
      status: "SUCCESS",
      confidence: 0.99,
      requiresHumanReview: false,
      warnings: [],
      decisionId: "mig12_handoff_qc"
    };
  }
}

class FinalClipDecisions {
  async designFinalClip() {
    return {
      decision: {
        implementationType: "CLIP",
        clipMode: "DIRECT_START_END_I2V",
        transitionMethod: "DIRECT",
        durationMs: 600,
        cameraMove: "LOW",
        subjectMotion: "LOW",
        environmentMotion: "LOW",
        rationale: "deterministic manual provider fixture",
        additionalAssetRequired: false
      },
      status: "SUCCESS",
      confidence: 0.99,
      requiresHumanReview: false,
      warnings: [],
      decisionId: "mig12_final_clip"
    };
  }
  async runProviderPreQc() {
    return {
      decision: {
        status: "PASS",
        safetySafe: true,
        capabilityCompatible: true,
        requiresAlternativeRepresentation: false,
        issueCodes: []
      },
      status: "SUCCESS",
      confidence: 0.99,
      requiresHumanReview: false,
      warnings: [],
      decisionId: "mig12_provider_pre_qc"
    };
  }
  async compileVideoPrompt() {
    return {
      decision: {
        prompt: "Use the approved START and END frames exactly; restrained continuity motion.",
        negativePrompt: "identity drift, new subject, modern objects"
      },
      status: "SUCCESS",
      confidence: 0.99,
      requiresHumanReview: false,
      warnings: [],
      decisionId: "mig12_video_prompt"
    };
  }
}

class QcDecisions {
  async runClipQc() {
    return {
      decision: {
        status: "PASS",
        severity: "MINOR",
        confidence: 0.99,
        issues: []
      },
      status: "SUCCESS",
      confidence: 0.99,
      requiresHumanReview: false,
      warnings: [],
      decisionId: "mig12_clip_qc"
    };
  }
  async selectClipFallback() {
    return {
      decision: {
        action: "EDITORIAL_MOVE",
        rationale: "deterministic fallback"
      },
      status: "SUCCESS",
      confidence: 0.99,
      requiresHumanReview: false,
      warnings: [],
      decisionId: "mig12_fallback"
    };
  }
}

class MockTtsRuntimeExecutor {
  constructor({projectRoot, fixtureAudioPath}) {
    this.projectRoot = projectRoot;
    this.fixtureAudioPath = fixtureAudioPath;
  }
  async execute(job) {
    const plan = job.input.plan;
    const text = plan.chunks.map(chunk => chunk.text).join("\n\n");
    const audioBytes = await readFile(this.fixtureAudioPath);
    const characters = [...text];
    const totalSeconds = 0.55;
    const step = totalSeconds / Math.max(1, characters.length);
    const starts = characters.map((_, index) => Number((index * step).toFixed(6)));
    const ends = characters.map((_, index) => Number(((index + 1) * step).toFixed(6)));
    const alignment = {
      characters,
      character_start_times_seconds: starts,
      character_end_times_seconds: ends
    };
    const metadata = {
      provider: "ELEVENLABS",
      model: "eleven_v3",
      mock: true,
      requestIds: ["mig12-tts-request"]
    };
    const voice = {provider: "ELEVENLABS", voiceId: "fixture-voice"};

    const documents = [
      ["narration", plan.outputPaths.narration, "audio/mpeg", audioBytes],
      ["character_alignment", plan.outputPaths.characterAlignment, "application/json", Buffer.from(JSON.stringify(alignment))],
      ["tts_metadata", plan.outputPaths.metadata, "application/json", Buffer.from(JSON.stringify(metadata))],
      ["resolved_voice_profile", plan.outputPaths.resolvedVoiceProfile, "application/json", Buffer.from(JSON.stringify(voice))]
    ];

    const outputs = [];
    for (const [role, relativePath, mimeType, bytes] of documents) {
      const absolute = join(this.projectRoot, relativePath);
      await mkdir(dirname(absolute), {recursive: true});
      await writeFile(absolute, bytes);
      outputs.push({
        role,
        relativePath,
        mimeType,
        sizeBytes: bytes.length,
        sha256: sha256(bytes),
        ...(role === "narration" ? {durationMs: 600} : {})
      });
    }
    return {
      schemaVersion: 1,
      jobId: job.jobId,
      jobRevision: job.jobRevision,
      projectId: job.projectId,
      attempt: job.attempt,
      status: "COMPLETE",
      providerRequestIds: ["mig12-tts-request"],
      outputs,
      startedAt: fixedNow,
      completedAt: fixedNow
    };
  }
}

function expectedVideoRuntimeResult(runtimeJob, relativePath, bytes) {
  return {
    schemaVersion: 1,
    jobId: runtimeJob.jobId,
    jobRevision: runtimeJob.jobRevision,
    projectId: runtimeJob.projectId,
    attempt: runtimeJob.attempt,
    status: "COMPLETE",
    providerRequestIds: ["mig12-manual-ticket"],
    outputs: [{
      role: "primary",
      relativePath,
      mimeType: "video/mp4",
      sizeBytes: bytes.length,
      sha256: sha256(bytes),
      durationMs: 600,
      width: 64,
      height: 64
    }],
    startedAt: fixedNow,
    completedAt: fixedNow
  };
}

function resourcePin(pins, type, id) {
  const pin = pins.find(item =>
    item.resourceType === type && item.resourceId === id
  );
  assert.ok(pin, `missing resource pin ${type}:${id}`);
  return pin;
}

async function countNamedFiles(root, name) {
  let count = 0;
  for (const entry of await readdir(root, {withFileTypes: true})) {
    const target = join(root, entry.name);
    if (entry.isDirectory()) count += await countNamedFiles(target, name);
    else if (entry.isFile() && entry.name === name) count += 1;
  }
  return count;
}

async function createWithCli(service, format, projectId) {
  const output = [];
  const errors = [];
  const io = {
    out: value => output.push(value),
    error: value => errors.push(value)
  };
  const code = await runCli([
    "project", "create", projectId,
    "--title", `MIG-12 ${format} Fixture`,
    "--format", format.toLowerCase()
  ], io, service);
  assert.equal(code, 0, errors.join("\n"));
  const created = JSON.parse(output.at(-1));
  assert.equal(created.status, "CREATED");
  assert.equal(created.format, format);

  const statusCode = await runCli(["project", "status", projectId], io, service);
  assert.equal(statusCode, 0, errors.join("\n"));
  const status = JSON.parse(output.at(-1));
  assert.equal(status.pipeline, "VPF_UNIFIED_V1");
  assert.equal(status.legacyAllowed, false);
  return {created, status};
}

async function assertStaleResourcePinBlocked(registry, pin) {
  const stale = {...pin, contentHash: `sha256:${"0".repeat(64)}`};
  await assert.rejects(
    () => registry.resolvePinned(stale),
    error => error instanceof ResourceRegistryError && error.code === "RESOURCE_HASH_MISMATCH"
  );
}

async function assertLegacyResourceBlocked(registry, counters) {
  const before = counters.legacyIoAccesses;
  await assert.rejects(
    () => registry.resolve({
      resourceType: "CHANNEL_VISUAL_BIBLE",
      resourceId: "HISTORY_MYSTERY_STYLIZED_V1",
      version: "1.0.0"
    }),
    error => error instanceof ResourceRegistryError && error.code === "LEGACY_RESOURCE_FORBIDDEN"
  );
  assert.equal(counters.legacyIoAccesses, before);
}

async function assertInvalidImageHashBlocked({workspaceRoot, projectId, projectRoot}) {
  const referencePath = join(projectRoot, "04_visual_identity", "invalid-hash-reference.png");
  const reference = solidPng(32, 32, 16);
  await writeFile(referencePath, reference);
  let providerCalls = 0;
  const executor = new ImageRuntimeExecutor({
    async generate(request) {
      providerCalls += 1;
      return {bytes: solidPng(request.width, request.height), mimeType: "image/png"};
    }
  }, {workspace: {workspaceRoot}, clock});
  const input = {
    prompt: "MIG12 invalid hash negative case",
    width: 64,
    height: 64,
    aspectRatio: "1:1",
    references: [{
      mediaId: "bad-reference",
      role: "IDENTITY_ANCHOR:test",
      relativePath: "04_visual_identity/invalid-hash-reference.png",
      sha256: "0".repeat(64)
    }],
    outputRelativePath: "05_images/generated/negative/attempt-1.png"
  };
  const job = {
    schemaVersion: 1,
    jobId: "negative-image-job",
    jobRevision: 1,
    projectId,
    jobType: "IMAGE_GENERATION",
    target: {type: "ASSET", id: "negative-asset", revision: 1},
    provider: "MIG12_MOCK_IMAGE",
    providerProfileVersion: "1.0.0",
    executionMode: "AUTOMATED",
    attempt: 1,
    inputHash: "a".repeat(64),
    input,
    expectedOutputs: [{
      role: "primary",
      mediaType: "IMAGE",
      required: true,
      acceptedMimeTypes: ["image/png"]
    }],
    secretRequirements: []
  };
  await assert.rejects(
    () => executor.execute(job),
    error => error instanceof RuntimeContractError && error.code === "ARTIFACT_HASH_MISMATCH"
  );
  assert.equal(providerCalls, 0);
}

export {repositoryRoot,fixtureRoot,fixedNow,clock,makeIds,sha256,solidPng,storyDecisions,visualDecisions,AssetDecisions,LinkDecisions,FinalClipDecisions,QcDecisions,MockTtsRuntimeExecutor,expectedVideoRuntimeResult,resourcePin,countNamedFiles,createWithCli,assertStaleResourcePinBlocked,assertLegacyResourceBlocked,assertInvalidImageHashBlocked};
