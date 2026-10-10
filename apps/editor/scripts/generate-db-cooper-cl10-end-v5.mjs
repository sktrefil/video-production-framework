import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createImageProviderAdapter } from '../../../runtimes/image/adapters/chatgpt-browser-adapter.mjs';

const mode = process.argv[2];
if (process.argv.length !== 3 || !['--check', '--generate-end'].includes(mode)) {
  throw new Error('Usage: node scripts/generate-db-cooper-cl10-end-v5.mjs --check|--generate-end');
}
const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const at = relative => resolve(root, relative);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const candidate = JSON.parse(await readFile(at('CL10-v5-chain-candidate.json'), 'utf8'));
const planBytes = await readFile(at('chain-plan.json'));
const plan = JSON.parse(planBytes);
const shot = plan.shots.find(value => value.id === 'CL10');
if (sha(planBytes) !== candidate.base_plan_sha256 || plan.manager_story_gate !== 'PASS' ||
    candidate.project_id !== plan.project_id || candidate.canonical_approval !== false ||
    candidate.status !== 'DIRECTING_CANDIDATE_NOT_CANONICAL' ||
    shot?.scene !== 'SC03' || shot?.timeline_start !== 82 || shot?.timeline_end !== 92 ||
    shot?.keep_seconds !== 10 || shot?.start_binding?.kind !== 'GENERATE_START' ||
    candidate.narration !== shot.narrator_text ||
    candidate.voice_slot_relative_seconds[0] !== shot.voice_slot_relative.start ||
    candidate.voice_slot_relative_seconds[1] !== shot.voice_slot_relative.end) {
  throw new Error('CL10 v5 differs from the locked shot plan or TTS timing.');
}
const gate = JSON.parse(await readFile(at('production-readiness-pass-v1.json'), 'utf8'));
if (gate.project_id !== plan.project_id || gate.plan_sha256 !== sha(planBytes) || gate.status !== 'PASS') {
  throw new Error('Production-readiness record differs from the locked plan.');
}
const startPath = candidate.start_binding.start_path;
const startBytes = await readFile(at(startPath));
const startEvidence = JSON.parse(await readFile(at(candidate.start_binding.evidence_path), 'utf8'));
const previous = candidate.cl09_transition_reference;
if (sha(startBytes) !== candidate.start_binding.start_sha256 ||
    startEvidence.output_sha256 !== sha(startBytes) || startEvidence.output_path !== startPath ||
    startEvidence.source_clip_sha256 !== previous.clip_sha256 ||
    sha(await readFile(at(previous.clip_path))) !== previous.clip_sha256 ||
    sha(await readFile(at(previous.review_frame_path))) !== previous.review_frame_sha256) {
  throw new Error('Existing CL10 START or CL09 transition reference changed; review before continuing.');
}
for (const kind of ['start', 'end', 'video']) {
  if (sha(await readFile(at(candidate.prompts[kind]))) !== candidate.prompt_sha256[kind]) {
    throw new Error(`CL10 ${kind} prompt changed; create a new revision.`);
  }
}
const video = await readFile(at(candidate.prompts.video), 'utf8');
if (sha(await readFile(at(candidate.video_prompt_korean_translation.path))) !== candidate.video_prompt_korean_translation.sha256 ||
    !video.includes('NO GENERATED VOICES — KEEP SOUND EFFECTS.') ||
    !video.includes('0.8-3.8s: Move FAST')) {
  throw new Error('CL10 translated video prompt or fast-motion/sound rule changed.');
}
const boards = [];
for (const id of ['BOARD01_STYLE', 'BOARD02_MOTION', 'BOARD03_SCENE']) {
  const board = plan.boards[id];
  if (sha(await readFile(at(board.path))) !== board.sha256) throw new Error(`Board changed: ${id}`);
  boards.push({ absolutePath: at(board.path), role: id, sha256: board.sha256 });
}
const output = candidate.end_target_path;
const evidencePath = 'assets/CL10_END_v5.evidence.json';
const imageExists = await exists(at(output));
const evidenceExists = await exists(at(evidencePath));
if (imageExists !== evidenceExists) throw new Error('Partial CL10 END output exists; inspect before retrying.');
if (imageExists) {
  const evidence = JSON.parse(await readFile(at(evidencePath), 'utf8'));
  if (evidence.prompt_sha256 !== candidate.prompt_sha256.end ||
      evidence.start_sha256 !== sha(startBytes) || evidence.output_path !== output ||
      evidence.output_sha256 !== sha(await readFile(at(output)))) {
    throw new Error('Existing CL10 END has different provenance.');
  }
}
if (mode === '--check') {
  console.log(`CL10 START (existing, visually reviewed): ${at(startPath)}`);
  console.log(`CL10 END: ${imageExists ? 'GENERATED_UNREVIEWED' : 'READY_TO_GENERATE'}: ${at(output)}`);
  console.log('One fast forward camera path, then deceleration. TTS and condition graphics are editing tasks. No full build or tests rerun.');
  process.exit(0);
}
if (imageExists) {
  console.log(`Existing CL10 END verified: ${at(output)}`);
  process.exit(0);
}
const prompt = (await readFile(at(candidate.prompts.end), 'utf8')).trim();
const references = [{ absolutePath: at(startPath), role: 'CL10_EXISTING_START', sha256: sha(startBytes) }, ...boards];
const result = await createImageProviderAdapter().generate({
  prompt, references: references.map((reference, index) => ({ ...reference, mediaId: `db-cooper-CL10-end-v5-ref-${index + 1}` })),
  sessionKey: 'db-cooper-CL10-end-v5', width: 1536, height: 864, aspectRatio: '16:9',
});
const bytes = result.bytes;
if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    bytes.readUInt32BE(16) !== 1536 || bytes.readUInt32BE(20) !== 864) {
  throw new Error('Provider did not return a 1536x864 PNG.');
}
const distinct = spawnSync(process.env.VPF_PYTHON_EXECUTABLE || 'python', [
  resolve(import.meta.dirname, 'check-db-cooper-end-distinct.py'), at(startPath)
], { input: bytes, encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true });
if (distinct.error || distinct.status !== 0) {
  throw new Error(`END resembles START or distinctness check failed; nothing saved. ${distinct.stderr || distinct.stdout || distinct.error}`);
}
await mkdir(dirname(at(output)), { recursive: true });
await writeFile(at(output), bytes, { flag: 'wx' });
await writeFile(at(evidencePath), JSON.stringify({
  project_id: plan.project_id, clip_id: 'CL10', kind: 'END',
  prompt_sha256: candidate.prompt_sha256.end, start_sha256: sha(startBytes),
  references: references.map(({ role, sha256 }) => ({ role, sha256 })),
  output_path: output, output_sha256: sha(bytes), distinct_from_start: JSON.parse(distinct.stdout),
  provider_request_ids: result.providerRequestIds ?? [], generated_at: new Date().toISOString(),
  status: 'GENERATED_UNREVIEWED', canonical_approval: false,
}, null, 2) + '\n', { flag: 'wx' });
console.log(`Generated CL10 END for visual review: ${at(output)}`);
