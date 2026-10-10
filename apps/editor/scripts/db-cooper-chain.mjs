import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {copyFile, mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';

const editorRoot = resolve(import.meta.dirname, '..');
const defaultInputDir = String.raw`D:\컴폴더\다운로드`;
const defaultOutputDir = join(editorRoot, 'output', 'db-cooper-v3');
const inputNames = {
  manifest: 'DB_Cooper_v3_Codex_Shot_Manifest.json',
  script: 'DB_Cooper_4min30_script_v3.txt',
  tts: 'DB_Cooper_4min30_script_v3_TTS.txt',
  bible: 'D.B.COOPER 마스터 보드 v3.1_VISUAL_BIBLE_LOCK.md',
};
const boardNames = {
  BOARD01_STYLE: 'D.B.COOPER 마스터 보드 v3.1.png',
  BOARD02_MOTION: 'D.B.COOPER 마스터 보드 v3.2.png',
  BOARD03_SCENE: 'D.B.COOPER 마스터 보드 v3.3.png',
};
const sha256 = data => createHash('sha256').update(data).digest('hex');
const compact = value => value.replace(/\s+/gu, '');

function options(argv) {
  const mode = argv[0] ?? 'status';
  if (!['prepare', 'sync', 'status'].includes(mode)) throw new Error(`Unknown mode: ${mode}`);
  const result = {mode, inputDir: defaultInputDir, outputDir: defaultOutputDir};
  for (let i = 1; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!value) throw new Error(`Missing value for ${key}`);
    if (key === '--input-dir') result.inputDir = resolve(value);
    else if (key === '--output-dir') result.outputDir = resolve(value);
    else throw new Error(`Unknown option: ${key}`);
  }
  return result;
}

async function exists(path) {
  try { await stat(path); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function writeSameOrNew(path, bytes) {
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8');
  await mkdir(dirname(path), {recursive: true});
  if (await exists(path)) {
    const current = await readFile(path);
    if (sha256(current) !== sha256(data)) throw new Error(`Existing file differs; preserve and revise explicitly: ${path}`);
    return;
  }
  await writeFile(path, data, {flag: 'wx'});
}

function checkManifest(manifest, ttsText) {
  if (manifest.schema !== 'vpf.codex.storyboard.v1') throw new Error('Unexpected manifest schema');
  if (manifest.style?.includes('NON_REALISTIC_STYLIZED') !== true) throw new Error('Style lock missing');
  if (manifest.tts_timing_verified !== false) throw new Error('Expected unmeasured preview TTS state');
  const shots = manifest.shots;
  if (!Array.isArray(shots) || shots.length !== manifest.source_clip_count) throw new Error('Shot count mismatch');
  let cursor = 0;
  const ids = new Set();
  for (const [index, shot] of shots.entries()) {
    if (shot.id !== `CL${String(index + 1).padStart(2, '0')}` || ids.has(shot.id)) throw new Error(`Shot order or ID mismatch at ${index}`);
    ids.add(shot.id);
    if (shot.timeline_start !== cursor || shot.timeline_end !== cursor + shot.keep_seconds) throw new Error(`Timeline gap/overlap at ${shot.id}`);
    if (shot.source_seconds !== manifest.i2v_source_duration_seconds || shot.keep_seconds > shot.source_seconds) throw new Error(`Source duration mismatch at ${shot.id}`);
    if (!['SINGLE', 'START_TARGET', 'CONTINUATION', 'EXIT_REFERENCE'].includes(shot.image_mode)) throw new Error(`Unknown image mode at ${shot.id}`);
    cursor = shot.timeline_end;
  }
  if (cursor !== manifest.target_duration_seconds) throw new Error('Final duration mismatch');
  if (compact(shots.map(shot => shot.tts).join('')) !== compact(ttsText)) throw new Error('Manifest shot TTS differs from TTS text');
  return shots;
}

function startBinding(shot, previous) {
  if (/prior EXIT/i.test(shot.start_source ?? '')) {
    if (!previous) throw new Error(`${shot.id} requests prior EXIT without prior shot`);
    return {kind: 'PREVIOUS_USED_EXIT', source_clip: previous.id};
  }
  if (shot.image_mode === 'EXIT_REFERENCE') {
    const match = /CL\d{2}/i.exec(shot.start ?? '');
    if (!match) throw new Error(`${shot.id} EXIT_REFERENCE has no source clip ID`);
    return {kind: 'EARLIER_USED_EXIT', source_clip: match[0].toUpperCase()};
  }
  return {kind: 'GENERATE_START', source_clip: null};
}

function promptHeader(shot, boards) {
  return [
    `D.B. COOPER v3 | ${shot.id} | SCENE ${shot.scene} | DRAFT PRODUCTION PROMPT`,
    'STYLE: NON_REALISTIC_STYLIZED hand-drawn 2D ink noir; graphic/fantasy motion, never photorealistic, live-action, documentary reenactment, hyperreal or glossy 3D.',
    'FORMAT: horizontal 16:9. Still image generation: LONGFORM_16X9_V1, 1536x864. Canonical editor delivery: 1920x1080.',
    'MASTER REFERENCES (style/motion/scene guidance, not literal panel copies):',
    ...Object.entries(boards).map(([id, board]) => `- ${id}: ${board.path} | sha256:${board.sha256}`),
    'Do not copy board titles, typography, composited panels, or invented facial details into the image.',
    `CONTINUITY LOCKS: ${(shot.reference_locks ?? []).join(', ')}`,
    `FACT GUARD: ${shot.fact_guard}`,
    '',
  ].join('\n');
}

function startPrompt(shot, boards) {
  return promptHeader(shot, boards) + [
    `Create one START still for ${shot.id}: ${shot.title}.`,
    `STORY EVENT: ${shot.story}`,
    `START COMPOSITION: ${shot.start}`,
    `TARGET PATH (for geometry only): ${shot.target}`,
    `CAMERA'S NEXT MOVE: ${shot.camera}`,
    `SUBJECT IDENTITY/ACTION: ${shot.subject_motion}`,
    `MOTION SPACE TO RESERVE: ${shot.key_event}`,
    'Keep unknown faces, behavior and exact historical interiors stylized, silhouetted or abstract. No invented readable documents, serial numbers, baked-in text, captions or UI.',
    'This is a candidate START still, subject to visual QC and manager approval. Do not infer that a board panel is a project-specific approved frame.',
    '',
  ].join('\n');
}

function endPrompt(shot, boards) {
  return promptHeader(shot, boards) + [
    `Create one planned END/TARGET still for ${shot.id}: ${shot.title}.`,
    `Attach the reviewed ${shot.id} START image when it exists. Preserve its subject identity, camera axis, object geometry, lighting family and continuity locks.`,
    `STORY EVENT: ${shot.story}`,
    `START STATE: ${shot.start}`,
    `CAMERA PATH: ${shot.camera}`,
    `DESIRED TARGET COMPOSITION: ${shot.target}`,
    `PLANNED EDITORIAL EXIT AT ${shot.keep_seconds} SECONDS: ${shot.exit}`,
    `SUBJECT ACTION: ${shot.subject_motion}`,
    `ENVIRONMENT MOTION: ${shot.environment_motion}`,
    'This still is a creative target, not the actual final used video frame. After a clip is generated, extract its actual last USED frame for any dependent START.',
    'Do not add an eyewitness jump, landing, confirmed survival/death, photorealistic reconstruction, fake historical words, subtitles or logos.',
    '',
  ].join('\n');
}

function videoPrompt(shot, boards, binding) {
  const startPath = `assets/${shot.id}_START.png`;
  const targetPath = shot.image_mode === 'START_TARGET' ? `assets/${shot.id}_END_TARGET.png` : null;
  return promptHeader(shot, boards) + [
    'NO GENERATED VOICES — KEEP SOUND EFFECTS. In Google Flow, do not generate narration, dialogue, speech, singing, humming or human crowd voices. Generate synchronized nonverbal sound effects and ambience for the visible action. Approved Korean TTS is added separately during editing. Keep effects restrained for later narration.',
    '',
    `SOURCE: ${startPath} (${binding.kind}${binding.source_clip ? ` from ${binding.source_clip}` : ''})`,
    `END/TARGET: ${targetPath ?? 'none; use the reviewed START and motion path'}`,
    `Generate one ${shot.source_seconds}-second 16:9 clip. Intended editor window: timeline ${shot.timeline_start}-${shot.timeline_end} seconds; use only the first ${shot.keep_seconds} seconds unless a revised cut is reviewed.`,
    `The important reveal must happen within the USED ${shot.keep_seconds}-second window. A target reached only in the discarded source tail does not satisfy the shot.`,
    'If the generator accepts only a first and final frame at the full source duration, treat the END/TARGET still as a guide and inspect the actual frame at the edit boundary. Do not claim it is the used exit.',
    '',
    shot.i2v_prompt_en,
    '',
    `HANDOFF: ${shot.transition}; extract the exact last used frame from the accepted video before deriving a dependent next START. Keep generated nonverbal effects; add approved TTS in editing.`,
    'STATUS: candidate prompt only. Final media requires script/directing lock, manager Story Gate, verified timing and independent visual/sequence QC.',
    '',
  ].join('\n');
}

async function prepare(config) {
  const input = {};
  for (const [key, name] of Object.entries(inputNames)) input[key] = await readFile(join(config.inputDir, name));
  const manifest = JSON.parse(input.manifest.toString('utf8'));
  const shots = checkManifest(manifest, input.tts.toString('utf8'));
  const boards = {};
  for (const [id, name] of Object.entries(boardNames)) {
    const bytes = await readFile(join(config.inputDir, name));
    boards[id] = {path: `boards/${id}.png`, sha256: sha256(bytes), original_name: name};
    await writeSameOrNew(join(config.outputDir, 'boards', `${id}.png`), bytes);
  }
  for (const [key, name] of Object.entries(inputNames)) await writeSameOrNew(join(config.outputDir, 'inputs', name), input[key]);
  const plan = {
    project_id: manifest.project_id,
    status: 'PROMPTS_PREPARED_NOT_PRODUCTION_APPROVED',
    canonical_approval: false,
    script_directing_lock: null,
    manager_story_gate: null,
    final_tts_allowed: false,
    tts_timing_verified: false,
    source_manifest_sha256: sha256(input.manifest),
    input_hashes: Object.fromEntries(Object.entries(input).map(([key, bytes]) => [key, sha256(bytes)])),
    boards,
    target_duration_seconds: manifest.target_duration_seconds,
    editor_fps: 30,
    source_clip_count: shots.length,
    shots: [],
  };
  const commands = [
    '# D.B. Cooper v3 — VS Code production runbook',
    '',
    'Run these in `apps/editor`. This is a draft prompt package; image/video generation and production gates still require review.',
    '',
    'PRODUCTION HOLD: `review/full-tts-timing-review-v3.md` measured 162.544s of 1.1x preview narration against the 270s plan. CL01 END and CL29 START-reference revisions are also unresolved. Do not produce from this v1 runbook until script/scene timing, the shot plan, and gates are revised.',
    '',
    '```powershell',
    'node scripts/db-cooper-chain.mjs prepare',
    'node scripts/db-cooper-chain.mjs status',
    '```',
    '',
    'For each shot, generate the START still when a START prompt exists, then the END/TARGET still when its prompt exists, then submit the VIDEO prompt with its listed assets. Save each returned video as `clips/CLxx.mp4` under this package. After a clip is accepted, one reusable command scans all available clips, extracts actual used exits, and binds dependent starts:',
    '',
    '```powershell',
    'powershell -NoProfile -File scripts/db-cooper-sync.ps1',
    'node scripts/db-cooper-chain.mjs status',
    '```',
    '',
    'Extraction is evidence only: `EXTRACTED_UNREVIEWED` never approves a clip or its successor. For a STORY_CUT, use its independent START prompt. For `EXIT_REFERENCE`, reuse the named earlier actual exit after QC.',
    '',
    '| Clip | Timeline | START | END/TARGET | VIDEO prompt |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const [index, shot] of shots.entries()) {
    const binding = startBinding(shot, shots[index - 1]);
    const stem = shot.id;
    const startFile = binding.kind === 'GENERATE_START' ? `prompts/${stem}_START.prompt.txt` : null;
    const endFile = shot.image_mode === 'START_TARGET' ? `prompts/${stem}_END.prompt.txt` : null;
    const videoFile = `prompts/${stem}_VIDEO.prompt.txt`;
    if (startFile) await writeSameOrNew(join(config.outputDir, startFile), startPrompt(shot, boards));
    if (endFile) await writeSameOrNew(join(config.outputDir, endFile), endPrompt(shot, boards));
    await writeSameOrNew(join(config.outputDir, videoFile), videoPrompt(shot, boards, binding));
    const job = {
      id: shot.id, scene: shot.scene, ordinal: index + 1,
      timeline_start: shot.timeline_start, timeline_end: shot.timeline_end,
      source_seconds: shot.source_seconds, keep_seconds: shot.keep_seconds,
      image_mode: shot.image_mode, transition: shot.transition,
      start_binding: binding,
      start_asset: `assets/${stem}_START.png`,
      end_target_asset: endFile ? `assets/${stem}_END_TARGET.png` : null,
      video_asset: `clips/${stem}.mp4`,
      prompts: {start: startFile, end: endFile, video: videoFile},
      reference_locks: shot.reference_locks,
      fact_class: shot.fact_class,
      state: 'SPEC_ONLY_NOT_GENERATED',
    };
    plan.shots.push(job);
    await writeSameOrNew(join(config.outputDir, 'jobs', `${stem}.json`), JSON.stringify(job, null, 2) + '\n');
    commands.push(`| ${stem} | ${shot.timeline_start}–${shot.timeline_end}s (${shot.keep_seconds}s used / ${shot.source_seconds}s source) | ${startFile ?? `${binding.kind}: ${binding.source_clip}`} | ${endFile ?? 'none'} | ${videoFile} |`);
  }
  await writeSameOrNew(join(config.outputDir, 'chain-plan.json'), JSON.stringify(plan, null, 2) + '\n');
  await writeSameOrNew(join(config.outputDir, 'COMMANDS.md'), commands.join('\n') + '\n');
  for (const folder of ['assets', 'clips', 'exits', 'evidence']) await mkdir(join(config.outputDir, folder), {recursive: true});
  console.log(`PREPARED ${shots.length} jobs in ${config.outputDir}`);
  console.log(`START prompts: ${plan.shots.filter(job => job.prompts.start).length}; END/TARGET prompts: ${plan.shots.filter(job => job.prompts.end).length}; VIDEO prompts: ${shots.length}`);
  console.log(`Runbook: ${join(config.outputDir, 'COMMANDS.md')}`);
}

function run(program, args) {
  const result = spawnSync(program, args, {encoding: 'utf8', maxBuffer: 20 * 1024 * 1024});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

function selectLastUsedFrame(videoPath, keepSeconds, editFps = 30) {
  const data = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_frames', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', videoPath]));
  const frames = data.frames ?? [];
  const lastEditorTime = keepSeconds - 1 / editFps;
  let selected = -1;
  let sourceTime = null;
  frames.forEach((frame, index) => {
    const time = Number(frame.best_effort_timestamp_time);
    if (Number.isFinite(time) && time <= lastEditorTime + 1e-6) { selected = index; sourceTime = time; }
  });
  if (selected < 0 || frames.length === 0) throw new Error(`No source frame at used exit: ${videoPath}`);
  return {index: selected, sourceTime, lastEditorTime, sourceFrameCount: frames.length};
}

async function loadPlan(outputDir) {
  return JSON.parse(await readFile(join(outputDir, 'chain-plan.json'), 'utf8'));
}

async function verifyInputSnapshot(outputDir, plan) {
  for (const [key, name] of Object.entries(inputNames)) {
    const hash = sha256(await readFile(join(outputDir, 'inputs', name)));
    if (hash !== plan.input_hashes[key]) throw new Error(`Input changed since prepare: ${name}`);
  }
  for (const [id, board] of Object.entries(plan.boards)) {
    if (sha256(await readFile(join(outputDir, board.path))) !== board.sha256) throw new Error(`Board changed since prepare: ${id}`);
  }
}

async function sync(config) {
  const plan = await loadPlan(config.outputDir);
  await verifyInputSnapshot(config.outputDir, plan);
  let extracted = 0;
  let bound = 0;
  for (const shot of plan.shots) {
    const videoPath = join(config.outputDir, shot.video_asset);
    if (!await exists(videoPath)) continue;
    const sourceHash = sha256(await readFile(videoPath));
    const exitPath = join(config.outputDir, 'exits', `${shot.id}_USED_EXIT.png`);
    const evidencePath = join(config.outputDir, 'evidence', `${shot.id}_USED_EXIT.json`);
    if (await exists(exitPath) || await exists(evidencePath)) {
      if (!await exists(exitPath) || !await exists(evidencePath)) throw new Error(`Incomplete exit pair for ${shot.id}`);
      const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
      if (evidence.source_sha256 !== sourceHash || evidence.exit_sha256 !== sha256(await readFile(exitPath))) throw new Error(`Stale or modified exit evidence for ${shot.id}`);
      continue;
    }
    const frame = selectLastUsedFrame(videoPath, shot.keep_seconds, plan.editor_fps);
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-n', '-i', videoPath, '-vf', `select=eq(n\\,${frame.index})`, '-fps_mode', 'vfr', '-frames:v', '1', exitPath]);
    const exitHash = sha256(await readFile(exitPath));
    const evidence = {
      project_id: plan.project_id, clip_id: shot.id, source_path: shot.video_asset,
      source_sha256: sourceHash, keep_seconds: shot.keep_seconds, edit_fps: plan.editor_fps,
      last_editor_frame_time_sec: frame.lastEditorTime,
      selected_source_frame_index: frame.index, selected_source_frame_time_sec: frame.sourceTime,
      source_frame_count: frame.sourceFrameCount,
      exit_path: `exits/${shot.id}_USED_EXIT.png`, exit_sha256: exitHash,
      status: 'EXTRACTED_UNREVIEWED', canonical_approval: false,
    };
    await writeSameOrNew(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
    extracted++;
  }
  for (const shot of plan.shots) {
    const binding = shot.start_binding;
    if (binding.kind === 'GENERATE_START') continue;
    const sourceExit = join(config.outputDir, 'exits', `${binding.source_clip}_USED_EXIT.png`);
    const sourceEvidencePath = join(config.outputDir, 'evidence', `${binding.source_clip}_USED_EXIT.json`);
    if (!await exists(sourceExit) || !await exists(sourceEvidencePath)) continue;
    const startPath = join(config.outputDir, shot.start_asset);
    const bindingEvidencePath = join(config.outputDir, 'evidence', `${shot.id}_START_BINDING.json`);
    const sourceHash = sha256(await readFile(sourceExit));
    if (await exists(startPath) || await exists(bindingEvidencePath)) {
      if (!await exists(startPath) || !await exists(bindingEvidencePath)) throw new Error(`Incomplete START binding for ${shot.id}`);
      const evidence = JSON.parse(await readFile(bindingEvidencePath, 'utf8'));
      if (evidence.source_exit_sha256 !== sourceHash || evidence.start_sha256 !== sha256(await readFile(startPath))) throw new Error(`Stale or modified START binding for ${shot.id}`);
      continue;
    }
    await copyFile(sourceExit, startPath);
    const evidence = {
      project_id: plan.project_id, clip_id: shot.id, binding_kind: binding.kind,
      source_clip: binding.source_clip, source_exit_path: `exits/${binding.source_clip}_USED_EXIT.png`,
      source_exit_sha256: sourceHash, start_path: shot.start_asset,
      start_sha256: sha256(await readFile(startPath)),
      status: 'EXTRACTED_UNREVIEWED', canonical_approval: false,
    };
    await writeSameOrNew(bindingEvidencePath, JSON.stringify(evidence, null, 2) + '\n');
    bound++;
  }
  console.log(`SYNC complete: ${extracted} new used exits, ${bound} new dependent START images.`);
  console.log('Review each exit and START visually before submitting the next image/video job.');
}

async function status(config) {
  const plan = await loadPlan(config.outputDir);
  await verifyInputSnapshot(config.outputDir, plan);
  const ready = [];
  const waiting = [];
  for (const shot of plan.shots) {
    const start = await exists(join(config.outputDir, shot.start_asset));
    const end = shot.end_target_asset ? await exists(join(config.outputDir, shot.end_target_asset)) : true;
    const video = await exists(join(config.outputDir, shot.video_asset));
    const exit = await exists(join(config.outputDir, 'exits', `${shot.id}_USED_EXIT.png`));
    if (start && end && !video) ready.push(shot.id);
    if (!start || !end || !video || !exit) waiting.push(`${shot.id}: ${!start ? 'START ' : ''}${!end ? 'END ' : ''}${!video ? 'VIDEO ' : ''}${!exit ? 'EXIT ' : ''}`.trim());
  }
  console.log(`PLAN: ${plan.shots.length} shots / ${plan.target_duration_seconds}s; canonical approval: ${plan.canonical_approval}`);
  console.log(`Asset-ready candidate jobs: ${ready.join(', ') || 'none'}`);
  console.log(`Incomplete: ${waiting.length}`);
  for (const line of waiting) console.log(`- ${line}`);
}

const config = options(process.argv.slice(2));
try {
  if (config.mode === 'prepare') await prepare(config);
  else if (config.mode === 'sync') await sync(config);
  else await status(config);
} catch (error) {
  console.error(`DB COOPER CHAIN ERROR: ${error.message}`);
  process.exitCode = 1;
}
