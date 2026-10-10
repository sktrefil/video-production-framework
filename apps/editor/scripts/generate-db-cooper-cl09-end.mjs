import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createImageProviderAdapter } from '../../../runtimes/image/adapters/chatgpt-browser-adapter.mjs';

const mode = process.argv[2];
if (process.argv.length !== 3 || !['--check', '--generate-end'].includes(mode)) {
  throw new Error('Usage: node scripts/generate-db-cooper-cl09-end.mjs --check|--generate-end');
}
const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const at = relative => resolve(root, relative);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const candidate = JSON.parse(await readFile(at('CL09-v3-chain-candidate.json'), 'utf8'));
const planBytes = await readFile(at('chain-plan.json'));
const plan = JSON.parse(planBytes);
const shot = plan.shots.find(value => value.id === 'CL09');
const previous = plan.shots.find(value => value.id === 'CL08');
const binding = candidate.start_binding;
if (sha(planBytes) !== candidate.base_plan_sha256 || plan.manager_story_gate !== 'PASS' ||
    candidate.project_id !== plan.project_id || candidate.canonical_approval !== false ||
    candidate.status !== 'DIRECTING_CANDIDATE_NOT_CANONICAL' ||
    shot?.scene !== 'SC03' || shot?.timeline_start !== 72 || shot?.timeline_end !== 82 ||
    shot?.keep_seconds !== 10 || previous?.keep_seconds !== 10 ||
    shot?.start_binding?.kind !== 'PREVIOUS_USED_EXIT' || shot.start_binding.source_clip !== 'CL08' ||
    candidate.narration !== shot.narrator_text ||
    candidate.voice_slot_relative_seconds[0] !== shot.voice_slot_relative.start ||
    candidate.voice_slot_relative_seconds[1] !== shot.voice_slot_relative.end ||
    binding.kind !== 'PREVIOUS_USED_EXIT' || binding.used_exit_frame_index !== 239 ||
    binding.used_exit_time_seconds !== 9.958333 || plan.editor_fps !== 30) {
  throw new Error('CL09 candidate differs from the locked shot plan or FINAL TTS timing.');
}
const gate = JSON.parse(await readFile(at('production-readiness-pass-v1.json'), 'utf8'));
if (gate.project_id !== plan.project_id || gate.plan_sha256 !== sha(planBytes) || gate.status !== 'PASS') {
  throw new Error('Production-readiness record does not match the locked plan.');
}
const exitEvidence = JSON.parse(await readFile(at('evidence/CL08_USED_EXIT.json'), 'utf8'));
const startEvidence = JSON.parse(await readFile(at('evidence/CL09_START_BINDING.json'), 'utf8'));
const clipHash = sha(await readFile(at(binding.source_clip_path)));
const exitHash = sha(await readFile(at(binding.exit_path)));
const startHash = sha(await readFile(at(binding.start_path)));
if (clipHash !== binding.source_clip_sha256 || clipHash !== exitEvidence.source_sha256 ||
    exitHash !== binding.exit_sha256 || exitHash !== startHash || startHash !== binding.start_sha256 ||
    exitHash !== exitEvidence.exit_sha256 || startHash !== startEvidence.start_sha256 ||
    startEvidence.source_exit_sha256 !== exitHash || exitEvidence.selected_source_frame_index !== 239) {
  throw new Error('CL08 clip/used exit or CL09 START changed; extract and review a new revision.');
}
for (const kind of ['end', 'video']) {
  if (sha(await readFile(at(candidate.prompts[kind]))) !== candidate.prompt_sha256[kind]) {
    throw new Error(`CL09 ${kind} prompt changed; create a new revision.`);
  }
}
if (sha(await readFile(at(candidate.video_prompt_korean_translation.path))) !== candidate.video_prompt_korean_translation.sha256) {
  throw new Error('CL09 Korean translation changed; create a new revision.');
}
const video = await readFile(at(candidate.prompts.video), 'utf8');
if (!video.includes('NO GENERATED VOICES — KEEP SOUND EFFECTS.') || !video.includes('Generate synchronized NONVERBAL sound effects')) {
  throw new Error('Voice prohibition and required nonverbal sound effects are missing.');
}
const boards = [];
for (const id of ['BOARD01_STYLE', 'BOARD02_MOTION', 'BOARD03_SCENE']) {
  const board = plan.boards[id];
  if (sha(await readFile(at(board.path))) !== board.sha256) throw new Error(`Board changed: ${id}`);
  boards.push({ absolutePath: at(board.path), role: id, sha256: board.sha256 });
}
const output = candidate.end_target_path;
const evidencePath = 'assets/CL09_END_v3.evidence.json';
const imageExists = await exists(at(output));
const evidenceExists = await exists(at(evidencePath));
if (imageExists !== evidenceExists) throw new Error('Partial CL09 END output exists; inspect before retrying.');
if (imageExists) {
  const evidence = JSON.parse(await readFile(at(evidencePath), 'utf8'));
  if (evidence.prompt_sha256 !== candidate.prompt_sha256.end || evidence.start_sha256 !== startHash ||
      evidence.output_path !== output || evidence.output_sha256 !== sha(await readFile(at(output)))) {
    throw new Error('Existing CL09 END has different provenance.');
  }
}
if (mode === '--check') {
  console.log(`CL09 START extracted from CL08 frame 239 at 9.958333s: ${at(binding.start_path)}`);
  console.log(`CL09 END: ${imageExists ? 'GENERATED_UNREVIEWED' : 'READY_TO_GENERATE'}: ${at(output)}`);
  console.log('Plan, TTS window, source clip, image binding, boards and prompt hashes match. No build or tests rerun.');
  process.exit(0);
}
if (imageExists) {
  console.log(`Existing END image verified: ${at(output)}`);
  process.exit(0);
}
const prompt = (await readFile(at(candidate.prompts.end), 'utf8')).trim();
// An exterior START bitmap here may cause an exterior copy instead of the required cabin END.
// The exact START is supplied to video generation; the END renderer uses the three locked boards.
const result = await createImageProviderAdapter().generate({
  prompt, references: boards.map((board, index) => ({ ...board, mediaId: `db-cooper-CL09-end-v3-board-${index + 1}` })),
  sessionKey: 'db-cooper-CL09-end-v3', width: 1536, height: 864, aspectRatio: '16:9',
});
const bytes = result.bytes;
if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    bytes.readUInt32BE(16) !== 1536 || bytes.readUInt32BE(20) !== 864) {
  throw new Error('Provider did not return a 1536x864 PNG.');
}
const distinct = spawnSync(process.env.VPF_PYTHON_EXECUTABLE || 'python', [
  resolve(import.meta.dirname, 'check-db-cooper-end-distinct.py'), at(binding.start_path)
], { input: bytes, encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true });
if (distinct.error || distinct.status !== 0) {
  throw new Error(`END resembles START or distinctness check failed; nothing saved. ${distinct.stderr || distinct.stdout || distinct.error}`);
}
await mkdir(dirname(at(output)), { recursive: true });
await writeFile(at(output), bytes, { flag: 'wx' });
await writeFile(at(evidencePath), JSON.stringify({
  project_id: plan.project_id, clip_id: 'CL09', kind: 'END',
  prompt_sha256: candidate.prompt_sha256.end, start_sha256: startHash,
  source_clip_sha256: clipHash, source_frame_index: 239,
  references: boards.map(({ role, sha256 }) => ({ role, sha256 })),
  output_path: output, output_sha256: sha(bytes),
  distinct_from_start: JSON.parse(distinct.stdout), provider_request_ids: result.providerRequestIds ?? [],
  generated_at: new Date().toISOString(), status: 'GENERATED_UNREVIEWED', canonical_approval: false,
}, null, 2) + '\n', { flag: 'wx' });
console.log(`Generated CL09 END for visual review: ${at(output)}`);
