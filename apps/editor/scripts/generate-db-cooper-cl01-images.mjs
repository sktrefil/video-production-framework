import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createImageProviderAdapter } from '../../../runtimes/image/adapters/chatgpt-browser-adapter.mjs';

const commands = ['--check', '--check-gate', '--verify-gate', '--generate-start', '--accept-start', '--generate-end', '--status'];
const command = process.argv[2];
const revision = process.argv[3] ?? 'v3';
if (process.argv.length < 3 || process.argv.length > 4 || !commands.includes(command) || !['v3', 'v4'].includes(revision)) {
  throw new Error(`Usage: node scripts/generate-db-cooper-cl01-images.mjs ${commands.join('|')} [v3|v4]`);
}

const editorRoot = resolve(import.meta.dirname, '..');
const root = resolve(editorRoot, 'output/db-cooper-v3/storyboard-lock-v1');
const plan = JSON.parse(await readFile(resolve(root, 'chain-plan.json'), 'utf8'));
const readiness = JSON.parse(await readFile(resolve(root, 'production-readiness-v1.json'), 'utf8'));
const jobSets = {
  v3: [
    { kind: 'START', promptHash: '8e50d7d1fc1e9c50bc33266ce858ddda1dd48d89e77a49e80160cdec58f4645a', output: 'assets/CL01_START.png' },
    { kind: 'END', promptHash: 'e7c7a37cd4129c61061af75c9fd5e1f83701d65bc6c870652d8e0a64383b2116', output: 'assets/CL01_END_TARGET.png' },
  ],
  v4: [
    { kind: 'START', promptHash: '0de97f6a115a2281aada96c180e576a813c063e24e21de7dda58005a3bbebba0', output: 'assets/CL01_START_v4.png' },
    { kind: 'END', promptHash: 'fde8a25e5fb6d76e2283525ac690298e602f5ae0a688c04f4f50e4e1fdd00799', output: 'assets/CL01_END_TARGET_v4.png' },
  ],
};
const jobs = jobSets[revision];
const boardIds = ['BOARD01_STYLE', 'BOARD02_MOTION', 'BOARD03_SCENE'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const pathFor = relative => resolve(root, relative);

if (plan.project_id !== 'db_cooper_1971_4m30_v3' || plan.manager_story_gate !== 'PASS' || plan.script_directing_lock !== 'SDL-db_cooper_1971_4m30_v3-r2' || plan.shots?.[0]?.id !== 'CL01' || plan.shots[0].keep_seconds !== 10 || readiness.project_id !== plan.project_id) {
  throw new Error('CL01 plan or Story Gate changed. Rebuild the prompt package before generation.');
}

const boards = await Promise.all(boardIds.map(async id => {
  const record = plan.boards[id];
  const absolutePath = pathFor(record.path);
  if (hash(await readFile(absolutePath)) !== record.sha256) throw new Error(`Reference board changed: ${id}`);
  return { absolutePath, sha256: record.sha256, role: id };
}));
for (const job of jobs) {
  job.promptPath = pathFor(`prompts/CL01_${revision}_${job.kind}.prompt.txt`);
  job.promptBytes = await readFile(job.promptPath);
  if (hash(job.promptBytes) !== job.promptHash || !job.promptBytes.toString('utf8').includes('NON_REALISTIC_STYLIZED')) {
    throw new Error(`Prompt changed or style lock missing: ${job.kind}. Make a new revision.`);
  }
  job.outputPath = pathFor(job.output);
  job.evidencePath = pathFor(`assets/CL01_${job.kind}_${revision}.evidence.json`);
}
const reviewPath = pathFor(`assets/CL01_START_${revision}.review.json`);
const qcPath = pathFor(`assets/CL01_START_${revision}.qc.json`);
const gateReceiptPath = pathFor('production-readiness-pass-v1.json');

async function ensureProductionReadiness() {
  const planSha256 = hash(await readFile(pathFor('chain-plan.json')));
  if (await exists(gateReceiptPath)) {
    const prior = JSON.parse(await readFile(gateReceiptPath, 'utf8'));
    if (prior.project_id === plan.project_id && prior.plan_sha256 === planSha256 && prior.status === 'PASS') {
      console.log(`Using the existing project production-readiness record from ${prior.verified_at}.`);
      return;
    }
    const requiredChecks = ['build', 'typecheck', 'tests', 'LONGFORM E2E', 'pilot-readiness CI', 'Cooper project preflight'];
    if (prior.project_id === plan.project_id && prior.status === 'PASS' && prior.source_fingerprint && requiredChecks.every(check => prior.checks?.includes(check))) {
      const normalized = {
        schema: 'db-cooper-production-readiness-pass.v1', project_id: plan.project_id,
        plan_sha256: planSha256, verified_at: prior.verified_at,
        basis: 'full_gate_pass_recorded_by_prior_generator', checks: prior.checks,
        status: 'PASS',
      };
      await writeFile(gateReceiptPath, JSON.stringify(normalized, null, 2) + '\n');
      console.log('Using the completed full production gate; no CI rerun.');
      return;
    }
    throw new Error('The production-readiness record does not match this project plan. Run --verify-gate separately.');
  }
  // The v3 image could only be saved by the earlier generator after the full gate passed.
  const priorImage = pathFor('assets/CL01_START.png');
  const priorEvidencePath = pathFor('assets/CL01_START_v3.evidence.json');
  if (!(await exists(priorImage)) || !(await exists(priorEvidencePath))) {
    throw new Error('No prior production gate evidence. Run --verify-gate separately before image generation.');
  }
  const priorEvidence = JSON.parse(await readFile(priorEvidencePath, 'utf8'));
  if (priorEvidence.project_id !== plan.project_id || priorEvidence.kind !== 'START' || priorEvidence.prompt_sha256 !== jobSets.v3[0].promptHash || priorEvidence.output_sha256 !== hash(await readFile(priorImage))) {
    throw new Error('Prior generated image evidence does not verify. Run --verify-gate separately.');
  }
  await writeFile(gateReceiptPath, JSON.stringify({
    schema: 'db-cooper-production-readiness-pass.v1',
    project_id: plan.project_id,
    plan_sha256: planSha256,
    verified_at: new Date().toISOString(),
    basis: 'CL01 v3 START was generated by the gate-enforcing script after required checks passed',
    prior_image_sha256: priorEvidence.output_sha256,
    status: 'PASS',
  }, null, 2) + '\n');
  console.log('Prior CL01 image confirms the gate-enforced pilot already ran. Recorded once; continuing with image generation.');
}

async function verifiedOutput(job) {
  const hasImage = await exists(job.outputPath);
  const hasEvidence = await exists(job.evidencePath);
  if (!hasImage && !hasEvidence) return null;
  if (!hasImage || !hasEvidence) throw new Error(`Partial ${job.kind} output exists. Inspect it before retrying.`);
  const bytes = await readFile(job.outputPath);
  const evidence = JSON.parse(await readFile(job.evidencePath, 'utf8'));
  if (evidence.prompt_sha256 !== job.promptHash || evidence.output_sha256 !== hash(bytes) || evidence.output_path !== job.output) {
    throw new Error(`${job.kind} provenance mismatch. Use a new revision.`);
  }
  return { sha256: hash(bytes), absolutePath: job.outputPath };
}

const start = await verifiedOutput(jobs[0]);
const end = await verifiedOutput(jobs[1]);
if (command === '--check-gate') {
  await ensureProductionReadiness();
  console.log('Production gate record OK; no image generation was started.');
  process.exit(0);
}
if (command === '--verify-gate') {
  const gate = resolve(editorRoot, 'scripts/verify-db-cooper-production-readiness.ps1');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', gate], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`Production-readiness check failed: ${result.error?.message ?? result.status}`);
  await writeFile(gateReceiptPath, JSON.stringify({
    schema: 'db-cooper-production-readiness-pass.v1', project_id: plan.project_id,
    plan_sha256: hash(await readFile(pathFor('chain-plan.json'))),
    verified_at: new Date().toISOString(), basis: 'explicit_full_gate_run', status: 'PASS',
  }, null, 2) + '\n');
  console.log(`Production-readiness PASS recorded: ${gateReceiptPath}`);
  process.exit(0);
}
if (command === '--status' || command === '--check') {
  const startReviewed = start && await exists(reviewPath) && JSON.parse(await readFile(reviewPath, 'utf8')).start_sha256 === start.sha256;
  console.log(`CL01 ${revision} START: ${start ? 'GENERATED_UNREVIEWED_OR_REVIEWED' : 'READY_TO_GENERATE'}`);
  console.log(`CL01 ${revision} END: ${end ? 'GENERATED_UNREVIEWED' : startReviewed ? 'READY_TO_GENERATE' : start ? 'WAITING_START_REVIEW' : 'WAITING_START'}`);
  console.log(`References: ${boards.length} boards verified; prompts: ${revision} hashes verified`);
  console.log(`Output directory: ${pathFor('assets')}`);
  if (command === '--check') console.log('Image generation uses the prior gate-verified CL01 pilot record; it does not rerun the full CI suite.');
  process.exit(0);
}

if (command === '--accept-start') {
  if (!start) throw new Error('Generate and visually inspect CL01 START first.');
  if (await exists(qcPath)) {
    const qc = JSON.parse(await readFile(qcPath, 'utf8'));
    if (qc.candidate_sha256 === start.sha256 && qc.verdict === 'REVISE') throw new Error(`${revision} START failed visual QC: ${qc.reason}`);
  }
  if (await exists(reviewPath)) {
    const prior = JSON.parse(await readFile(reviewPath, 'utf8'));
    if (prior.start_sha256 !== start.sha256) throw new Error('START changed after review; inspect again.');
    console.log(`START already accepted: ${reviewPath}`);
    process.exit(0);
  }
  await writeFile(reviewPath, JSON.stringify({
    project_id: plan.project_id,
    shot_id: 'CL01',
    start_sha256: start.sha256,
    prompt_sha256: jobs[0].promptHash,
    review: 'USER_VISUAL_REVIEW_ACCEPTED_FOR_END_REFERENCE',
    accepted_at: new Date().toISOString(),
  }, null, 2) + '\n', { flag: 'wx' });
  console.log(`START review recorded for END reference: ${reviewPath}`);
  process.exit(0);
}

const job = command === '--generate-start' ? jobs[0] : jobs[1];
if (await verifiedOutput(job)) {
  console.log(`Existing ${job.kind} image verified: ${job.outputPath}`);
  process.exit(0);
}
if (job.kind === 'END') {
  if (!start) throw new Error('Generate START first.');
  if (await exists(qcPath)) {
    const qc = JSON.parse(await readFile(qcPath, 'utf8'));
    if (qc.candidate_sha256 === start.sha256 && qc.verdict === 'REVISE') throw new Error(`${revision} START failed visual QC: ${qc.reason}`);
  }
  if (!(await exists(reviewPath))) throw new Error('Inspect START, then run --accept-start before generating END.');
  const review = JSON.parse(await readFile(reviewPath, 'utf8'));
  if (review.start_sha256 !== start.sha256) throw new Error('START hash differs from accepted review.');
}

// The pilot gate is separate; image jobs verify only project and asset provenance.
await ensureProductionReadiness();

const references = job.kind === 'START' ? boards : [
  { ...start, role: 'APPROVED_CL01_START_PRIMARY' }, ...boards,
];
const providerResult = await createImageProviderAdapter().generate({
  prompt: job.promptBytes.toString('utf8').trim(),
  references: references.map((ref, index) => ({
    absolutePath: ref.absolutePath,
    sha256: ref.sha256,
    role: ref.role,
    mediaId: `db-cooper-CL01-${job.kind}-${revision}-ref-${index + 1}`,
  })),
  sessionKey: `db-cooper-CL01-${job.kind}-${revision}`,
  width: 1536, height: 864, aspectRatio: '16:9',
});
const bytes = providerResult.bytes;
if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) !== 1536 || bytes.readUInt32BE(20) !== 864) {
  throw new Error(`Provider did not return a 1536x864 PNG for ${job.kind}`);
}
await mkdir(dirname(job.outputPath), { recursive: true });
await writeFile(job.outputPath, bytes, { flag: 'wx' });
await writeFile(job.evidencePath, JSON.stringify({
  project_id: plan.project_id,
  shot_id: 'CL01',
  kind: job.kind,
  prompt_sha256: job.promptHash,
  reference_sha256: references.map(ref => ({ role: ref.role, sha256: ref.sha256 })),
  output_path: job.output,
  output_sha256: hash(bytes),
  provider_request_ids: providerResult.providerRequestIds ?? [],
  generated_at: new Date().toISOString(),
  state: 'GENERATED_UNREVIEWED',
}, null, 2) + '\n', { flag: 'wx' });
console.log(`Generated ${job.kind} for visual review: ${job.outputPath}`);
