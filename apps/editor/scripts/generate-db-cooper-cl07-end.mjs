import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createImageProviderAdapter } from '../../../runtimes/image/adapters/chatgpt-browser-adapter.mjs';

const mode = process.argv[2];
if (process.argv.length !== 3 || !['--check', '--generate-end'].includes(mode)) {
  throw new Error('Usage: node scripts/generate-db-cooper-cl07-end.mjs --check|--generate-end');
}
const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const at = relative => resolve(root, relative);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const candidate = JSON.parse(await readFile(at('CL07-v6-chain-candidate.json'), 'utf8'));
const planBytes = await readFile(at('chain-plan.json'));
const plan = JSON.parse(planBytes);
const cl06 = plan.shots.find(shot => shot.id === 'CL06');
const cl07 = plan.shots.find(shot => shot.id === 'CL07');
if (sha256(planBytes) !== candidate.base_plan_sha256 || plan.manager_story_gate !== 'PASS' ||
    candidate.status !== 'DIRECTING_CANDIDATE_NOT_CANONICAL' || candidate.canonical_approval !== false ||
    candidate.project_id !== plan.project_id || plan.editor_fps !== 30 ||
    cl06?.keep_seconds !== 9 || cl06?.timeline_end !== 54 ||
    cl07?.scene !== 'SC02' || cl07?.keep_seconds !== 8 || cl07?.timeline_start !== 54 || cl07?.timeline_end !== 62 ||
    candidate.start_binding.kind !== 'PREVIOUS_USED_EXIT_CANDIDATE' ||
    candidate.narration !== cl07.narrator_text ||
    candidate.voice_slot_relative_seconds[0] !== cl07.voice_slot_relative.start ||
    candidate.voice_slot_relative_seconds[1] !== cl07.voice_slot_relative.end) {
  throw new Error('CL07 candidate no longer matches locked story and TTS timing.');
}
const gate = JSON.parse(await readFile(at('production-readiness-pass-v1.json'), 'utf8'));
if (gate.plan_sha256 !== sha256(planBytes) || gate.project_id !== plan.project_id || gate.status !== 'PASS') {
  throw new Error('Existing production-readiness record does not match locked plan.');
}
for (const [relative, expected] of [[candidate.end_prompt_path, candidate.end_prompt_sha256],
                                    [candidate.video_prompt_path, candidate.video_prompt_sha256]]) {
  const bytes = await readFile(at(relative));
  if (sha256(bytes) !== expected || !bytes.toString('utf8').includes('NON_REALISTIC_STYLIZED')) {
    throw new Error(`CL07 prompt revision changed: ${relative}`);
  }
}
const clipHash = sha256(await readFile(at(cl06.video_asset)));
if (clipHash !== candidate.start_binding.source_clip_sha256) {
  throw new Error('CL06.mp4 changed. Review its actual exit and create a new CL07 revision.');
}
const exitPath = at(candidate.start_binding.source_exit_path);
const startPath = at(candidate.start_binding.start_path);
const sourcePaths = [exitPath, startPath, at('evidence/CL06_USED_EXIT.json'), at('evidence/CL07_START_BINDING.json')];
const present = await Promise.all(sourcePaths.map(exists));
if (present.some(Boolean) && !present.every(Boolean)) throw new Error('Partial CL06 exit / CL07 START output exists.');
let startHash;
if (present.every(Boolean)) {
  const exitBytes = await readFile(exitPath);
  const startBytes = await readFile(startPath);
  const exitEvidence = JSON.parse(await readFile(sourcePaths[2], 'utf8'));
  const startEvidence = JSON.parse(await readFile(sourcePaths[3], 'utf8'));
  startHash = sha256(startBytes);
  if (!exitBytes.equals(startBytes) || exitEvidence.source_sha256 !== clipHash ||
      exitEvidence.exit_sha256 !== startHash || exitEvidence.selected_source_frame_index !== 215 ||
      Math.abs(exitEvidence.selected_source_frame_time_sec - 8.958333) > 0.00001 ||
      startEvidence.start_sha256 !== startHash || startEvidence.source_exit_sha256 !== startHash ||
      startEvidence.binding_kind !== 'PREVIOUS_USED_EXIT_CANDIDATE') {
    throw new Error('CL07 START is not CL06 actual used exit.');
  }
}
if (mode === '--check') {
  console.log(present.every(Boolean) ? `CL07 START verified: ${startPath}` :
    'CL07 START pending: powershell -NoProfile -File scripts/extract-db-cooper-cl06-to-cl07-start.ps1');
  console.log(`CL07 END target: ${at(candidate.end_target_path)}`);
  console.log('CL07 END v3 / video v6 is a directing candidate; no full CI rerun.');
  process.exit(0);
}
if (!present.every(Boolean)) throw new Error('Extract and review CL07 START first.');
const outputPath = at(candidate.end_target_path);
const evidencePath = at('assets/CL07_END_v3.evidence.json');
const outputPresent = await Promise.all([outputPath, evidencePath].map(exists));
if (outputPresent.some(Boolean)) {
  if (!outputPresent.every(Boolean)) throw new Error('Partial CL07 END output exists; inspect it.');
  const prior = JSON.parse(await readFile(evidencePath, 'utf8'));
  if (prior.output_sha256 !== sha256(await readFile(outputPath)) ||
      prior.prompt_sha256 !== candidate.end_prompt_sha256 || prior.start_sha256 !== startHash) {
    throw new Error('Existing CL07 END provenance differs from this candidate.');
  }
  console.log(`Existing CL07 END verified: ${outputPath}`);
  process.exit(0);
}
const references = [];
for (const id of ['BOARD03_SCENE', 'BOARD01_STYLE', 'BOARD02_MOTION']) {
  const board = plan.boards[id];
  if (sha256(await readFile(at(board.path))) !== board.sha256) throw new Error(`Master board changed: ${id}`);
  references.push({ absolutePath: at(board.path), role: id, sha256: board.sha256 });
}
const result = await createImageProviderAdapter().generate({
  prompt: (await readFile(at(candidate.end_prompt_path), 'utf8')).trim(),
  references: references.map((reference, index) => ({ ...reference, mediaId: `db-cooper-CL07-END-v3-ref-${index + 1}` })),
  sessionKey: 'db-cooper-CL07-END-v3', width: 1536, height: 864, aspectRatio: '16:9',
});
const bytes = result.bytes;
if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    bytes.readUInt32BE(16) !== 1536 || bytes.readUInt32BE(20) !== 864) {
  throw new Error('Provider did not return a 1536x864 PNG for CL07 END.');
}
const distinct = spawnSync(process.env.VPF_PYTHON_EXECUTABLE || 'python', [
  resolve(import.meta.dirname, 'check-db-cooper-end-distinct.py'), startPath
], { input: bytes, encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true });
if (distinct.error || distinct.status !== 0) {
  throw new Error(`Generated CL07 END resembles START or could not be checked; nothing saved. ${distinct.stderr || distinct.stdout || distinct.error}`);
}
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, bytes, { flag: 'wx' });
await writeFile(evidencePath, JSON.stringify({
  project_id: plan.project_id, clip_id: 'CL07', kind: 'END_TARGET',
  prompt_sha256: candidate.end_prompt_sha256, start_sha256: startHash,
  references: references.map(({ role, sha256 }) => ({ role, sha256 })),
  output_path: candidate.end_target_path, output_sha256: sha256(bytes),
  distinct_from_start: JSON.parse(distinct.stdout), provider_request_ids: result.providerRequestIds ?? [],
  generated_at: new Date().toISOString(), status: 'GENERATED_UNREVIEWED', canonical_approval: false,
}, null, 2) + '\n', { flag: 'wx' });
console.log(`Generated CL07 END for visual review: ${outputPath}`);
