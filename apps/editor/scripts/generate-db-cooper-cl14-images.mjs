import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createImageProviderAdapter } from '../../../runtimes/image/adapters/chatgpt-browser-adapter.mjs';

const mode = process.argv[2];
if (process.argv.length !== 3 || !['--check', '--generate-start', '--generate-end'].includes(mode)) {
  throw new Error('Usage: node scripts/generate-db-cooper-cl14-images.mjs --check|--generate-start|--generate-end');
}
const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const at = relative => resolve(root, relative);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const candidate = JSON.parse(await readFile(at('CL14-v3-chain-candidate.json'), 'utf8'));
const planBytes = await readFile(at('chain-plan.json'));
const plan = JSON.parse(planBytes);
const shot = plan.shots.find(x => x.id === 'CL14');
const next = plan.shots.find(x => x.id === 'CL15');
if (sha(planBytes) !== candidate.base_plan_sha256 || plan.manager_story_gate !== 'PASS' ||
    candidate.project_id !== plan.project_id || candidate.canonical_approval !== false ||
    candidate.status !== 'DIRECTING_CANDIDATE_NOT_CANONICAL' || shot?.scene !== 'SC04' ||
    shot.timeline_start !== 121 || shot.timeline_end !== 130 || shot.source_seconds !== 10 ||
    shot.keep_seconds !== 9 || shot.image_mode !== 'SINGLE' ||
    candidate.base_image_mode !== 'SINGLE' || candidate.proposed_image_mode !== 'START_TARGET_OPTIONAL_END' ||
    shot.start_binding.kind !== 'GENERATE_START' || candidate.start_binding.kind !== 'GENERATE_START' ||
    next?.start_binding.kind !== 'PREVIOUS_USED_EXIT' || next.start_binding.source_clip !== 'CL14' ||
    candidate.narration !== shot.narrator_text ||
    candidate.voice_slot_relative_seconds[0] !== shot.voice_slot_relative.start ||
    candidate.voice_slot_relative_seconds[1] !== shot.voice_slot_relative.end || plan.editor_fps !== 30) {
  throw new Error('CL14 candidate differs from locked plan or FINAL TTS timing.');
}
const gate = JSON.parse(await readFile(at('production-readiness-pass-v1.json'), 'utf8'));
if (gate.project_id !== plan.project_id || gate.plan_sha256 !== sha(planBytes) || gate.status !== 'PASS') {
  throw new Error('Production-readiness record differs from locked plan.');
}
const prompts = {};
for (const kind of ['start', 'end', 'video']) {
  const bytes = await readFile(at(candidate.prompts[kind]));
  if (sha(bytes) !== candidate.prompt_sha256[kind]) throw new Error(`CL14 ${kind} prompt changed; create a new revision.`);
  prompts[kind] = bytes.toString('utf8');
  if (!prompts[kind].includes('NON_REALISTIC_STYLIZED')) throw new Error(`CL14 ${kind} style lock absent.`);
}
if (sha(await readFile(at(candidate.video_prompt_korean_translation.path))) !== candidate.video_prompt_korean_translation.sha256 ||
    !prompts.video.includes('NO GENERATED VOICES — KEEP SOUND EFFECTS.') ||
    !prompts.video.includes('Generate synchronized NONVERBAL sound effects')) {
  throw new Error('CL14 translation or voice-free sound-effects rule changed.');
}
const boards = [];
for (const id of ['BOARD01_STYLE', 'BOARD02_MOTION', 'BOARD03_SCENE']) {
  const board = plan.boards[id];
  if (board.path !== candidate.boards[id].path || board.sha256 !== candidate.boards[id].sha256 ||
      sha(await readFile(at(board.path))) !== board.sha256) throw new Error(`Board changed: ${id}`);
  boards.push({ absolutePath: at(board.path), role: id, sha256: board.sha256 });
}
const jobs = {
  start: { output: candidate.start_binding.start_path, evidence: 'assets/CL14_START_v3.evidence.json' },
  end: { output: candidate.end_target_path, evidence: 'assets/CL14_END_v3.evidence.json' },
};
async function verifiedOutput(kind) {
  const job = jobs[kind];
  const imageExists = await exists(at(job.output));
  const evidenceExists = await exists(at(job.evidence));
  if (!imageExists && !evidenceExists) return null;
  if (imageExists !== evidenceExists) throw new Error(`Partial CL14 ${kind} output exists; inspect before retrying.`);
  const bytes = await readFile(at(job.output));
  const evidence = JSON.parse(await readFile(at(job.evidence), 'utf8'));
  if (evidence.project_id !== plan.project_id || evidence.clip_id !== 'CL14' ||
      evidence.prompt_sha256 !== candidate.prompt_sha256[kind] ||
      evidence.output_path !== job.output || evidence.output_sha256 !== sha(bytes)) {
    throw new Error(`Existing CL14 ${kind} provenance differs from v3.`);
  }
  return { absolutePath: at(job.output), sha256: sha(bytes), evidence };
}
const start = await verifiedOutput('start');
const end = await verifiedOutput('end');
if (end && (!start || end.evidence.start_sha256 !== start.sha256)) {
  throw new Error('CL14 END is not bound to current START.');
}
if (mode === '--check') {
  console.log(`CL14 START: ${start ? 'GENERATED_UNREVIEWED' : 'READY_TO_GENERATE'}: ${at(jobs.start.output)}`);
  console.log(`CL14 optional END: ${end ? 'GENERATED_UNREVIEWED' : start ? 'READY_TO_GENERATE' : 'WAITING_FOR_START'}: ${at(jobs.end.output)}`);
  console.log('Independent cockpit story cut; not extracted from rejected CL13 v3. Original plan SINGLE; END is a requested candidate. No build/tests rerun.');
  process.exit(0);
}
const kind = mode === '--generate-start' ? 'start' : 'end';
if (kind === 'end' && !start) throw new Error('Generate and visually review CL14 START before END.');
const existing = kind === 'start' ? start : end;
if (existing) {
  console.log(`Existing CL14 ${kind.toUpperCase()} verified: ${existing.absolutePath}`);
  process.exit(0);
}
const references = kind === 'start'
  ? boards
  : [{ absolutePath: start.absolutePath, role: 'CL14_START_GEOMETRY', sha256: start.sha256 }, ...boards];
const result = await createImageProviderAdapter().generate({
  prompt: prompts[kind].trim(),
  references: references.map((ref, i) => ({ ...ref, mediaId: `db-cooper-CL14-${kind}-v3-ref-${i + 1}` })),
  sessionKey: `db-cooper-CL14-${kind}-v3`, width: 1536, height: 864, aspectRatio: '16:9',
});
const bytes = result.bytes;
if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    bytes.readUInt32BE(16) !== 1536 || bytes.readUInt32BE(20) !== 864) {
  throw new Error(`Provider did not return a 1536x864 PNG for CL14 ${kind}.`);
}
let distinctResult = null;
if (kind === 'end') {
  const distinct = spawnSync(process.env.VPF_PYTHON_EXECUTABLE || 'python', [
    resolve(import.meta.dirname, 'check-db-cooper-end-distinct.py'), start.absolutePath
  ], { input: bytes, encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true });
  if (distinct.error || distinct.status !== 0) {
    throw new Error(`END resembles START or distinctness check failed; nothing saved. ${distinct.stderr || distinct.stdout || distinct.error}`);
  }
  distinctResult = JSON.parse(distinct.stdout);
}
const job = jobs[kind];
await mkdir(dirname(at(job.output)), { recursive: true });
await writeFile(at(job.output), bytes, { flag: 'wx' });
await writeFile(at(job.evidence), JSON.stringify({
  project_id: plan.project_id, clip_id: 'CL14', kind: kind.toUpperCase(),
  prompt_sha256: candidate.prompt_sha256[kind], start_sha256: kind === 'end' ? start.sha256 : null,
  references: references.map(({ role, sha256 }) => ({ role, sha256 })),
  output_path: job.output, output_sha256: sha(bytes), distinct_from_start: distinctResult,
  provider_request_ids: result.providerRequestIds ?? [], generated_at: new Date().toISOString(),
  status: 'GENERATED_UNREVIEWED', canonical_approval: false,
}, null, 2) + '\n', { flag: 'wx' });
console.log(`Generated CL14 ${kind.toUpperCase()} for visual review: ${at(job.output)}`);
