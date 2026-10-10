import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const review = resolve(import.meta.dirname, '../output/db-cooper-v3/review');
const original = JSON.parse(await readFile(resolve(review, 'script-directing-lock-v1.json'), 'utf8'));
if (original.lock_id !== 'SDL-db_cooper_1971_4m30_v3-r1' || original.development_state !== 'SCRIPT_DIRECTING_LOCKED') {
  throw new Error('Unexpected source lock');
}
const revised = {
  ...original,
  lock_id: 'SDL-db_cooper_1971_4m30_v3-r2',
  narrative_spine: 'A man vanished from a Boeing 727 in 1971. Did he escape, or is his disappearance still unresolved?',
  supersedes_lock_id: original.lock_id,
  revision_reason: 'Repair unreadable narrative spine metadata; source script and approval evidence remain unchanged',
};
const output = resolve(review, 'script-directing-lock-v2.json');
const value = JSON.stringify(revised, null, 2) + '\n';
try {
  if (await readFile(output, 'utf8') !== value) throw new Error('Existing revised lock differs');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(output, value, {flag: 'wx'});
}
console.log(`REVISED LOCK READY: ${output}`);
