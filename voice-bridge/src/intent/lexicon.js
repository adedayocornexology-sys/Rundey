// Deterministic Yoruba lexicon parser. Offline stand-in for the Haiku parser
// (no API key needed) and a permanent cross-check baseline for the eval
// harness. Matching is done on diacritic-stripped lowercase text so ASR
// tone-mark inconsistencies don't break extraction.

const ITEMS = [
  // [stripped match, canonical Yoruba, English market name] — longest first
  ['epo pupa', 'epo pupa', 'palm oil'],
  ['alubosa', 'àlùbọ́sà', 'onion'],
  ['tomati', 'tòmátì', 'tomato'],
  ['gaari', 'gaàrí', 'garri'],
  ['garri', 'gaàrí', 'garri'],
  ['iresi', 'ìrẹsì', 'rice'],
  ['rice', 'ìrẹsì', 'rice'],
  ['ogede', 'ọ̀gẹ̀dẹ̀', 'plantain'],
  ['buredi', 'búrẹ́dì', 'bread'],
  ['bread', 'búrẹ́dì', 'bread'],
  ['elubo', 'ẹ̀lùbọ́', 'yam flour'],
  ['adie', 'adìẹ', 'chicken'],
  ['suga', 'ṣúgà', 'sugar'],
  ['sugar', 'ṣúgà', 'sugar'],
  ['wara', 'wàrà', 'milk'],
  ['milk', 'wàrà', 'milk'],
  ['efo', 'ẹ̀fọ́', 'vegetables'],
  ['ewa', 'ẹ̀wà', 'beans'],
  ['eja', 'ẹja', 'fish'],
  ['eran', 'ẹran', 'meat'],
  ['ata', 'ata', 'pepper'],
  ['isu', 'iṣu', 'yam'],
  ['iyo', 'iyọ̀', 'salt'],
];

const NUMBERS = {
  kan: 1, okan: 1, eyokan: 1,
  meji: 2, mejeeji: 2,
  meta: 3, merin: 4,
  marun: 5, 'marun-un': 5, maruun: 5,
  mefa: 6, meje: 7, mejo: 8,
  mesan: 9, 'mesan-an': 9,
  mewa: 10, mewaa: 10,
};

const UNITS = {
  kilo: 'kilo', kilogiramu: 'kilo',
  igo: 'bottle', kongo: 'congo',
  paali: 'carton', garawa: 'bucket', derica: 'derica',
};

// Strip ALL diacritics (tones + underdots): ẹ̀fọ́ -> efo, mẹ́ta -> meta.
export function strip(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export class LexiconIntentParser {
  provider = 'lexicon';

  async parse({ transcript, callerPhone }) {
    const text = strip(transcript ?? '');
    const tokens = text.split(/[^a-z0-9-]+/).filter(Boolean);
    const items = [];

    let i = 0;
    while (i < tokens.length) {
      const match = this.#matchItem(tokens, i);
      if (!match) { i += 1; continue; }

      let qty = 1;
      let unit = null;
      let j = i + match.length;
      if (j < tokens.length && UNITS[tokens[j]] !== undefined) {
        unit = UNITS[tokens[j]];
        j += 1;
      }
      if (j < tokens.length) {
        const n = NUMBERS[tokens[j]] ?? (/^\d+$/.test(tokens[j]) ? Number(tokens[j]) : undefined);
        if (n !== undefined) { qty = n; j += 1; }
      }
      items.push({ name_yo: match.name_yo, name_en: match.name_en, qty, unit });
      i = j;
    }

    return {
      items,
      customer_phone: callerPhone,
      confidence: items.length > 0 ? 0.85 : 0.2,
      provider: this.provider,
    };
  }

  #matchItem(tokens, i) {
    for (const [key, name_yo, name_en] of ITEMS) {
      const parts = key.split(' ');
      if (parts.every((p, k) => tokens[i + k] === p)) {
        return { name_yo, name_en, length: parts.length };
      }
    }
    return null;
  }
}
