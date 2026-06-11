// Generates the 10-fixture eval suite. ALL AUDIO IS SYNTHETIC (synthetic=true):
// programmatically generated 8kHz mono WAVs (tones / tone+market-noise / pure
// silence) standing in for real elder GSM recordings, paired with the Yoruba
// transcript a perfect ASR would produce. The stub ASR maps audio sha256 ->
// transcript via manifest.json. Replace with real elder recordings + real ASR
// before making any accuracy claim (see fixtures/README.md).
//
// This environment has no FFmpeg and no Yoruba TTS key; when SPITCH_API_KEY
// exists, regenerate fixture audio with scripts/generate-prompts.js-style TTS
// and FFmpeg noise overlays per the spec.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = join(root, 'fixtures');

const SAMPLE_RATE = 8000; // GSM-ish

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32767))), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);             // PCM
  header.writeUInt16LE(1, 22);             // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// Deterministic PRNG so fixture hashes are stable across regeneration.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toneSpeech(seconds, seed) {
  const rng = mulberry32(seed);
  const n = SAMPLE_RATE * seconds;
  const out = new Array(n);
  let freq = 180 + rng() * 120; // voice-band wandering tone
  for (let i = 0; i < n; i += 1) {
    if (i % (SAMPLE_RATE / 4) === 0) freq = 140 + rng() * 200;
    const t = i / SAMPLE_RATE;
    const envelope = 0.4 + 0.3 * Math.sin(2 * Math.PI * 2.5 * t);
    out[i] = envelope * 0.5 * Math.sin(2 * Math.PI * freq * t);
  }
  return out;
}

function addNoise(samples, seed, level = 0.25) {
  const rng = mulberry32(seed);
  return samples.map((s) => s * 0.8 + (rng() * 2 - 1) * level);
}

const silence = (seconds) => new Array(SAMPLE_RATE * seconds).fill(0);

const FIXTURES = [
  {
    slug: '01-simple-efo-epo', kind: 'clean simple order', seed: 101,
    transcript: 'Mo fẹ́ ra ẹ̀fọ́ méjì àti epo pupa kan', confidence: 0.93,
    expect: { order: true, status: 'pending_review',
      items: [{ name_en: 'vegetables', qty: 2 }, { name_en: 'palm oil', qty: 1 }] },
  },
  {
    slug: '02-simple-iresi-kilo', kind: 'clean simple order', seed: 102,
    transcript: 'Ẹ jọ̀wọ́, mo fẹ́ ra ìrẹsì kílò kan', confidence: 0.91,
    expect: { order: true, status: 'pending_review',
      items: [{ name_en: 'rice', qty: 1, unit: 'kilo' }] },
  },
  {
    slug: '03-simple-ata', kind: 'clean simple order', seed: 103,
    transcript: 'Mo fẹ́ ra ata mẹ́ta', confidence: 0.94,
    expect: { order: true, status: 'pending_review',
      items: [{ name_en: 'pepper', qty: 3 }] },
  },
  {
    slug: '04-multi-tomati-alubosa-ata', kind: 'multi-item with quantities', seed: 104,
    transcript: 'Mo fẹ́ ra tòmátì mẹ́rin, àlùbọ́sà méjì àti ata kan', confidence: 0.89,
    expect: { order: true, status: 'pending_review',
      items: [{ name_en: 'tomato', qty: 4 }, { name_en: 'onion', qty: 2 }, { name_en: 'pepper', qty: 1 }] },
  },
  {
    slug: '05-multi-ewa-gaari-epo', kind: 'multi-item with quantities + units', seed: 105,
    transcript: 'Ẹ bá mi ra ẹ̀wà kílò méjì, gaàrí kóńgò kan àti epo pupa ìgò kan', confidence: 0.88,
    expect: { order: true, status: 'pending_review',
      items: [{ name_en: 'beans', qty: 2, unit: 'kilo' }, { name_en: 'garri', qty: 1, unit: 'congo' }, { name_en: 'palm oil', qty: 1, unit: 'bottle' }] },
  },
  {
    slug: '06-noisy-eja-iyo', kind: 'market-noise overlay', seed: 106, noisy: true,
    transcript: 'Mo fẹ́ ra ẹja méjì àti iyọ̀ kan', confidence: 0.74,
    expect: { order: true, status: 'pending_review',
      items: [{ name_en: 'fish', qty: 2 }, { name_en: 'salt', qty: 1 }] },
  },
  {
    slug: '07-noisy-ogede-eran', kind: 'market-noise overlay', seed: 107, noisy: true,
    transcript: 'Mo fẹ́ ra ọ̀gẹ̀dẹ̀ mẹ́fà àti ẹran kílò kan', confidence: 0.71,
    expect: { order: true, status: 'pending_review',
      items: [{ name_en: 'plantain', qty: 6 }, { name_en: 'meat', qty: 1, unit: 'kilo' }] },
  },
  {
    slug: '08-codeswitch-rice-bread', kind: 'code-switched Yoruba/English', seed: 108,
    transcript: 'Mo fẹ́ ra rice kílò méjì àti bread kan', confidence: 0.86,
    expect: { order: true, status: 'pending_review',
      items: [{ name_en: 'rice', qty: 2, unit: 'kilo' }, { name_en: 'bread', qty: 1 }] },
  },
  {
    slug: '09-empty-silence', kind: 'empty/silence', seed: 109, silent: true,
    transcript: '', confidence: 0,
    expect: { order: true, status: 'needs_callback', items: [] },
  },
  {
    slug: '10-greeting-no-order', kind: 'non-order speech', seed: 110,
    transcript: 'Ẹ káàsán o, báwo ni ẹ ṣe wà', confidence: 0.92,
    expect: { order: true, status: 'needs_callback', items: [] },
  },
];

const manifest = {};
for (const f of FIXTURES) {
  let samples = f.silent ? silence(4) : toneSpeech(4, f.seed);
  if (f.noisy) samples = addNoise(samples, f.seed + 1000);
  const audio = wav(samples);
  const dir = join(fixturesDir, f.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'audio.wav'), audio);
  writeFileSync(join(dir, 'expected.json'), `${JSON.stringify({
    synthetic: true,
    kind: f.kind,
    transcript_yo: f.transcript,
    expect_order_row: f.expect.order,
    expect_status: f.expect.status,
    items: f.expect.items.map((it) => ({ unit: null, ...it })),
  }, null, 2)}\n`);
  const sha = createHash('sha256').update(audio).digest('hex');
  manifest[sha] = { fixture: f.slug, transcript: f.transcript, confidence: f.confidence };
}

writeFileSync(join(fixturesDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${FIXTURES.length} fixtures + manifest.json to ${fixturesDir}`);
