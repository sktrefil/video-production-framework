import {createHash, randomUUID} from 'node:crypto';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve, dirname} from 'node:path';
import {SqliteTtsGenerationRepository} from '../../../packages/storage/dist/tts-generation.js';
import {TtsGenerationPipeline, sanitizeTtsText} from '../../../packages/tts-generation/dist/index.js';
import {buildTtsAlignedSubtitleCues, buildSegmentedTtsTimelineFromArtifacts} from '../../../packages/tts-generation/dist/subtitle-bridge.js';

const root = resolve(import.meta.dirname, '..');
const project = resolve(root, 'output/db-cooper-v3/canonical-workspace/projects/db_cooper_1971_4m30_v3');
const review = resolve(root, 'output/db-cooper-v3/review');
const preview = resolve(root, 'output/db-cooper-v3/tts-preview-v1');
const projectId = 'db_cooper_1971_4m30_v3';
const get = async path => JSON.parse(await readFile(path, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFile = async path => hash(await readFile(path));
const isSpoken = char => char.trim().length > 0;
const writeJson = async (path, value) => {
  await mkdir(dirname(path), {recursive: true});
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
};

function mapAlignment(source, targetText, speed) {
  const sourceText = source.characters.join('');
  const stripped = value => Array.from(value).filter(isSpoken).join('');
  if (stripped(sourceText) !== stripped(targetText)) throw new Error('Approved and generated narration differ');
  const characters = Array.from(targetText);
  const starts = [];
  const ends = [];
  let cursor = 0;
  let previousStart = 0;
  for (const char of characters) {
    if (!isSpoken(char)) {
      starts.push(previousStart);
      ends.push(previousStart);
      continue;
    }
    while (cursor < source.characters.length && !isSpoken(source.characters[cursor])) cursor++;
    if (source.characters[cursor] !== char) throw new Error(`Alignment character mismatch at ${cursor}`);
    const start = source.character_start_times_seconds[cursor] / speed;
    const end = source.character_end_times_seconds[cursor] / speed;
    starts.push(start);
    ends.push(end);
    previousStart = start;
    cursor++;
  }
  while (cursor < source.characters.length && !isSpoken(source.characters[cursor])) cursor++;
  if (cursor !== source.characters.length) throw new Error('Unmapped alignment characters');
  return {characters, character_start_times_seconds: starts, character_end_times_seconds: ends};
}

const gatePath = resolve(review, 'final-tts-gate-v1.json');
const validator = resolve(root, '../../skills/history-video-development-director/scripts/validate_final_tts_gate.py');
execFileSync('python', [validator, gatePath], {stdio: 'inherit'});
const [gate, qc, previewPlan, manager] = await Promise.all([
  get(gatePath), get(resolve(review, 'existing-audio-reuse-qc-v1.json')),
  get(resolve(preview, 'preview-plan.json')), get(resolve(review, 'manager-story-gate-v1.json')),
]);
if (gate.gate_id !== 'FTG-db_cooper_1971_4m30_v3-r1' ||
    qc.reuse_count !== 7 || qc.regenerate_scene_ids.length !== 0 ||
    previewPlan.scenes.length !== 7 || manager.canonical_scenes !== 7) {
  throw new Error('FINAL TTS reuse prerequisites failed');
}
const dbPath = resolve(project, 'project.db');
const repo = new SqliteTtsGenerationRepository(dbPath);
const clock = {nowIso: () => new Date().toISOString()};
const ids = {next: prefix => `${prefix}_${randomUUID().replaceAll('-', '')}`};
try {
  if (await repo.getLatestTtsResult(projectId)) throw new Error('FINAL TTS already exists; refusing duplicate promotion');
  const approvedScript = await repo.getLatestApprovedFinalScript(projectId);
  const approvedScenes = await repo.listApprovedTtsScenes(projectId);
  if (!approvedScript || approvedScenes.length !== 7 ||
      hash(Buffer.from(approvedScript.body)) !== manager.canonical_script.sha256) {
    throw new Error('Current canonical FINAL script or Scene set changed');
  }
  const sortedScenes = [...approvedScenes].sort((a, b) => a.chapterOrder - b.chapterOrder || a.sequenceOrder - b.sequenceOrder || a.sceneOrder - b.sceneOrder);
  const staged = [];
  for (const [index, scene] of sortedScenes.entries()) {
    const old = previewPlan.scenes[index];
    const qcRow = qc.scenes[index];
    const sceneId = `SC${String(index + 1).padStart(2, '0')}`;
    if (old.id !== sceneId || qcRow.scene_id !== sceneId || qcRow.decision !== 'REUSE' ||
        scene.sceneId !== manager.scene_mapping[index].canonical_scene_id) {
      throw new Error(`Canonical scene mapping changed at ${sceneId}`);
    }
    const text = sanitizeTtsText(scene.scriptSegment);
    const rawAlignment = await get(resolve(preview, old.alignment));
    const alignment = mapAlignment(rawAlignment, text, previewPlan.playback_speed);
    const playbackPath = resolve(preview, old.playback_1p1);
    if (await hashFile(playbackPath) !== qcRow.playback_audio_sha256) throw new Error(`Playback hash mismatch ${sceneId}`);
    const durationMs = Math.round(qcRow.playback_duration_seconds * 1000);
    buildTtsAlignedSubtitleCues({displayText: text, alignment: {
      characters: alignment.characters,
      characterStartTimesSeconds: alignment.character_start_times_seconds,
      characterEndTimesSeconds: alignment.character_end_times_seconds,
    }, audioPlacementId: `tts-section-${String(index + 1).padStart(3, '0')}`,
    audioDurationMs: durationMs, maximumCharacters: 42});
    staged.push({sceneId, scene, old, qcRow, text, alignment, durationMs,
      playbackPath, rawAlignmentPath: resolve(preview, old.alignment),
      rawAudioPath: resolve(preview, old.audio),
      sourceResult: await get(resolve(preview, old.result))});
  }

  const pipeline = new TtsGenerationPipeline(repo, clock, ids);
  const {plan, created} = await pipeline.prepare({projectId, format: 'LONGFORM'});
  if (!created || plan.sections?.length !== 7 || plan.narrationMode !== 'SEGMENTED') {
    throw new Error('Canonical segmented TTS plan was not freshly prepared');
  }
  const sections = [];
  const media = [];
  const manifestSections = [];
  const requestIds = [];
  const alignmentFiles = [];
  for (const [index, item] of staged.entries()) {
    const section = plan.sections[index];
    if (section.sceneIds.length !== 1 || section.sceneIds[0] !== item.scene.sceneId || section.text !== item.text) {
      throw new Error(`Canonical plan text changed at ${item.sceneId}`);
    }
    const audioPath = resolve(project, section.audioRelativePath);
    const alignPath = resolve(project, section.characterAlignmentRelativePath);
    await mkdir(dirname(audioPath), {recursive: true});
    await copyFile(item.playbackPath, audioPath);
    await writeJson(alignPath, item.alignment);
    const audioSha = await hashFile(audioPath);
    const alignSha = await hashFile(alignPath);
    const rawAudioRel = `03_tts/source_raw/${item.sceneId}_raw.mp3`;
    const rawAlignRel = `03_tts/source_raw/${item.sceneId}_alignment.json`;
    await mkdir(resolve(project, '03_tts/source_raw'), {recursive: true});
    await copyFile(item.rawAudioPath, resolve(project, rawAudioRel));
    await copyFile(item.rawAlignmentPath, resolve(project, rawAlignRel));
    if (audioSha !== item.qcRow.playback_audio_sha256 ||
        await hashFile(resolve(project, rawAudioRel)) !== item.qcRow.source_audio_sha256) {
      throw new Error(`Copied audio hash mismatch ${item.sceneId}`);
    }
    const mediaId = ids.next('media');
    const now = clock.nowIso();
    media.push({id: mediaId, projectId, revision: 1, lifecycleStatus: 'ACTIVE',
      createdAt: now, updatedAt: now, mediaType: 'AUDIO',
      relativePath: section.audioRelativePath, mimeType: 'audio/mpeg',
      durationMs: item.durationMs, checksum: `sha256:${audioSha}`,
      sourceJobId: item.sourceResult.jobId, mediaStatus: 'AVAILABLE'});
    sections.push({id: section.id, index: section.index, sequenceId: section.sequenceId,
      sceneIds: [...section.sceneIds], textSha256: hash(Buffer.from(section.text)),
      audioMediaId: mediaId, audioRelativePath: section.audioRelativePath,
      audioSha256: audioSha, audioDurationMs: item.durationMs,
      characterAlignmentRelativePath: section.characterAlignmentRelativePath,
      characterAlignmentSha256: alignSha,
      requestIds: item.sourceResult.providerRequestIds});
    requestIds.push(...item.sourceResult.providerRequestIds);
    manifestSections.push({sceneId: item.sceneId, canonicalSceneId: item.scene.sceneId,
      sectionId: section.id, textSha256: hash(Buffer.from(section.text)),
      audioRelativePath: section.audioRelativePath, audioSha256: audioSha,
      audioDurationMs: item.durationMs,
      characterAlignmentRelativePath: section.characterAlignmentRelativePath,
      characterAlignmentSha256: alignSha,
      sourceRawAudioRelativePath: rawAudioRel,
      sourceRawAudioSha256: item.qcRow.source_audio_sha256,
      sourceRawAlignmentRelativePath: rawAlignRel,
      sourceProviderJobId: item.sourceResult.jobId,
      sourceProviderRequestIds: item.sourceResult.providerRequestIds});
    alignmentFiles.push(alignPath);
  }
  const manifest = {
    schemaVersion: 2, mode: 'SEGMENTED', planId: plan.id,
    planRevision: plan.revision + 1, sourceScriptId: plan.sourceScriptId,
    sourceScriptRevision: plan.sourceScriptRevision,
    sourceScriptSha256: plan.sourceScriptSha256,
    finalTtsGateId: gate.gate_id,
    reuseQcSha256: await hashFile(resolve(review, 'existing-audio-reuse-qc-v1.json')),
    transform: {type: 'ATEMPO_PLAYBACK_PROMOTION', speed: 1.1,
      alignment: 'source timestamps divided by 1.1; whitespace mapped to zero-duration characters'},
    sections: manifestSections,
    totalAudioDurationMs: sections.reduce((sum, section) => sum + section.audioDurationMs, 0),
    regeneratedScenes: [],
  };
  const manifestPath = resolve(project, plan.outputPaths.narrationManifest);
  await writeJson(manifestPath, manifest);
  await writeJson(resolve(project, plan.outputPaths.metadata), {
    schemaVersion: 2, status: 'COMPLETE_REUSED_EXISTING_AUDIO',
    provider: 'ELEVENLABS', modelId: 'eleven_v3',
    sourcePreviewPlan: 'output/db-cooper-v3/tts-preview-v1/preview-plan.json',
    finalTtsGateId: gate.gate_id, planId: plan.id,
    sceneCount: 7, regeneratedScenes: [],
    originalProviderRequestIds: requestIds,
    speedTransform: 1.1,
  });
  const voice = await get(resolve(preview, '03_tts/voice/SC01.json'));
  await writeJson(resolve(project, plan.outputPaths.resolvedVoiceProfile), voice);
  const now = clock.nowIso();
  const primary = sections[0];
  const result = {id: ids.next('tts-result'), projectId, revision: 1,
    lifecycleStatus: 'ACTIVE', createdAt: now, updatedAt: now,
    planId: plan.id, planRevision: plan.revision + 1,
    sourceScriptId: plan.sourceScriptId, sourceScriptRevision: plan.sourceScriptRevision,
    sourceScriptSha256: plan.sourceScriptSha256,
    provider: 'ELEVENLABS', modelId: 'eleven_v3', voiceId: 'REDACTED',
    outputFormat: 'mp3_44100_128', narrationMode: 'SEGMENTED',
    requestIds, sections, totalAudioDurationMs: manifest.totalAudioDurationMs,
    narrationManifestRelativePath: plan.outputPaths.narrationManifest,
    narrationManifestSha256: await hashFile(manifestPath),
    audioMediaId: primary.audioMediaId, audioRelativePath: primary.audioRelativePath,
    audioSha256: primary.audioSha256, audioDurationMs: primary.audioDurationMs,
    characterAlignmentRelativePath: primary.characterAlignmentRelativePath,
    characterAlignmentSha256: primary.characterAlignmentSha256,
    metadataRelativePath: plan.outputPaths.metadata,
    chunkCount: plan.chunks.length, completedAt: now};
  const completePlan = {...plan, revision: plan.revision + 1, lifecycleStatus: 'ACTIVE',
    updatedAt: now, status: 'COMPLETE'};
  await buildSegmentedTtsTimelineFromArtifacts({projectRoot: project, plan: completePlan, result, maximumCharacters: 42});
  const eventId = ids.next('evt');
  await repo.commitTtsResult({previousPlan: plan, nextPlan: completePlan,
    previousResult: null, result, audioMedia: media[0], audioMediaItems: media,
    event: {eventId, projectId, eventType: 'TTS_EXISTING_AUDIO_PROMOTED',
      targetType: 'PROJECT', targetId: projectId, trigger: 'USER',
      payload: {planId: plan.id, planRevision: completePlan.revision,
        resultId: result.id, sectionCount: 7, regeneratedScenes: [],
        source: 'PREVIEW_AUDIO_REUSED_AFTER_QC', finalTtsGateId: gate.gate_id},
      createdAt: now},
    outbox: {outboxId: ids.next('outbox'), eventId, status: 'PENDING',
      attempts: 0, createdAt: now}});
  const verified = await repo.getLatestTtsResult(projectId);
  if (verified?.id !== result.id || verified.sections?.length !== 7) throw new Error('Canonical TTS commit verification failed');
  await writeJson(resolve(review, 'final-tts-reuse-registration-v1.json'), {
    projectId, status: 'PASS', gateId: gate.gate_id, planId: plan.id,
    planRevision: completePlan.revision, resultId: result.id,
    sourcePreviewSectionCount: 7, reusedSectionCount: 7,
    regeneratedSceneIds: [], totalAudioDurationMs: manifest.totalAudioDurationMs,
    canonicalProjectDb: dbPath, canonicalNarrationManifest: manifestPath,
    sectionAudioPaths: sections.map(section => resolve(project, section.audioRelativePath)),
  });
  console.log(`FINAL TTS REGISTERED: ${sections.length} reused sections; regenerated=0; ${manifest.totalAudioDurationMs} ms`);
  console.log(`CANONICAL PROJECT DB: ${dbPath}`);
} finally {
  repo.close();
}
