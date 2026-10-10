import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createImageProviderAdapter } from '../../../runtimes/image/adapters/chatgpt-browser-adapter.mjs';

const mode = process.argv[2];
if (process.argv.length !== 3 || !['--check', '--generate-start', '--generate-end'].includes(mode)) {
  throw new Error('Usage: node scripts/generate-db-cooper-cl08-images.mjs --check|--generate-start|--generate-end');
}
const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const at = relative => resolve(root, relative);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const candidate = JSON.parse(await readFile(at('CL08-v6-chain-candidate.json'), 'utf8'));
const planBytes = await readFile(at('chain-plan.json'));
const plan = JSON.parse(planBytes);
const cl07 = plan.shots.find(shot => shot.id === 'CL07');
const cl08 = plan.shots.find(shot => shot.id === 'CL08');
const cl09 = plan.shots.find(shot => shot.id === 'CL09');
if (sha256(planBytes) !== candidate.base_plan_sha256 || plan.manager_story_gate !== 'PASS' ||
    candidate.project_id !== plan.project_id || candidate.canonical_approval !== false ||
    candidate.status !== 'DIRECTING_CANDIDATE_NOT_CANONICAL' || plan.editor_fps !== 30 ||
    cl07?.keep_seconds !== 8 || cl07?.timeline_end !== 62 ||
    cl08?.scene !== 'SC03' || cl08?.keep_seconds !== 10 || cl08?.timeline_start !== 62 || cl08?.timeline_end !== 72 ||
    cl08?.start_binding?.kind !== 'GENERATE_START' || candidate.start_binding.kind !== 'GENERATE_START' ||
    cl09?.start_binding?.source_clip !== 'CL08' ||
    candidate.narration !== cl08.narrator_text ||
    candidate.voice_slot_relative_seconds[0] !== cl08.voice_slot_relative.start ||
    candidate.voice_slot_relative_seconds[1] !== cl08.voice_slot_relative.end) {
  throw new Error('CL08 candidate no longer matches locked story, timing or TTS.');
}
const gate = JSON.parse(await readFile(at('production-readiness-pass-v1.json'), 'utf8'));
if (gate.plan_sha256 !== sha256(planBytes) || gate.project_id !== plan.project_id || gate.status !== 'PASS') {
  throw new Error('Existing production-readiness record does not match locked plan.');
}
const transition = candidate.cl07_transition_reference;
if (sha256(await readFile(at(transition.clip_path))) !== transition.clip_sha256 ||
    sha256(await readFile(at(transition.review_frame_path))) !== transition.review_frame_sha256 ||
    transition.image_reference_for_generation !== false || transition.used_exit_frame_index !== 191) {
  throw new Error('CL07 actual used exit changed. Review the CL07→CL08 scene cut.');
}
const prompts = {};
for (const kind of ['start', 'end', 'video']) {
  prompts[kind] = await readFile(at(candidate.prompts[kind]));
  if (sha256(prompts[kind]) !== candidate.prompt_sha256[kind] ||
      !prompts[kind].toString('utf8').includes('NON_REALISTIC_STYLIZED')) {
    throw new Error(`CL08 ${kind} prompt changed; create a new revision.`);
  }
}
if (!prompts.video.toString('utf8').includes('NO GENERATED VOICES — KEEP SOUND EFFECTS.') ||
    !prompts.video.toString('utf8').includes('Generate synchronized NONVERBAL sound effects')) {
  throw new Error('CL08 Google Flow video prompt must prohibit voices and require sound effects.');
}
const boards = [];
for (const id of ['BOARD03_SCENE', 'BOARD01_STYLE', 'BOARD02_MOTION']) {
  const board = plan.boards[id];
  if (sha256(await readFile(at(board.path))) !== board.sha256) throw new Error(`Master board changed: ${id}`);
  boards.push({ absolutePath: at(board.path), role: id, sha256: board.sha256 });
}
const paths = {
  start: { output: candidate.start_binding.start_path, evidence: 'assets/CL08_START_v3.evidence.json' },
  end: { output: candidate.end_target_path, evidence: 'assets/CL08_END_v3.evidence.json' },
};
async function verifiedOutput(kind) {
  const job = paths[kind];
  const imageExists = await exists(at(job.output));
  const evidenceExists = await exists(at(job.evidence));
  if (!imageExists && !evidenceExists) return null;
  if (!imageExists || !evidenceExists) throw new Error(`Partial CL08 ${kind} output exists; inspect it.`);
  const bytes = await readFile(at(job.output));
  const evidence = JSON.parse(await readFile(at(job.evidence), 'utf8'));
  if (evidence.project_id !== plan.project_id || evidence.clip_id !== 'CL08' ||
      evidence.prompt_sha256 !== candidate.prompt_sha256[kind] ||
      evidence.output_path !== job.output || evidence.output_sha256 !== sha256(bytes)) {
    throw new Error(`Existing CL08 ${kind} provenance differs from the v3 package.`);
  }
  return { absolutePath: at(job.output), sha256: sha256(bytes), evidence };
}
const start = await verifiedOutput('start');
const end = await verifiedOutput('end');
if (end && (!start || end.evidence.start_sha256 !== start.sha256)) {
  throw new Error('CL08 END is not bound to its current START.');
}
if (mode === '--check') {
  console.log(`CL08 START: ${start ? 'GENERATED_UNREVIEWED' : 'READY_TO_GENERATE'} → ${at(paths.start.output)}`);
  console.log(`CL08 END: ${end ? 'GENERATED_UNREVIEWED' : start ? 'READY_TO_GENERATE' : 'WAITING_FOR_START'} → ${at(paths.end.output)}`);
  console.log('START is a new SC03 exterior image. CL07 dark door is a transition reference only. No full CI rerun.');
  process.exit(0);
}
const kind = mode === '--generate-start' ? 'start' : 'end';
if (kind === 'end' && !start) throw new Error('Generate and inspect CL08 START first.');
const existing = kind === 'start' ? start : end;
if (existing) {
  console.log(`Existing CL08 ${kind.toUpperCase()} verified: ${existing.absolutePath}`);
  process.exit(0);
}
// The END camera is much closer to the aircraft; attaching the wide START as a visual
// reference can cause the image provider to reproduce the START instead of the target.
// Continuity is expressed in the END prompt and three board references.
const references = boards;
const result = await createImageProviderAdapter().generate({
  prompt: prompts[kind].toString('utf8').trim(),
  references: references.map((reference, index) => ({ ...reference, mediaId: `db-cooper-CL08-${kind}-v3-ref-${index + 1}` })),
  sessionKey: `db-cooper-CL08-${kind}-v3`, width: 1536, height: 864, aspectRatio: '16:9',
});
const bytes = result.bytes;
if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    bytes.readUInt32BE(16) !== 1536 || bytes.readUInt32BE(20) !== 864) {
  throw new Error(`Provider did not return a 1536x864 PNG for CL08 ${kind}.`);
}
let similarity;
if (kind === 'end') {
  const distinct = spawnSync(process.env.VPF_PYTHON_EXECUTABLE || 'python', [
    resolve(import.meta.dirname, 'check-db-cooper-end-distinct.py'), start.absolutePath
  ], { input: bytes, encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true });
  if (distinct.error || distinct.status !== 0) {
    throw new Error(`CL08 END resembles START or could not be checked; nothing saved. ${distinct.stderr || distinct.stdout || distinct.error}`);
  }
  similarity = JSON.parse(distinct.stdout);
}
const job = paths[kind];
await mkdir(dirname(at(job.output)), { recursive: true });
await writeFile(at(job.output), bytes, { flag: 'wx' });
await writeFile(at(job.evidence), JSON.stringify({
  project_id: plan.project_id, clip_id: 'CL08', kind: kind.toUpperCase(),
  prompt_sha256: candidate.prompt_sha256[kind], start_sha256: start?.sha256 ?? null,
  references: references.map(({ role, sha256 }) => ({ role, sha256 })),
  output_path: job.output, output_sha256: sha256(bytes),
  distinct_from_start: similarity ?? null, provider_request_ids: result.providerRequestIds ?? [],
  generated_at: new Date().toISOString(), status: 'GENERATED_UNREVIEWED', canonical_approval: false,
}, null, 2) + '\n', { flag: 'wx' });
console.log(`Generated CL08 ${kind.toUpperCase()} for visual review: ${at(job.output)}`);
