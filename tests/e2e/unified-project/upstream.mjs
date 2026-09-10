import assert from "node:assert/strict";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {ProjectBootstrapService} from "@vpf/project-bootstrap";
import {
  FileSystemResourceRegistry,
  ChannelVisualBibleRegistryAdapter,
  FormatProfileRegistryAdapter
} from "@vpf/resource-registry";
import {StoryGenerationService, StoryPipeline} from "@vpf/story";
import {VisualIdentityPipeline} from "@vpf/visual-identity";
import {SceneAssetPipeline} from "@vpf/scene-assets";
import {UnifiedImageRuntimeJobService} from "@vpf/scene-assets/image-runtime";
import {PreLinkHandoffPipeline} from "@vpf/prelink-handoff";
import {FinalClipPipeline, FinalClipValidationError} from "@vpf/final-clip";
import {QcFallbackPipeline} from "@vpf/qc-fallback";
import {MediaBindingPipeline} from "@vpf/media-binding";
import {EditorContentPlanService, EditorTimelineAssemblyPipeline} from "@vpf/editor-timeline";
import {
  TtsGenerationPipeline
} from "@vpf/tts-generation";
import {
  TtsRuntimePreparationService,
  TtsRuntimeCompletionService,
  elevenLabsRuntimeExecutionOptions
} from "@vpf/tts-generation/runtime-adapter";
import {buildTtsAlignedSubtitleCuesFromArtifacts} from "@vpf/tts-generation/subtitle-bridge";
import {
  RuntimeExecutorRegistry,
  RuntimeOrchestrator
} from "@vpf/provider-orchestrator";
import {ImageRuntimeExecutor} from "@vpf/provider-orchestrator/image-runtime";
import {LocalAudioImportService} from "@vpf/provider-orchestrator/audio-import";
import {SqliteStoryRepository} from "@vpf/storage";
import {SqliteVisualIdentityRepository} from "@vpf/storage/visual-identity";
import {SqliteSceneAssetRepository} from "@vpf/storage/scene-assets";
import {SqlitePreLinkHandoffRepository} from "@vpf/storage/prelink-handoff";
import {SqliteFinalClipRepository} from "@vpf/storage/final-clip";
import {SqliteQcFallbackRepository} from "@vpf/storage/qc-fallback";
import {SqliteMediaBindingRepository} from "@vpf/storage/media-binding";
import {SqliteEditorTimelineRepository} from "@vpf/storage/editor-timeline";
import {SqliteTtsRuntimeRepository} from "@vpf/storage/tts-runtime";
import {SqliteRuntimeExecutionRepository} from "@vpf/storage/runtime-execution";
import {SqliteAudioImportRepository} from "@vpf/storage/audio-import";
import {
  repositoryRoot,
  fixtureRoot,
  clock,
  makeIds,
  sha256,
  solidPng,
  storyDecisions,
  visualDecisions,
  AssetDecisions,
  LinkDecisions,
  FinalClipDecisions,
  QcDecisions,
  MockTtsRuntimeExecutor,
  resourcePin,
  createWithCli,
  assertStaleResourcePinBlocked,
  assertLegacyResourceBlocked,
  assertInvalidImageHashBlocked
} from "./support.mjs";

function providerOptions() {
  return {
    expectedOutputs: [{
      role: "primary",
      mediaType: "VIDEO",
      required: true,
      acceptedMimeTypes: ["video/mp4"]
    }]
  };
}

function profileFromSnapshot(snapshot) {
  const payload = snapshot.payload;
  assert.ok(payload && typeof payload === "object");
  assert.ok(Number.isInteger(payload.fpsPreference));
  assert.ok(Number.isInteger(payload.width));
  assert.ok(Number.isInteger(payload.height));
  return {
    fps: payload.fpsPreference,
    width: payload.width,
    height: payload.height
  };
}

function rowCount(db, table, projectId) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE project_id = ?`).get(projectId).count;
}

export async function runUpstreamFixture({workspaceRoot, format, projectId, negativeCases = false}) {
  const bootstrap = new ProjectBootstrapService({repositoryRoot, workspaceRoot, clock});
  const {created, status} = await createWithCli(bootstrap, format, projectId);
  const projectRoot = created.projectRoot;
  const dbPath = created.projectDb;
  assert.equal((await bootstrap.doctor(projectId)).healthy, true);

  const counters = {legacyIoAccesses: 0, oldRepoOperationalCalls: 0};
  const registry = new FileSystemResourceRegistry(join(repositoryRoot, "resources"));
  const visualPin = resourcePin(status.resourcePins, "CHANNEL_VISUAL_BIBLE", "HISTORY_MYSTERY_VISUAL_BIBLE");
  const formatId = format === "SHORTFORM" ? "SHORTFORM_9X16_V1" : "LONGFORM_16X9_V1";
  const formatPin = resourcePin(status.resourcePins, "FORMAT_PROFILE", formatId);
  const ttsPin = resourcePin(status.resourcePins, "PROVIDER_PROFILE", "ELEVENLABS_V3_HISTORY_V1");
  const formatSnapshot = await registry.resolvePinned(formatPin);
  const bible = new ChannelVisualBibleRegistryAdapter(
    registry,
    visualPin.resourceId,
    {[visualPin.version]: visualPin.contentHash}
  );
  const formats = new FormatProfileRegistryAdapter(
    registry,
    formatPin.resourceId,
    {[formatPin.version]: formatPin.contentHash}
  );

  if (negativeCases) {
    await assertStaleResourcePinBlocked(registry, formatPin);
    await assertLegacyResourceBlocked(registry, counters);
    await assertInvalidImageHashBlocked({workspaceRoot, projectId, projectRoot});
  }

  const storyRepo = new SqliteStoryRepository(dbPath);
  const storyIds = makeIds(1000);
  const story = new StoryPipeline(storyRepo, clock, storyIds);
  const storyGeneration = new StoryGenerationService(storyRepo, storyDecisions, clock, storyIds);
  const script = await story.createScript({
    projectId,
    body: "첫 장면. 둘째 장면.",
    kind: "FINAL"
  });
  await story.approveFinalScript({projectId, scriptId: script.id});
  const graph = await storyGeneration.generate({projectId, format});
  await storyGeneration.approveStructure({projectId});
  await storyGeneration.approveScenes({projectId, sceneIds: graph.scenes.map(scene => scene.id)});
  assert.equal(graph.scenes.length, 2);
  storyRepo.close();

  const visualRepo = new SqliteVisualIdentityRepository(dbPath);
  const visual = new VisualIdentityPipeline(
    visualRepo,
    visualRepo,
    bible,
    visualDecisions(graph.scenes.map(scene => scene.id)),
    clock,
    makeIds(3000)
  );
  await visual.generateProjectStyle({
    projectId,
    format,
    channelVisualBibleVersion: visualPin.version
  });
  await visual.approveProjectStyle({projectId});
  const anchors = await visual.planIdentityAnchors({projectId, format});
  await visual.approveAnchors({projectId, anchorIds: anchors.map(anchor => anchor.id)});
  assert.equal(anchors.length, 1);
  visualRepo.close();

  const assetRepo = new SqliteSceneAssetRepository(dbPath);
  const assetDecisions = new AssetDecisions();
  assetDecisions.anchorIds = anchors.map(anchor => anchor.id);
  const assetIds = makeIds(5000);
  const assetPipeline = new SceneAssetPipeline(
    assetRepo,
    assetRepo,
    bible,
    formats,
    assetDecisions,
    {shouldAutoApprove: () => false},
    clock,
    assetIds
  );
  const imageRuntime = new UnifiedImageRuntimeJobService(
    assetRepo,
    assetRepo,
    bible,
    formats,
    assetDecisions,
    clock,
    assetIds
  );

  const runtimeRepo = new SqliteRuntimeExecutionRepository(dbPath);
  const imageRegistry = new RuntimeExecutorRegistry();
  let imageProviderCalls = 0;
  imageRegistry.register({
    provider: "MIG12_MOCK_IMAGE",
    jobType: "IMAGE_GENERATION",
    executor: new ImageRuntimeExecutor({
      async generate(request) {
        imageProviderCalls += 1;
        return {
          bytes: solidPng(request.width, request.height, 32 + imageProviderCalls * 16),
          mimeType: "image/png",
          providerRequestIds: [`mig12-image-${imageProviderCalls}`]
        };
      }
    }, {workspace: {workspaceRoot}, clock})
  });
  const imageOrchestrator = new RuntimeOrchestrator(
    runtimeRepo,
    imageRuntime.targetRevisionPort(),
    imageRegistry,
    clock,
    makeIds(7000),
    {workspaceRoot}
  );

  const imageStates = [];
  for (const scene of graph.scenes) {
    const designed = await assetPipeline.designPrimarySceneAsset({
      projectId,
      sceneId: scene.id,
      format,
      formatProfileVersion: formatPin.version
    });
    const prepared = await imageRuntime.prepareGeneration({
      projectId,
      assetId: designed.id,
      format,
      provider: "MIG12_MOCK_IMAGE",
      providerProfileVersion: "1.0.0",
      executionMode: "AUTOMATED"
    });
    const runtimeOutcome = await imageOrchestrator.executeAutomated(
      projectId,
      prepared.job.id,
      {expectedOutputs: prepared.expectedOutputs}
    );
    assert.equal(runtimeOutcome.result.status, "COMPLETE");
    assert.equal(runtimeOutcome.media.length, 1);
    const candidate = await imageRuntime.synchronizeRuntimeOutcome({projectId, jobId: prepared.job.id});
    assert.equal(candidate.assetStatus, "CANDIDATE_AVAILABLE");
    assert.equal(candidate.approvedMediaId, undefined);
    const mediaId = candidate.candidateMediaIds.at(-1);
    assert.ok(mediaId);
    const qc = await assetPipeline.runImageQc({projectId, assetId: candidate.id, mediaId, format});
    assert.equal(qc.qc.qcStatus, "PASS");
    assert.equal(qc.asset.assetStatus, "NEEDS_REVIEW");
    imageStates.push({assetId: candidate.id, mediaId});
  }
  assert.equal(imageProviderCalls, 2);
  runtimeRepo.close();

  await assetPipeline.approveAsset({
    projectId,
    assetId: imageStates[0].assetId,
    mediaId: imageStates[0].mediaId
  });
  assetRepo.close();

  const linkRepo = new SqlitePreLinkHandoffRepository(dbPath);
  const linkPipeline = new PreLinkHandoffPipeline(
    linkRepo,
    linkRepo,
    new LinkDecisions(),
    clock,
    makeIds(9000)
  );
  const links = await linkPipeline.buildLinkGraph({projectId, format});
  assert.equal(links.length, 1);
  await linkPipeline.designPreLink({projectId, linkId: links[0].id, format});
  if (negativeCases) {
    await assert.rejects(() => linkPipeline.bindApprovedAssets({projectId, linkId: links[0].id}));
  }
  linkRepo.close();

  const assetRepo2 = new SqliteSceneAssetRepository(dbPath);
  const assetPipeline2 = new SceneAssetPipeline(
    assetRepo2,
    assetRepo2,
    bible,
    formats,
    assetDecisions,
    {shouldAutoApprove: () => false},
    clock,
    makeIds(11000)
  );
  await assetPipeline2.approveAsset({
    projectId,
    assetId: imageStates[1].assetId,
    mediaId: imageStates[1].mediaId
  });
  assetRepo2.close();

  const linkRepo2 = new SqlitePreLinkHandoffRepository(dbPath);
  const linkPipeline2 = new PreLinkHandoffPipeline(
    linkRepo2,
    linkRepo2,
    new LinkDecisions(),
    clock,
    makeIds(13000)
  );
  await linkPipeline2.bindApprovedAssets({projectId, linkId: links[0].id});
  const handoff = await linkPipeline2.runHandoffQc({projectId, linkId: links[0].id, format});
  assert.equal(handoff.link.linkStatus, "HANDOFF_PASS");
  linkRepo2.close();

  const finalRepo = new SqliteFinalClipRepository(dbPath);
  const finalPipeline = new FinalClipPipeline(
    finalRepo,
    finalRepo,
    new FinalClipDecisions(),
    clock,
    makeIds(15000)
  );
  const design = await finalPipeline.designFinalImplementation({projectId, linkId: links[0].id, format});
  assert.equal(design.kind, "CLIP");
  if (design.kind !== "CLIP") throw new Error("MIG-12 fixture expected CLIP implementation");
  await finalPipeline.runProviderPreQc({
    projectId,
    clipId: design.clip.id,
    format,
    provider: "GOOGLE_FLOW",
    providerProfileVersion: "1.0.0"
  });
  let videoJob = await finalPipeline.createVideoGenerationJob({
    projectId,
    clipId: design.clip.id,
    format,
    provider: "GOOGLE_FLOW",
    providerProfileVersion: "1.0.0",
    executionMode: "MANUAL_EXTERNAL"
  });
  assert.equal(videoJob.job.status, "WAITING_EXTERNAL");

  if (negativeCases) {
    const failed = await finalPipeline.markVideoJobFailed({
      projectId,
      jobId: videoJob.job.id,
      errorCode: "MIG12_STALE_MANUAL_RESULT"
    });
    const retry = await finalPipeline.retryVideoGenerationJob({
      projectId,
      failedJobId: failed.job.id,
      format
    });
    await assert.rejects(
      () => finalPipeline.registerVideoResult({
        projectId,
        jobId: failed.job.id,
        relativePath: "06_clips/generated/stale.mp4",
        mimeType: "video/mp4",
        checksum: "0".repeat(64),
        durationMs: 600,
        width: 64,
        height: 64
      }),
      error => error instanceof FinalClipValidationError
    );
    videoJob = retry;
  }

  const videoBytes = await readFile(join(fixtureRoot, "manual-clip-600ms.mp4"));
  const videoRelativePath = `06_clips/generated/${format.toLowerCase()}-manual-clip.mp4`;
  await mkdir(join(projectRoot, "06_clips", "generated"), {recursive: true});
  await writeFile(join(projectRoot, videoRelativePath), videoBytes);
  const videoResult = await finalPipeline.registerVideoResult({
    projectId,
    jobId: videoJob.job.id,
    relativePath: videoRelativePath,
    mimeType: "video/mp4",
    checksum: sha256(videoBytes),
    durationMs: 600,
    width: 64,
    height: 64
  });
  assert.equal(videoResult.clip.clipStatus, "CANDIDATE_AVAILABLE");
  assert.equal(videoResult.clip.approvedMediaId, undefined);
  finalRepo.close();

  const qcRepo = new SqliteQcFallbackRepository(dbPath);
  const qcPipeline = new QcFallbackPipeline(
    qcRepo,
    qcRepo,
    new QcDecisions(),
    clock,
    makeIds(17000)
  );
  const clipQc = await qcPipeline.runClipQc({
    projectId,
    clipId: design.clip.id,
    candidateMediaId: videoResult.media.id,
    format
  });
  assert.equal(clipQc.qc.status, "PASS");
  assert.equal(clipQc.clip.clipStatus, "APPROVED");
  qcRepo.close();

  const bindingRepo = new SqliteMediaBindingRepository(dbPath);
  const bindingPipeline = new MediaBindingPipeline(
    bindingRepo,
    bindingRepo,
    clock,
    makeIds(19000)
  );
  const bound = await bindingPipeline.bindClip({projectId, clipId: design.clip.id});
  assert.equal(bound.binding.bindingKind, "VIDEO");
  const editorHandoff = await bindingPipeline.buildEditorHandoff(projectId);
  assert.equal(editorHandoff.status, "READY");
  bindingRepo.close();

  const ttsRepo = new SqliteTtsRuntimeRepository(dbPath);
  const ttsPipeline = new TtsGenerationPipeline(ttsRepo, clock, makeIds(21000));
  const ttsPreparedPlan = await ttsPipeline.prepare({projectId, format});
  assert.equal(ttsPreparedPlan.plan.status, "READY");
  const ttsPreparation = new TtsRuntimePreparationService(
    ttsRepo,
    registry,
    clock,
    makeIds(23000)
  );
  const ttsProviderJob = await ttsPreparation.prepare({projectId, providerPin: ttsPin});
  assert.equal(ttsProviderJob.job.status, "READY");

  const ttsRuntimeRepo = new SqliteRuntimeExecutionRepository(dbPath);
  const ttsRegistry = new RuntimeExecutorRegistry();
  let ttsProviderCalls = 0;
  const ttsExecutor = new MockTtsRuntimeExecutor({
    projectRoot,
    fixtureAudioPath: join(fixtureRoot, "silence-600ms.mp3")
  });
  ttsRegistry.register({
    provider: "ELEVENLABS",
    jobType: "TTS_GENERATION",
    executor: {
      async execute(job) {
        ttsProviderCalls += 1;
        return ttsExecutor.execute(job);
      }
    }
  });
  const ttsOrchestrator = new RuntimeOrchestrator(
    ttsRuntimeRepo,
    ttsRepo,
    ttsRegistry,
    clock,
    makeIds(25000),
    {workspaceRoot}
  );
  const ttsRuntimeOutcome = await ttsOrchestrator.executeAutomated(
    projectId,
    ttsProviderJob.job.id,
    elevenLabsRuntimeExecutionOptions()
  );
  assert.equal(ttsRuntimeOutcome.result.status, "COMPLETE");
  assert.equal(ttsProviderCalls, 1);
  const alignmentDocument = await readFile(
    join(projectRoot, ttsPreparedPlan.plan.outputPaths.characterAlignment),
    "utf8"
  );
  const ttsCompletion = new TtsRuntimeCompletionService(
    ttsRepo,
    clock,
    makeIds(27000)
  );
  const completedTts = await ttsCompletion.complete({
    projectId,
    runtimeJob: ttsRuntimeOutcome.runtimeJob,
    runtimeResult: ttsRuntimeOutcome.result,
    media: ttsRuntimeOutcome.media,
    alignmentDocument
  });
  assert.equal(completedTts.result.audioMediaId, completedTts.audioMedia.id);
  ttsRuntimeRepo.close();

  const subtitles = await buildTtsAlignedSubtitleCuesFromArtifacts({
    projectRoot,
    script,
    result: completedTts.result,
    audioPlacementId: "narration"
  });
  assert.ok(subtitles.length >= 1);
  assert.ok(subtitles.every(cue => cue.endMs <= completedTts.result.audioDurationMs));
  ttsRepo.close();

  const audioRepo = new SqliteAudioImportRepository(dbPath);
  const audioImporter = new LocalAudioImportService(
    audioRepo,
    clock,
    makeIds(29000),
    {workspaceRoot}
  );
  const sourceAudio = join(fixtureRoot, "silence-600ms.mp3");
  const clipAudio = await audioImporter.importFile({projectId, kind: "CLIP_AUDIO", sourcePath: sourceAudio});
  const bgm = await audioImporter.importFile({projectId, kind: "BGM", sourcePath: sourceAudio});
  const sfx = await audioImporter.importFile({projectId, kind: "SFX", sourcePath: sourceAudio});
  assert.equal(clipAudio.media.mediaType, "AUDIO");
  assert.equal(bgm.media.mediaType, "AUDIO");
  assert.equal(sfx.media.mediaType, "AUDIO");
  audioRepo.close();

  const timelineRepo = new SqliteEditorTimelineRepository(dbPath);
  const timelineIds = makeIds(31000);
  const contentPlanService = new EditorContentPlanService(timelineRepo, clock, timelineIds);
  const profile = profileFromSnapshot(formatSnapshot);
  const contentPlan = await contentPlanService.savePlan({
    projectId,
    planStatus: "APPROVED",
    audio: [
      {id: "narration", type: "TTS", mediaId: completedTts.audioMedia.id, timelineStartMs: 0, volume: 1},
      {id: "clip-audio", type: "CLIP_AUDIO", mediaId: clipAudio.media.id, timelineStartMs: 0, durationMs: 200, volume: 0.12},
      {id: "bgm", type: "BGM", mediaId: bgm.media.id, timelineStartMs: 0, durationMs: 600, volume: 0.1, loop: true},
      {id: "impact", type: "SFX", mediaId: sfx.media.id, timelineStartMs: 300, durationMs: 200, volume: 0.35}
    ],
    subtitles,
    textOverlays: [{
      id: "title",
      startMs: 0,
      endMs: 300,
      text: `MIG-12 ${format}`,
      textRole: "TOP_TITLE",
      x: profile.width / 2,
      y: profile.height * 0.1,
      width: profile.width * 0.8,
      fontSize: Math.round(Math.min(profile.width, profile.height) * 0.05)
    }],
    graphics: [{
      id: "panel",
      startMs: 0,
      endMs: 600,
      graphicType: "BLUR_PANEL",
      x: 0,
      y: profile.height * 0.78,
      width: profile.width,
      height: profile.height * 0.22,
      opacity: 0.2,
      blurPx: 8,
      backgroundColor: "rgba(0,0,0,0.2)",
      borderRadius: 0
    }]
  });
  assert.equal(contentPlan.planStatus, "APPROVED");
  const timelineBindingSource = new MediaBindingPipeline(
    timelineRepo,
    timelineRepo,
    clock,
    makeIds(33000)
  );
  const timelinePipeline = new EditorTimelineAssemblyPipeline(
    timelineRepo,
    timelineBindingSource,
    clock,
    timelineIds,
    timelineRepo
  );
  const timeline = await timelinePipeline.assembleProject({
    projectId,
    projectName: `MIG-12 ${format} Fixture`,
    profile
  });
  assert.equal(timeline.output.status, "READY");
  assert.equal(timeline.assembly.assemblyStatus, "READY");
  assert.equal(timeline.output.editProject.project.durationInFrames, Math.round(profile.fps * 0.6));
  for (const type of ["VIDEO", "TTS", "CLIP_AUDIO", "BGM", "SFX", "SUBTITLE", "TEXT", "GRAPHIC"]) {
    assert.ok(timeline.output.editProject.items.some(item => item.type === type), `missing ${type} timeline item`);
  }

  assert.equal(rowCount(timelineRepo.db, "projects", projectId), 1);
  assert.equal(rowCount(timelineRepo.db, "scripts", projectId) >= 1, true);
  assert.equal(rowCount(timelineRepo.db, "media_artifacts", projectId) >= 7, true);
  assert.equal(rowCount(timelineRepo.db, "editor_timeline_assemblies", projectId), 1);
  timelineRepo.close();

  return {
    format,
    projectId,
    projectRoot,
    dbPath,
    workspaceRoot,
    profile,
    assembly: timeline.assembly,
    contentPlan,
    counters,
    providerCalls: {image: imageProviderCalls, tts: ttsProviderCalls},
    keyMedia: {
      videoRelativePath,
      videoSha256: sha256(videoBytes),
      ttsRelativePath: completedTts.audioMedia.relativePath
    }
  };
}
