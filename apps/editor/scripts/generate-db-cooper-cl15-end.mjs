import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createImageProviderAdapter } from '../../../runtimes/image/adapters/chatgpt-browser-adapter.mjs';

const mode = process.argv[2];
if (process.argv.length !== 3 || !['--check', '--generate-end'].includes(mode)) {
  throw new Error('Usage: node scripts/generate-db-cooper-cl15-end.mjs --check|--generate-end');
}
const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const at = relative => resolve(root, relative);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const candidate = JSON.parse(await readFile(at('CL15-v3-chain-candidate.json'), 'utf8'));
const planBytes = await readFile(at('chain-plan.json'));
const plan = JSON.parse(planBytes);
const shot = plan.shots.find(x => x.id === 'CL15');
const next = plan.shots.find(x => x.id === 'CL16');
if (sha(planBytes) !== candidate.base_plan_sha256 || plan.manager_story_gate !== 'PASS' ||
    candidate.project_id !== plan.project_id || candidate.canonical_approval !== false ||
    candidate.status !== 'DIRECTING_CANDIDATE_NOT_CANONICAL' || shot?.scene !== 'SC04' ||
    shot.timeline_start !== 130 || shot.timeline_end !== 139 || shot.source_seconds !== 10 ||
    shot.keep_seconds !== 9 || shot.image_mode !== 'START_TARGET' ||
    shot.start_binding.kind !== 'PREVIOUS_USED_EXIT' || shot.start_binding.source_clip !== 'CL14' ||
    candidate.start_binding.kind !== 'PREVIOUS_USED_EXIT' || candidate.start_binding.source_clip !== 'CL14' ||
    next?.start_binding.kind !== 'PREVIOUS_USED_EXIT' || next.start_binding.source_clip !== 'CL15' ||
    candidate.narration !== shot.narrator_text ||
    candidate.voice_slot_relative_seconds[0] !== shot.voice_slot_relative.start ||
    candidate.voice_slot_relative_seconds[1] !== shot.voice_slot_relative.end ||
    plan.editor_fps !== 30) throw new Error('CL15 candidate differs from locked plan or FINAL TTS timing.');

const sourceBytes = await readFile(at(candidate.source_clip_path));
const startBytes = await readFile(at(candidate.start_path));
const exitBytes = await readFile(at(candidate.source_exit_path));
const exitEvidence = JSON.parse(await readFile(at('evidence/CL14_USED_EXIT.json'), 'utf8'));
const startEvidence = JSON.parse(await readFile(at('evidence/CL15_START_BINDING.json'), 'utf8'));
if (sha(sourceBytes) !== candidate.source_clip_sha256 ||
    sha(startBytes) !== candidate.start_sha256 || sha(exitBytes) !== candidate.source_exit_sha256 ||
    sha(startBytes) !== sha(exitBytes) || exitEvidence.source_sha256 !== sha(sourceBytes) ||
    exitEvidence.exit_sha256 !== sha(exitBytes) || startEvidence.start_sha256 !== sha(startBytes) ||
    startEvidence.source_exit_sha256 !== sha(exitBytes) ||
    exitEvidence.selected_source_frame_index !== candidate.source_frame_index ||
    exitEvidence.selected_source_frame_time_sec !== candidate.source_frame_seconds) {
  throw new Error('CL15 START no longer matches CL14 actual used exit or recorded provenance.');
}
const endPromptBytes = await readFile(at(candidate.prompts.end));
const videoPromptBytes = await readFile(at(candidate.prompts.video));
const koreanBytes = await readFile(at(candidate.video_prompt_korean_translation.path));
if (sha(endPromptBytes) !== candidate.prompt_sha256.end ||
    sha(videoPromptBytes) !== candidate.prompt_sha256.video ||
    sha(koreanBytes) !== candidate.video_prompt_korean_translation.sha256 ||
    !endPromptBytes.toString('utf8').includes('NON_REALISTIC_STYLIZED') ||
    !videoPromptBytes.toString('utf8').includes('NO GENERATED VOICES') ||
    !videoPromptBytes.toString('utf8').includes('NONVERBAL effects')) {
  throw new Error('CL15 prompt hash, style or nonverbal audio rule changed.');
}
const boards = [];
for (const id of ['BOARD01_STYLE', 'BOARD02_MOTION', 'BOARD03_SCENE']) {
  const board = plan.boards[id];
  if (board.path !== candidate.boards[id].path || board.sha256 !== candidate.boards[id].sha256 ||
      sha(await readFile(at(board.path))) !== board.sha256) throw new Error(`Board changed: ${id}`);
  boards.push({ absolutePath: at(board.path), role: id, sha256: board.sha256 });
}
const output = at(candidate.end_target_path);
const evidencePath = at('assets/CL15_END_v3.evidence.json');
const imageExists = await exists(output);
const evidenceExists = await exists(evidencePath);
if (imageExists !== evidenceExists) throw new Error('Partial CL15 END output exists; inspect before retrying.');
if (imageExists) {
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  if (evidence.output_sha256 !== sha(await readFile(output)) ||
      evidence.prompt_sha256 !== candidate.prompt_sha256.end ||
      evidence.start_sha256 !== candidate.start_sha256 ||
      evidence.source_clip_sha256 !== candidate.source_clip_sha256) {
    throw new Error('Existing CL15 END provenance differs from candidate v3.');
  }
  console.log(`Existing CL15 END verified: ${output}`);
  process.exit(0);
}
if (mode === '--check') {
  console.log(`CL15 START from CL14 frame #${candidate.source_frame_index} at ${candidate.source_frame_seconds}s: ${at(candidate.start_path)}`);
  console.log(`CL15 END ready to generate: ${output}`);
  console.log('No full build or tests run. Image remains a candidate until visual review.');
  process.exit(0);
}
const references = [{ absolutePath: at(candidate.start_path), role: 'CL15_ACTUAL_START_STYLE', sha256: candidate.start_sha256 }, ...boards];
const result = await createImageProviderAdapter().generate({
  prompt: endPromptBytes.toString('utf8').trim(),
  references: references.map((ref, i) => ({ ...ref, mediaId: `db-cooper-CL15-end-v3-ref-${i + 1}` })),
  sessionKey: 'db-cooper-CL15-end-v3', width: 1536, height: 864, aspectRatio: '16:9',
});
const bytes = result.bytes;
if (!Buffer.isBuffer(bytes) || bytes.length < 24 ||
    bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    bytes.readUInt32BE(16) !== 1536 || bytes.readUInt32BE(20) !== 864) {
  throw new Error('Provider did not return a 1536x864 PNG for CL15 END.');
}
const distinct = spawnSync(process.env.VPF_PYTHON_EXECUTABLE || 'python', [
  resolve(import.meta.dirname, 'check-db-cooper-end-distinct.py'), at(candidate.start_path)
], { input: bytes, encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true });
if (distinct.error || distinct.status !== 0) {
  throw new Error(`CL15 END resembles START or distinctness check failed; nothing saved. ${distinct.stderr || distinct.stdout || distinct.error}`);
}
await mkdir(dirname(output), { recursive: true });
await writeFile(output, bytes, { flag: 'wx' });
await writeFile(evidencePath, JSON.stringify({
  project_id: plan.project_id, clip_id: 'CL15', kind: 'END_TARGET',
  prompt_sha256: candidate.prompt_sha256.end,
  source_clip_sha256: candidate.source_clip_sha256, start_sha256: candidate.start_sha256,
  references: references.map(({ role, sha256 }) => ({ role, sha256 })),
  output_path: candidate.end_target_path, output_sha256: sha(bytes),
  distinct_from_start: JSON.parse(distinct.stdout),
  provider_request_ids: result.providerRequestIds ?? [], generated_at: new Date().toISOString(),
  status: 'GENERATED_UNREVIEWED', canonical_approval: false,
}, null, 2) + '\n', { flag: 'wx' });
console.log(`Generated CL15 END for visual review: ${output}`);
