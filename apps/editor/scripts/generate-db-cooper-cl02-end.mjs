import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createImageProviderAdapter } from '../../../runtimes/image/adapters/chatgpt-browser-adapter.mjs';

const mode = process.argv[2];
if (process.argv.length !== 3 || !['--check', '--generate'].includes(mode)) {
  throw new Error('Usage: node scripts/generate-db-cooper-cl02-end.mjs --check|--generate');
}

const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const at = path => resolve(root, path);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const promptPath = at('prompts/CL02_v3_END.prompt.txt');
const promptBytes = await readFile(promptPath);
const promptHash = '0ff80ffa31ebb3553bfbf2529f76f4ba3379b07d06b87d194a5b896894cbf283';
if (sha256(promptBytes) !== promptHash || !promptBytes.toString('utf8').includes('NON_REALISTIC_STYLIZED')) {
  throw new Error('CL02 END prompt changed; create a new revision.');
}

const planBytes = await readFile(at('chain-plan.json'));
const plan = JSON.parse(planBytes);
const shot = plan.shots.find(item => item.id === 'CL02');
if (plan.project_id !== 'db_cooper_1971_4m30_v3' || plan.manager_story_gate !== 'PASS' || shot?.keep_seconds !== 8 || shot?.timeline_start !== 10) {
  throw new Error('CL02 plan or Story Gate changed.');
}
const gate = JSON.parse(await readFile(at('production-readiness-pass-v1.json'), 'utf8'));
if (gate.project_id !== plan.project_id || gate.plan_sha256 !== sha256(planBytes) || gate.status !== 'PASS') {
  throw new Error('Production gate record does not match this plan.');
}

const exitEvidence = JSON.parse(await readFile(at('exits/CL01_USED_EXIT.evidence.json'), 'utf8'));
const exitBytes = await readFile(at('exits/CL01_USED_EXIT.png'));
const clipBytes = await readFile(at('clips/CL01.mp4'));
if (exitEvidence.clip_id !== 'CL01' || exitEvidence.exit_sha256 !== sha256(exitBytes) || exitEvidence.source_sha256 !== sha256(clipBytes) || exitEvidence.selected_frame_index !== 239) {
  throw new Error('CL01 actual used exit or source clip changed.');
}
const references = [{ absolutePath: at('exits/CL01_USED_EXIT.png'), role: 'CL01_ACTUAL_USED_EXIT_GRAPHIC_MATCH_ONLY', sha256: exitEvidence.exit_sha256 }];
for (const id of ['BOARD01_STYLE', 'BOARD02_MOTION', 'BOARD03_SCENE']) {
  const board = plan.boards[id];
  const absolutePath = at(board.path);
  if (sha256(await readFile(absolutePath)) !== board.sha256) throw new Error(`Board changed: ${id}`);
  references.push({ absolutePath, role: id, sha256: board.sha256 });
}

const output = at('assets/CL02_END_TARGET_v3.png');
const evidencePath = at('assets/CL02_END_v3.evidence.json');
if (await exists(output) || await exists(evidencePath)) {
  if (!(await exists(output)) || !(await exists(evidencePath))) throw new Error('Partial CL02 END output exists; inspect it.');
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  if (evidence.prompt_sha256 !== promptHash || evidence.output_sha256 !== sha256(await readFile(output))) throw new Error('Existing CL02 END provenance mismatch.');
  console.log(`Existing CL02 END verified: ${output}`);
  process.exit(0);
}
if (mode === '--check') {
  console.log('READY: CL02 END target image candidate (8-second used exit)');
  console.log(`References verified: ${references.length}`);
  console.log(`Output: ${output}`);
  process.exit(0);
}

const result = await createImageProviderAdapter().generate({
  prompt: promptBytes.toString('utf8').trim(),
  references: references.map((reference, index) => ({ ...reference, mediaId: `db-cooper-CL02-END-v3-ref-${index + 1}` })),
  sessionKey: 'db-cooper-CL02-END-v3', width: 1536, height: 864, aspectRatio: '16:9',
});
const bytes = result.bytes;
if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) !== 1536 || bytes.readUInt32BE(20) !== 864) {
  throw new Error('Provider did not return a 1536x864 PNG.');
}
await mkdir(dirname(output), { recursive: true });
await writeFile(output, bytes, { flag: 'wx' });
await writeFile(evidencePath, JSON.stringify({
  project_id: plan.project_id, clip_id: 'CL02', kind: 'END_TARGET',
  prompt_sha256: promptHash,
  references: references.map(({role, sha256}) => ({role, sha256})),
  output_path: 'assets/CL02_END_TARGET_v3.png', output_sha256: sha256(bytes),
  provider_request_ids: result.providerRequestIds ?? [],
  generated_at: new Date().toISOString(), status: 'GENERATED_UNREVIEWED',
  canonical_approval: false,
}, null, 2) + '\n', { flag: 'wx' });
console.log(`Generated CL02 END for visual review: ${output}`);
