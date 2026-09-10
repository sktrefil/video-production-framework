import assert from "node:assert/strict";
import {readFile, stat, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {EditorMaterializationError} from "@vpf/editor-materializer";
import {FinalRenderPipeline} from "@vpf/final-render";
import {FinalOutputPipeline} from "@vpf/final-output";
import {EditorContentPlanService, EditorTimelineAssemblyPipeline} from "@vpf/editor-timeline";
import {MediaBindingPipeline} from "@vpf/media-binding";
import {SqliteFinalRenderRepository} from "@vpf/storage/final-render";
import {SqliteFinalOutputRepository} from "@vpf/storage/final-output";
import {SqliteEditorTimelineRepository} from "@vpf/storage/editor-timeline";
import {materializeProjectCommand} from "../../../apps/editor/scripts/materialize-editor-project.mjs";
import {renderEditorProject} from "../../../apps/editor/scripts/render-editor-project.mjs";
import {recordFinalOutputQcCommand} from "../../../apps/editor/scripts/final-output-qc.mjs";
import {packagePublishHandoffCommand} from "../../../apps/editor/scripts/package-publish-handoff.mjs";
import {clock, makeIds} from "./support.mjs";

async function assertMaterializationHashDriftBlocked(fixture) {
  const first = await materializeProjectCommand({
    projectId: fixture.projectId,
    projectRoot: fixture.projectRoot
  });
  assert.equal(first.report.status, "READY");
  assert.ok(first.report.media.length >= 2);
  const sourceRelativePath = first.report.media[0].sourceRelativePath;
  const sourcePath = join(fixture.projectRoot, sourceRelativePath);
  const original = await readFile(sourcePath);
  await writeFile(sourcePath, Buffer.concat([original, Buffer.from("MIG12_HASH_DRIFT")]));
  try {
    await assert.rejects(
      () => materializeProjectCommand({
        projectId: fixture.projectId,
        projectRoot: fixture.projectRoot
      }),
      error => error instanceof EditorMaterializationError && error.code === "SOURCE_HASH_MISMATCH"
    );
  } finally {
    await writeFile(sourcePath, original);
  }
  const restored = await materializeProjectCommand({
    projectId: fixture.projectId,
    projectRoot: fixture.projectRoot
  });
  assert.equal(restored.report.status, "READY");
  return restored;
}

async function assertTechnicalQcFailureBlocksDelivery(fixture) {
  const repo = new SqliteFinalRenderRepository(fixture.dbPath);
  const pipeline = new FinalRenderPipeline(repo, clock, makeIds(41000));
  try {
    const prepared = await pipeline.prepareRender({projectId: fixture.projectId});
    assert.equal(prepared.renderAttempt.status, "READY");
    const running = await pipeline.markRunning({
      projectId: fixture.projectId,
      renderAttemptId: prepared.renderAttempt.id
    });
    const expectedDurationMs = (running.expectedDurationInFrames / running.expectedFps) * 1000;
    const bad = await pipeline.importRenderResult({
      projectId: fixture.projectId,
      renderAttemptId: running.id,
      result: {
        schemaVersion: 1,
        status: "RENDERED",
        compositionId: "GenericFinalRender",
        projectId: fixture.projectId,
        projectSha256: running.projectSha256,
        renderedAt: clock.nowIso(),
        metadata: {
          fps: running.expectedFps,
          width: running.expectedWidth,
          height: running.expectedHeight,
          durationInFrames: running.expectedDurationInFrames
        },
        output: {
          path: running.paths.outputPath,
          sizeBytes: 100,
          sha256: "b".repeat(64),
          codec: "h264",
          audioCodec: "aac",
          pixelFormat: "yuv420p",
          crf: 18
        },
        probe: {
          container: "mov,mp4,m4a,3gp,3g2,mj2",
          videoCodec: "h264",
          audioCodec: "aac",
          pixelFormat: "yuv420p",
          width: 1,
          height: running.expectedHeight,
          fps: running.expectedFps,
          durationMs: expectedDurationMs,
          hasAudioStream: running.expectedAudio
        }
      }
    });
    assert.equal(bad.technicalQc.status, "FAIL");
    assert.ok(bad.technicalQc.issueCodes.includes("DIMENSIONS_MISMATCH"));
    assert.equal(bad.delivery.status, "BLOCKED");
    assert.equal(bad.renderAttempt.status, "TECHNICAL_QC_FAILED");
    const readiness = await pipeline.getReadiness(fixture.projectId);
    assert.equal(readiness.deliveryReady, false);
  } finally {
    repo.close();
  }
}

async function packageCurrentRender(fixture) {
  const qc = await recordFinalOutputQcCommand({
    projectId: fixture.projectId,
    projectRoot: fixture.projectRoot,
    status: "PASS",
    confidence: 1,
    notes: ["MIG-12 deterministic fixture final output QC"]
  });
  assert.equal(qc.record.status, "PASS");

  const metadataPath = join(fixture.projectRoot, "10_publish", "mig12_metadata_input.json");
  await writeFile(metadataPath, JSON.stringify({
    platform: "YOUTUBE",
    title: `MIG-12 ${fixture.format} E2E`,
    description: "Single-repository deterministic fixture",
    tags: ["mig-12", "e2e", fixture.format.toLowerCase()],
    visibility: "PRIVATE",
    madeForKids: false,
    language: "ko"
  }, null, 2));
  const packaged = await packagePublishHandoffCommand({
    projectId: fixture.projectId,
    projectRoot: fixture.projectRoot,
    metadataPath
  });
  assert.equal(packaged.outcome.manifest.packageStatus, "READY");
  assert.equal(packaged.outcome.output.status, "READY");
  assert.equal(packaged.materialized.status, "READY");
  const handoffPath = join(fixture.projectRoot, packaged.materialized.handoffPath);
  const handoff = JSON.parse(await readFile(handoffPath, "utf8"));
  assert.equal(handoff.status, "READY");
  const video = packaged.materialized.files.find(file => file.role === "VIDEO");
  assert.ok(video);
  const videoInfo = await stat(join(fixture.projectRoot, video.projectRelativePath));
  assert.ok(videoInfo.isFile() && videoInfo.size > 0);

  const repo = new SqliteFinalOutputRepository(fixture.dbPath);
  try {
    const readiness = await new FinalOutputPipeline(repo, clock, makeIds(43000))
      .getReadiness(fixture.projectId);
    assert.equal(readiness.publishHandoffReady, true);
    assert.equal(readiness.status, "PACKAGE_READY");
  } finally {
    repo.close();
  }
  return packaged;
}

async function assertRenewedTimelineStalesDeliveryAndPackage(fixture) {
  const timelineRepo = new SqliteEditorTimelineRepository(fixture.dbPath);
  const ids = makeIds(45000);
  try {
    const contentService = new EditorContentPlanService(timelineRepo, clock, ids);
    const revised = await contentService.savePlan({
      projectId: fixture.projectId,
      planStatus: "APPROVED",
      audio: fixture.contentPlan.audio,
      subtitles: fixture.contentPlan.subtitles,
      textOverlays: fixture.contentPlan.textOverlays.map(item => ({
        ...item,
        text: item.text + " · revised"
      })),
      graphics: fixture.contentPlan.graphics
    });
    assert.equal(revised.revision, fixture.contentPlan.revision + 1);
    const handoff = new MediaBindingPipeline(
      timelineRepo,
      timelineRepo,
      clock,
      makeIds(47000)
    );
    const assemblyPipeline = new EditorTimelineAssemblyPipeline(
      timelineRepo,
      handoff,
      clock,
      ids,
      timelineRepo
    );
    const renewed = await assemblyPipeline.assembleProject({
      projectId: fixture.projectId,
      projectName: `MIG-12 ${fixture.format} Fixture revised`,
      profile: fixture.profile
    });
    assert.equal(renewed.output.status, "READY");
    assert.ok(renewed.assembly.revision > fixture.assembly.revision);
  } finally {
    timelineRepo.close();
  }

  const renderRepo = new SqliteFinalRenderRepository(fixture.dbPath);
  try {
    const readiness = await new FinalRenderPipeline(renderRepo, clock, makeIds(49000))
      .getReadiness(fixture.projectId);
    assert.equal(readiness.status, "STALE");
    assert.equal(readiness.deliveryReady, false);
  } finally {
    renderRepo.close();
  }

  const outputRepo = new SqliteFinalOutputRepository(fixture.dbPath);
  try {
    const outputPipeline = new FinalOutputPipeline(outputRepo, clock, makeIds(51000));
    const readiness = await outputPipeline.getReadiness(fixture.projectId);
    assert.equal(readiness.publishHandoffReady, false);
    const pkg = await outputRepo.getLatestPublishPackage(fixture.projectId);
    assert.equal(pkg?.packageStatus, "STALE");
  } finally {
    outputRepo.close();
  }
}

export async function runEditorFixture(fixture, {negativeCases = false} = {}) {
  const materialized = negativeCases
    ? await assertMaterializationHashDriftBlocked(fixture)
    : await materializeProjectCommand({
        projectId: fixture.projectId,
        projectRoot: fixture.projectRoot
      });
  assert.equal(materialized.report.status, "READY");
  assert.equal(materialized.report.assemblyId, fixture.assembly.id);
  const mediaItemTypes = new Set(["VIDEO", "IMAGE", "TTS", "CLIP_AUDIO", "BGM", "SFX"]);
  const executionMediaPaths = new Set(
    materialized.executionProject.items
      .filter(item => mediaItemTypes.has(item.type))
      .map(item => item.src)
  );
  assert.equal(materialized.report.media.length, executionMediaPaths.size);
  assert.ok(materialized.report.media.every(media => executionMediaPaths.has(media.editorRelativePath)));

  if (negativeCases) {
    await assertTechnicalQcFailureBlocksDelivery(fixture);
  }

  const rendered = await renderEditorProject({
    projectId: fixture.projectId,
    projectRoot: fixture.projectRoot
  });
  assert.equal(rendered.status, "DELIVERY_READY");
  assert.equal(rendered.technicalQc?.status ?? "PASS", "PASS");
  assert.equal(rendered.delivery?.status, "READY");
  const outputInfo = await stat(join(fixture.projectRoot, "09_render", "final.mp4"));
  assert.ok(outputInfo.isFile() && outputInfo.size > 0);

  const packaged = await packageCurrentRender(fixture);
  let staleGateVerified = false;
  if (negativeCases) {
    await assertRenewedTimelineStalesDeliveryAndPackage(fixture);
    staleGateVerified = true;
  }

  return {
    format: fixture.format,
    projectId: fixture.projectId,
    materialized: true,
    deliveryReady: true,
    publishHandoffReady: true,
    staleGateVerified,
    renderAttempt: rendered.renderAttempt?.attempt,
    packageSha256: packaged.outcome.manifest.packageSha256
  };
}
