import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createImageProviderAdapter } from '../../../runtimes/image/adapters/chatgpt-browser-adapter.mjs';

const mode = process.argv[2];
if (process.argv.length !== 3 || !['--check', '--generate-end'].includes(mode)) {
  throw new Error('Usage: node scripts/generate-db-cooper-cl04-end.mjs --check|--generate-end');
}

const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const at = relative => resolve(root, relative);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const promptPath = 'prompts/CL04_v3_END.prompt.txt';
const promptHash = '83b9f1d015b1726e778fe483463cbf900db24b8d71416ab92c08c2798a7a9fbf';
const outputPath = 'assets/CL04_END_TARGET_v3.png';
const evidencePath = 'assets/CL04_END_v3.evidence.json';

const planBytes = await readFile(at('chain-plan.json'));
const plan = JSON.parse(planBytes);
const shot = plan.shots.find(item => item.id === 'CL04');
if (plan.project_id !== 'db_cooper_1971_4m30_v3' || plan.manager_story_gate !== 'PASS' ||
    shot?.scene !== 'SC02' || shot?.keep_seconds !== 9 || shot?.timeline_start !== 27 ||
    shot?.start_binding?.kind !== 'PREVIOUS_USED_EXIT' || shot.start_binding.source_clip !== 'CL03') {
  throw new Error('CL04 Story Gate, timing or START binding changed.');
}
const gate = JSON.parse(await readFile(at('production-readiness-pass-v1.json'), 'utf8'));
if (gate.project_id !== plan.project_id || gate.plan_sha256 !== sha256(planBytes) || gate.status !== 'PASS') {
  throw new Error('Production-readiness record does not match this project plan.');
}

const promptBytes = await readFile(at(promptPath));
if (sha256(promptBytes) !== promptHash || !promptBytes.toString('utf8').includes('non-photorealistic')) {
  throw new Error('CL04 END prompt changed; create a new revision.');
}

const clipBytes = await readFile(at('clips/CL03.mp4'));
const exitBytes = await readFile(at('exits/CL03_USED_EXIT.png'));
const startBytes = await readFile(at('assets/CL04_START.png'));
const exitEvidence = JSON.parse(await readFile(at('evidence/CL03_USED_EXIT.json'), 'utf8'));
const startEvidence = JSON.parse(await readFile(at('evidence/CL04_START_BINDING.json'), 'utf8'));
const startHash = sha256(startBytes);
if (exitEvidence.project_id !== plan.project_id || exitEvidence.clip_id !== 'CL03' ||
    exitEvidence.source_sha256 !== sha256(clipBytes) || exitEvidence.exit_sha256 !== sha256(exitBytes) ||
    exitEvidence.keep_seconds !== 9 || exitEvidence.selected_source_frame_time_sec < 8.75 ||
    startEvidence.source_clip !== 'CL03' || startEvidence.start_sha256 !== startHash ||
    startEvidence.source_exit_sha256 !== sha256(exitBytes) || !startBytes.equals(exitBytes) ||
    startHash !== 'be07228d9387054df9b7db5b01c76d4ac2ac159df56b30dc27edb0c22f401e0b') {
  throw new Error('CL03 actual exit / CL04 START provenance changed; revise the END prompt.');
}
const width = startBytes.readUInt32BE(16);
const height = startBytes.readUInt32BE(20);
if (startBytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || width * 9 !== height * 16) {
  throw new Error('CL04 START is not a horizontal 16:9 PNG.');
}

const references = [{ absolutePath: at('assets/CL04_START.png'), role: 'CL04_ACTUAL_START_PRIMARY', sha256: startHash }];
for (const id of ['BOARD01_STYLE', 'BOARD02_MOTION', 'BOARD03_SCENE']) {
  const board = plan.boards[id];
  const bytes = await readFile(at(board.path));
  if (sha256(bytes) !== board.sha256) throw new Error(`Project master board changed: ${id}`);
  references.push({ absolutePath: at(board.path), role: id, sha256: board.sha256 });
}

const hasOutput = await exists(at(outputPath));
const hasEvidence = await exists(at(evidencePath));
if (hasOutput || hasEvidence) {
  if (!hasOutput || !hasEvidence) throw new Error('Partial CL04 END output exists; inspect it.');
  const evidence = JSON.parse(await readFile(at(evidencePath), 'utf8'));
  if (evidence.project_id !== plan.project_id || evidence.prompt_sha256 !== promptHash ||
      evidence.output_path !== outputPath || evidence.output_sha256 !== sha256(await readFile(at(outputPath))) ||
      evidence.references?.[0]?.sha256 !== startHash) {
    throw new Error('Existing CL04 END image provenance does not match this prompt and START.');
  }
  console.log(`Existing CL04 END image verified: ${at(outputPath)}`);
  process.exit(0);
}
if (mode === '--check') {
  console.log('READY: CL04 END target; no image generated and no full CI rerun.');
  console.log(`START: ${at('assets/CL04_START.png')} (${width}x${height})`);
  console.log(`Output: ${at(outputPath)}`);
  process.exit(0);
}

const result = await createImageProviderAdapter().generate({
  prompt: promptBytes.toString('utf8').trim(),
  references: references.map((reference, index) => ({ ...reference, mediaId: `db-cooper-CL04-END-v3-ref-${index + 1}` })),
  sessionKey: 'db-cooper-CL04-END-v3', width: 1536, height: 864, aspectRatio: '16:9',
});
const bytes = result.bytes;
if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    bytes.readUInt32BE(16) !== 1536 || bytes.readUInt32BE(20) !== 864) {
  throw new Error('Provider did not return a 1536x864 PNG for CL04 END.');
}
await mkdir(dirname(at(outputPath)), { recursive: true });
await writeFile(at(outputPath), bytes, { flag: 'wx' });
await writeFile(at(evidencePath), JSON.stringify({
  project_id: plan.project_id, clip_id: 'CL04', kind: 'END_TARGET',
  prompt_sha256: promptHash,
  references: references.map(({ role, sha256 }) => ({ role, sha256 })),
  output_path: outputPath, output_sha256: sha256(bytes),
  provider_request_ids: result.providerRequestIds ?? [],
  generated_at: new Date().toISOString(), status: 'GENERATED_UNREVIEWED', canonical_approval: false,
}, null, 2) + '\n', { flag: 'wx' });
console.log(`Generated CL04 END for visual review: ${at(outputPath)}`);
