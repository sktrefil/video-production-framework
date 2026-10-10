import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createImageProviderAdapter } from '../../../runtimes/image/adapters/chatgpt-browser-adapter.mjs';

const mode = process.argv[2];
if (process.argv.length !== 3 || !['--check', '--generate-start', '--generate-end'].includes(mode)) {
  throw new Error('Usage: node scripts/generate-db-cooper-cl11-images.mjs --check|--generate-start|--generate-end');
}
const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const at = relative => resolve(root, relative);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const candidate = JSON.parse(await readFile(at('CL11-v3-chain-candidate.json'), 'utf8'));
const planBytes = await readFile(at('chain-plan.json'));
const plan = JSON.parse(planBytes);
const shot = plan.shots.find(value => value.id === 'CL11');
const next = plan.shots.find(value => value.id === 'CL12');
if (sha(planBytes) !== candidate.base_plan_sha256 || plan.manager_story_gate !== 'PASS' ||
    candidate.project_id !== plan.project_id || candidate.canonical_approval !== false ||
    candidate.status !== 'DIRECTING_CANDIDATE_NOT_CANONICAL' ||
    shot?.scene !== 'SC03' || shot?.timeline_start !== 92 || shot?.timeline_end !== 102 ||
    shot?.keep_seconds !== 10 || shot?.start_binding?.kind !== 'GENERATE_START' ||
    candidate.start_binding.kind !== 'GENERATE_START' ||
    next?.start_binding?.kind !== 'PREVIOUS_USED_EXIT' || next.start_binding.source_clip !== 'CL11' ||
    candidate.narration !== shot.narrator_text ||
    candidate.voice_slot_relative_seconds[0] !== shot.voice_slot_relative.start ||
    candidate.voice_slot_relative_seconds[1] !== shot.voice_slot_relative.end || plan.editor_fps !== 30) {
  throw new Error('CL11 candidate differs from the locked story, chain or FINAL TTS timing.');
}
const gate = JSON.parse(await readFile(at('production-readiness-pass-v1.json'), 'utf8'));
if (gate.project_id !== plan.project_id || gate.plan_sha256 !== sha(planBytes) || gate.status !== 'PASS') {
  throw new Error('Production-readiness record differs from the locked plan.');
}
const transition = candidate.cl10_transition_reference;
if (transition.used_exit_frame_index !== 239 || transition.used_exit_time_seconds !== 9.958333 ||
    sha(await readFile(at(transition.clip_path))) !== transition.clip_sha256 ||
    sha(await readFile(at(transition.review_frame_path))) !== transition.review_frame_sha256 ||
    sha(await readFile(at(transition.clean_identity_reference_path))) !== transition.clean_identity_reference_sha256) {
  throw new Error('CL10 clip, actual used exit or clean identity reference changed; review and revise CL11.');
}
const prompts = {};
for (const kind of ['start', 'end', 'video']) {
  prompts[kind] = await readFile(at(candidate.prompts[kind]), 'utf8');
  if (sha(Buffer.from(prompts[kind])) !== candidate.prompt_sha256[kind] ||
      !prompts[kind].includes('NON_REALISTIC_STYLIZED')) {
    throw new Error(`CL11 ${kind} prompt changed or style lock is absent; create a new revision.`);
  }
}
if (sha(await readFile(at(candidate.video_prompt_korean_translation.path))) !== candidate.video_prompt_korean_translation.sha256 ||
    !prompts.video.includes('NO GENERATED VOICES — KEEP SOUND EFFECTS.') ||
    !prompts.video.includes('Generate synchronized NONVERBAL sound effects')) {
  throw new Error('CL11 translation or voice-free sound-effects rule changed.');
}
const boards = [];
for (const id of ['BOARD01_STYLE', 'BOARD02_MOTION', 'BOARD03_SCENE']) {
  const board = plan.boards[id];
  if (sha(await readFile(at(board.path))) !== board.sha256) throw new Error(`Board changed: ${id}`);
  boards.push({ absolutePath: at(board.path), role: id, sha256: board.sha256 });
}
const jobs = {
  start: { output: candidate.start_binding.start_path, evidence: 'assets/CL11_START_v3.evidence.json' },
  end: { output: candidate.end_target_path, evidence: 'assets/CL11_END_v3.evidence.json' },
};
async function verifiedOutput(kind) {
  const job = jobs[kind];
  const imageExists = await exists(at(job.output));
  const evidenceExists = await exists(at(job.evidence));
  if (!imageExists && !evidenceExists) return null;
  if (imageExists !== evidenceExists) throw new Error(`Partial CL11 ${kind} output exists; inspect it.`);
  const bytes = await readFile(at(job.output));
  const evidence = JSON.parse(await readFile(at(job.evidence), 'utf8'));
  if (evidence.project_id !== plan.project_id || evidence.clip_id !== 'CL11' ||
      evidence.prompt_sha256 !== candidate.prompt_sha256[kind] ||
      evidence.source_clip_sha256 !== transition.clip_sha256 ||
      evidence.output_path !== job.output || evidence.output_sha256 !== sha(bytes)) {
    throw new Error(`Existing CL11 ${kind} provenance differs from v3.`);
  }
  return { absolutePath: at(job.output), sha256: sha(bytes), evidence };
}
const start = await verifiedOutput('start');
const end = await verifiedOutput('end');
if (end && (!start || end.evidence.start_sha256 !== start.sha256)) {
  throw new Error('CL11 END is not bound to its current START.');
}
if (mode === '--check') {
  console.log(`CL11 START: ${start ? 'GENERATED_UNREVIEWED' : 'READY_TO_GENERATE'}: ${at(jobs.start.output)}`);
  console.log(`CL11 END: ${end ? 'GENERATED_UNREVIEWED' : start ? 'READY_TO_GENERATE' : 'WAITING_FOR_START'}: ${at(jobs.end.output)}`);
  console.log('START is new; CL10 actual exit is a transition review reference, not a derived START. No full build or tests rerun.');
  process.exit(0);
}
const kind = mode === '--generate-start' ? 'start' : 'end';
if (kind === 'end' && !start) throw new Error('Generate and inspect CL11 START before generating END.');
const existing = kind === 'start' ? start : end;
if (existing) {
  console.log(`Existing ${kind.toUpperCase()} image verified: ${existing.absolutePath}`);
  process.exit(0);
}
// Use a clean CL10 target to hold aircraft identity at the story cut. The actual CL10
// video exit has a generator mark and is checked by hash, not passed as image input.
// The CL11 END changes ground to sky, so using the ground START as an image reference
// risks copying the start rather than generating the distinct target.
const references = kind === 'start'
  ? [{ absolutePath: at(transition.clean_identity_reference_path), role: 'CL10_CLEAN_IDENTITY', sha256: transition.clean_identity_reference_sha256 }, ...boards]
  : boards;
const result = await createImageProviderAdapter().generate({
  prompt: prompts[kind].trim(),
  references: references.map((reference, index) => ({ ...reference, mediaId: `db-cooper-CL11-${kind}-v3-ref-${index + 1}` })),
  sessionKey: `db-cooper-CL11-${kind}-v3`, width: 1536, height: 864, aspectRatio: '16:9',
});
const bytes = result.bytes;
if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    bytes.readUInt32BE(16) !== 1536 || bytes.readUInt32BE(20) !== 864) {
  throw new Error(`Provider did not return a 1536x864 PNG for CL11 ${kind}.`);
}
let similarity = null;
if (kind === 'end') {
  const distinct = spawnSync(process.env.VPF_PYTHON_EXECUTABLE || 'python', [
    resolve(import.meta.dirname, 'check-db-cooper-end-distinct.py'), start.absolutePath
  ], { input: bytes, encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true });
  if (distinct.error || distinct.status !== 0) {
    throw new Error(`END resembles START or distinctness check failed; nothing saved. ${distinct.stderr || distinct.stdout || distinct.error}`);
  }
  similarity = JSON.parse(distinct.stdout);
}
const job = jobs[kind];
await mkdir(dirname(at(job.output)), { recursive: true });
await writeFile(at(job.output), bytes, { flag: 'wx' });
await writeFile(at(job.evidence), JSON.stringify({
  project_id: plan.project_id, clip_id: 'CL11', kind: kind.toUpperCase(),
  prompt_sha256: candidate.prompt_sha256[kind], source_clip_sha256: transition.clip_sha256,
  start_sha256: kind === 'end' ? start.sha256 : null,
  references: references.map(({ role, sha256 }) => ({ role, sha256 })),
  output_path: job.output, output_sha256: sha(bytes), distinct_from_start: similarity,
  provider_request_ids: result.providerRequestIds ?? [], generated_at: new Date().toISOString(),
  status: 'GENERATED_UNREVIEWED', canonical_approval: false,
}, null, 2) + '\n', { flag: 'wx' });
console.log(`Generated CL11 ${kind.toUpperCase()} for visual review: ${at(job.output)}`);
