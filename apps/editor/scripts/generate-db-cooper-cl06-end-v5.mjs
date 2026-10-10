import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createImageProviderAdapter } from '../../../runtimes/image/adapters/chatgpt-browser-adapter.mjs';

const mode = process.argv[2];
if (process.argv.length !== 3 || !['--check', '--generate-end'].includes(mode)) {
  throw new Error('Usage: node scripts/generate-db-cooper-cl06-end-v5.mjs --check|--generate-end');
}
const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const at = relative => resolve(root, relative);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const promptPath = 'prompts/CL06_v5_END.prompt.txt';
const promptHash = 'a387fe7db1b15e1eac0e6339453833b16c9a28683ea4fb68082841e35983fbfb';
const expectedStartHash = 'b185935b1051d6a10c4ea07a8e70765d899db5dcfc9b6eab331128b5dc305604';
const outputPath = 'assets/CL06_END_TARGET_v5.png';
const evidencePath = 'assets/CL06_END_v5.evidence.json';

const planBytes = await readFile(at('chain-plan.json'));
const plan = JSON.parse(planBytes);
const candidate = JSON.parse(await readFile(at('chain-plan-cl06-v5-candidate.json'), 'utf8'));
const shot = plan.shots.find(item => item.id === 'CL06');
const selected = candidate.shots.find(item => item.id === 'CL06');
if (plan.project_id !== 'db_cooper_1971_4m30_v3' || plan.manager_story_gate !== 'PASS' ||
    shot?.scene !== 'SC02' || shot?.keep_seconds !== 9 || shot?.timeline_start !== 45 ||
    shot?.start_binding?.kind !== 'PREVIOUS_USED_EXIT' || shot.start_binding.source_clip !== 'CL05') {
  throw new Error('CL06 Story Gate, timing or START binding changed.');
}
if (candidate.derived_from_plan_sha256 !== sha256(planBytes) ||
    candidate.project_id !== plan.project_id || candidate.canonical_approval !== false ||
    candidate.status !== 'CL06_V5_DIRECTING_CANDIDATE_NOT_CANONICAL' ||
    selected?.scene !== shot.scene || selected?.keep_seconds !== shot.keep_seconds ||
    selected?.timeline_start !== shot.timeline_start || selected?.timeline_end !== shot.timeline_end ||
    selected?.start_binding?.source_clip !== 'CL05' ||
    selected?.prompts?.end !== promptPath || selected?.prompts?.video !== 'prompts/CL06_v5_VIDEO.prompt.txt' ||
    selected?.end_target_asset !== outputPath || candidate.cl06_prompt_hashes?.end !== promptHash) {
  throw new Error('CL06 v5 directing candidate differs from the approved story/timing baseline.');
}
const candidateJob = JSON.parse(await readFile(at('jobs/CL06_v5.json'), 'utf8'));
if (JSON.stringify(candidateJob) !== JSON.stringify(selected)) throw new Error('CL06 v5 candidate job differs from its chain plan.');
const videoPromptBytes = await readFile(at(selected.prompts.video));
if (sha256(videoPromptBytes) !== candidate.cl06_prompt_hashes.video ||
    !videoPromptBytes.toString('utf8').includes('NON_REALISTIC_STYLIZED')) {
  throw new Error('CL06 v5 video prompt differs from the candidate chain plan.');
}
const gate = JSON.parse(await readFile(at('production-readiness-pass-v1.json'), 'utf8'));
if (gate.project_id !== plan.project_id || gate.plan_sha256 !== sha256(planBytes) || gate.status !== 'PASS') {
  throw new Error('Production-readiness record does not match this project plan.');
}
const promptBytes = await readFile(at(promptPath));
if (sha256(promptBytes) !== promptHash || !promptBytes.toString('utf8').includes('NON_REALISTIC_STYLIZED')) {
  throw new Error('CL06 v5 END prompt changed; create a new revision.');
}

const clipBytes = await readFile(at('clips/CL05.mp4'));
const exitBytes = await readFile(at('exits/CL05_USED_EXIT.png'));
const startBytes = await readFile(at('assets/CL06_START.png'));
const exitEvidence = JSON.parse(await readFile(at('evidence/CL05_USED_EXIT.json'), 'utf8'));
const startEvidence = JSON.parse(await readFile(at('evidence/CL06_START_BINDING.json'), 'utf8'));
const startHash = sha256(startBytes);
if (exitEvidence.project_id !== plan.project_id || exitEvidence.clip_id !== 'CL05' ||
    exitEvidence.source_sha256 !== sha256(clipBytes) || exitEvidence.exit_sha256 !== sha256(exitBytes) ||
    exitEvidence.keep_seconds !== 9 || exitEvidence.selected_source_frame_time_sec < 8.75 ||
    startEvidence.source_clip !== 'CL05' || startEvidence.start_sha256 !== startHash ||
    startEvidence.source_exit_sha256 !== sha256(exitBytes) || !startBytes.equals(exitBytes) ||
    startHash !== expectedStartHash) {
  throw new Error('CL05 actual exit / CL06 START provenance changed; revise the END prompt.');
}
if (startBytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    startBytes.readUInt32BE(16) * 9 !== startBytes.readUInt32BE(20) * 16) {
  throw new Error('CL06 START is not a horizontal 16:9 PNG.');
}

const references = [];
for (const id of ['BOARD03_SCENE', 'BOARD01_STYLE', 'BOARD02_MOTION']) {
  const board = plan.boards[id];
  if (sha256(await readFile(at(board.path))) !== board.sha256) throw new Error(`Project master board changed: ${id}`);
  references.push({ absolutePath: at(board.path), role: id, sha256: board.sha256 });
}

const hasOutput = await exists(at(outputPath));
const hasEvidence = await exists(at(evidencePath));
if (hasOutput || hasEvidence) {
  if (!hasOutput || !hasEvidence) throw new Error('Partial CL06 END output exists; inspect it.');
  const evidence = JSON.parse(await readFile(at(evidencePath), 'utf8'));
  if (evidence.project_id !== plan.project_id || evidence.prompt_sha256 !== promptHash ||
      evidence.output_path !== outputPath || evidence.output_sha256 !== sha256(await readFile(at(outputPath))) ||
      evidence.start_sha256 !== startHash || evidence.references?.length !== 3) {
    throw new Error('Existing CL06 END image provenance does not match this prompt and START.');
  }
  console.log(`Existing CL06 END image verified: ${at(outputPath)}`);
  process.exit(0);
}
if (mode === '--check') {
  console.log('READY: CL06 v5 END target with new aisle composition; no image generated and no full CI rerun.');
  console.log(`START: ${at('assets/CL06_START.png')}`);
  console.log(`Output: ${at(outputPath)}`);
  process.exit(0);
}

const result = await createImageProviderAdapter().generate({
  prompt: promptBytes.toString('utf8').trim(),
  references: references.map((reference, index) => ({ ...reference, mediaId: `db-cooper-CL06-END-v5-ref-${index + 1}` })),
  sessionKey: 'db-cooper-CL06-END-v5', width: 1536, height: 864, aspectRatio: '16:9',
});
const bytes = result.bytes;
if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    bytes.readUInt32BE(16) !== 1536 || bytes.readUInt32BE(20) !== 864) {
  throw new Error('Provider did not return a 1536x864 PNG for CL06 END.');
}
const distinct = spawnSync(process.env.VPF_PYTHON_EXECUTABLE || 'python', [
  resolve(import.meta.dirname, 'check-db-cooper-end-distinct.py'), at('assets/CL06_START.png')
], { input: bytes, encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true });
if (distinct.error || distinct.status !== 0) {
  throw new Error(`Generated CL06 END resembles START or could not be checked; nothing saved. ${distinct.stderr || distinct.stdout || distinct.error}`);
}
const similarity = JSON.parse(distinct.stdout);
await mkdir(dirname(at(outputPath)), { recursive: true });
await writeFile(at(outputPath), bytes, { flag: 'wx' });
await writeFile(at(evidencePath), JSON.stringify({
  project_id: plan.project_id, clip_id: 'CL06', kind: 'END_TARGET',
  prompt_sha256: promptHash, start_sha256: startHash,
  references: references.map(({ role, sha256 }) => ({ role, sha256 })),
  output_path: outputPath, output_sha256: sha256(bytes),
  distinct_from_start: similarity,
  provider_request_ids: result.providerRequestIds ?? [],
  generated_at: new Date().toISOString(), status: 'GENERATED_UNREVIEWED', canonical_approval: false,
}, null, 2) + '\n', { flag: 'wx' });
console.log(`Generated CL06 END for visual review: ${at(outputPath)}`);
