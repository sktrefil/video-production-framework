import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createImageProviderAdapter } from '../../../runtimes/image/adapters/chatgpt-browser-adapter.mjs';

const mode = process.argv[2];
if (process.argv.length !== 3 || !['--check', '--generate-start', '--generate-end'].includes(mode)) {
  throw new Error('Usage: node scripts/generate-db-cooper-cl02-images.mjs --check|--generate-start|--generate-end');
}
const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const at = relative => resolve(root, relative);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const planBytes = await readFile(at('chain-plan.json'));
const plan = JSON.parse(planBytes);
const shot = plan.shots.find(item => item.id === 'CL02');
if (plan.project_id !== 'db_cooper_1971_4m30_v3' || plan.manager_story_gate !== 'PASS' || shot?.keep_seconds !== 8 || shot?.timeline_start !== 10) {
  throw new Error('CL02 Story Gate or timing changed.');
}
const gate = JSON.parse(await readFile(at('production-readiness-pass-v1.json'), 'utf8'));
if (gate.project_id !== plan.project_id || gate.plan_sha256 !== sha256(planBytes) || gate.status !== 'PASS') {
  throw new Error('Production gate record does not match this project plan.');
}

const exitEvidence = JSON.parse(await readFile(at('exits/CL01_USED_EXIT.evidence.json'), 'utf8'));
const exitBytes = await readFile(at('exits/CL01_USED_EXIT.png'));
if (exitEvidence.clip_id !== 'CL01' || exitEvidence.source_sha256 !== sha256(await readFile(at('clips/CL01.mp4'))) || exitEvidence.exit_sha256 !== sha256(exitBytes) || exitEvidence.selected_frame_index !== 239) {
  throw new Error('CL01 actual used exit or source clip changed.');
}
const exitReference = { absolutePath: at('exits/CL01_USED_EXIT.png'), role: 'CL01_EXIT_GRAPHIC_MATCH_ONLY', sha256: exitEvidence.exit_sha256 };
const boards = [];
for (const id of ['BOARD01_STYLE', 'BOARD02_MOTION', 'BOARD03_SCENE']) {
  const record = plan.boards[id];
  const absolutePath = at(record.path);
  if (sha256(await readFile(absolutePath)) !== record.sha256) throw new Error(`Board changed: ${id}`);
  boards.push({ absolutePath, role: id, sha256: record.sha256 });
}
const jobs = {
  START: {
    prompt: 'prompts/CL02_v3_START.prompt.txt', promptHash: '64d8883a048cd458b168a6235cfc4b3530e5b35a6439c42110d1782a57be2bf6',
    output: 'assets/CL02_START_v3.png', evidence: 'assets/CL02_START_v3.evidence.json',
  },
  END: {
    prompt: 'prompts/CL02_v4_END.prompt.txt', promptHash: 'a563f34e0853f6f65b9df058905ec7930d0cc30cdffb06e11fb95ccb576d2630',
    output: 'assets/CL02_END_TARGET_v4.png', evidence: 'assets/CL02_END_v4.evidence.json',
  },
};
for (const [kind, job] of Object.entries(jobs)) {
  job.promptBytes = await readFile(at(job.prompt));
  if (sha256(job.promptBytes) !== job.promptHash || !job.promptBytes.toString('utf8').includes('NON_REALISTIC_STYLIZED')) {
    throw new Error(`${kind} prompt changed; create a new revision.`);
  }
}
async function verifiedOutput(kind) {
  const job = jobs[kind];
  const hasImage = await exists(at(job.output));
  const hasEvidence = await exists(at(job.evidence));
  if (!hasImage && !hasEvidence) return null;
  if (!hasImage || !hasEvidence) throw new Error(`Partial ${kind} output exists; inspect it.`);
  const bytes = await readFile(at(job.output));
  const evidence = JSON.parse(await readFile(at(job.evidence), 'utf8'));
  if (evidence.prompt_sha256 !== job.promptHash || evidence.output_sha256 !== sha256(bytes) || evidence.output_path !== job.output) {
    throw new Error(`${kind} output provenance mismatch; use a new revision.`);
  }
  return { absolutePath: at(job.output), sha256: sha256(bytes), evidence };
}
const start = await verifiedOutput('START');
const end = await verifiedOutput('END');
if (mode === '--check') {
  console.log(`CL02 START: ${start ? 'GENERATED_UNREVIEWED' : 'READY_TO_GENERATE'}`);
  console.log(`CL02 END: ${end ? 'GENERATED_UNREVIEWED' : start ? 'READY_TO_GENERATE' : 'WAITING_FOR_START'}`);
  console.log('References and prompt hashes verified. No full CI rerun.');
  console.log(`START output: ${at(jobs.START.output)}`);
  console.log(`END output: ${at(jobs.END.output)}`);
  process.exit(0);
}
const kind = mode === '--generate-start' ? 'START' : 'END';
if (kind === 'END' && !start) throw new Error('Generate and inspect CL02 START first.');
const prior = kind === 'START' ? start : end;
if (prior) { console.log(`Existing ${kind} image verified: ${prior.absolutePath}`); process.exit(0); }
const job = jobs[kind];
const references = kind === 'START'
  ? [exitReference, ...boards]
  : [{ absolutePath: start.absolutePath, role: 'CL02_START_PRIMARY_SAME_SHOT', sha256: start.sha256 }, exitReference, ...boards];
const result = await createImageProviderAdapter().generate({
  prompt: job.promptBytes.toString('utf8').trim(),
  references: references.map((reference, index) => ({ ...reference, mediaId: `db-cooper-CL02-${kind}-ref-${index + 1}` })),
  sessionKey: `db-cooper-CL02-${kind}-${kind === 'START' ? 'v3' : 'v4'}`,
  width: 1536, height: 864, aspectRatio: '16:9',
});
const bytes = result.bytes;
if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) !== 1536 || bytes.readUInt32BE(20) !== 864) {
  throw new Error(`Provider did not return a 1536x864 PNG for ${kind}.`);
}
await mkdir(dirname(at(job.output)), { recursive: true });
await writeFile(at(job.output), bytes, { flag: 'wx' });
await writeFile(at(job.evidence), JSON.stringify({
  project_id: plan.project_id, clip_id: 'CL02', kind,
  prompt_sha256: job.promptHash,
  references: references.map(({ role, sha256 }) => ({ role, sha256 })),
  output_path: job.output, output_sha256: sha256(bytes),
  provider_request_ids: result.providerRequestIds ?? [],
  generated_at: new Date().toISOString(), status: 'GENERATED_UNREVIEWED', canonical_approval: false,
}, null, 2) + '\n', { flag: 'wx' });
console.log(`Generated CL02 ${kind} for visual review: ${at(job.output)}`);
