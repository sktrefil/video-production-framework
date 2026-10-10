import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'output/db-cooper-v3/review');
const manifestPath = join(root, 'output/db-cooper-v3/inputs/DB_Cooper_v3_Codex_Shot_Manifest.json');
const timingPath = join(root, 'output/db-cooper-v3/tts-preview-v1/timing-report.json');
const overridePath = join(output, '270s-directing-overrides-v1.json');
const planPath = join(output, '270s-motion-sound-replan-v1.json');
const documentPath = join(output, '270s-motion-sound-replan-v1.md');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const round = value => Math.round(value * 1000) / 1000;
const source = await Promise.all([readFile(manifestPath), readFile(timingPath), readFile(overridePath)]);
const [manifest, timing, overrides] = source.map(bytes => JSON.parse(bytes.toString('utf8')));

if (manifest.project_id !== 'db_cooper_1971_4m30_v3' || manifest.target_duration_seconds !== 270) throw new Error('Unexpected source manifest');
if (timing.completed_scene_count !== 7 || timing.scenes.length !== 7) throw new Error('All seven preview scenes are required');
if (overrides.status !== 'DIRECTING_CANDIDATE_NOT_APPROVED') throw new Error('Unexpected override status');
// Shot values are rounded to milliseconds in the preview report. Assign each
// scene's rounding residue to its final shot so both timeline levels reconcile.
const measured = new Map(timing.scenes.flatMap(scene => scene.shots.map((shot, index) => [
  shot.shot_id,
  index === scene.shots.length - 1
    ? round(scene.preview_seconds_at_1p1 - scene.shots.slice(0, -1).reduce((sum, item) => sum + item.preview_seconds_at_1p1, 0))
    : shot.preview_seconds_at_1p1,
])));
const overrideIds = Object.keys(overrides.shots);
if (overrideIds.length !== manifest.shots.length || manifest.shots.some(shot => !overrides.shots[shot.id] || !measured.has(shot.id))) {
  throw new Error('Shot IDs do not match the timing report and directing overrides');
}

let timeline = 0;
const shots = manifest.shots.map(shot => {
  const direction = overrides.shots[shot.id];
  if (shot.timeline_start !== timeline || shot.timeline_end !== timeline + shot.keep_seconds) throw new Error(`Timeline mismatch: ${shot.id}`);
  const voDuration = measured.get(shot.id);
  const voStart = direction.vo_start;
  const voEnd = round(voStart + voDuration);
  if (!Number.isFinite(voStart) || voStart < 0 || voEnd > shot.keep_seconds + 0.001) throw new Error(`Voice slot outside used clip: ${shot.id}`);
  timeline = shot.timeline_end;
  return {
    id: shot.id, scene_id: shot.scene, title: shot.title,
    timeline_start: shot.timeline_start, timeline_end: shot.timeline_end,
    source_seconds: shot.source_seconds, used_seconds: shot.keep_seconds,
    preview_voice_source: `tts-preview-v1/03_tts/sections/${shot.scene}_raw.mp3`,
    preview_voice_at_1p1_seconds: voDuration,
    voice_slot_relative: {start: voStart, end: voEnd},
    voice_slot_timeline: {start: round(shot.timeline_start + voStart), end: round(shot.timeline_start + voEnd)},
    pre_voice_seconds: voStart, post_voice_seconds: round(shot.keep_seconds - voEnd),
    nonvoice_seconds: round(shot.keep_seconds - voDuration),
    narrator_text: shot.tts,
    viewer_gain: direction.viewer_gain,
    before_voice: direction.before_voice,
    during_voice: direction.during_voice,
    after_voice: direction.after_voice,
    sound: direction.sound,
    planned_reveal: shot.key_event,
    planned_exit: shot.exit,
    transition: shot.transition,
    status: 'DIRECTING_CANDIDATE_NOT_APPROVED',
  };
});
if (timeline !== 270) throw new Error('Final timeline is not 270 seconds');
const scenes = timing.scenes.map(scene => ({
  id: scene.scene_id,
  planned_seconds: scene.planned_seconds,
  measured_preview_voice_seconds: scene.preview_seconds_at_1p1,
  nonvoice_design_seconds: round(scene.planned_seconds - scene.preview_seconds_at_1p1),
  shot_ids: shots.filter(shot => shot.scene_id === scene.scene_id).map(shot => shot.id),
}));
const plan = {
  schema: 'db-cooper-270s-motion-sound-replan.v1', project_id: manifest.project_id,
  status: 'DIRECTING_CANDIDATE_NOT_APPROVED',
  source_manifest_sha256: sha256(source[0]), source_timing_report_sha256: sha256(source[1]),
  directing_overrides_sha256: sha256(source[2]),
  target_seconds: 270, preview_voice_seconds: timing.preview_total_seconds_at_1p1,
  designed_nonvoice_seconds: round(270 - timing.preview_total_seconds_at_1p1),
  audio_edit_requirement: 'Preview audio is continuous per Scene; to realize these per-shot slots, split only at verified shot-text boundaries or redesign FINAL segmented TTS after Story Gate. Do not imply current seven MP3s already contain these gaps.',
  revision_constraints: [
    'CL01 v2 END must show dark stairwell at 10 seconds after a 6-8 second stair reveal.',
    'CL29 START must use a reviewed CL01 stair-reveal state as identity reference, not CL01 dark used exit.',
    'No invented witness, jump, landing, survival/death, readable document text or faux-realistic reenactment.',
  ],
  scenes, shots, canonical_approval: false, final_tts_allowed: false,
};

const md = [
  '# D.B. Cooper v3 — 270초 모션·정보·음향 재설계 후보', '',
  '상태: **연출 후보, 제작 승인 아님**. 7개 검토용 TTS의 1.1배속 정렬에서 음성 162.544초, 비음성 설계 구간 107.456초를 확인했다. 이 표는 무음 삽입 지시가 아니라 각 구간에 실제 화면 행동과 소리 변화를 부여한 계획이다.', '',
  '현재 TTS는 장면별로 이어진 7개 MP3다. 아래 샷별 VO 시작·종료를 구현하려면 검증된 문장/샷 경계에서 검토 음성을 나누어 배치하거나, Story Gate 뒤 FINAL 분절 TTS에서 해당 호흡을 설계해야 한다. 현재 파일이 이미 이 간격을 포함한다고 가정하지 않는다.', '',
  '## 장면별 시간', '',
  '| 장면 | 계획 | 측정 VO | 행동·소리 설계 구간 |', '| --- | ---: | ---: | ---: |',
  ...scenes.map(scene => `| ${scene.id} | ${scene.planned_seconds}s | ${scene.measured_preview_voice_seconds}s | ${scene.nonvoice_design_seconds}s |`),
  '| **합계** | **270s** | **162.544s** | **107.456s** |', '',
  '## 30개 샷의 실제 사건·음향', '',
  'VO 구간은 각 클립 시작을 0초로 계산한다. 원본 I2V는 10초, 사용 길이는 8~10초다. `앞/뒤`는 음성이 없는 구간이며 화면·음향의 구체적인 목적을 적었다.', '',
  '| 샷/시간 | VO 구간 | 관객이 새로 아는 것 | VO 앞 행동 → VO 중 행동 → VO 뒤 행동 | 소리 변화 |',
  '| --- | --- | --- | --- | --- |',
  ...shots.map(shot => `| ${shot.id} ${shot.timeline_start}–${shot.timeline_end}s | ${shot.voice_slot_relative.start}–${shot.voice_slot_relative.end}s | ${shot.viewer_gain} | ${shot.before_voice} → ${shot.during_voice} → ${shot.after_voice} | ${shot.sound} |`),
  '', '## 연결과 제작 조건', '',
  '- CL01은 6~8초 계단 구조를 보여준 뒤 10초에는 검은 계단 내부로 들어간다. 수정 후보는 `prompts/CL01_END_v2.prompt.txt`와 `prompts/CL01_VIDEO_v2.prompt.txt`다.',
  '- CL02는 착륙 후 빈 객실로 의도적인 컷이다. CL29는 CL01의 검은 10초 종료 프레임을 START로 복사하지 않고, 6~8초의 계단 공개 상태를 시각 참조로 삼는 별도 START 후보를 사용한다.',
  '- SC04는 31.182초의 비음성 구간이 한곳에 몰리지 않게 조작 난항→조종실 연락→경고등→보이지 않는 커튼→교신 단절→계기 변화→빈 계단→리노 빈 객실로 정보를 번갈아 공개한다.',
  '- 실제 클립을 만들면 시간표대로 사건이 20~30초마다 진전되는지 연결 재생으로 확인한다. 지속할 근거가 약한 샷은 길이·클립 수를 재조정하며 270초를 기계적으로 채우지 않는다.',
  '- 대본과 Scene graph, TTS 계획, CL01/CL29 연결 수정이 승인되기 전에는 이 후보를 최종 프롬프트나 `project.db` 상태로 승격하지 않는다.', '',
].join('\n');

for (const [path, value] of [[planPath, JSON.stringify(plan, null, 2) + '\n'], [documentPath, md]]) {
  try {
    const existing = await readFile(path, 'utf8');
    if (existing !== value) throw new Error(`Existing revision differs: ${path}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(path, value, {flag: 'wx'});
  }
}
console.log(`REPLAN READY: ${shots.length} shots, ${scenes.length} scenes, ${plan.designed_nonvoice_seconds}s designed nonvoice time`);
console.log(documentPath);
