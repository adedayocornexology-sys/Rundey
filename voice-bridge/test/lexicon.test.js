// Unit tests for the deterministic Yoruba parser (no DB needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LexiconIntentParser, strip } from '../src/intent/lexicon.js';

const parser = new LexiconIntentParser();
const parse = (t) => parser.parse({ transcript: t, callerPhone: '+2348000000000' });

test('strip removes tones and underdots', () => {
  assert.equal(strip('Ẹ̀fọ́ mẹ́ta àti ìrẹsì'), 'efo meta ati iresi');
});

test('simple order with quantities', async () => {
  const { items, confidence } = await parse('Mo fẹ́ ra ẹ̀fọ́ méjì àti epo pupa kan');
  assert.deepEqual(items, [
    { name_yo: 'ẹ̀fọ́', name_en: 'vegetables', qty: 2, unit: null },
    { name_yo: 'epo pupa', name_en: 'palm oil', qty: 1, unit: null },
  ]);
  assert.ok(confidence > 0.5);
});

test('unit before quantity (ewa kílò méjì)', async () => {
  const { items } = await parse('ẹ̀wà kílò méjì');
  assert.deepEqual(items, [{ name_yo: 'ẹ̀wà', name_en: 'beans', qty: 2, unit: 'kilo' }]);
});

test('item with no quantity defaults to 1', async () => {
  const { items } = await parse('Mo fẹ́ ra iyọ̀');
  assert.deepEqual(items, [{ name_yo: 'iyọ̀', name_en: 'salt', qty: 1, unit: null }]);
});

test('code-switched English items and digits', async () => {
  const { items } = await parse('Mo fẹ́ ra rice kílò 2 àti bread kan');
  assert.deepEqual(items, [
    { name_yo: 'ìrẹsì', name_en: 'rice', qty: 2, unit: 'kilo' },
    { name_yo: 'búrẹ́dì', name_en: 'bread', qty: 1, unit: null },
  ]);
});

test('greeting yields no items and low confidence', async () => {
  const { items, confidence } = await parse('Ẹ káàsán o, báwo ni ẹ ṣe wà');
  assert.deepEqual(items, []);
  assert.ok(confidence < 0.5);
});

test('empty transcript yields no items', async () => {
  const { items } = await parse('');
  assert.deepEqual(items, []);
});
