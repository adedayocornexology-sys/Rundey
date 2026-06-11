// Eval harness: runs every fixture through ASR (stub by default) + intent
// parser and scores ITEM-NAME and QUANTITY extraction against expected.json.
// A fixture passes only if the extracted (name_en, qty) multiset exactly
// matches ground truth — "did not crash" does not score. Units are reported
// but not scored (spec scores item-name + quantity).
// Gate: >= 8/10. Exit code 1 below the gate.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createASR } from '../src/providers/asr/index.js';
import { createIntentParser } from '../src/intent/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = join(root, 'fixtures');
const GATE = 8;

const asr = createASR();
const intent = createIntentParser();

const dirs = readdirSync(fixturesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name).sort();

const key = (it) => `${(it.name_en ?? '').toLowerCase().trim()}×${it.qty}`;

function scoreItems(got, want) {
  const g = got.map(key).sort();
  const w = want.map(key).sort();
  return { pass: JSON.stringify(g) === JSON.stringify(w), got: g, want: w };
}

let passed = 0;
const rows = [];
for (const dir of dirs) {
  const expected = JSON.parse(readFileSync(join(fixturesDir, dir, 'expected.json'), 'utf8'));
  const audio = readFileSync(join(fixturesDir, dir, 'audio.wav'));
  let detail = '';
  let pass = false;
  try {
    const { transcript } = await asr.transcribe({ audio });
    if (!transcript.trim()) {
      pass = expected.items.length === 0;
      detail = pass ? 'empty transcript → no items (correct)' : 'empty transcript but items expected';
    } else {
      const parsed = await intent.parse({ transcript, callerPhone: '+2348000000000' });
      const s = scoreItems(parsed.items, expected.items);
      pass = s.pass;
      detail = pass ? s.got.join(', ') || 'no items (correct)' : `got [${s.got}] want [${s.want}]`;
    }
  } catch (err) {
    detail = `ERROR: ${err.message}`;
  }
  if (pass) passed += 1;
  rows.push({ fixture: dir, kind: expected.kind, pass, detail });
}

console.log('\n=== RUNDEY Voice Bridge — extraction scorecard ===');
console.log(`asr=${asr.provider ?? 'unknown'} intent=${intent.provider}\n`);
for (const r of rows) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.fixture.padEnd(30)} ${r.kind.padEnd(34)} ${r.detail}`);
}
console.log(`\nscore: ${passed}/${rows.length}  (gate: >= ${GATE})`);
if (rows.some((r) => JSON.parse(readFileSync(join(fixturesDir, r.fixture, 'expected.json'), 'utf8')).synthetic)) {
  console.log('NOTE: fixtures are synthetic scaffolding — see fixtures/README.md before quoting accuracy.');
}
process.exit(passed >= GATE ? 0 : 1);
